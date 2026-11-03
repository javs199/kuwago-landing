import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createWorker} from '../.wrangler/build/security.js';
import {createLogicalBackup,restoreLogicalBackup,resumeRecoveredEmpty,quarantineLegacy,verifyRecovery} from '../.wrangler/build/recovery.js';
import publicWorker from '../.wrangler/build/public.js';
import {issuer,audience,origin,signingFixture,jwksFetcher,request,localDatabase,seedAdministrators,localBarrier} from './auth-fixtures.mjs';
import {deliverCatalog,reconcileScheduled,reconciliationMetrics,retryLimit} from '../.wrangler/build/resilience.js';

const offline={async get(){throw new Error('synthetic store offline');},async put(){throw new Error('synthetic store offline');}};
async function fixture(options={}){
  const local=await localDatabase({r2Buckets:{PUBLICATION:'resilience-test-only'},...options});const {db,mf}=local;
  await seedAdministrators(db);const store=await mf.getR2Bucket('PUBLICATION');
  const key=await signingFixture('resilience-test');const worker=createWorker(jwksFetcher(()=>[key.publicJwk]).fetch,()=>{});
  const env={APP_ENV:'development',DB:db,PUBLICATION:store,ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin,MUTATIONS_ENABLED:'true'};
  const call=async(method,path,body={},version,overrides={},subject='subject-admin')=>{
    const token=await key.token(subject);const response=await worker.fetch(request(token,'/api/v1'+path,method,{'Origin':origin,'Content-Type':'application/json','X-Kuwago-Request':'1',...(version?{'If-Match':`"${version}"`}:{})},method==='GET'?undefined:JSON.stringify(body)),{...env,...overrides});
    return {status:response.status,...await response.json()};
  };
  const category=await call('POST','/categories',{slug:'synthetic-resilience',active:true,translations:{es:{name:'Solo prueba'},en:{name:'Test only'}}});assert.equal(category.status,201);
  await db.prepare(`INSERT INTO media_assets(id,private_object_key,derivative_object_key,state,provenance,usage_approval,sha256,mime_type,byte_size,width,height,uploaded_by,reviewed_by,reviewed_at)
    VALUES ('synthetic-media','development/quarantine/synthetic','development/derived/synthetic','approved','verified','approved',?,'image/png',1,1,1,'fixture-editor','fixture-admin','2026-01-01T00:00:00Z')`).bind('a'.repeat(64)).run();
  const publish=async(overrides={})=>{
    const draft=await call('POST','/services',{slug:'synthetic-'+crypto.randomUUID(),categoryId:category.category.id,internalNotes:'PRIVATE RESILIENCE TEST',translations:{es:{title:'Solo prueba',description:'No comercial'},en:{title:'Test only',description:'Not commercial'}},
      options:[{id:crypto.randomUUID(),translations:{es:{name:'Prueba'},en:{name:'Test'}},durationMinutes:60,experienceType:'private',venue:'in_property',price:{kind:'quote',currency:null,unit:'service'}}],
      media:[{id:'synthetic-media',sortOrder:0,alt:{es:'Prueba sintética',en:'Synthetic test'}}]},undefined,{},'subject-editor');assert.equal(draft.status,201);
    const id=draft.data.service.id,revisionId=draft.data.service.workingRevisionId;
    const approved=await call('POST',`/services/${id}/approve`,{revisionId,confirmCommercialApproval:true},draft.version);assert.equal(approved.status,200);
    return call('POST',`/services/${id}/publish`,{revisionId},approved.version,overrides);
  };
  const pub=async(overrides={})=>publicWorker.fetch(new Request('https://public.test.invalid/v1/catalog'),{APP_ENV:'development',PUBLICATION:store,CATALOG_BARRIER:localBarrier(db),...overrides});
  return {...local,store,call,publish,pub};
}

test('resilience: real scheduled handler in workerd drains pending events without a manual sync request',async()=>{
  const f=await fixture({script:readFileSync(new URL('../.wrangler/build/reconciler.js',import.meta.url),'utf8'),bindings:{APP_ENV:'development'},unsafeTriggerHandlers:true,cronTriggers:['* * * * *']});
  try{
    const result=await f.publish({PUBLICATION:offline});assert.equal(result.status,202);
    const event=await f.mf.dispatchFetch('http://localhost/cdn-cgi/local/scheduled?time='+(Date.now()+60000)+'&cron=*+*+*+*+*&format=json');
    assert.equal(event.status,200,await event.text());
    assert.equal((await reconciliationMetrics(f.db)).pendingCount,0);assert.equal((await f.pub()).status,200);
  }finally{await f.mf.dispose();}
});

