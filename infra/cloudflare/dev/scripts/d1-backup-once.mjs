import {writeFileSync} from 'node:fs';
import {assertEnvironment,requireSafe} from './safe-d1/policy.mjs';
import {decodeRecoverySecret} from './safe-d1/recovery-format.mjs';
import {issueBackupOncePermit,backupAuthorizationId,backupResultFile,backupExecutionApproved,backupIntendedPermission} from './safe-d1/backup-once-permit.mjs';
import {createBackupTransport} from './safe-d1/backup-transport.mjs';
import {runBackupOnly} from './safe-d1/backup-only.mjs';
import {createEncryptedStore} from './safe-d1/encrypted-store.mjs';
import {custodyRoot,verifyWindowsCustody,dpapi} from './safe-d1/windows-custody.mjs';
import {backupExpectedStage,verifyStageFourPreparation} from './safe-d1/backup-stage-four.mjs';
const chunks=[];let joined,token,key,transport,consumed=false;
try{
 requireSafe(backupExecutionApproved,'remote_backup_not_authorized');
 requireSafe(process.argv.length===2&&!process.stdin.isTTY,'private_pipe_required');assertEnvironment(process.env);
 verifyStageFourPreparation();
 let size=0;for await(const part of process.stdin){chunks.push(part);size+=part.length;requireSafe(size<=8192,'private_input_limit');}
 joined=Buffer.concat(chunks);const input=JSON.parse(joined.toString('utf8'));
 requireSafe(Object.keys(input).sort().join(',')==='recoverySecretBase64,token','private_input_invalid');
 token=input.token;requireSafe(typeof token==='string'&&/^[-_A-Za-z0-9]{20,256}$/.test(token),'credential_invalid');key=decodeRecoverySecret(input.recoverySecretBase64);input.token=undefined;input.recoverySecretBase64=undefined;
 const permit=issueBackupOncePermit();consumed=true;transport=createBackupTransport(token,{oneShotPermit:permit});token=undefined;
 const result=await runBackupOnly({transport,store:createEncryptedStore(custodyRoot,verifyWindowsCustody),protector:dpapi,recoverySecret:key,expectedStage:backupExpectedStage,mode:'remote-single-authorized-stage-four-backup'});
 result.authorizationId=backupAuthorizationId;result.intendedTokenPermission=backupIntendedPermission;result.tokenPermissionIndependentlyVerified=false;result.finishedAt=new Date().toISOString();
 writeFileSync(backupResultFile,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:result.verified&&result.cleanupComplete?'PASS':'FAIL',authorizationId:backupAuthorizationId}));process.exitCode=result.verified&&result.cleanupComplete?0:2;
}catch{
 if(consumed)try{writeFileSync(backupResultFile,JSON.stringify({authorizationId:backupAuthorizationId,status:'failed_local',verified:false}),{flag:'wx',mode:0o600});}catch{/* Never overwrite evidence or echo secrets. */}
 console.log(JSON.stringify({status:backupExecutionApproved?'FAIL':'BLOCKED',authorizationId:backupAuthorizationId}));process.exitCode=2;
}finally{transport?.dispose();key?.fill(0);joined?.fill(0);for(const chunk of chunks)chunk.fill(0);token=undefined;delete process.env.CLOUDFLARE_API_TOKEN;requireSafe(token===undefined,'credential_cleanup_failed');}
