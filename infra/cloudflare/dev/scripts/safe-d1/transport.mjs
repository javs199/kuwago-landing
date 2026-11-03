import {target,requireSafe,remoteExecutionEnabled,digest,migrations} from './policy.mjs';
import {allowedReadSql} from './read.mjs';
import {isApprovedBatch,approvedBatchStage,hasFullSnapshotGuard,approvedCompletionReadbacks} from './write.mjs';
import {takeCompletionPermit} from './completion-permit.mjs';
import {takeBatchPermit} from './migration-batch-permit.mjs';
import {takeFinalPermit} from './migration-final-permit.mjs';
import {takeFirstMigrationPermit} from './migration-0001-permit.mjs';
import {isBackupRead} from './snapshot.mjs';
import {createExporter} from './export.mjs';
import {takeBootstrapPermit,takeBootstrapPreflightPermit} from './bootstrap-permit.mjs';
import {bootstrapBatchPlan,isBootstrapRead,identityEvidenceHash,assertBootstrapIdentityFresh} from '../single-operator-bootstrap.mjs';
import {isBootstrapJournal} from './bootstrap-journal.mjs';
const writeAcknowledgements=new WeakMap();
export function ownWriteMetadata(receipt){const m=writeAcknowledgements.get(receipt);requireSafe(m,'own_write_acknowledgement_required');return Object.freeze({stage:m.stage,acknowledgedAt:m.acknowledgedAt,source:m.source});}
export function consumeCompletionAcknowledgement(receipt,{transport,environment,executionId,stage,migrationSha256,batchSha256}){
 const m=writeAcknowledgements.get(receipt);requireSafe(m&&m.owner===transport&&m.environment===environment&&m.executionId===executionId&&m.stage===stage&&m.migrationSha256===migrationSha256&&m.batchSha256===batchSha256&&m.completionOutput,'completion_ack_binding_mismatch');
 writeAcknowledgements.delete(receipt);const {owner,...value}=m;requireSafe(owner===transport,'completion_ack_owner_invalid');return Object.freeze(value);
}
export function consumeBootstrapAcknowledgement(receipt,{transport,scope}){
 const m=writeAcknowledgements.get(receipt);
 requireSafe(m?.owner===transport&&m.bootstrapOutput&&m.scope==='bootstrap'&&m.environment===scope.environment&&m.executionId===scope.executionId&&m.stage===6&&m.batchSha256===scope.batchSha256&&m.sourceSetSha256===scope.sourceSetSha256,'bootstrap_ack_binding_mismatch');
 writeAcknowledgements.delete(receipt);const {owner,...ack}=m;requireSafe(owner===transport,'bootstrap_ack_owner_invalid');return Object.freeze(ack);
}
// Remote transport is release-locked. Tests inject fetch into a simulation-only instance.
export function createTransport(token,{simulationFetch,migration0001Permit,onlyFirstMigration=false,migrationBatchPermit,onlyRemainingMigrations=false,migrationFinalPermit,onlyFinalMigrations=false,migrationCompletionPermit,onlyCompletionMigrations=false,simulationExecutionId,bootstrapPermit,simulationBootstrapScope,bootstrapJournal,bootstrapPreflightPermit}={}){
 const scopedPermit=takeFirstMigrationPermit(migration0001Permit);const firstOnly=scopedPermit||onlyFirstMigration;
 const batchPermit=takeBatchPermit(migrationBatchPermit),remainingOnly=batchPermit||onlyRemainingMigrations;
 const finalPermit=takeFinalPermit(migrationFinalPermit),finalOnly=finalPermit||onlyFinalMigrations;
 const completionScope=takeCompletionPermit(migrationCompletionPermit),completionOnly=Boolean(completionScope)||onlyCompletionMigrations;
 const bootstrapScope=takeBootstrapPermit(bootstrapPermit)??(typeof simulationFetch==='function'?simulationBootstrapScope:undefined),bootstrapOnly=Boolean(bootstrapScope);
 const bootstrapReadScope=takeBootstrapPreflightPermit(bootstrapPreflightPermit);
 requireSafe(!simulationBootstrapScope||typeof simulationFetch==='function','bootstrap_simulation_transport_required');
 requireSafe(Number(remainingOnly)+Number(firstOnly)+Number(finalOnly)+Number(completionOnly)+Number(bootstrapOnly)+Number(Boolean(bootstrapReadScope))<=1,'conflicting_migration_scope');
 requireSafe(remoteExecutionEnabled||typeof simulationFetch==='function'||scopedPermit||batchPermit||finalPermit||completionScope||bootstrapScope||bootstrapReadScope,'remote_execution_not_authorized');
 const context=Object.freeze({environment:typeof simulationFetch==='function'?'local-simulation':'development',executionId:bootstrapScope?.executionId??bootstrapReadScope?.executionId??completionScope?.executionId??simulationExecutionId??'legacy-unbound',scope:bootstrapOnly?'bootstrap':bootstrapReadScope?'bootstrap-preflight':completionOnly?'0005-0006':'legacy',target});
 if(bootstrapOnly)requireSafe(bootstrapScope.environment===context.environment&&JSON.stringify(bootstrapScope.target)===JSON.stringify(target)&&bootstrapScope.stage===6&&bootstrapScope.maximumBatches===1&&isBootstrapJournal(bootstrapJournal)&&bootstrapJournal.environment===context.environment&&bootstrapJournal.executionId===context.executionId,'bootstrap_transport_scope_invalid');
 if(completionOnly)requireSafe(/^[a-f0-9-]{36}$/.test(context.executionId),'completion_execution_id_required');
 requireSafe(typeof token==='string'&&/^[-_A-Za-z0-9]{20,256}$/.test(token),'credential_invalid');
 const fetcher=simulationFetch??fetch,base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`;
 const submitted=new WeakSet();
 let secret=token,writeAttempted=false,nextBatchStage=completionOnly?4:finalOnly?3:1,batchFailed=false,lastAcknowledgement,bootstrapInvocationRecorded=false,bootstrapFetchInvoked=false,bootstrapFetchInvokedAt;const diagnostics=[];token=undefined;requireSafe(token===undefined,'credential_transfer_failed');
 async function request(suffix,body){
  requireSafe(secret!==undefined,'credential_disposed');
  const item={operation:suffix===''?'metadata':suffix==='/time_travel/bookmark'?'bookmark':body?.batch?(bootstrapOnly?'bootstrap_batch':'migration_batch'):'read_query',httpStatus:null,codes:[]};
  const options={method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000),...(body?{body:JSON.stringify(body)}:{})};
  // Last synchronous guard AFTER journal persistence and serialization, with no
  // await or filesystem operation between this check and the mutating fetch.
  // Keep failures outside the network catch: stale identity means ZERO sends.
  if(bootstrapOnly&&body?.batch){
   const plan=bootstrapBatchPlan(body.batch),freshness=assertBootstrapIdentityFresh(plan?.identity);
   bootstrapFetchInvokedAt=new Date(freshness.checkedAt).toISOString();bootstrapFetchInvoked=true;
  }
  diagnostics.push(item);
  let response;try{response=await fetcher(base+suffix,options);item.httpStatus=response.status;}catch{throw Error('request_outcome_unknown');}
  // Never persist upstream errors, bodies, headers or the request object.
  const reader=response.body?.getReader();requireSafe(reader,'response_invalid');let total=0;const chunks=[];
  try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;requireSafe(total<=2000000,'response_too_large');chunks.push(Buffer.from(part.value));}}catch{throw Error('response_invalid_or_oversized');}finally{await reader.cancel().catch(()=>{});}
  let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('response_invalid');}
  item.codes=Array.isArray(value.errors)?value.errors.map(e=>e?.code).filter(Number.isSafeInteger).slice(0,8):[];
  requireSafe(response.ok,'http_rejected');requireSafe(value.success===true&&(!value.errors||value.errors.length===0),'cloudflare_rejected');return value.result;
 }
 async function query(body){const result=await request('/query',body);requireSafe(Array.isArray(result)&&result.length>0&&result.every(r=>r.success===true),'query_failed');return result;}
 const exporter=createExporter(request,fetcher);
 const client=Object.freeze({metadata:()=>request(''),bookmark:async()=>{const result=await request('/time_travel/bookmark');return result?.bookmark;},fullExport:bookmark=>{requireSafe(!firstOnly&&!remainingOnly&&!finalOnly&&!completionOnly&&!bootstrapOnly&&!bootstrapReadScope,'export_not_authorized_for_migration_0001');return exporter.fullExport(bookmark);},
  select:async sql=>{requireSafe(allowedReadSql.includes(sql)||isBackupRead(sql),'read_sql_forbidden');const result=await query({sql,params:[]});requireSafe(result.length===1&&Array.isArray(result[0].results),'read_response_invalid');return result[0].results;},
  bootstrapSelect:async(plan,sql,params=[])=>{
   requireSafe(bootstrapOnly&&plan.executionId===context.executionId&&plan.batchSha256===bootstrapScope.batchSha256&&isBootstrapRead(plan,sql,params),'bootstrap_read_forbidden');
   const result=await query({sql,params});requireSafe(result.length===1&&Array.isArray(result[0].results),'bootstrap_read_response_invalid');return result[0].results;
  },
  applyBatch:async batch=>{
   requireSafe(!bootstrapReadScope,'bootstrap_preflight_read_only');
   if(bootstrapOnly){
    const plan=bootstrapBatchPlan(batch);
    requireSafe(plan&&!writeAttempted&&!submitted.has(batch)&&!batchFailed&&plan.executionId===context.executionId&&plan.batchSha256===bootstrapScope.batchSha256&&digest(JSON.stringify(batch))===bootstrapScope.batchSha256&&identityEvidenceHash(plan.identity)===bootstrapScope.identitySha256&&plan.baselineFingerprint===bootstrapScope.baselineFingerprint&&plan.authorizationReference===bootstrapScope.authorizationReference,'bootstrap_arbitrary_duplicate_or_scope_mismatch');
    submitted.add(batch);writeAttempted=true;lastAcknowledgement=undefined;
    const requestStartedAt=new Date().toISOString();
    try{
     bootstrapJournal.write('request-invocation',{executionId:context.executionId,batchSha256:plan.batchSha256,requestStartedAt,meaning:'about-to-invoke-fetch; not confirmation of server receipt'});
     bootstrapInvocationRecorded=true;
     const results=await query({batch}),responseCompletedAt=new Date().toISOString();
     requireSafe(results.length===batch.length&&results.slice(plan.readbackStart).length===3&&results.slice(plan.readbackStart).every(r=>Array.isArray(r.results)),'bootstrap_response_incomplete');
     lastAcknowledgement=Object.freeze({});
     writeAcknowledgements.set(lastAcknowledgement,{owner:client,...context,stage:6,sourceSetSha256:bootstrapScope.sourceSetSha256,batchSha256:plan.batchSha256,requestStartedAt:bootstrapFetchInvokedAt,responseCompletedAt,
      bootstrapOutput:results.slice(plan.readbackStart).map(r=>r.results)});
    }catch(error){batchFailed=true;throw error;}return;
   }
   requireSafe(isApprovedBatch(batch)&&!submitted.has(batch),'arbitrary_or_duplicate_write_forbidden');const index=approvedBatchStage(batch),readbacks=approvedCompletionReadbacks(batch);
   if(firstOnly)requireSafe(index===0&&!writeAttempted,'only_0001_once_authorized');
   if(remainingOnly||finalOnly||completionOnly){requireSafe(!batchFailed&&nextBatchStage<=5&&index===nextBatchStage&&hasFullSnapshotGuard(batch),completionOnly?'only_0005_0006_in_order_authorized':finalOnly?'only_0004_0006_in_order_authorized':'only_0002_0006_in_order_authorized');if(completionOnly)requireSafe(readbacks,'completion_readbacks_required');nextBatchStage++;}
   submitted.add(batch);writeAttempted=true;lastAcknowledgement=undefined;const requestStartedAt=new Date().toISOString();
   try{
    const results=await query({batch}),responseCompletedAt=new Date().toISOString();let completionOutput;
    if(completionOnly){requireSafe(results.length===batch.length&&Array.isArray(results[readbacks.historyIndex]?.results)&&Array.isArray(results[readbacks.controlIndex]?.results),'completion_response_incomplete');const h=results[readbacks.historyIndex].results,c=results[readbacks.controlIndex].results;
     completionOutput=Object.freeze({history:Object.freeze(h.map(r=>Object.freeze({id:r.id,name:r.name,applied_at:r.applied_at}))),control:Object.freeze(c.map(r=>Object.freeze({id:r.id,epoch:r.epoch,mode:r.mode,generation:r.generation,payload_hash:r.payload_hash})))});
    }
    lastAcknowledgement=Object.freeze({});writeAcknowledgements.set(lastAcknowledgement,{owner:client,...context,stage:index+1,migrationSha256:migrations[index].sha256,batchSha256:digest(JSON.stringify(batch)),requestStartedAt,responseCompletedAt,acknowledgedAt:Date.parse(responseCompletedAt),source:'fixed-rest-batch-acknowledgement',completionOutput});
   }catch(error){batchFailed=true;throw error;}
  },
  writeAcknowledgement:()=>lastAcknowledgement,
  executionContext:()=>context,
  bootstrapContext:()=>bootstrapScope,
  bootstrapWriteObservation:()=>({invocationRecorded:bootstrapInvocationRecorded,fetchInvoked:bootstrapFetchInvoked,fetchInvokedAt:bootstrapFetchInvokedAt}),
  diagnostics:()=>diagnostics.map(item=>({...item,codes:[...item.codes]})),dispose(){secret=undefined;},
 });
 return client;
}