test('resilience: persistent retry, withdrawal barrier, escalation and audited operator recovery',async()=>{
  const f=await fixture();const {db,store,call,pub}=f;
  try{
    const service=await f.publish();assert.equal(service.status,200);
    const withdrawn=await call('POST',`/services/${service.data.service.id}/unpublish`,{},service.version,{PUBLICATION:offline});
    assert.equal(withdrawn.status,202);assert.equal(withdrawn.delivery,'pending');assert.equal((await pub()).status,503);
    let item=await db.prepare('SELECT * FROM publication_outbox ORDER BY generation DESC LIMIT 1').first();assert.equal(item.retry_count,1);assert.equal(item.last_error_code,'delivery_failed');
    const beforeAttempts=item.attempts;await reconcileScheduled(db,offline,Date.now());
    assert.equal((await db.prepare('SELECT attempts FROM publication_outbox WHERE generation=?').bind(item.generation).first()).attempts,beforeAttempts);
    for(let attempt=1;attempt<retryLimit;attempt++){
      item=await db.prepare('SELECT * FROM publication_outbox WHERE generation=?').bind(item.generation).first();
      await reconcileScheduled(db,offline,item.next_attempt_at+1);
    }
    item=await db.prepare('SELECT * FROM publication_outbox WHERE generation=?').bind(item.generation).first();assert.equal(item.delivery_state,'escalated');
    const metrics=await reconciliationMetrics(db,Date.now()+3_600_000);assert.ok(metrics.oldestPendingMs>=120000);assert.equal(metrics.escalatedCount,1);
    const alerts=(await db.prepare('SELECT code FROM publication_alerts').all()).results.map(v=>v.code);assert.ok(alerts.includes('withdrawal_overdue'));assert.ok(alerts.includes('retry_exhausted'));
    assert.equal(await deliverCatalog(db,store,Date.now()+7_200_000),false);assert.equal((await pub()).status,503);
    assert.equal((await call('POST','/catalog/sync',{retryEscalated:true},undefined,{},'subject-editor')).status,403);
    assert.equal((await call('POST','/catalog/sync',{retryEscalated:true})).status,200);assert.equal((await pub()).status,200);
    assert.deepEqual((await (await pub()).json()).services,[]);
    assert.equal((await db.prepare("SELECT count(*) n FROM audit_events WHERE action='service.unpublish'").first()).n,1);
    assert.equal((await db.prepare("SELECT count(*) n FROM audit_events WHERE action='catalog.retry_authorized'").first()).n,1);
    assert.equal((await call('GET','/catalog/status')).pendingCount,0);
    assert.equal((await call('GET','/catalog/status',{},undefined,{},'subject-editor')).status,403);
  }finally{await f.mf.dispose();}
});

test('resilience: concurrent/duplicate delivery and publication followed by withdrawal preserve the newest state',async()=>{
  const f=await fixture();
  try{
    const pending=await f.publish({PUBLICATION:offline});assert.equal(pending.status,202);
    const result=await f.call('POST',`/services/${pending.data.service.id}/unpublish`,{},pending.version);assert.equal(result.status,200);
    const calls=await Promise.all([deliverCatalog(f.db,f.store),deliverCatalog(f.db,f.store),deliverCatalog(f.db,f.store)]);assert.ok(calls.every(Boolean));
    assert.deepEqual((await (await f.pub()).json()).services,[]);
    const outbox=(await f.db.prepare('SELECT delivery_state FROM publication_outbox ORDER BY generation').all()).results;
    assert.deepEqual(outbox.map(v=>v.delivery_state),['superseded','delivered']);
    assert.equal((await f.db.prepare("SELECT count(*) n FROM audit_events WHERE action='service.publish'").first()).n,1);
    const previous=await f.store.get('catalog/v1/current.json');const text=await previous.text();const stale=JSON.parse(text);stale.generation--;
    await f.store.put('catalog/v1/current.json',JSON.stringify(stale));assert.equal((await f.pub()).status,503);
    assert.equal(await deliverCatalog(f.db,f.store),true);assert.equal(await (await f.store.get('catalog/v1/current.json')).text(),text);
    const missing={async fetch(){return new Response(null,{status:503});}};assert.equal((await f.pub({CATALOG_BARRIER:missing})).status,503);
    assert.equal((await f.pub({CATALOG_BARRIER:undefined})).status,503);
  }finally{await f.mf.dispose();}
});

