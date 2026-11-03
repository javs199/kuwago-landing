import {stagePublicMedia} from '../multimedia.js';
import type {CatalogEnvironment} from './types.js';
import type { PublicationStore, CatalogDatabase } from './types.js';
import { rows } from './repository.js';
import { manifestKey, parseSnapshot } from './snapshot.js';
import { publicationHead, sha256, snapshotKey, type PublicationHead } from './head.js';
export const retryLimit=8;
export const leaseDurationMs=30_000;
export const withdrawalTargetMs=120_000;
export function retryDelayMs(attempt:number):number{return Math.min(900_000,15_000*2**Math.min(attempt-1,6));}
const emptyCatalog={schemaVersion:1,source:'api',categories:[],services:[]};
export function snapshotText(epoch:string,generation:number,catalog:unknown):string{
  const text=JSON.stringify({epoch,generation,catalog});parseSnapshot(text);return text;
}
async function bounded<T>(promise:Promise<T>):Promise<T>{
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('storage_timeout')),5000);})]);}
  finally{if(timeout)clearTimeout(timeout);}
}
function sameHead(a:PublicationHead,b:PublicationHead):boolean{return a.mode==='ready'&&b.mode==='ready'&&a.epoch===b.epoch&&a.generation===b.generation&&a.payloadHash===b.payloadHash;}
async function initializeEmpty(db:CatalogDatabase,head:PublicationHead):Promise<PublicationHead>{
  const text=snapshotText(head.epoch,0,emptyCatalog);const hash=await sha256(text);
  await db.prepare(`UPDATE publication_control SET generation=0,payload_hash=? WHERE id=1 AND epoch=? AND mode='ready'
    AND generation IS NULL AND NOT EXISTS(SELECT 1 FROM services WHERE status='published')`).bind(hash,head.epoch).run();
  return publicationHead(db);
}
async function acknowledge(db:CatalogDatabase,head:PublicationHead,token:string):Promise<void>{
  const operation=crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO mutation_guards VALUES (?,1,CASE WHEN EXISTS(SELECT 1 FROM publication_control WHERE id=1 AND mode='ready' AND epoch=? AND generation=? AND payload_hash=?)
      AND EXISTS(SELECT 1 FROM publication_outbox WHERE generation=? AND epoch=? AND lease_token=?) THEN 1 ELSE 0 END)`)
      .bind(operation,head.epoch,head.generation,head.payloadHash,head.generation,head.epoch,token),
    db.prepare("UPDATE publication_commands SET state='visible' WHERE id IN (SELECT command_id FROM publication_outbox WHERE epoch=? AND generation<=?)").bind(head.epoch,head.generation),
    db.prepare(`UPDATE publication_outbox SET delivery_state=CASE WHEN generation=? THEN 'delivered' ELSE 'superseded' END,
      delivered_at=CASE WHEN generation=? THEN COALESCE(delivered_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE delivered_at END,
      lease_token=NULL,lease_until=0,last_error_code=NULL WHERE epoch=? AND generation<=?`).bind(head.generation,head.generation,head.epoch,head.generation),
    db.prepare('DELETE FROM mutation_guards WHERE operation_id=?').bind(operation),
  ]);
}
async function alert(db:CatalogDatabase,head:PublicationHead,code:string,now:number):Promise<void>{
  await db.prepare(`INSERT INTO publication_alerts(id,epoch,generation,code,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(epoch,generation,code) DO UPDATE SET last_seen_at=excluded.last_seen_at,occurrences=occurrences+1`)
    .bind(crypto.randomUUID(),head.epoch,head.generation??0,code,now,now).run();
}
// Persistent leases/backoff survive isolate and scheduler restarts. Never report an unacknowledged success.
export async function deliverCatalog(db:CatalogDatabase,store:PublicationStore|undefined,now=Date.now(),mediaEnvironment?:CatalogEnvironment):Promise<boolean>{
  let head:PublicationHead|undefined;let token:string|undefined;
  try{
    head=await publicationHead(db);if(head.mode!=='ready')return false;
    if(head.generation===null)head=await initializeEmpty(db,head);
    if(head.generation===null||!store)return false;
    await db.prepare("UPDATE publication_outbox SET delivery_state='escalated',last_error_code='lease_retry_exhausted',lease_token=NULL,lease_until=0 WHERE epoch=? AND generation=? AND delivery_state='pending' AND retry_count>=? AND lease_until<=?").bind(head.epoch,head.generation,retryLimit,now).run();
    const item=(await rows(db,'SELECT * FROM publication_outbox WHERE epoch=? AND generation=?',head.epoch,head.generation))[0];
    if(!item&&head.generation!==0)throw new Error('snapshot_invalid');
    const text=snapshotText(head.epoch,head.generation,item?JSON.parse(item.catalog_json as string):emptyCatalog);
    if(await sha256(text)!==head.payloadHash)throw new Error('snapshot_invalid');
    if(item?.delivery_state==='escalated'||item?.delivery_state==='quarantined')return false;
    if(item?.delivery_state==='delivered'){
      let valid=false;
      try{const current=await bounded(store.get(manifestKey));valid=!!current&&await sha256(await bounded(current.text()))===head.payloadHash;}
      catch{ /* A transient read outage re-enters bounded retry, never immediate integrity escalation. */ }
      if(valid){try{await stagePublicMedia(mediaEnvironment??{DB:db,...(store?{PUBLICATION:store}:{})},parseSnapshot(text).catalog);return sameHead(head,await publicationHead(db));}catch{valid=false;}}
      await db.prepare("UPDATE publication_outbox SET delivery_state='pending',retry_count=0,next_attempt_at=0,delivered_at=NULL WHERE epoch=? AND generation=? AND delivery_state='delivered'").bind(head.epoch,head.generation).run();
    }
    if(item){
      token=crypto.randomUUID();
      const claim=await db.prepare(`UPDATE publication_outbox SET lease_token=?,lease_until=?,retry_count=retry_count+1,attempts=attempts+1
        WHERE epoch=? AND generation=? AND delivery_state='pending' AND retry_count<? AND next_attempt_at<=? AND lease_until<=?
        AND EXISTS(SELECT 1 FROM publication_control WHERE id=1 AND mode='ready' AND epoch=? AND generation=?) RETURNING retry_count`)
        .bind(token,now+leaseDurationMs,head.epoch,head.generation,retryLimit,now,now,head.epoch,head.generation).all();
      if(!claim.results.length){token=undefined;return false;}
    }
    await stagePublicMedia(mediaEnvironment??{DB:db,...(store?{PUBLICATION:store}:{})},parseSnapshot(text).catalog);
    const archiveKey=snapshotKey(head);const archived=await bounded(store.get(archiveKey));
    if(archived){if(await sha256(await bounded(archived.text()))!==head.payloadHash)throw new Error('integrity_conflict');}
    else{
      const created=await bounded(store.put(archiveKey,text,{onlyIf:{etagDoesNotMatch:'*'}}));
      if(!created){const raced=await bounded(store.get(archiveKey));if(!raced||await sha256(await bounded(raced.text()))!==head.payloadHash)throw new Error('integrity_conflict');}
    }
    if(!sameHead(head,await publicationHead(db)))throw new Error('head_changed');
    const current=await bounded(store.get(manifestKey));
    if(!current||await sha256(await bounded(current.text()))!==head.payloadHash){
      const saved=await bounded(store.put(manifestKey,text,{onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'}}));
      if(!saved)throw new Error('concurrent_delivery');
    }
    if(token)await acknowledge(db,head,token);
    return sameHead(head,await publicationHead(db));
  }catch(error){
    if(head&&!token){
      try{
        await db.prepare("UPDATE publication_outbox SET delivery_state='escalated',last_error_code='snapshot_invalid' WHERE epoch=? AND generation=? AND lease_until<=? AND delivery_state IN ('pending','delivered')").bind(head.epoch,head.generation,now).run();
        await alert(db,head,'delivery_error',now);
      }catch{ /* DB unavailable: fail closed; persisted work remains for the next tick. */ }
    }
    if(head&&token){
      const code=error instanceof Error&&['snapshot_invalid','integrity_conflict','head_changed','concurrent_delivery'].includes(error.message)?error.message:'delivery_failed';
      try{
        const attempt=(await rows(db,'SELECT retry_count FROM publication_outbox WHERE epoch=? AND generation=? AND lease_token=?',head.epoch,head.generation,token))[0]?.retry_count as number|undefined;
        if(attempt!==undefined){
          await db.prepare(`UPDATE publication_outbox SET delivery_state=?,last_error_code=?,next_attempt_at=?,lease_token=NULL,lease_until=0
            WHERE epoch=? AND generation=? AND lease_token=?`).bind(attempt>=retryLimit?'escalated':'pending',code,now+retryDelayMs(attempt),head.epoch,head.generation,token).run();
          await alert(db,head,attempt>=retryLimit?'retry_exhausted':'delivery_error',now);
        }
      }catch{ /* Lease expiry permits recovery; no success is returned. */ }
    }
    return false;
  }
}
export async function reconciliationMetrics(db:CatalogDatabase,now=Date.now()){
  const head=await publicationHead(db);
  const quarantinedCount=((await rows(db,"SELECT count(*) n FROM publication_outbox WHERE delivery_state='quarantined'"))[0]!.n as number);
  if(head.mode==='paused'&&quarantinedCount)await alert(db,head,'recovery_required',now);
  const pending=await rows(db,`SELECT o.generation,o.delivery_state,o.retry_count,o.last_error_code AS lastErrorCode,o.next_attempt_at AS nextAttemptAt,
    o.lease_until AS leaseUntil,c.action,MAX(0,?-CAST(strftime('%s',o.created_at) AS INTEGER)*1000) AS ageMs
    FROM publication_outbox o JOIN publication_commands c ON c.id=o.command_id
    WHERE o.epoch=? AND o.delivery_state IN ('pending','escalated') ORDER BY o.generation`,now,head.epoch);
  for(const item of pending){
    if(['unpublish','archive'].includes(item.action as string)&&(item.ageMs as number)>withdrawalTargetMs)await alert(db,{...head,generation:item.generation as number},'withdrawal_overdue',now);
    if(item.delivery_state==='escalated')await alert(db,{...head,generation:item.generation as number},'retry_exhausted',now);
  }
  return {epoch:head.epoch,mode:head.mode,generation:head.generation,quarantinedCount,pendingCount:pending.length,oldestPendingMs:Math.max(0,...pending.map(v=>v.ageMs as number)),escalatedCount:pending.filter(v=>v.delivery_state==='escalated').length,items:pending};
}
export async function reconcileScheduled(db:CatalogDatabase,store:PublicationStore|undefined,now=Date.now(),mediaEnvironment?:CatalogEnvironment){
  const visible=await deliverCatalog(db,store,now,mediaEnvironment);const metrics=await reconciliationMetrics(db,now);
  console.info(JSON.stringify({event:'catalog_reconciliation',visible,mode:metrics.mode,pendingCount:metrics.pendingCount,quarantinedCount:metrics.quarantinedCount,oldestPendingMs:metrics.oldestPendingMs,escalatedCount:metrics.escalatedCount}));
  return {visible,...metrics};
}
