import {writeFileSync} from 'node:fs';
import {currentBackupApproved,currentBackupId,currentBackupPrefix,issueCurrentBackupPermit} from './safe-d1/backup-current-permit.mjs';
import {assertEnvironment,assertRuntime,requireSafe} from './safe-d1/policy.mjs';
import {decodeRecoverySecret} from './safe-d1/recovery-format.mjs';
import {createBackupTransport} from './safe-d1/backup-transport.mjs';
import {runBackupOnly} from './safe-d1/backup-only.mjs';
import {createEncryptedStore} from './safe-d1/encrypted-store.mjs';
import {custodyRoot,verifyWindowsCustody,dpapi} from './safe-d1/windows-custody.mjs';

const chunks=[];let bytes,token,key,input,transport,consumed=false;
try{
 requireSafe(currentBackupApproved,'stage_six_export_not_authorized');
 requireSafe(process.argv.length===2&&!process.stdin.isTTY,'private_pipe_required');assertEnvironment(process.env);assertRuntime();
 let size=0;for await(const p of process.stdin){size+=p.length;requireSafe(size<=8192,'private_input_limit');chunks.push(p);}
 bytes=Buffer.concat(chunks);input=JSON.parse(bytes.toString('utf8'));requireSafe(Object.keys(input).sort().join(',')==='recoverySecretBase64,token','private_input_invalid');
 token=input.token;key=decodeRecoverySecret(input.recoverySecretBase64);input.token=undefined;input.recoverySecretBase64=undefined;input=undefined;
 const permit=issueCurrentBackupPermit();consumed=true;transport=createBackupTransport(token,{currentPermit:permit});token=undefined;
 const result=await runBackupOnly({transport,store:createEncryptedStore(custodyRoot,verifyWindowsCustody),protector:dpapi,recoverySecret:key,expectedStage:6,postAdmin:true,mode:'remote-single-authorized-current-admin-backup'});
 result.authorizationId=currentBackupId;
 writeFileSync(currentBackupPrefix+'.result.json',JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:result.verified&&result.cleanupComplete?'PASS':'FAIL',authorizationId:currentBackupId}));process.exitCode=result.verified&&result.cleanupComplete?0:2;
}catch{
 if(consumed)try{writeFileSync(currentBackupPrefix+'.result.json',JSON.stringify({status:'FAIL',authorizationId:currentBackupId}),{flag:'wx',mode:0o600});}catch{/* Preserve evidence; do not repeat. */}
 console.log(JSON.stringify({status:currentBackupApproved?'FAIL':'BLOCKED',authorizationId:currentBackupId}));process.exitCode=2;
}finally{
 transport?.dispose();key?.fill(0);bytes?.fill(0);for(const p of chunks)p.fill(0);
 // eslint-disable-next-line no-useless-assignment
 token=undefined;
 // eslint-disable-next-line no-useless-assignment
 input=undefined;
 delete process.env.CLOUDFLARE_API_TOKEN;
}

