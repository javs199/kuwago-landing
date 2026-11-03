import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,target,digest,requireSafe} from './policy.mjs';
import {custodyRoot,verifyWindowsCustody,dpapi} from './windows-custody.mjs';
import {decryptEnvelope} from './encryption.mjs';
import {verifyRestorable} from './restore.mjs';
import {isBookmark} from './export.mjs';
import {isReadReceipt} from './read.mjs';
import {verifyStageOnePreparation} from './backup-stage-one.mjs';
export const batchBackupPins=Object.freeze({
 operationId:'62c608c3-60c6-41fd-a811-8c9f273fe259',
 ciphertextSha256:'7935096090980e3e4ffc278899b790af9d13151285a2fb2a33b9db9e9b22a596',
 evidenceSha256:'daae42483e896ab31929484676ccb2468500048dfb75064d1b4133eb238690b9',
 reportSha256:'18779dc86c5c6e5a0cd1350d31022e527fd0c84724842307244d48f3cbf2c8ed',
 resultSha256:'0549532605d00d2d267bd29ac90a8d838394302302ff52e1e2e367efb89e02b7',
});
const folder=resolve(custodyRoot,batchBackupPins.operationId),receipts=new WeakMap();
function checked(file,hash,max){const stat=lstatSync(file);requireSafe(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=max,'batch_backup_file_invalid');const bytes=readFileSync(file);requireSafe(digest(bytes)===hash,'batch_backup_hash_mismatch');return bytes;}
function files(){
 verifyWindowsCustody();verifyStageOnePreparation();requireSafe(lstatSync(folder).isDirectory()&&!lstatSync(folder).isSymbolicLink(),'batch_backup_folder_invalid');
 checked(resolve(root,'../../../docs/D1-BACKUP-ONLY-STAGE1-REMOTE-RESULT.md'),batchBackupPins.reportSha256,100000);
 const evidence=JSON.parse(checked(resolve(folder,'evidence.json'),batchBackupPins.evidenceSha256,16000));
 const result=JSON.parse(checked(resolve(custodyRoot,'backup-once-d4c76ea9-2bab-4817-a99e-f8032685aa35.result.json'),batchBackupPins.resultSha256,100000));
 requireSafe(evidence.restoreVerified===true&&evidence.exactSnapshotComparison===true&&result.verified===true&&result.cleanupComplete===true&&result.operationId===batchBackupPins.operationId,'batch_backup_evidence_invalid');
 return checked(resolve(folder,'backup.kwgbak'),batchBackupPins.ciphertextSha256,34000000);
}
export async function loadBatchBackup(){
 let clear,sql;try{
  clear=await decryptEnvelope(files(),{protector:dpapi});const payload=JSON.parse(clear.toString('utf8'));
  requireSafe(payload.operationId===batchBackupPins.operationId&&JSON.stringify(payload.target)===JSON.stringify(target)&&payload.sourceStage===1&&payload.applicationTables===21&&payload.historyEntries===1&&isBookmark(payload.bookmark),'batch_backup_payload_invalid');
  sql=Buffer.from(payload.sqlBase64,'base64');payload.sqlBase64=undefined;requireSafe(digest(sql)===payload.sqlSha256,'batch_backup_sql_invalid');
  const restored=await verifyRestorable(sql,payload.sourceFingerprint);requireSafe(restored.tables===23&&restored.rows===22,'batch_backup_restore_invalid');
  const receipt=Object.freeze({operationId:batchBackupPins.operationId});receipts.set(receipt,{fingerprint:payload.sourceFingerprint,bookmark:payload.bookmark});return receipt;
 }finally{clear?.fill(0);sql?.fill(0);}
}
export const isBatchBackupReceipt=r=>receipts.has(r);
export function batchBackupState(r){const s=receipts.get(r);requireSafe(s,'batch_backup_receipt_invalid');return Object.freeze({...s});}
export function verifyBatchBackup(r,state){requireSafe(isReadReceipt(state)&&state.stage>=1&&state.stage<=5&&receipts.has(r),'batch_backup_preflight_invalid');files();return Object.freeze({operationId:batchBackupPins.operationId,sha256:batchBackupPins.ciphertextSha256,bookmark:receipts.get(r).bookmark});}
