import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {digest,requireSafe,target} from './policy.mjs';
import {isReadReceipt} from './read.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
import {isBookmark} from './export.mjs';
import {verifyRestorable} from './restore.mjs';
import {isEncryptedBackupReceipt,verifyEncryptedBackup} from './encrypted-backup-receipt.mjs';
import {isBatchBackupReceipt,verifyBatchBackup} from './batch-backup-receipt.mjs';
import {isFinalBackupReceipt,verifyFinalBackup} from './final-backup-receipt.mjs';
import {isCompletionBackupReceipt,verifyCompletionBackup} from './completion-backup.mjs';
const receipts=new WeakMap();
// No baseline fallback: the downloaded full SQL must restore and match the entire source snapshot.
export async function captureBackup(reader,file,operationId){
 const before=await reader.snapshot(),bookmark=await reader.bookmark();requireSafe(isBookmark(bookmark),'time_travel_unavailable');
 const exported=await reader.fullExport(bookmark);requireSafe(exported?.bookmark===bookmark&&exported.bytes instanceof Uint8Array,'export_missing_or_mismatched');
 const after=await reader.snapshot(),endBookmark=await reader.bookmark();const fingerprint=snapshotFingerprint(before.snapshot);
 requireSafe(endBookmark===bookmark&&before.stage===after.stage&&fingerprint===snapshotFingerprint(after.snapshot),'backup_source_changed');
 const restore=await verifyRestorable(exported.bytes,fingerprint);requireSafe(restore.ok&&restore.fingerprint===fingerprint,'backup_restore_failed');
 const sqlFile=file+'.sql';writeFileSync(sqlFile,exported.bytes,{flag:'wx',mode:0o600});
 const data={format:2,target,operationId,kind:'complete-sql-and-time-travel',stage:before.stage,sourceFingerprint:fingerprint,exportSha256:digest(exported.bytes),exportBytes:exported.bytes.byteLength,bookmark,restoreVerified:true,tableCount:restore.tables,rowCount:restore.rows,createdAt:Date.now(),expiresAt:Date.now()+600000};
 const serialized=JSON.stringify(data);writeFileSync(file,serialized,{flag:'wx',mode:0o600});
 const receipt=Object.freeze({file,operationId});receipts.set(receipt,{sha256:digest(serialized),sqlFile});verifyBackupFiles(receipt);return receipt;
}
export function verifyBackupFiles(receipt){
 const known=receipts.get(receipt);requireSafe(known,'backup_missing_or_forged');let serialized,bytes;
 try{requireSafe(lstatSync(receipt.file).isFile()&&!lstatSync(receipt.file).isSymbolicLink()&&lstatSync(known.sqlFile).isFile()&&!lstatSync(known.sqlFile).isSymbolicLink(),'backup_file_invalid');serialized=readFileSync(receipt.file,'utf8');bytes=readFileSync(known.sqlFile);}catch{throw Error('backup_missing_or_invalid');}
 requireSafe(digest(serialized)===known.sha256,'backup_invalid');
 const data=JSON.parse(serialized);requireSafe(data.format===2&&data.kind==='complete-sql-and-time-travel'&&data.restoreVerified===true&&isBookmark(data.bookmark)&&data.exportBytes===bytes.byteLength&&digest(bytes)===data.exportSha256,'backup_export_invalid');
 requireSafe(JSON.stringify(data.target)===JSON.stringify(target)&&data.operationId===receipt.operationId&&Date.now()>=data.createdAt&&Date.now()<=data.expiresAt,'backup_expired_or_mismatched');return data;
}
export function verifyBackup(receipt,state){if(isCompletionBackupReceipt(receipt))return verifyCompletionBackup(receipt,state);if(isFinalBackupReceipt(receipt))return verifyFinalBackup(receipt,state);if(isBatchBackupReceipt(receipt))return verifyBatchBackup(receipt,state);if(isEncryptedBackupReceipt(receipt))return verifyEncryptedBackup(receipt,state);requireSafe(isReadReceipt(state),'backup_preflight_invalid');const data=verifyBackupFiles(receipt);requireSafe(data.stage===0,'backup_not_first_install');return Object.freeze({sha256:data.exportSha256,bookmark:data.bookmark,operationId:receipt.operationId});}
