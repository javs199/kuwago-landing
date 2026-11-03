import {approvedSources,assertEnvironment,assertRuntime,digest,migrations,requireSafe} from './policy.mjs';
import {createReader} from './read.mjs';
import {createStageWriter} from './write.mjs';
import {verifyBackup} from './backup.mjs';
import {approvedBackupState} from './encrypted-backup-receipt.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
import {captureVerifiedLiveBaseline,assertVerifiedBaselineCurrent} from './verified-baseline-control.mjs';
export async function runFirstMigration({transport,backup,environment=process.env,baselineCandidate,recordVerifiedBaseline}){
 const result={status:'blocked',migration:migrations[0].name,migrationSha256:migrations[0].sha256,writeAttempted:false,postflightVerified:false,credentialDisposed:false};
 try{
  assertEnvironment(environment);assertRuntime();requireSafe(digest(approvedSources()[0])===migrations[0].sha256,'migration_hash_mismatch');
  const reader=createReader(transport),stored=approvedBackupState(backup);
  let liveBaseline;
  if(baselineCandidate){
   requireSafe(typeof recordVerifiedBaseline==='function','baseline_evidence_recorder_required');
   liveBaseline=await captureVerifiedLiveBaseline(transport,backup,baselineCandidate);
   result.verifiedBaseline=await recordVerifiedBaseline(liveBaseline);
   requireSafe(result.verifiedBaseline?.originalBookmarkPreserved===true&&result.verifiedBaseline.fingerprint===stored.fingerprint&&/^[a-f0-9]{64}$/.test(result.verifiedBaseline.recordSha256),'baseline_evidence_not_confirmed');
  }else{
   const before=await reader.snapshot();requireSafe(before.stage===0&&snapshotFingerprint(before.snapshot)===stored.fingerprint,'backup_live_snapshot_mismatch');
   requireSafe(await reader.bookmark()===stored.bookmark,'backup_bookmark_mismatch');
  }
  const state=await reader.inspect(0);verifyBackup(backup,state);approvedSources();
  if(liveBaseline)await assertVerifiedBaselineCurrent(transport,liveBaseline);
  result.preflightVerified=true;result.writeAttempted=true;
  await createStageWriter(transport).apply(state,backup);
  result.writeResponseAccepted=true;
  const after=await reader.inspect(1);requireSafe(after.stage===1,'postflight_stage_mismatch');
  result.postflightVerified=true;result.historyVerified=true;result.schemaHash=after.schemaHash;result.history=JSON.parse(after.history).map(([id,name])=>({id,name}));result.status='completed_0001_only';
 }catch(error){
  result.status=result.writeAttempted?'stopped_outcome_requires_review':'stopped_before_write';
  const codes=new Set(['backup_live_snapshot_mismatch','backup_bookmark_mismatch','schema_mismatch','history_mismatch','http_rejected','cloudflare_rejected','query_failed','request_outcome_unknown','migration_hash_mismatch','preflight_stale','live_baseline_logical_change','live_baseline_concurrent_bookmark_change','live_baseline_stale','live_baseline_changed_before_write','baseline_evidence_recorder_required','baseline_evidence_not_confirmed']);
  result.errorCode=codes.has(error?.message)?error.message:'validation_or_operation_failed_details_omitted';
 }finally{delete environment.CLOUDFLARE_API_TOKEN;transport.dispose();result.credentialDisposed=true;if(transport.diagnostics)result.requests=transport.diagnostics();result.finishedAt=new Date().toISOString();}
 return result;
}
