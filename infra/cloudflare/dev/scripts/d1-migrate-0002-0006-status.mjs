import {existsSync,readFileSync} from 'node:fs';
import {batchAuthorizationId,batchApproved,batchPrefix} from './safe-d1/migration-batch-permit.mjs';
import {target} from './safe-d1/policy.mjs';
const done=existsSync(batchPrefix+'.result.json');
const state={authorizationId:batchAuthorizationId,approved:batchApproved,target,attemptStarted:existsSync(batchPrefix+'.attempt.json'),resultReady:done};
if(done){const r=JSON.parse(readFileSync(batchPrefix+'.result.json'));Object.assign(state,{status:r.status,writeAttempts:r.writeAttempts,attemptedMigration:r.attemptedMigration,stages:r.stages,credentialDisposed:r.credentialDisposed,errorCode:r.errorCode,finishedAt:r.finishedAt,requests:r.requests?.length,allHttp200:r.requests?.every(q=>q.httpStatus===200),requestCounts:r.requests?.reduce((o,q)=>(o[q.operation]=(o[q.operation]??0)+1,o),{})});}
else state.checkpoints=[1,2,3,4,5].map(stage=>({migration:stage+1,started:existsSync(batchPrefix+`.stage-${stage}.started.json`),verified:existsSync(batchPrefix+`.stage-${stage}.verified.json`)}));
console.log(JSON.stringify(state));
