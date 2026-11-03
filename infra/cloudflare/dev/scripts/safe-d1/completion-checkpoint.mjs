import {captureDatabase,snapshotFingerprint} from './snapshot.mjs';
import {isBookmark} from './export.mjs';
import {requireSafe} from './policy.mjs';
export async function completionCheckpoint(transport,{expected,journal,phase,boundary}){
 const fingerprint=snapshotFingerprint(expected.snapshot),points=boundary?[{...boundary}]:[];let capturedAt;
 async function point(label){const value=await transport.bookmark();requireSafe(isBookmark(value),'completion_bookmark_invalid');const p={label,value,observedAt:new Date().toISOString()};points.push(p);return p;}
 try{
  const first=await point('first');if(boundary)requireSafe(first.value===boundary.value,'completion_boundary_changed');
  const a=await captureDatabase(transport);requireSafe(a.stage===expected.stage&&snapshotFingerprint(a.snapshot)===fingerprint,'completion_logical_difference');
  const middle=await point('middle'),b=await captureDatabase(transport);requireSafe(b.stage===expected.stage&&snapshotFingerprint(b.snapshot)===fingerprint,'completion_logical_difference');
  const last=await point('last');requireSafe(first.value===middle.value&&middle.value===last.value,'completion_bookmark_changed');capturedAt=Date.now();
  const final=await point('final_check');requireSafe(final.value===last.value,'completion_bookmark_changed');
  const receipt=await journal.checkpoint(expected.stage,{fingerprint,points,phase});const evidence=await journal.verifyCheckpoint(receipt);
  requireSafe(Date.now()-capturedAt>=0&&Date.now()-capturedAt<30000,'completion_checkpoint_stale');
  return {receipt,evidence,snapshot:b,point:final,capturedAt};
 }catch(error){try{await journal.checkpoint(expected.stage,{fingerprint,points,phase:'observation'});}catch{/* Preserve existing failure evidence; never continue. */}throw error;}
}
