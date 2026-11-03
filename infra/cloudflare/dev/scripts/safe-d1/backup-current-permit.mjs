import {openSync,writeFileSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {target,requireSafe,approvedSources} from './policy.mjs';
import {custodyRoot,verifyWindowsCustody} from './windows-custody.mjs';
export const currentBackupApproved=false; // One authorized export consumed and restored: c1763339-d083-45d7-9e81-934ee8da840a.
export const currentBackupId='b1c35aab-1bbe-490f-b527-1fe83ebaee3c';
export const currentBackupPrefix=resolve(custodyRoot,'backup-once-'+currentBackupId);
const permits=new WeakSet();
export function issueCurrentBackupPermit(){
 requireSafe(currentBackupApproved,'backup_not_authorized');verifyWindowsCustody();approvedSources();
 requireSafe(!existsSync(currentBackupPrefix+'.attempt.json')&&!existsSync(currentBackupPrefix+'.result.json'),'authorization_consumed');
 const fd=openSync(currentBackupPrefix+'.attempt.json','wx',0o600);
 try{writeFileSync(fd,JSON.stringify({target,authorizationId:currentBackupId,scope:'one full backup of post-bootstrap schema 6 before single-operator changes',maximumExportStarts:1,startedAt:new Date().toISOString()}));fsyncSync(fd);}finally{closeSync(fd);}
 const permit=Object.freeze({});permits.add(permit);return permit;
}
export const takeCurrentBackupPermit=permit=>permits.delete(permit);
