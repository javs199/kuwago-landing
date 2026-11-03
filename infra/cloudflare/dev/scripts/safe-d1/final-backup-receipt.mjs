import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,target,digest,requireSafe} from './policy.mjs';
import {custodyRoot,verifyWindowsCustody,dpapi} from './windows-custody.mjs';
import {decryptEnvelope} from './encryption.mjs';
import {verifyRestorable} from './restore.mjs';
import {isBookmark} from './export.mjs';
import {isReadReceipt} from './read.mjs';
import {verifyStageThreePreparation} from './backup-stage-three.mjs';
export const finalBackupPins=Object.freeze({operationId:'249fc1c0-e980-4197-a2f9-ced122f72dd2',ciphertextSha256:'ce4405f5434cef2eaa2b23c2cfe0a75b24109b7b77971c394cf3e9312d736df9',evidenceSha256:'2a877de11cd8ae58d96c75ff4afc7d3b413592a82baf775208dce486c61224a4',resultSha256:'d2681b231f94269819b819531fb1091f769f25ab4108d348f779a693130289c0',reportSha256:'6860aaaa0d400d18236bcff8180787315d12164c1e4b476d1046eac8e8d294ea'});
const folder=resolve(custodyRoot,finalBackupPins.operationId),receipts=new WeakMap();
function checked(file,hash,max){const s=lstatSync(file);requireSafe(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max,'final_backup_file_invalid');const bytes=readFileSync(file);requireSafe(digest(bytes)===hash,'final_backup_hash_mismatch');return bytes;}
function files(){
 verifyWindowsCustody();verifyStageThreePreparation();requireSafe(lstatSync(folder).isDirectory()&&!lstatSync(folder).isSymbolicLink(),'final_backup_folder_invalid');
 checked(resolve(root,'../../../docs/D1-BACKUP-ONLY-STAGE3-REMOTE-RESULT.md'),finalBackupPins.reportSha256,100000);
 const e=JSON.parse(checked(resolve(folder,'evidence.json'),finalBackupPins.evidenceSha256,16000)),r=JSON.parse(checked(resolve(custodyRoot,'backup-once-6d61db52-444c-476d-b258-64dd4e323bd5.result.json'),finalBackupPins.resultSha256,150000));
 requireSafe(e.restoreVerified===true&&e.sourceStage===3&&e.exactSnapshotComparison===true&&r.verified===true&&r.cleanupComplete===true&&r.operationId===finalBackupPins.operationId&&r.historyEntries===3&&r.applicationTables===24,'final_backup_evidence_invalid');
 return checked(resolve(folder,'backup.kwgbak'),finalBackupPins.ciphertextSha256,34000000);
}
export async function loadFinalBackup(){
 let clear,sql;try{clear=await decryptEnvelope(files(),{protector:dpapi});const p=JSON.parse(clear.toString('utf8'));
  requireSafe(p.operationId===finalBackupPins.operationId&&JSON.stringify(p.target)===JSON.stringify(target)&&p.sourceStage===3&&p.applicationTables===24&&p.historyEntries===3&&isBookmark(p.bookmark),'final_backup_payload_invalid');
  sql=Buffer.from(p.sqlBase64,'base64');p.sqlBase64=undefined;requireSafe(digest(sql)===p.sqlSha256,'final_backup_sql_invalid');const restored=await verifyRestorable(sql,p.sourceFingerprint);requireSafe(restored.tables===26&&restored.rows===51,'final_backup_restore_invalid');
  const receipt=Object.freeze({operationId:finalBackupPins.operationId});receipts.set(receipt,{fingerprint:p.sourceFingerprint,bookmark:p.bookmark});return receipt;
 }finally{clear?.fill(0);sql?.fill(0);}
}
export const isFinalBackupReceipt=r=>receipts.has(r);
export function finalBackupState(r){const s=receipts.get(r);requireSafe(s,'final_backup_receipt_invalid');return Object.freeze({...s});}
export function verifyFinalBackup(r,state){requireSafe(isReadReceipt(state)&&state.stage>=3&&state.stage<=5&&receipts.has(r),'final_backup_preflight_invalid');files();return Object.freeze({operationId:finalBackupPins.operationId,sha256:finalBackupPins.ciphertextSha256,bookmark:receipts.get(r).bookmark});}
