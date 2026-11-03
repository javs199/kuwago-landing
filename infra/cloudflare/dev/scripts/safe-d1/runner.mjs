import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {approvedSources,assertEnvironment,assertRuntime,requireSafe,target,digest,migrations,remoteExecutionEnabled} from './policy.mjs';
import {createReader} from './read.mjs';
import {captureBackup,verifyBackup} from './backup.mjs';
import {createStageWriter} from './write.mjs';
export async function runMigration({transport,evidenceDirectory,backupDirectory,environment=process.env}){
 const operationId=randomUUID();
 const result={operationId,target,planHash:digest(JSON.stringify(migrations)),startedAt:Date.now(),status:'blocked',stages:[],attemptedStage:null,releaseRemoteEnabled:remoteExecutionEnabled,credentialDisposed:false};let acquired=false;
 try{
  assertEnvironment(environment);assertRuntime();approvedSources();
  mkdirSync(evidenceDirectory,{recursive:true,mode:0o700});
  // Never remove automatically: crash/unknown outcome requires incident review, not resumption.
  writeFileSync(resolve(evidenceDirectory,'operation.lock'),JSON.stringify({operationId,startedAt:Date.now()}),{flag:'wx',mode:0o600});acquired=true;
  const reader=createReader(transport),writer=createStageWriter(transport);
  await reader.inspect(0);
  const artifactDirectory=backupDirectory?resolve(backupDirectory,operationId):evidenceDirectory;
  mkdirSync(artifactDirectory,{recursive:true,mode:0o700});
  const backup=await captureBackup(reader,resolve(artifactDirectory,'complete-backup.json'),operationId);
  result.backup={manifestFile:backup.file,kind:'complete-sql-and-time-travel',restoreVerified:true};
  for(let stage=0;stage<6;stage++){
   approvedSources();const state=await reader.inspect(stage);verifyBackup(backup,state);
   result.attemptedStage=stage+1;
   writeFileSync(resolve(evidenceDirectory,`stage-${stage+1}.started.json`),JSON.stringify({operationId,stage:stage+1,status:'outcome_not_confirmed'}),{flag:'wx',mode:0o600});
   const name=await writer.apply(state,backup);await reader.inspect(stage+1);
   result.stages.push({name,status:'verified'});
   writeFileSync(resolve(evidenceDirectory,`stage-${stage+1}.json`),JSON.stringify({operationId,stage:stage+1,name,status:'verified'}),{flag:'wx',mode:0o600});
  }
  result.status='completed';
 }catch{
  result.status=result.stages.length?'stopped_after_verified_stage':'blocked_or_outcome_unknown';
  // No error message from transport/filesystem can reach logs; it might contain secrets.
 }finally{
  delete environment.CLOUDFLARE_API_TOKEN;transport.dispose();result.credentialDisposed=true;result.finishedAt=Date.now();
  if(acquired)writeFileSync(resolve(evidenceDirectory,'result.json'),JSON.stringify(result,null,2),{mode:0o600});
 }
 requireSafe(result.credentialDisposed,'credential_cleanup_failed');return result;
}
