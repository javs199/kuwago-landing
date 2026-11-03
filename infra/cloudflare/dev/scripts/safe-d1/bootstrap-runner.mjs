import {target,requireSafe} from './policy.mjs';
import {isBootstrapPlan,identityEvidenceHash,verifyBootstrapPostflight} from '../single-operator-bootstrap.mjs';
import {bootstrapRecoveryState} from './bootstrap-recovery.mjs';
import {bootstrapSourceHash} from './bootstrap-permit.mjs';
import {isBootstrapJournal} from './bootstrap-journal.mjs';
import {completionCheckpoint} from './completion-checkpoint.mjs';
import {consumeBootstrapAcknowledgement} from './transport.mjs';
import {projectBootstrap} from './bootstrap-oracle.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
const used=new WeakSet();
export async function runBootstrap({transport,plan,recovery,journal,scope}){
 const result={status:'STOPPED',intentionRecorded:false,requestInvocationRecorded:false,requestActuallyInvoked:false,writeAccepted:false,writeVerified:false,durablyClosed:false};
 try{
  requireSafe(isBootstrapPlan(plan)&&!used.has(plan),'bootstrap_plan_consumed_or_invalid');used.add(plan);
  const c=transport.executionContext();
  requireSafe(c.scope==='bootstrap'&&c.executionId===plan.executionId&&JSON.stringify(c.target)===JSON.stringify(target)&&scope.environment===c.environment&&JSON.stringify(transport.bootstrapContext())===JSON.stringify(scope),'bootstrap_context_mismatch');
  requireSafe(isBootstrapJournal(journal)&&journal.environment===c.environment&&journal.executionId===plan.executionId,'bootstrap_journal_mismatch');
  const r=bootstrapRecoveryState(recovery,c.environment);
  requireSafe(r.fingerprint===plan.baselineFingerprint&&r.evidenceSha256===scope.stageSixBackupEvidenceSha256&&scope.sourceSetSha256===bootstrapSourceHash()&&scope.batchSha256===plan.batchSha256&&scope.identitySha256===identityEvidenceHash(plan.identity)&&scope.authorizationReference===plan.authorizationReference,'bootstrap_evidence_binding_mismatch');
  result.phase='durable-begin';journal.begin(scope);
  result.phase='baseline';
  const baseline=await completionCheckpoint(transport,{expected:plan.baselineSnapshot,journal,phase:'baseline'});
  requireSafe(Date.now()<plan.identity.expiresAt&&Date.now()-plan.identity.verifiedAt<300000&&scope.sourceSetSha256===bootstrapSourceHash(),'bootstrap_identity_or_sources_stale');
  await journal.verifyCheckpoint(baseline.receipt);
  result.phase='intent';journal.write('intent',{scope,baselineCheckpointSha256:baseline.evidence.recordSha256,recordedAt:new Date().toISOString()});result.intentionRecorded=true;
  requireSafe(await transport.bookmark()===baseline.point.value,'bootstrap_concurrent_bookmark_change');
  result.phase='batch';await transport.applyBatch(plan.statements);result.requestInvocationRecorded=true;result.requestActuallyInvoked=true;
  const ack=consumeBootstrapAcknowledgement(transport.writeAcknowledgement(),{transport,scope});
  result.writeAccepted=true;journal.write('ack',{stage:6,batchSha256:ack.batchSha256,sourceSetSha256:ack.sourceSetSha256,requestStartedAt:ack.requestStartedAt,responseCompletedAt:ack.responseCompletedAt});
  result.phase='oracle';const expected=projectBootstrap(plan,ack); // Does not adopt arbitrary postflight data.
  const db={prepare(sql){let params=[];return {bind(...p){params=p;return this;},async all(){return {success:true,results:await transport.bootstrapSelect(plan,sql,params)};}};}};
  result.phase='postflight';await verifyBootstrapPostflight(plan,db);
  const postflight=await completionCheckpoint(transport,{expected,journal,phase:'postflight'});
  result.writeVerified=true;result.status='PASS';result.postflightFingerprint=snapshotFingerprint(expected.snapshot);
  result.phase='closure';result.closure=await journal.close(result,postflight.receipt);result.durablyClosed=result.closure.durablyClosed;
 }catch(error){
  const observation=transport.bootstrapWriteObservation?.();
  result.requestInvocationRecorded=observation?.invocationRecorded===true;
  result.requestActuallyInvoked=observation?.fetchInvoked===true;
  result.status=result.requestActuallyInvoked?'UNCERTAIN_OR_POSTFLIGHT_FAILED':'STOPPED_BEFORE_SEND';
  if(['bootstrap_identity_stale','bootstrap_verified_identity_required'].includes(error?.message))result.errorCode=error.message;
  // A failed response is never evidence that no write occurred. No retry.
  result.requiresReadOnlyReconciliation=result.requestActuallyInvoked;
  try{journal.write('result',{...result,failedAt:new Date().toISOString()});}catch{/* Existing durable evidence is never overwritten. */}
 }finally{transport.dispose();result.credentialDisposed=true;}
 return result;
}
