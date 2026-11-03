import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {custodyRoot,dpapi} from './windows-custody.mjs';
import {approvedSources,target,migrations,digest,requireSafe} from './policy.mjs';
import {finalBackupPins,loadFinalBackup} from './final-backup-receipt.mjs';
import {decryptEnvelope} from './encryption.mjs';
import {splitMigration} from './sql.mjs';
import {captureDatabase,snapshotFingerprint} from './snapshot.mjs';
const prefix=resolve(custodyRoot,'migration-0004-0006-3771d065-f5e5-4bb0-b0fc-0091834f92c8');
export function stageFourWriteEvidence(){
 const checks=[['.attempt.json','54a0398c581e303674cc718b7809fb23a57962a5bf9016ba2552f0509b10ba08'],['.stage-3.started.json','b67f28a93479a0f955bc806930030c165f73b9ef5e11b8fcb93336440963fb2c'],['.result.json','0b2bb9cde45c154895d77dc323a657630ab30d56cfc2ef5f2736b659ddf038cd']];
 const [attempt,started,result]=checks.map(([suffix,hash])=>{const bytes=readFileSync(prefix+suffix);requireSafe(digest(bytes)===hash,'stage_four_evidence_hash_mismatch');return JSON.parse(bytes);});
 approvedSources();requireSafe(started.migration===migrations[3].name&&started.migrationSha256===migrations[3].sha256&&result.writeAttempts===1&&result.errorCode==='postflight_concurrent_change','stage_four_write_evidence_invalid');
 return {startedAt:attempt.startedAt,finishedAt:result.finishedAt,migrationSha256:started.migrationSha256,hashStoredInD1Ledger:false};
}
export function checkedStageFourHistory(history,evidence=stageFourWriteEvidence()){
 requireSafe(Array.isArray(history)&&history.length===4&&history.every((r,i)=>r.id===i+1&&r.name===migrations[i].name&&typeof r.applied_at==='string'),'stage_four_history_mismatch');
 const stamp=history[3].applied_at,t=Date.parse(stamp+'Z');
 requireSafe(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp)&&Number.isFinite(t)&&new Date(t).toISOString().slice(0,19).replace('T',' ')===stamp&&t>=Date.parse(evidence.startedAt)-1000&&t<=Date.parse(evidence.finishedAt)+1000,'stage_four_timestamp_outside_attempt');
 return stamp;
}
// Local oracle only: restore approved encrypted stage-three SQL and apply original
// 0004 in ephemeral workerd. Remote code has no write/export capability.
export async function expectedStageFourSnapshot(history,{writeEvidence=stageFourWriteEvidence()}={}){
 const timestamp=checkedStageFourHistory(history,writeEvidence);await loadFinalBackup();let clear,sql,mf;
 try{
  clear=await decryptEnvelope(readFileSync(resolve(custodyRoot,finalBackupPins.operationId,'backup.kwgbak')),{protector:dpapi});const p=JSON.parse(clear.toString('utf8'));sql=Buffer.from(p.sqlBase64,'base64');p.sqlBase64=undefined;requireSafe(digest(sql)===p.sqlSha256,'expected_source_invalid');
  mf=new Miniflare(convertV4MiniflareOptions({name:'kuwago-stage4-oracle-local',host:'127.0.0.1',modules:true,script:'export default {fetch(){return new Response(null,{status:503})}}',compatibilityDate:'2026-07-30',telemetry:{enabled:false},cf:false,d1Databases:{DB:'ephemeral-stage4-oracle'}}));
  const db=await mf.getD1Database('DB');await db.batch(splitMigration(sql.toString('utf8')).map(q=>db.prepare(q)));
  await db.batch([...splitMigration(approvedSources()[3]).map(q=>db.prepare(q)),db.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(4,?,?)').bind(migrations[3].name,timestamp)]);
  return await captureDatabase({metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async q=>(await db.prepare(q).all()).results});
 }finally{clear?.fill(0);sql?.fill(0);await mf?.dispose();}
}
export function snapshotDifferences(expected,actual){
 const differences=[];
 if(JSON.stringify(expected.snapshot.schema)!==JSON.stringify(actual.snapshot.schema))differences.push({kind:'schema_hash_mismatch'});
 const names=new Set([...expected.snapshot.tables.map(t=>t.name),...actual.snapshot.tables.map(t=>t.name)]);
 for(const name of names){const a=expected.snapshot.tables.find(t=>t.name===name),b=actual.snapshot.tables.find(t=>t.name===name);if(JSON.stringify(a)!==JSON.stringify(b))differences.push({kind:'table_mismatch',table:name,expectedRows:a?.rows.length??null,actualRows:b?.rows.length??null,columnsMatch:JSON.stringify(a?.columns)===JSON.stringify(b?.columns)});}
 return {matches:snapshotFingerprint(expected.snapshot)===snapshotFingerprint(actual.snapshot),differences};
}