test('resilience: two synchronizers race a pending generation using one persistent lease',async()=>{
  const f=await fixture();
  try{
    await f.publish({PUBLICATION:offline});const now=Date.now()+60000;
    const outcomes=await Promise.all([deliverCatalog(f.db,f.store,now),deliverCatalog(f.db,f.store,now)]);
    assert.ok(outcomes.includes(true));
    const item=await f.db.prepare('SELECT * FROM publication_outbox ORDER BY generation DESC LIMIT 1').first();assert.equal(item.delivery_state,'delivered');assert.equal(item.lease_token,null);assert.ok(item.attempts<=3);
    assert.equal((await f.pub()).status,200);
  }finally{await f.mf.dispose();}
});

test('resilience: withdrawal between barrier reads rejects an in-flight old snapshot',async()=>{
  const f=await fixture();
  try{
    const service=await f.publish();let changed=false;
    const racing={put:(...args)=>f.store.put(...args),async get(key){const old=await f.store.get(key);if(key==='catalog/v1/current.json'&&!changed){changed=true;assert.equal((await f.call('POST',`/services/${service.data.service.id}/unpublish`,{},service.version)).status,200);}return old;}};
    assert.equal((await f.pub({PUBLICATION:racing})).status,503);
    assert.deepEqual((await (await f.pub()).json()).services,[]);
  }finally{await f.mf.dispose();}
});

test('resilience: delayed old synchronization cannot acknowledge or replace a later withdrawal',async()=>{
  const f=await fixture();
  try{
    const pending=await f.publish({PUBLICATION:offline});let unblock;let started;
    const blocked=new Promise(resolve=>{unblock=resolve;}),claimed=new Promise(resolve=>{started=resolve;});
    const delayed={put:(...args)=>f.store.put(...args),async get(key){if(key.startsWith('catalog/v2/')){started();await blocked;}return f.store.get(key);}};
    const old=deliverCatalog(f.db,delayed,Date.now()+60000);await claimed;
    const withdrawn=await f.call('POST',`/services/${pending.data.service.id}/unpublish`,{},pending.version);assert.equal(withdrawn.status,200);
    unblock();assert.equal(await old,false);assert.deepEqual((await (await f.pub()).json()).services,[]);
    assert.equal((await f.db.prepare("SELECT count(*) n FROM audit_events WHERE action='service.unpublish'").first()).n,1);
  }finally{await f.mf.dispose();}
});

test('resilience: restart checkpoint before retry exhaustion is redelivered after the lease expires',async()=>{
  const f=await fixture();
  try{
    await f.publish({PUBLICATION:offline});const now=Date.now()+60000;
    await f.db.prepare("UPDATE publication_outbox SET lease_token='terminated-local-process',lease_until=?,next_attempt_at=0 WHERE delivery_state='pending'").bind(now+30000).run();
    assert.equal(await deliverCatalog(f.db,f.store,now),false);
    assert.equal(await deliverCatalog(f.db,f.store,now+30001),true);
    assert.equal((await f.db.prepare('SELECT delivery_state FROM publication_outbox').first()).delivery_state,'delivered');
    assert.equal((await f.pub()).status,200);
  }finally{await f.mf.dispose();}
});

