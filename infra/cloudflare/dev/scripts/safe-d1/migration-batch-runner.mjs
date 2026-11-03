import {approvedSources,assertEnvironment,assertRuntime,migrations,requireSafe} from './policy.mjs';
import {createReader} from './read.mjs';
import {createStageWriter} from './write.mjs';
import {verifyBackup} from './backup.mjs';
import {batchBackupState,batchBackupPins} from './batch-backup-receipt.mjs';
import {isFinalBackupReceipt,finalBackupState,finalBackupPins} from './final-backup-receipt.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
import {captureBatchBaseline,assertVerifiedBaselineCurrent} from './verified-baseline-control.mjs';
function verifyTransition(before,after){
 const oldLedger=before.snapshot.tables.find(t=>t.name==='d1_migrations'),ledger=after.snapshot.tables.find(t=>t.name==='d1_migrations');
 requireSafe(ledger&&oldLedger&&JSON.stringify(ledger.rows.slice(0,oldLedger.rows.length))===JSON.stringify(oldLedger.rows),'postflight_previous_history_changed');
 const seeded=new Set(['roles','permissions','role_permissions','admin_role_definitions','admin_role_permissions','publication_control','catalog_state']);
 for(const table of after.snapshot.tables){
  if(['d1_migrations','sqlite_sequence'].includes(table.name))continue;
  if(!seeded.has(table.name))requireSafe(table.rows.length===0,'postflight_unexpected_content');
  if(table.name==='catalog_state')requireSafe(JSON.stringify(table.columns)===JSON.stringify(['id','version'])&&JSON.stringify(table.rows)===JSON.stringify([['integer:31','integer:30']]),'postflight_catalog_state_invalid');
  const old=before.snapshot.tables.find(t=>t.name===table.name);
  if(seeded.has(table.name)&&old)requireSafe(JSON.stringify(table)===JSON.stringify(old),'postflight_seed_or_control_changed');
 }
}
// One pre-batch verified full backup protects this entire bounded batch. No export
// path exists here. Any failure is terminal; a partial batch cannot be resumed.
export async function runRemainingMigrations({transport,backup,recordBaseline,recordStage,recordObservation,recordPostflight,environment=process.env}){
 const result={status:'blocked',stages:[],attemptedMigration:null,writeAttempts:0,credentialDisposed:false};
 try{
  assertEnvironment(environment);assertRuntime();approvedSources();const finalOnly=isFinalBackupReceipt(backup),startStage=finalOnly?3:1,backupPins=finalOnly?finalBackupPins:batchBackupPins,stored=finalOnly?finalBackupState(backup):batchBackupState(backup);
  requireSafe(typeof recordBaseline==='function'&&typeof recordStage==='function','batch_evidence_required');
  if(finalOnly)requireSafe(typeof recordObservation==='function'&&typeof recordPostflight==='function','final_batch_durable_evidence_required');
  const reader=createReader(transport);await reader.inspect(startStage);
  let expectedFingerprint=stored.fingerprint,recoveryBookmark=stored.bookmark;
  for(let stage=startStage;stage<=5;stage++){
   approvedSources();await reader.inspect(stage);
   const live=await captureBatchBaseline(transport,{stage,fingerprint:expectedFingerprint,originalBookmark:recoveryBookmark,requireOriginalBookmark:stage>startStage,recordObservation});
   const evidence=await recordBaseline(live.baseline,backupPins);requireSafe(evidence?.originalBookmarkPreserved===true&&/^[a-f0-9]{64}$/.test(evidence.recordSha256),'baseline_evidence_not_confirmed');
   const state=await reader.inspect(stage);verifyBackup(backup,state);approvedSources();
   await assertVerifiedBaselineCurrent(transport,live.baseline);
   await recordStage(stage,{status:'outcome_not_confirmed',migration:migrations[stage].name,migrationSha256:migrations[stage].sha256,baseline:evidence});
   result.attemptedMigration=migrations[stage].name;result.writeAttempts++;
   await createStageWriter(transport).apply(state,backup,{snapshot:live.snapshot});
   const after=await reader.inspect(stage+1),postBookmark=await reader.bookmark(),post=await reader.snapshot();
   requireSafe(post.stage===stage+1&&await reader.bookmark()===postBookmark,'postflight_concurrent_change');
   verifyTransition(live.snapshot,post);
   expectedFingerprint=snapshotFingerprint(post.snapshot);recoveryBookmark=postBookmark;
   let postflightEvidence;if(recordPostflight){postflightEvidence=await recordPostflight({stage:stage+1,fingerprint:expectedFingerprint,bookmark:postBookmark,observedAt:new Date().toISOString()});requireSafe(postflightEvidence?.bookmarkProtected===true&&/^[a-f0-9]{64}$/.test(postflightEvidence.recordSha256),'postflight_evidence_not_confirmed');}
   const completed={migration:migrations[stage].name,migrationSha256:migrations[stage].sha256,status:'verified',schemaHash:after.schemaHash,history:JSON.parse(after.history).map(([id,name])=>({id,name})),postflightVerified:true};
   if(postflightEvidence)completed.postflightEvidence=postflightEvidence;
   result.stages.push(completed);await recordStage(stage,completed);
  }
  result.status=finalOnly?'completed_0004_0006_only':'completed_0002_0006_only';
 }catch(error){
  result.status=result.writeAttempts?'stopped_review_required':'stopped_before_write';
  const safe=new Set(['live_baseline_logical_change','live_baseline_concurrent_bookmark_change','live_baseline_changed_between_stages','live_baseline_stale','live_baseline_changed_before_write','schema_mismatch','history_mismatch','nonempty_installation','seed_data_mismatch','query_failed','http_rejected','cloudflare_rejected','request_outcome_unknown','postflight_concurrent_change','postflight_previous_history_changed','postflight_unexpected_content','postflight_catalog_state_invalid','postflight_seed_or_control_changed','preflight_stale','baseline_evidence_not_confirmed']);
  result.errorCode=safe.has(error?.message)?error.message:'validation_or_operation_failed_details_omitted';
 }finally{transport.dispose();delete environment.CLOUDFLARE_API_TOKEN;result.credentialDisposed=true;if(transport.diagnostics)result.requests=transport.diagnostics();result.finishedAt=new Date().toISOString();}
 return result;
}
