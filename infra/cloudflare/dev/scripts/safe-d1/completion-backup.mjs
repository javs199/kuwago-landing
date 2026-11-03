import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,target,digest,requireSafe} from './policy.mjs';
import {custodyRoot,verifyWindowsCustody,dpapi} from './windows-custody.mjs';
import {decryptEnvelope} from './encryption.mjs';
import {verifyRestorable} from './restore.mjs';
import {isBookmark} from './export.mjs';
import {isReadReceipt} from './read.mjs';
import {verifyStageFourPreparation,expectedStageFourFingerprint} from './backup-stage-four.mjs';
export const completionBackupPins=Object.freeze({operationId:'4e5b4fc2-8f1e-44e1-b2e5-f7ca82d40749',ciphertextSha256:'6283323d913b68ce1781553aeeac2a28e1fdd0833f73b9edd6c1535171a4356c',evidenceSha256:'064b8745f6c79dbb0fb265eee8abacd643c6bec53fc4d81388e9b383d3c859a8',resultSha256:'601582fde7e401cda8647b1534837158388e2ab7f94e5a316b36add51b4fcbc6',reportSha256:'904f43276cf8180d656f19b3c0d631c7298f6deb5da8de9cbb2a416fdeb45a90'});
const folder=resolve(custodyRoot,completionBackupPins.operationId),receipts=new WeakMap();
function checked(file,hash,max){const s=lstatSync(file);requireSafe(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max,'completion_backup_file_invalid');const bytes=readFileSync(file);requireSafe(digest(bytes)===hash,'completion_backup_hash_mismatch');return bytes;}
function files(){
 verifyWindowsCustody();verifyStageFourPreparation();requireSafe(lstatSync(folder).isDirectory()&&!lstatSync(folder).isSymbolicLink(),'completion_backup_directory_invalid');
 checked(resolve(root,'../../../docs/D1-BACKUP-ONLY-STAGE4-REMOTE-RESULT.md'),completionBackupPins.reportSha256,100000);
 const e=JSON.parse(checked(resolve(folder,'evidence.json'),completionBackupPins.evidenceSha256,16000)),r=JSON.parse(checked(resolve(custodyRoot,'backup-once-472f450d-3410-4808-a491-c14aa3cc16ae.result.json'),completionBackupPins.resultSha256,200000));
 requireSafe(e.restoreVerified&&e.sourceStage===4&&r.verified&&r.cleanupComplete&&r.historyEntries===4&&r.operationId===completionBackupPins.operationId,'completion_backup_evidence_invalid');
 return checked(resolve(folder,'backup.kwgbak'),completionBackupPins.ciphertextSha256,34000000);
}
export async function withCompletionSql(callback){let clear,sql;try{clear=await decryptEnvelope(files(),{protector:dpapi});const p=JSON.parse(clear.toString('utf8'));requireSafe(p.operationId===completionBackupPins.operationId&&JSON.stringify(p.target)===JSON.stringify(target)&&p.sourceStage===4&&p.sourceFingerprint===expectedStageFourFingerprint&&isBookmark(p.bookmark),'completion_backup_payload_invalid');sql=Buffer.from(p.sqlBase64,'base64');p.sqlBase64=undefined;requireSafe(digest(sql)===p.sqlSha256,'completion_backup_sql_invalid');return await callback(sql,{fingerprint:p.sourceFingerprint,bookmark:p.bookmark});}finally{clear?.fill(0);sql?.fill(0);}}
export async function loadCompletionBackup(){return withCompletionSql(async(sql,data)=>{const r=await verifyRestorable(sql,data.fingerprint);requireSafe(r.tables===28&&r.rows===53,'completion_backup_restore_invalid');const receipt=Object.freeze({operationId:completionBackupPins.operationId});receipts.set(receipt,data);return receipt;});}
export const isCompletionBackupReceipt=r=>receipts.has(r);
export function completionBackupState(r){const d=receipts.get(r);requireSafe(d,'completion_backup_receipt_invalid');return Object.freeze({...d});}
export function verifyCompletionBackup(r,state){requireSafe(receipts.has(r)&&isReadReceipt(state)&&[4,5].includes(state.stage),'completion_backup_preflight_invalid');files();return {operationId:completionBackupPins.operationId,sha256:completionBackupPins.ciphertextSha256,bookmark:receipts.get(r).bookmark};}