test('resilience: a partial restore never republishes a historical approved revision',async()=>{
  const source=await fixture();const target=await localDatabase({r2Buckets:{PUBLICATION:'isolated-recovery-test'}});
  try{
    let service=await source.publish();assert.equal(service.status,200);
    const revision=service.data.revisions.find(r=>r.id===service.data.service.workingRevisionId);
    service=await source.call('PATCH','/services/'+service.data.service.id,{slug:revision.slug,categoryId:revision.categoryId,translations:revision.translations,options:revision.options,
      media:revision.media.map(({id,sortOrder,alt})=>({id,sortOrder,alt})),internalNotes:'NEW PRIVATE WORKING REVISION'},service.version,{},'subject-editor');assert.equal(service.status,200);
    const backup=await createLogicalBackup(source.db,source.store);const auditRows=backup.data.tables.find(t=>t.name==='audit_events').rows;
    // A withdrawal newer than the backup remains intact in the source, never overwritten by restore.
    await source.call('POST',`/services/${service.data.service.id}/unpublish`,{},service.version);
    const restored=await restoreLogicalBackup(target.db,backup);assert.equal(restored.mode,'paused');assert.notEqual(restored.epoch,backup.data.sourceEpoch);
    const targetStore=await target.mf.getR2Bucket('PUBLICATION');await targetStore.put('catalog/v1/current.json',backup.data.materializedSnapshot);
    const pub=()=>publicWorker.fetch(new Request('https://public.test.invalid/v1/catalog'),{APP_ENV:'development',PUBLICATION:targetStore,CATALOG_BARRIER:localBarrier(target.db)});
    assert.equal((await pub()).status,503);assert.equal(await deliverCatalog(target.db,targetStore),false);
    assert.deepEqual((await target.db.prepare('SELECT * FROM audit_events').all()).results,auditRows);
    assert.equal((await target.db.prepare('SELECT count(*) n FROM service_revisions').first()).n,2);
    assert.ok((await target.db.prepare('SELECT revoked_at FROM commercial_approvals').first()).revoked_at);
    await resumeRecoveredEmpty(target.db,true);assert.equal(await deliverCatalog(target.db,targetStore),true);
    assert.deepEqual((await (await pub()).json()).services,[]);
    const verification=await verifyRecovery(target.db,targetStore);assert.equal(verification.foreignKeyViolations,0);assert.equal(verification.materializationMatches,true);
    const tampered=structuredClone(backup);tampered.data.tables[0].rows=[];
    await assert.rejects(restoreLogicalBackup(target.db,tampered),/backup_integrity/);
    await assert.rejects(restoreLogicalBackup(source.db,backup),/isolated_empty_destination/);
    assert.equal((await source.db.prepare("SELECT count(*) n FROM audit_events WHERE action='service.unpublish'").first()).n,1);
  }finally{await source.mf.dispose();await target.mf.dispose();}
});

test('resilience: failure between archive and current object is retried without losing the event',async()=>{
  const f=await fixture();
  try{
    const partial={get:key=>f.store.get(key),async put(key,...args){if(key==='catalog/v1/current.json')throw new Error('synthetic interruption after archive');return f.store.put(key,...args);}};
    const pending=await f.publish({PUBLICATION:partial});assert.equal(pending.status,202);assert.equal((await f.pub()).status,503);
    assert.equal((await f.db.prepare('SELECT delivery_state FROM publication_outbox').first()).delivery_state,'pending');
    assert.equal(await deliverCatalog(f.db,f.store,Date.now()+60000),true);assert.equal((await f.pub()).status,200);
    assert.equal((await f.db.prepare("SELECT count(*) n FROM audit_events WHERE action='service.publish'").first()).n,1);
  }finally{await f.mf.dispose();}
});

test('resilience: outage after confirmed delivery re-enters bounded retry and automatically heals',async()=>{
  const f=await fixture();
  try{
    assert.equal((await f.publish()).status,200);assert.equal(await deliverCatalog(f.db,offline),false);
    const pending=await f.db.prepare('SELECT delivery_state,retry_count FROM publication_outbox').first();
    assert.equal(pending.delivery_state,'pending');assert.equal(pending.retry_count,1);
    assert.equal(await deliverCatalog(f.db,f.store,Date.now()+60000),true);
    assert.equal((await f.pub()).status,200);
    assert.equal((await f.db.prepare("SELECT count(*) n FROM audit_events WHERE action='service.publish'").first()).n,1);
  }finally{await f.mf.dispose();}
});

test('resilience: corrupt persistent payload escalates instead of disappearing or producing public content',async()=>{
  const f=await fixture();
  try{
    await f.publish({PUBLICATION:offline});await f.db.prepare("UPDATE publication_outbox SET catalog_json='{}'").run();
    assert.equal(await deliverCatalog(f.db,f.store,Date.now()+60000),false);
    const item=await f.db.prepare('SELECT delivery_state,last_error_code FROM publication_outbox').first();assert.equal(item.delivery_state,'escalated');assert.equal(item.last_error_code,'snapshot_invalid');
    assert.equal((await f.pub()).status,503);assert.equal((await f.db.prepare('SELECT count(*) n FROM publication_commands').first()).n,1);
    assert.equal((await f.db.prepare("SELECT count(*) n FROM audit_events WHERE action='service.publish'").first()).n,1);
  }finally{await f.mf.dispose();}
});

