import {openSync,writeFileSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody} from './windows-custody.mjs';
import {target,requireSafe} from './policy.mjs';
// Authorized stage-four backup completed and consumed. Preserve all evidence.
export const backupAuthorizationId='472f450d-3410-4808-a491-c14aa3cc16ae';
export const backupExecutionApproved=false;
export const backupIntendedPermission='D1 Read + D1 Write';
export const backupAttemptFile=resolve(custodyRoot,'backup-once-'+backupAuthorizationId+'.attempt.json');
export const backupResultFile=resolve(custodyRoot,'backup-once-'+backupAuthorizationId+'.result.json');
const permits=new WeakSet();
export function issueBackupOncePermit(){
 requireSafe(backupExecutionApproved,'remote_backup_not_authorized');
 verifyWindowsCustody();requireSafe(!existsSync(backupResultFile),'backup_authorization_already_used');
 const fd=openSync(backupAttemptFile,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify({authorizationId:backupAuthorizationId,target,startedAt:new Date().toISOString(),maximumExportStarts:1}));fsyncSync(fd);}finally{closeSync(fd);}
 const permit=Object.freeze({});permits.add(permit);return permit;
}
export function takeBackupOncePermit(permit){return permits.delete(permit);}
