import {writeFileSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {assertEnvironment,assertRuntime,approvedSources,requireSafe} from './safe-d1/policy.mjs';
import {finalApproved as batchApproved,finalAuthorizationId as batchAuthorizationId,finalPrefix as batchPrefix,issueFinalPermit as issueBatchPermit} from './safe-d1/migration-final-permit.mjs';
import {loadFinalBackup as loadBatchBackup,finalBackupPins as batchBackupPins} from './safe-d1/final-backup-receipt.mjs';
import {createTransport} from './safe-d1/transport.mjs';
import {runRemainingMigrations} from './safe-d1/migration-batch-runner.mjs';
import {persistBatchBaseline,persistBatchObservation,persistBatchPostflight} from './safe-d1/verified-baseline-control.mjs';
const chunks=[];let joined,token,transport,consumed=false;
function record(file,value){const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,JSON.stringify(value,null,2));fsyncSync(fd);}finally{closeSync(fd);}}
try{
 requireSafe(batchApproved,'batch_not_authorized');requireSafe(process.argv.length===2&&!process.stdin.isTTY,'private_pipe_required');assertEnvironment(process.env);assertRuntime();approvedSources();
 requireSafe(!existsSync(batchPrefix+'.attempt.json')&&!existsSync(batchPrefix+'.result.json'),'batch_already_attempted');
 let size=0;for await(const p of process.stdin){chunks.push(p);size+=p.length;requireSafe(size<=4096,'private_input_limit');}
 joined=Buffer.concat(chunks);const input=JSON.parse(joined.toString('utf8'));requireSafe(Object.keys(input).join(',')==='token','private_input_invalid');token=input.token;input.token=undefined;
 requireSafe(typeof token==='string'&&/^[-_A-Za-z0-9]{20,256}$/.test(token),'credential_invalid');
 const backup=await loadBatchBackup(),permit=issueBatchPermit();consumed=true;transport=createTransport(token,{migrationFinalPermit:permit});token=undefined;
 const result=await runRemainingMigrations({transport,backup,recordBaseline:(baseline,pins)=>persistBatchBaseline(baseline,batchPrefix+`.stage-${baseline.stage}.baseline.private.json`,pins),recordObservation:o=>persistBatchObservation(o,batchPrefix+`.stage-${o.stage}.observation.private.json`),recordPostflight:p=>persistBatchPostflight(p,batchPrefix+`.postflight-stage-${p.stage}.private.json`),recordStage:async(stage,value)=>record(batchPrefix+`.stage-${stage}.${value.status==='verified'?'verified':'started'}.json`,value)});
 result.authorizationId=batchAuthorizationId;result.backup={...batchBackupPins,restoreVerified:true};record(batchPrefix+'.result.json',result);
 const ok=result.status==='completed_0004_0006_only';console.log(JSON.stringify({status:ok?'PASS':'FAIL',authorizationId:batchAuthorizationId}));process.exitCode=ok?0:2;
}catch{
 if(consumed)try{record(batchPrefix+'.result.json',{authorizationId:batchAuthorizationId,status:'stopped_local_or_outcome_unknown'});}catch{/* Never overwrite evidence. */}
 console.log(JSON.stringify({status:batchApproved?'FAIL':'BLOCKED',authorizationId:batchAuthorizationId}));process.exitCode=2;
}finally{transport?.dispose();token=undefined;requireSafe(token===undefined,'credential_cleanup_failed');joined?.fill(0);for(const p of chunks)p.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;}
