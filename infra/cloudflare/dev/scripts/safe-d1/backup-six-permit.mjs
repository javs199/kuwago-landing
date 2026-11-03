import {readFileSync,existsSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,target,requireSafe} from './policy.mjs';
import {custodyRoot,verifyWindowsCustody} from './windows-custody.mjs';
import {verifyStageSixClosure,stageSixFingerprint} from './backup-stage-six.mjs';
export const stageSixBackupApproved=false; // Authorized attempt 17fe22b3 completed; evidence preserved, no retry.
export const stageSixBackupId='17fe22b3-a7bf-4a86-954b-f4d7c35a7db6';
export const stageSixBackupPrefix=resolve(custodyRoot,'backup-once-'+stageSixBackupId);
const permits=new WeakSet();
export function issueStageSixBackupPermit(){
 requireSafe(stageSixBackupApproved,'stage_six_export_not_authorized');verifyWindowsCustody();verifyStageSixClosure();
 const p=JSON.parse(readFileSync(resolve(root,'next-stage/stage-six-backup-proposal.json')));
 requireSafe(p.approved===true&&p.executionId===stageSixBackupId&&p.expectedStage===6&&p.expectedFingerprint===stageSixFingerprint&&JSON.stringify(p.target)===JSON.stringify(target)&&p.maximumExportStarts===1&&!p.migrationsAllowed&&!p.bootstrapAllowed&&!existsSync(stageSixBackupPrefix+'.result.json'),'stage_six_backup_scope_mismatch');
 const fd=openSync(stageSixBackupPrefix+'.attempt.json','wx',0o600);
 try{writeFileSync(fd,JSON.stringify({target,authorizationId:stageSixBackupId,maximumExportStarts:1,startedAt:new Date().toISOString()}));fsyncSync(fd);}finally{closeSync(fd);}
 const permit=Object.freeze({});permits.add(permit);return permit;
}
export const takeStageSixBackupPermit=permit=>permits.delete(permit);
