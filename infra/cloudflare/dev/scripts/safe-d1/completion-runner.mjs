import {approvedSources,assertEnvironment,assertRuntime,migrations,schemaHashes,requireSafe} from './policy.mjs';
import {completionBackupState,withCompletionSql} from './completion-backup.mjs';
import {createReader} from './read.mjs';
import {createStageWriter} from './write.mjs';
import {consumeCompletionAcknowledgement} from './transport.mjs';
import {projectCompletion} from './completion-oracle.mjs';
import {completionCheckpoint} from './completion-checkpoint.mjs';
import {isCompletionJournal} from './completion-journal.mjs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitMigration} from './sql.mjs';
import {captureDatabase,snapshotFingerprint} from './snapshot.mjs';
import {target} from './policy.mjs';
async function sourceSnapshot(){let mf;try{return await withCompletionSql(async sql=>{mf=new Miniflare(convertV4MiniflareOptions({name:'kuwago-completion-source',host:'127.0.0.1',modules:true,script:'export default {fetch(){return new Response(null,{status:503})}}',compatibilityDate:'2026-07-30',telemetry:{enabled:false},cf:false,d1Databases:{DB:'ephemeral-completion-source'}}));const db=await mf.getD1Database('DB');await db.batch(splitMigration(sql.toString('utf8')).map(q=>db.prepare(q)));return captureDatabase({metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async q=>(await db.prepare(q).all()).results});});}finally{await mf?.dispose();}}
export async function runCompletion({transport,backup,journal,environment='development',executionId,processEnvironment=process.env}){
 const result={status:'blocked',executionId,writeAttempts:0,writesAccepted:[],verifiedStages:[],credentialDisposed:false};
 let finalCheckpointReceipt;
 try{
  assertEnvironment(processEnvironment);assertRuntime();approvedSources();const ctx=transport.executionContext();
  requireSafe(ctx.scope==='0005-0006'&&ctx.environment===environment&&ctx.executionId===executionId&&isCompletionJournal(journal)&&journal.environment===environment&&journal.executionId===executionId,'completion_scope_mismatch');
  const stored=completionBackupState(backup);journal.begin();const reader=createReader(transport);await reader.inspect(4);
  let expected=await sourceSnapshot();requireSafe(expected.stage===4&&snapshotFingerprint(expected.snapshot)===stored.fingerprint,'completion_source_mismatch');
  let checkpoint=await completionCheckpoint(transport,{expected,journal,phase:'baseline'}),generated;
  for(const stage of [5,6]){
   await journal.verifyCheckpoint(checkpoint.receipt);approvedSources();const state=await reader.inspect(stage-1);let intent;
   requireSafe(Date.now()-checkpoint.capturedAt<30000,'completion_checkpoint_stale');
   await createStageWriter(transport).apply(state,backup,{snapshot:checkpoint.snapshot,captureCompletionOutput:true,beforeSubmit:async summary=>{
    requireSafe(summary.stage===stage&&summary.migrationSha256===migrations[stage-1].sha256,'completion_intent_invalid');
    const value=await transport.bookmark(),p={label:'before_write',value,observedAt:new Date().toISOString()};requireSafe(value===checkpoint.point.value,'completion_bookmark_changed_before_write');
    const guardReceipt=await journal.checkpoint(stage,{fingerprint:snapshotFingerprint(expected.snapshot),points:[p],phase:'before_write'});await journal.verifyCheckpoint(guardReceipt);
    intent={...summary,executionId,environment,preparedAt:new Date().toISOString(),status:'outcome_not_confirmed'};journal.write('intent',stage,intent);result.writeAttempts++;
   }});
   const ack=consumeCompletionAcknowledgement(transport.writeAcknowledgement(),{transport,environment,executionId,stage,migrationSha256:intent.migrationSha256,batchSha256:intent.batchSha256});
   result.writesAccepted.push({stage,migration:migrations[stage-1].name,requestStartedAt:ack.requestStartedAt,responseCompletedAt:ack.responseCompletedAt,batchSha256:ack.batchSha256});
   journal.write('ack',stage,{stage,migrationSha256:ack.migrationSha256,batchSha256:ack.batchSha256,requestStartedAt:ack.requestStartedAt,responseCompletedAt:ack.responseCompletedAt,completionOutput:ack.completionOutput});
   const projection=await projectCompletion(ack,generated);expected=projection.expected;generated=projection.generated;
   const inspected=await reader.inspect(stage),candidate=await reader.snapshot();requireSafe(candidate.stage===stage&&snapshotFingerprint(candidate.snapshot)===snapshotFingerprint(expected.snapshot),'completion_postwrite_logical_difference');
   const boundary={label:'candidate_after_verified_write',value:await transport.bookmark(),observedAt:new Date().toISOString()};
   checkpoint=await completionCheckpoint(transport,{expected,journal,phase:'postflight',boundary});
   const record={stage,migration:migrations[stage-1].name,migrationSha256:migrations[stage-1].sha256,schemaHash:inspected.schemaHash,fingerprint:checkpoint.evidence.fingerprint,checkpointSha256:checkpoint.evidence.recordSha256,history:JSON.parse(inspected.history).map(([id,name])=>({id,name}))};
   journal.write('verified',stage,record);result.verifiedStages.push(record);
  }
  const final=await journal.verifyCheckpoint(checkpoint.receipt);requireSafe(final.stage===6&&result.verifiedStages.length===2&&result.verifiedStages[1].schemaHash===schemaHashes[6],'completion_final_stage_unverified');
  result.finalCheckpoint=final;result.status='completed_0005_0006_only';
  finalCheckpointReceipt=checkpoint.receipt;
 }catch(error){result.status=result.writeAttempts?'stopped_review_required':'stopped_before_write';const codes=new Set(['completion_logical_difference','completion_postwrite_logical_difference','completion_boundary_changed','completion_bookmark_changed','completion_bookmark_changed_before_write','request_outcome_unknown','completion_checkpoint_simulated_readback_failure','completion_checkpoint_receipt_invalid','completion_ack_binding_mismatch','completion_previous_history_changed','completion_generated_values_changed','completion_control_invalid','completion_checkpoint_readback_failed','query_failed','http_rejected']);result.errorCode=codes.has(error?.message)?error.message:'completion_validation_or_persistence_failed';}
 finally{transport.dispose();delete processEnvironment.CLOUDFLARE_API_TOKEN;result.credentialDisposed=true;result.finishedAt=new Date().toISOString();result.requests=transport.diagnostics();try{if(finalCheckpointReceipt&&result.status==='completed_0005_0006_only')result.closure=await journal.closeResult(result,finalCheckpointReceipt);else journal.write('result',6,result);}catch{result.status='stopped_result_persistence_failed';}}
 return result;
}
