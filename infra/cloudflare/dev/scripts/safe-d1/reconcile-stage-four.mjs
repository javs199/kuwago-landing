import {createReader} from './read.mjs';
import {captureDatabase,snapshotFingerprint} from './snapshot.mjs';
import {stageFourWriteEvidence,checkedStageFourHistory,expectedStageFourSnapshot,snapshotDifferences} from './stage-four-expectation.mjs';
import {requireSafe,schemaHashes} from './policy.mjs';
import {isBookmark} from './export.mjs';
export async function reconcileStageFour(transport,recordPrivate,{oracle=expectedStageFourSnapshot}={}){
 const result={status:'failed',confirmed:false,startedAt:new Date().toISOString(),bookmarks:[],snapshots:[],differences:[]},points=[];
 async function point(label){const startedAt=new Date().toISOString(),value=await transport.bookmark(),observedAt=new Date().toISOString();requireSafe(isBookmark(value),'reconcile_bookmark_invalid');points.push({label,value,startedAt,observedAt});result.bookmarks.push({label,startedAt,observedAt});return value;}
 try{
  const evidence=stageFourWriteEvidence();await createReader(transport).inspect(4);const history=await transport.select('SELECT id,name,applied_at FROM d1_migrations ORDER BY id');checkedStageFourHistory(history,evidence);
  result.history=history.map(r=>({id:r.id,name:r.name}));result.schemaHash=schemaHashes[4];result.registeredSqlHash=evidence.migrationSha256;result.hashStoredInD1Ledger=false;result.timestampPolicy='new_0004_timestamp_observed_and_bounded_to_original_attempt';
  const expected=await oracle(history);requireSafe(expected.stage===4,'expected_stage_invalid');result.expectedFingerprint=snapshotFingerprint(expected.snapshot);
  const first=await point('first');
  for(let i=0;i<2;i++){
   const actual=await captureDatabase(transport),comparison=snapshotDifferences(expected,actual);result.snapshots.push({stage:actual.stage,fingerprint:snapshotFingerprint(actual.snapshot),observedAt:new Date().toISOString(),tables:actual.snapshot.tables.length,rows:actual.snapshot.tables.reduce((n,t)=>n+t.rows.length,0)});
   result.differences=comparison.differences;requireSafe(actual.stage===4&&comparison.matches,'reconcile_logical_difference');await point(i===0?'middle':'last');
  }
  result.logicalMatch=true;result.currentFingerprint=result.snapshots[1].fingerprint;result.bookmarkStable=first===points[1].value&&points[1].value===points[2].value;result.firstEqualsMiddle=first===points[1].value;result.middleEqualsLast=points[1].value===points[2].value;
  result.confirmed=true;result.status=result.bookmarkStable?'confirmed_stage4':'confirmed_logical_checkpoint_unstable';
 }catch(error){const safe=new Set(['schema_mismatch','history_mismatch','nonempty_installation','seed_data_mismatch','stage_four_history_mismatch','stage_four_timestamp_outside_attempt','reconcile_logical_difference','reconcile_bookmark_invalid','read_rejected']);result.errorCode=safe.has(error?.message)?error.message:'read_or_validation_failed_details_omitted';}
 finally{
  try{await recordPrivate({points,snapshots:result.snapshots,confirmed:result.confirmed});}catch{result.confirmed=false;result.status='failed';result.errorCode='reconcile_evidence_failed';}
  transport.dispose();result.credentialDisposed=true;if(transport.diagnostics)result.requests=transport.diagnostics();result.finishedAt=new Date().toISOString();
 }
 return result;
}
