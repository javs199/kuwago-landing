import {readFileSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {custodyRoot,verifyWindowsCustody,dpapi} from './windows-custody.mjs';
import {target,digest,requireSafe} from './policy.mjs';
import {approvedBackupState,encryptedBackupPins} from './encrypted-backup-receipt.mjs';
import {captureDatabase,snapshotFingerprint} from './snapshot.mjs';
import {isBookmark} from './export.mjs';
const auditId='9e727e66-ad85-4d6f-b1a8-e976ab2397ce',prefix=resolve(custodyRoot,'baseline-audit-'+auditId);
const pins=Object.freeze({result:'f279c721d3ddd9bf46fba0ffbed1b5ef21f22d18e8b9d9d960bc0afdc800d6d3',private:'cbbbccf942ffab08025dc075e0690741ba94aba1c1a1361a30d223f5c25192a2'});
const candidates=new WeakMap(),baselines=new WeakMap();
function pinned(file,hash){const s=lstatSync(file);requireSafe(s.isFile()&&!s.isSymbolicLink()&&s.size<=100000,'baseline_evidence_invalid');const bytes=readFileSync(file);requireSafe(digest(bytes)===hash,'baseline_evidence_hash_mismatch');return JSON.parse(bytes.toString('utf8'));}
async function unprotectBookmark(value){let plain;try{plain=await dpapi.unprotect(Buffer.from(value,'base64'));requireSafe(plain.length===32&&plain.subarray(28).toString('ascii')==='BKM1','baseline_private_record_invalid');const h=plain.subarray(0,28).toString('hex');return [h.slice(0,8),h.slice(8,16),h.slice(16,24),h.slice(24)].join('-');}finally{plain?.fill(0);}}
async function protectBookmark(value){requireSafe(isBookmark(value),'baseline_bookmark_invalid');const plain=Buffer.concat([Buffer.from(value.replaceAll('-',''),'hex'),Buffer.from('BKM1')]);try{return (await dpapi.protect(plain)).toString('base64');}finally{plain.fill(0);}}
export async function loadReviewedBaselineCandidate(backup){
 verifyWindowsCustody();const publicRecord=pinned(prefix+'.result.json',pins.result),privateRecord=pinned(prefix+'.private-bookmarks.json',pins.private),stored=approvedBackupState(backup);
 requireSafe(publicRecord.auditId===auditId&&privateRecord.auditId===auditId&&JSON.stringify(publicRecord.target)===JSON.stringify(target)&&JSON.stringify(privateRecord.target)===JSON.stringify(target)&&publicRecord.backupOperationId===encryptedBackupPins.operationId&&privateRecord.backupOperationId===encryptedBackupPins.operationId,'baseline_target_mismatch');
 requireSafe(publicRecord.status==='logical_match'&&publicRecord.logicalContentStable===true&&publicRecord.fixedTimestampBookmarkStable===true&&publicRecord.currentBookmarksStable===true&&publicRecord.snapshots.length===2&&publicRecord.snapshots.every(s=>s.stage===0&&s.rows===0&&s.applicationTables===0&&s.fingerprint===stored.fingerprint),'baseline_candidate_not_verified');
 const records=new Map();for(const r of privateRecord.records){requireSafe(!records.has(r.label),'baseline_records_invalid');records.set(r.label,await unprotectBookmark(r.dpapiCiphertext));}
 requireSafe(records.size===6&&records.get('saved_backup')===stored.bookmark&&records.get('current_before')===records.get('current_between')&&records.get('current_between')===records.get('current_after')&&records.get('fixed_time_before')===records.get('fixed_time_after'),'baseline_private_comparison_failed');
 const candidate=Object.freeze({auditId,backupOperationId:encryptedBackupPins.operationId});candidates.set(candidate,{fingerprint:stored.fingerprint,originalBookmark:stored.bookmark,auditBookmark:records.get('current_after')});return candidate;
}
export async function captureVerifiedLiveBaseline(transport,backup,candidate){
 const reviewed=candidates.get(candidate),stored=approvedBackupState(backup);requireSafe(reviewed&&reviewed.fingerprint===stored.fingerprint&&reviewed.originalBookmark===stored.bookmark,'reviewed_baseline_required');
 const startedAt=new Date().toISOString(),first=await transport.bookmark();requireSafe(isBookmark(first),'live_baseline_bookmark_invalid');
 const a=await captureDatabase(transport),middle=await transport.bookmark(),b=await captureDatabase(transport),last=await transport.bookmark();
 requireSafe(a.stage===0&&b.stage===0&&a.snapshot.tables.length===0&&b.snapshot.tables.length===0&&snapshotFingerprint(a.snapshot)===stored.fingerprint&&snapshotFingerprint(b.snapshot)===stored.fingerprint,'live_baseline_logical_change');
 requireSafe(first===middle&&middle===last,'live_baseline_concurrent_bookmark_change');
 const baseline=Object.freeze({auditId,backupOperationId:encryptedBackupPins.operationId});baselines.set(baseline,{startedAt,verifiedAt:Date.now(),fingerprint:stored.fingerprint,originalBookmark:stored.bookmark,auditBookmark:reviewed.auditBookmark,liveBookmark:last});return baseline;
}
export async function assertVerifiedBaselineCurrent(transport,baseline){const data=baselines.get(baseline);requireSafe(data&&Date.now()-data.verifiedAt>=0&&Date.now()-data.verifiedAt<30000,'live_baseline_stale');requireSafe(await transport.bookmark()===data.liveBookmark,'live_baseline_changed_before_write');}
export async function persistVerifiedBaseline(baseline,file){
 verifyWindowsCustody();requireSafe(typeof file==='string'&&dirname(resolve(file))===resolve(custodyRoot)&&/^migration-0001-[a-f0-9-]{36}\.baseline\.private\.json$/.test(basename(file)),'baseline_custody_path_invalid');const data=baselines.get(baseline);requireSafe(data,'live_baseline_required');
 const record={format:1,target,auditId,backupOperationId:encryptedBackupPins.operationId,backupCiphertextSha256:encryptedBackupPins.ciphertextSha256,fingerprint:data.fingerprint,startedAt:data.startedAt,verifiedAt:new Date(data.verifiedAt).toISOString(),originalBookmark:await protectBookmark(data.originalBookmark),reviewedAuditBookmark:await protectBookmark(data.auditBookmark),liveBookmark:await protectBookmark(data.liveBookmark),protection:'DPAPI CurrentUser; BKM1 encoding',doesNotReplaceBackup:true};
 const bytes=Buffer.from(JSON.stringify(record,null,2));const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
 requireSafe(digest(readFileSync(file))===digest(bytes),'baseline_evidence_readback_failed');
 return {auditId,backupOperationId:record.backupOperationId,fingerprint:record.fingerprint,verifiedAt:record.verifiedAt,originalBookmarkPreserved:true,recordFile:file,recordSha256:digest(bytes)};
}
// Same stable-bookmark / two-full-snapshot control for the explicitly authorized
// stage-one continuation. Never changes the historical backup or its receipt.
export async function captureBatchBaseline(transport,{stage,fingerprint,originalBookmark,requireOriginalBookmark=false,recordObservation}){
 requireSafe(stage>=1&&stage<=5&&/^[a-f0-9]{64}$/.test(fingerprint)&&isBookmark(originalBookmark),'batch_baseline_input_invalid');
 const startedAt=new Date().toISOString(),observation={stage,startedAt,originalBookmark,expectedFingerprint:fingerprint,points:[],snapshots:[],status:'incomplete'};
 async function point(label){const value=await transport.bookmark();requireSafe(isBookmark(value),'live_baseline_bookmark_invalid');observation.points.push({label,observedAt:new Date().toISOString(),value});return value;}
 try{
  const first=await point('first');observation.originalEqualsFirst=first===originalBookmark;
  if(requireOriginalBookmark)requireSafe(first===originalBookmark,'live_baseline_changed_between_stages');
  const a=await captureDatabase(transport);observation.snapshots.push({stage:a.stage,fingerprint:snapshotFingerprint(a.snapshot),observedAt:new Date().toISOString()});
  const middle=await point('middle'),b=await captureDatabase(transport);observation.snapshots.push({stage:b.stage,fingerprint:snapshotFingerprint(b.snapshot),observedAt:new Date().toISOString()});const last=await point('last');
  observation.firstEqualsMiddle=first===middle;observation.middleEqualsLast=middle===last;
  observation.logicalMatch=a.stage===stage&&b.stage===stage&&snapshotFingerprint(a.snapshot)===fingerprint&&snapshotFingerprint(b.snapshot)===fingerprint;
  requireSafe(observation.logicalMatch,'live_baseline_logical_change');
  requireSafe(first===middle&&middle===last,'live_baseline_concurrent_bookmark_change');
  observation.status='verified';const baseline=Object.freeze({stage});baselines.set(baseline,{startedAt,verifiedAt:Date.now(),fingerprint,originalBookmark,liveBookmark:last});return {baseline,snapshot:b};
 }finally{
  // Observe both failure and success; persistence failure blocks instead of accepting a baseline.
  if(recordObservation)await recordObservation({...observation,finishedAt:new Date().toISOString()});
 }
}
export async function persistBatchBaseline(baseline,file,backup){
 verifyWindowsCustody();requireSafe(dirname(resolve(file))===resolve(custodyRoot)&&/^migration-(?:0002|0004)-0006-[a-f0-9-]{36}\.stage-[1-5]\.baseline\.private\.json$/.test(basename(file)),'baseline_custody_path_invalid');
 const data=baselines.get(baseline);requireSafe(data,'live_baseline_required');
 const record={format:1,target,stage:baseline.stage,backupOperationId:backup.operationId,backupCiphertextSha256:backup.ciphertextSha256,fingerprint:data.fingerprint,startedAt:data.startedAt,verifiedAt:new Date(data.verifiedAt).toISOString(),originalBookmark:await protectBookmark(data.originalBookmark),liveBookmark:await protectBookmark(data.liveBookmark),protection:'DPAPI CurrentUser; BKM1 encoding',doesNotReplaceBackup:true};
 const bytes=Buffer.from(JSON.stringify(record,null,2)),fd=openSync(file,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
 requireSafe(digest(readFileSync(file))===digest(bytes),'baseline_evidence_readback_failed');return {recordSha256:digest(bytes),originalBookmarkPreserved:true,stage:baseline.stage,verifiedAt:record.verifiedAt};
}
function writePrivateCheckpoint(file,record,pattern){
 verifyWindowsCustody();requireSafe(dirname(resolve(file))===resolve(custodyRoot)&&pattern.test(basename(file)),'baseline_custody_path_invalid');
 const bytes=Buffer.from(JSON.stringify(record,null,2)),fd=openSync(file,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
 requireSafe(digest(readFileSync(file))===digest(bytes),'baseline_evidence_readback_failed');return {recordSha256:digest(bytes),bookmarkProtected:true};
}
export async function persistBatchObservation(observation,file){
 requireSafe(Number.isInteger(observation.stage)&&observation.stage>=1&&observation.stage<=5&&Array.isArray(observation.points)&&observation.points.length<=3,'baseline_observation_invalid');
 const points=[];for(const p of observation.points){requireSafe(['first','middle','last'].includes(p.label),'baseline_observation_invalid');points.push({label:p.label,observedAt:p.observedAt,bookmark:await protectBookmark(p.value)});}
 const record={...observation,target,originalBookmark:await protectBookmark(observation.originalBookmark),points,protection:'DPAPI CurrentUser; BKM1 encoding',doesNotAuthorizeWrites:true};
 return writePrivateCheckpoint(file,record,/^migration-(?:0002|0004)-0006-[a-f0-9-]{36}\.stage-[1-5]\.observation\.private\.json$/);
}
export async function persistBatchPostflight(checkpoint,file){
 requireSafe(checkpoint.stage>=2&&checkpoint.stage<=6&&/^[a-f0-9]{64}$/.test(checkpoint.fingerprint)&&isBookmark(checkpoint.bookmark),'postflight_checkpoint_invalid');
 return writePrivateCheckpoint(file,{format:1,target,stage:checkpoint.stage,fingerprint:checkpoint.fingerprint,observedAt:checkpoint.observedAt,bookmark:await protectBookmark(checkpoint.bookmark),protection:'DPAPI CurrentUser; BKM1 encoding'},/^migration-(?:0002|0004)-0006-[a-f0-9-]{36}\.postflight-stage-[2-6]\.private\.json$/);
}
