import {writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {assertEnvironment,approvedSources,assertRuntime,requireSafe} from './safe-d1/policy.mjs';
import {loadApprovedEncryptedBackup,encryptedBackupPins} from './safe-d1/encrypted-backup-receipt.mjs';
import {firstMigrationApproved,firstMigrationVerifiedBaselineEnabled,firstMigrationAuthorizationId,firstMigrationAttemptFile,firstMigrationResultFile,issueFirstMigrationPermit} from './safe-d1/migration-0001-permit.mjs';
import {createTransport} from './safe-d1/transport.mjs';
import {runFirstMigration} from './safe-d1/migration-0001-runner.mjs';
import {loadReviewedBaselineCandidate,persistVerifiedBaseline} from './safe-d1/verified-baseline-control.mjs';
import {custodyRoot} from './safe-d1/windows-custody.mjs';
const chunks=[];let joined,token,transport,consumed=false;
try{
 requireSafe(firstMigrationApproved,'migration_0001_not_authorized');requireSafe(process.argv.length===2&&!process.stdin.isTTY,'private_pipe_required');
 requireSafe(!existsSync(firstMigrationAttemptFile)&&!existsSync(firstMigrationResultFile),'migration_0001_already_attempted');assertEnvironment(process.env);assertRuntime();approvedSources();
 let size=0;for await(const part of process.stdin){chunks.push(part);size+=part.length;requireSafe(size<=4096,'private_input_limit');}
 joined=Buffer.concat(chunks);const input=JSON.parse(joined.toString('utf8'));requireSafe(Object.keys(input).length===1,'private_input_invalid');token=input.token;input.token=undefined;
 requireSafe(typeof token==='string'&&/^[-_A-Za-z0-9]{20,256}$/.test(token),'credential_invalid');
 const backup=await loadApprovedEncryptedBackup();const permit=issueFirstMigrationPermit();consumed=true;
 transport=createTransport(token,{migration0001Permit:permit});token=undefined;
 const baselineCandidate=firstMigrationVerifiedBaselineEnabled?await loadReviewedBaselineCandidate(backup):undefined;
 const result=await runFirstMigration({transport,backup,baselineCandidate,recordVerifiedBaseline:baseline=>persistVerifiedBaseline(baseline,resolve(custodyRoot,'migration-0001-'+firstMigrationAuthorizationId+'.baseline.private.json'))});result.authorizationId=firstMigrationAuthorizationId;result.backup={operationId:encryptedBackupPins.operationId,ciphertextSha256:encryptedBackupPins.ciphertextSha256,restoreVerified:true};
 writeFileSync(firstMigrationResultFile,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:result.status==='completed_0001_only'?'PASS':'FAIL',authorizationId:firstMigrationAuthorizationId}));process.exitCode=result.status==='completed_0001_only'?0:2;
}catch{
 if(consumed)try{writeFileSync(firstMigrationResultFile,JSON.stringify({authorizationId:firstMigrationAuthorizationId,status:'stopped_local_or_outcome_unknown'}),{flag:'wx',mode:0o600});}catch{/* Preserve original evidence. */}
 console.log(JSON.stringify({status:'FAIL',authorizationId:firstMigrationAuthorizationId}));process.exitCode=2;
}finally{transport?.dispose();token=undefined;requireSafe(token===undefined,'credential_cleanup_failed');joined?.fill(0);for(const chunk of chunks)chunk.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;}
