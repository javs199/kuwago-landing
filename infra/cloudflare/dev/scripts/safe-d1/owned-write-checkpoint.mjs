import {ownWriteMetadata} from './transport.mjs';
import {createReader} from './read.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
import {captureBatchBaseline,assertVerifiedBaselineCurrent} from './verified-baseline-control.mjs';
import {requireSafe} from './policy.mjs';
import {isBookmark} from './export.mjs';
import {expectedStageFourSnapshot} from './stage-four-expectation.mjs';
// Local prototype for 0004 only, deliberately NOT wired into a remote migration CLI.
// Validation is separate from establishing a NEW stable checkpoint after our ack.
// No fallback after a guard failure, retry loop, or acceptance of logical differences.
export async function captureOwnedWriteCheckpoint(transport,{acknowledgement,recordEvidence,recordObservation}){
 const ack=ownWriteMetadata(acknowledgement),age=Date.now()-ack.acknowledgedAt;
 requireSafe(ack.stage===4&&age>=0&&age<60000,'own_write_scope_or_age_invalid');
 requireSafe(typeof recordEvidence==='function'&&typeof recordObservation==='function','owned_write_evidence_required');
 const reader=createReader(transport);await reader.inspect(4);
 const history=await transport.select('SELECT id,name,applied_at FROM d1_migrations ORDER BY id');
 // Never use the newly read snapshot as its own oracle: replay approved source
 // backup + original 0004. Only its generated timestamp is observed and bounded
 // to the successfully acknowledged REST write (20s request timeout).
 const expectedSnapshot=await expectedStageFourSnapshot(history,{writeEvidence:{startedAt:new Date(ack.acknowledgedAt-20000).toISOString(),finishedAt:new Date(ack.acknowledgedAt).toISOString()}});
 const observed=await reader.snapshot(),expected=snapshotFingerprint(expectedSnapshot.snapshot);
 requireSafe(observed.stage===4&&snapshotFingerprint(observed.snapshot)===expected,'own_write_logical_difference');
 const candidatePoint=await reader.bookmark();requireSafe(isBookmark(candidatePoint),'own_write_bookmark_invalid');
 const proof=await recordEvidence({phase:'write_validated_before_checkpoint',stage:4,acknowledgedAt:new Date(ack.acknowledgedAt).toISOString(),fingerprint:expected,observedAt:new Date().toISOString(),bookmark:candidatePoint});
 requireSafe(proof?.bookmarkProtected===true&&/^[a-f0-9]{64}$/.test(proof.recordSha256),'owned_write_evidence_not_confirmed');
 // A point sampled AFTER verified own-write state becomes the boundary, not the
 // earlier point sampled while that state was still being established.
 const live=await captureBatchBaseline(transport,{stage:4,fingerprint:expected,originalBookmark:candidatePoint,requireOriginalBookmark:true,recordObservation});
 await assertVerifiedBaselineCurrent(transport,live.baseline);
 return {...live,writeValidated:true,stableCheckpointEstablished:true};
}