test('resilience: invalid restored references roll back schema, principals and history in the isolated target',async()=>{
  const source=await fixture(),target=await localDatabase();
  try{
    await source.publish();const backup=await createLogicalBackup(source.db,source.store);
    backup.data.tables.find(t=>t.name==='service_revisions').rows[0].category_id='missing-restore-category';
    backup.sha256=createHash('sha256').update(JSON.stringify(backup.data)).digest('hex');
    const before=(await target.db.prepare('SELECT * FROM publication_control').all()).results;
    // workerd can surface a deferred commit violation as a generic internal error.
    await assert.rejects(restoreLogicalBackup(target.db,backup));
    assert.deepEqual((await target.db.prepare('SELECT * FROM publication_control').all()).results,before);
    assert.equal((await target.db.prepare('SELECT count(*) n FROM principals').first()).n,0);
    assert.equal((await target.db.prepare('SELECT count(*) n FROM services').first()).n,0);
    assert.ok((await target.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='audit_no_delete'").first()));
    assert.equal((await source.db.prepare("SELECT count(*) n FROM audit_events WHERE action='service.publish'").first()).n,1);
    assert.deepEqual((await target.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }finally{await source.mf.dispose();await target.mf.dispose();}
});

test('resilience: legacy payloads require explicit quarantine and cannot be silently regenerated',async()=>{
  const local=await localDatabase({r2Buckets:{PUBLICATION:'legacy-recovery-only'}},4);
  try{
    const {db}=local;await seedAdministrators(db);
    await db.batch([
      db.prepare("INSERT INTO services(id,provenance,working_revision_id) VALUES ('legacy','demo','legacy-revision')"),
      db.prepare("INSERT INTO service_revisions(id,service_id,number,created_by) VALUES ('legacy-revision','legacy',1,'fixture-editor')"),
      db.prepare("INSERT INTO publication_commands(id,service_id,actor_id,idempotency_key,action,expected_version) VALUES ('legacy-command','legacy','fixture-admin','legacy-key','publish',1)"),
      db.prepare("INSERT INTO publication_outbox(generation,command_id) VALUES (42,'legacy-command')"),
    ]);
    const sql=readFileSync(new URL('../../../../packages/database/migrations/0005_publication_resilience.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();
    await db.batch(sql.split(/;\s*(?=(?:CREATE|INSERT|DROP|ALTER|UPDATE|PRAGMA)\b)/).map(q=>db.prepare(q)));
    const store=await local.mf.getR2Bucket('PUBLICATION');assert.equal(await deliverCatalog(db,store),false);
    assert.equal((await db.prepare('SELECT mode FROM publication_control').first()).mode,'paused');
    await quarantineLegacy(db,true);await resumeRecoveredEmpty(db,true);assert.equal(await deliverCatalog(db,store),true);
    assert.equal((await db.prepare('SELECT delivery_state FROM publication_outbox').first()).delivery_state,'quarantined');
    assert.equal((await db.prepare('SELECT count(*) n FROM service_revisions').first()).n,1);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }finally{await local.mf.dispose();}
});

test('resilience: interrupted synchronizer recovers its durable lease after a real local runtime restart',async()=>{
  const directory=resolve('.wrangler/restart-test-'+crypto.randomUUID());mkdirSync(directory,{recursive:true});
  const persist={resourcePersistencePath:directory};const f=await fixture(persist);
  let restarted;
  try{
    await f.publish({PUBLICATION:offline});const now=Date.now()+60000;
    // Persisted checkpoint of a process terminated after claiming its final attempt.
    await f.db.prepare("UPDATE publication_outbox SET retry_count=?,next_attempt_at=0,lease_token='interrupted-test-lease',lease_until=? WHERE delivery_state='pending'").bind(retryLimit,now+30000).run();
    await f.mf.dispose();
    restarted=new Miniflare(convertV4MiniflareOptions({name:'kuwago-auth-test-only',host:'127.0.0.1',cf:false,telemetry:{enabled:false},modules:true,script:'export default {fetch(){return new Response(null,{status:404})}}',compatibilityDate:'2026-07-30',d1Databases:{DB:'ephemeral-auth-only'},r2Buckets:{PUBLICATION:'resilience-test-only'},...persist}));
    const db=await restarted.getD1Database('DB'),store=await restarted.getR2Bucket('PUBLICATION');
    assert.equal(await deliverCatalog(db,store,now+1000),false);
    await reconcileScheduled(db,store,now+31000);
    assert.equal((await db.prepare('SELECT delivery_state FROM publication_outbox ORDER BY generation DESC LIMIT 1').first()).delivery_state,'escalated');
    assert.equal((await db.prepare("SELECT count(*) n FROM audit_events WHERE action='service.publish'").first()).n,1);
  }finally{if(restarted)await restarted.dispose();else await f.mf.dispose();}
});
