import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,target,requireSafe,digest} from './policy.mjs';
import {custodyRoot,verifyWindowsCustody,dpapi} from './windows-custody.mjs';
import {decryptEnvelope} from './encryption.mjs';
import {verifyRestorable} from './restore.mjs';
import {isBookmark} from './export.mjs';
import {stageSixFingerprint} from './backup-stage-six.mjs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitMigration} from './sql.mjs';
import {captureDatabase,snapshotFingerprint} from './snapshot.mjs';
const receipts=new WeakMap();
// Production evidence can only be loaded from an approved, pinned encrypted
// stage-6 backup outside Git. The old stage-4 backup cannot satisfy this loader.
export async function loadBootstrapRecovery(){
 verifyWindowsCustody();const a=JSON.parse(readFileSync(resolve(root,'next-stage/bootstrap-authorization.json')));
 requireSafe(/^[a-f0-9-]{36}$/.test(a.stageSixBackupOperationId)&&/^[a-f0-9]{64}$/.test(a.stageSixBackupEvidenceSha256)&&/^[a-f0-9]{64}$/.test(a.stageSixBackupCipherSha256),'bootstrap_stage_six_backup_missing');
 const folder=resolve(custodyRoot,a.stageSixBackupOperationId);
 requireSafe(lstatSync(folder).isDirectory()&&!lstatSync(folder).isSymbolicLink(),'bootstrap_backup_directory_invalid');
 const checked=(name,hash)=>{const f=resolve(folder,name);requireSafe(lstatSync(f).isFile()&&!lstatSync(f).isSymbolicLink(),'bootstrap_backup_file_invalid');const bytes=readFileSync(f);requireSafe(digest(bytes)===hash,'bootstrap_backup_hash_mismatch');return bytes;};
 const evidence=JSON.parse(checked('evidence.json',a.stageSixBackupEvidenceSha256));
 requireSafe(evidence.operationId===a.stageSixBackupOperationId&&JSON.stringify(evidence.target)===JSON.stringify(target)&&evidence.sourceStage===6&&evidence.restoreVerified===true&&evidence.exactSnapshotComparison===true,'bootstrap_backup_evidence_invalid');
 let clear,sql;
 try{
  clear=await decryptEnvelope(checked('backup.kwgbak',a.stageSixBackupCipherSha256),{protector:dpapi});
  const payload=JSON.parse(clear.toString('utf8'));sql=Buffer.from(payload.sqlBase64,'base64');payload.sqlBase64=undefined;
  requireSafe(payload.sourceStage===6&&payload.operationId===evidence.operationId&&JSON.stringify(payload.target)===JSON.stringify(target)&&payload.sourceFingerprint===stageSixFingerprint&&digest(sql)===payload.sqlSha256&&isBookmark(payload.bookmark),'bootstrap_backup_payload_invalid');
  await verifyRestorable(sql,stageSixFingerprint);
  let mf,snapshot;
  try{
   mf=new Miniflare(convertV4MiniflareOptions({name:'bootstrap-recovery-isolated',host:'127.0.0.1',modules:true,script:'export default {fetch(){return new Response(null,{status:503})}}',compatibilityDate:'2026-07-30',telemetry:{enabled:false},cf:false,d1Databases:{DB:'bootstrap-backup-proof-only'}}));
   const db=await mf.getD1Database('DB');await db.batch(splitMigration(sql.toString('utf8')).map(q=>db.prepare(q)));
   snapshot=await captureDatabase({metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async q=>(await db.prepare(q).all()).results});
   requireSafe(snapshot.stage===6&&snapshotFingerprint(snapshot.snapshot)===stageSixFingerprint,'bootstrap_recovery_projection_mismatch');
  }finally{await mf?.dispose();}
  const receipt=Object.freeze({});receipts.set(receipt,{environment:'development',fingerprint:stageSixFingerprint,evidenceSha256:a.stageSixBackupEvidenceSha256,snapshot});return receipt;
 }finally{clear?.fill(0);sql?.fill(0);}
}
// Test-only evidence is produced by actual isolated restoration and is marked
// local-simulation. A production runner rejects it even if its SQL is valid.
export async function verifySimulationRecovery(sql,fingerprint){
 await verifyRestorable(sql,fingerprint);const receipt=Object.freeze({});receipts.set(receipt,{environment:'local-simulation',fingerprint,evidenceSha256:digest(sql)});return receipt;
}
export function bootstrapRecoveryState(receipt,environment){const r=receipts.get(receipt);requireSafe(r&&r.environment===environment,'bootstrap_recovery_receipt_invalid');return Object.freeze({...r});}
