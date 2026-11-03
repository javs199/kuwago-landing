import {randomUUID,timingSafeEqual} from 'node:crypto';
import {createReader} from './read.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
import {isBookmark} from './export.mjs';
import {verifyRestorable} from './restore.mjs';
import {encryptEnvelope,decryptEnvelope} from './encryption.mjs';
import {target,digest,requireSafe} from './policy.mjs';
import {validateStageOneSnapshot} from './backup-stage-one.mjs';
import {validateStageThreeSnapshot} from './backup-stage-three.mjs';
import {validateStageFourSnapshot} from './backup-stage-four.mjs';
import {validateStageSixSnapshot,verifyStageSixClosure} from './backup-stage-six.mjs';
import {validateCurrentAdminSnapshot} from './backup-current-admin.mjs';
// No migration writer, migration runner or legacy plaintext backup helper is reachable here.
export async function runBackupOnly({transport,store,protector,recoverySecret,environment=process.env,mode='simulation',expectedStage,postAdmin=false}){
 const result={operationId:randomUUID(),target,mode,status:'failed',verified:false,cleanupComplete:false,credentialDisposed:false};
 let handle,sql,payload,decoded,encrypted,viaDpapi,viaRecovery;
 try{
  requireSafe(Buffer.isBuffer(recoverySecret)&&recoverySecret.length===32,'recovery_secret_required');
  if(expectedStage===6&&!postAdmin)verifyStageSixClosure();
  requireSafe(!postAdmin||expectedStage===6,'baseline_stage_mismatch');
  result.step='custody';handle=await store.begin(result.operationId);
  result.preflight={custodyVerified:true,identityAndSchemaVerified:false,bookmarkVerified:false};
  result.step='preflight';
  const reader=createReader(transport);
  const validateStage=postAdmin?validateCurrentAdminSnapshot:expectedStage===1?validateStageOneSnapshot:expectedStage===3?validateStageThreeSnapshot:expectedStage===4?validateStageFourSnapshot:expectedStage===6?validateStageSixSnapshot:null;
  if(validateStage&&!postAdmin)await reader.inspect(expectedStage);
  let anchor,anchorObservedAt;if([3,4,6].includes(expectedStage)){anchor=await reader.bookmark();anchorObservedAt=new Date().toISOString();requireSafe(isBookmark(anchor),'bookmark_missing');}
  const before=await reader.snapshot();
  if(expectedStage!==undefined)requireSafe(before.stage===expectedStage,'baseline_stage_mismatch');
  const stageMeta=validateStage?validateStage(before):null;
  result.preflight.identityAndSchemaVerified=true;
  const bookmark=await reader.bookmark(),middleObservedAt=new Date().toISOString();requireSafe(isBookmark(bookmark),'bookmark_missing');result.preflight.bookmarkVerified=true;
  if([3,4,6].includes(expectedStage)){const check=await reader.snapshot();validateStage(check);const last=await reader.bookmark();result.preflight.bookmarkChecks={firstObservedAt:anchorObservedAt,middleObservedAt,lastObservedAt:new Date().toISOString(),firstEqualsMiddle:anchor===bookmark,middleEqualsLast:bookmark===last,fullSnapshotsEqual:snapshotFingerprint(before.snapshot)===snapshotFingerprint(check.snapshot)};requireSafe(result.preflight.bookmarkChecks.fullSnapshotsEqual,'source_changed');requireSafe(anchor===bookmark&&bookmark===last,'pre_export_bookmark_changed');}
  result.step='export';const exported=await reader.fullExport(bookmark);sql=exported.bytes;
  requireSafe(exported.bookmark===bookmark&&Buffer.isBuffer(sql),'export_invalid');
  if(validateStage&&!postAdmin)await reader.inspect(expectedStage);
  const after=await reader.snapshot();if(validateStage)validateStage(after);
  requireSafe(bookmark===await reader.bookmark()&&snapshotFingerprint(before.snapshot)===snapshotFingerprint(after.snapshot),'source_changed');
  const fingerprint=snapshotFingerprint(before.snapshot);
  const stageEvidence=stageMeta?{sourceStage:stageMeta.stage,applicationTables:stageMeta.applicationTables,historyEntries:stageMeta.historyEntries}:{};
  payload=Buffer.from(JSON.stringify({format:1,target,operationId:result.operationId,bookmark,sourceFingerprint:fingerprint,...stageEvidence,sqlSha256:digest(sql),sqlBase64:sql.toString('base64')}));
  result.step='encryption';encrypted=await encryptEnvelope(payload,result,recoverySecret,protector);
  viaDpapi=await decryptEnvelope(encrypted,{protector});viaRecovery=await decryptEnvelope(encrypted,{recoverySecret});
  try{requireSafe(viaDpapi.length===payload.length&&viaRecovery.length===payload.length&&timingSafeEqual(viaDpapi,payload)&&timingSafeEqual(viaRecovery,payload),'encryption_roundtrip_failed');}finally{viaDpapi.fill(0);viaRecovery.fill(0);}
  const evidence={format:1,operationId:result.operationId,target,mode,createdAt:new Date().toISOString(),encryptedSha256:digest(encrypted),encryptedBytes:encrypted.length,restoreVerified:false,encryption:'AES-256-GCM',keyProtection:'DPAPI-CurrentUser + scrypt-recovery'};
  result.step='persistence';
  await store.write(handle,encrypted,evidence);
  const stored=store.read(handle);requireSafe(digest(stored)===evidence.encryptedSha256,'encrypted_file_corrupt');decoded=await decryptEnvelope(stored,{protector});
  const recovered=JSON.parse(decoded.toString('utf8'));requireSafe(recovered.operationId===result.operationId&&JSON.stringify(recovered.target)===JSON.stringify(target)&&recovered.sqlSha256===digest(Buffer.from(recovered.sqlBase64,'base64')),'decrypted_payload_invalid');
  requireSafe(recovered.sourceFingerprint===fingerprint,'backup_fingerprint_mismatch');
  result.step='restoration';const restoredSql=Buffer.from(recovered.sqlBase64,'base64');let restored;try{restored=await verifyRestorable(restoredSql,fingerprint);}finally{restoredSql.fill(0);recovered.sqlBase64=undefined;}
  if(stageMeta){Object.assign(result,stageEvidence);result.exactSnapshotComparison=true;result.restoredTables=restored.tables;result.restoredRows=restored.rows;}
  store.verifiedEvidence(handle,{...evidence,restoreVerified:true,...stageEvidence,...(stageMeta?{exactSnapshotComparison:true,restoredTables:restored.tables,restoredRows:restored.rows}:{})});result.step='promotion';
  result.artifact=await store.promote(handle);result.verified=true;result.status='verified';
 }catch(error){
  result.status='failed';
  const safeCodes=new Set(['baseline_stage_mismatch','bookmark_missing','source_changed','target_or_storage_version_mismatch','backup_request_rejected','backup_request_interrupted','backup_response_invalid','backup_read_invalid','export_failed_or_bookmark_changed','export_download_origin_forbidden','export_download_invalid','export_status_invalid','export_size_limit','export_truncated','export_poll_limit','export_download_failed','export_download_interrupted','export_bookmark_missing','export_restore_verification_failed','encryption_failed','encryption_roundtrip_failed']);
  for(const code of ['pre_export_bookmark_changed','stage_three_schema_mismatch','stage_three_tables_mismatch','stage_three_history_mismatch','stage_three_unexpected_content','stage_four_schema_mismatch','stage_four_tables_mismatch','stage_four_fingerprint_mismatch'])safeCodes.add(code);
  result.errorCode=safeCodes.has(error?.message)?error.message:'operation_failed_details_omitted';
 }
 finally{
  delete environment.CLOUDFLARE_API_TOKEN;
  try{transport.dispose();result.credentialDisposed=true;}catch{result.credentialDisposed=false;}
  if(transport.diagnostics)result.requests=transport.diagnostics();
  sql?.fill(0);payload?.fill(0);decoded?.fill(0);viaDpapi?.fill(0);viaRecovery?.fill(0);recoverySecret?.fill(0);
  if(handle&&store.isVerified(handle)){result.verified=true;if(result.status==='failed')result.status='verified_with_operation_error';}
  try{if(handle)store.cleanup(handle);result.cleanupComplete=true;}catch{result.status=store.isVerified(handle)?'verified_cleanup_pending':'failed_cleanup_pending';try{store.failureEvidence(handle,result);}catch{/* Never print unsanitized filesystem errors. */}}
 }
 return result;
}
