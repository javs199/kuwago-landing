import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,target,digest,requireSafe} from './policy.mjs';
import {custodyRoot,verifyWindowsCustody,dpapi} from './windows-custody.mjs';
import {decryptEnvelope} from './encryption.mjs';
import {verifyRestorable} from './restore.mjs';
import {isBookmark} from './export.mjs';
import {isReadReceipt} from './read.mjs';
const operationId='7a492026-01dd-49fc-9ecb-40997d5b9e56';
const folder=resolve(custodyRoot,operationId),file=resolve(folder,'backup.kwgbak'),evidenceFile=resolve(folder,'evidence.json');
const reportFile=resolve(root,'../../../docs/D1-BACKUP-ONLY-READ-WRITE-REMOTE-RESULT.md');
export const encryptedBackupPins=Object.freeze({operationId,file,evidenceFile,reportFile,ciphertextSha256:'bb6720bef5a5ce514e8ffb4867c31026ed88adb76cdcc4082f9a7664bb14eb37',evidenceSha256:'4d4df4d0f77abbec457209014bc342c5312961e9afd8e300edfa4d00088d1ed3',reportSha256:'72e9b7cb74fdc755b47d938037fe940063c3705a0c8652404d56586a72e6c19a'});
const receipts=new WeakMap();
function checked(file,max){const stat=lstatSync(file);requireSafe(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=max,'backup_file_invalid');return readFileSync(file);}
function verifyFiles(){
 verifyWindowsCustody();requireSafe(lstatSync(folder).isDirectory()&&!lstatSync(folder).isSymbolicLink(),'backup_directory_invalid');
 const encrypted=checked(file,34000000),evidence=checked(evidenceFile,16000),report=checked(reportFile,100000);
 requireSafe(digest(encrypted)===encryptedBackupPins.ciphertextSha256&&digest(evidence)===encryptedBackupPins.evidenceSha256&&digest(report)===encryptedBackupPins.reportSha256,'approved_backup_hash_mismatch');
 return {encrypted,evidence:JSON.parse(evidence.toString('utf8'))};
}
export async function loadApprovedEncryptedBackup(){
 let bytes,sql;
 try{
  const {encrypted,evidence}=verifyFiles();requireSafe(evidence.operationId===operationId&&evidence.restoreVerified===true&&evidence.encryptedSha256===encryptedBackupPins.ciphertextSha256&&JSON.stringify(evidence.target)===JSON.stringify(target),'backup_evidence_invalid');
  bytes=await decryptEnvelope(encrypted,{protector:dpapi});const payload=JSON.parse(bytes.toString('utf8'));
  requireSafe(payload.operationId===operationId&&JSON.stringify(payload.target)===JSON.stringify(target)&&isBookmark(payload.bookmark),'backup_identity_or_bookmark_invalid');
  sql=Buffer.from(payload.sqlBase64,'base64');payload.sqlBase64=undefined;requireSafe(digest(sql)===payload.sqlSha256,'backup_sql_hash_invalid');
  const restored=await verifyRestorable(sql,payload.sourceFingerprint);requireSafe(restored.tables===0&&restored.rows===0,'backup_not_empty_baseline');
  const receipt=Object.freeze({operationId});receipts.set(receipt,{bookmark:payload.bookmark,fingerprint:payload.sourceFingerprint});return receipt;
 }finally{bytes?.fill(0);sql?.fill(0);}
}
export const isEncryptedBackupReceipt=receipt=>receipts.has(receipt);
export function approvedBackupState(receipt){const value=receipts.get(receipt);requireSafe(value,'backup_receipt_invalid');return Object.freeze({...value});}
export function verifyEncryptedBackup(receipt,state){
 requireSafe(isReadReceipt(state)&&state.stage===0&&receipts.has(receipt),'encrypted_backup_preflight_invalid');verifyFiles();
 return Object.freeze({sha256:encryptedBackupPins.ciphertextSha256,bookmark:receipts.get(receipt).bookmark,operationId});
}
