import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,target,migrations,schemaHashes,schemaDigest,digest,requireSafe,approvedSources} from './policy.mjs';
import {custodyRoot,verifyWindowsCustody} from './windows-custody.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
export const stageSixFingerprint='1e2216c73853f32ccb46aa94e1b9ec1ee16e1ad71f51779db4d319d567545bf5';
export function verifyStageSixClosure(){
 verifyWindowsCustody();approvedSources();
 const e=JSON.parse(readFileSync(resolve(root,'next-stage/development-plan.json'))).migrationEvidence;
 const prefix=resolve(custodyRoot,'migration-0005-0006-'+e.executionId);
 const resultBytes=readFileSync(prefix+'.result.json'),closureBytes=readFileSync(prefix+'.closed.json'),checkpoint=readFileSync(prefix+'.stage-6.postflight.private.json');
 requireSafe(digest(resultBytes)===e.resultSha256&&digest(closureBytes)===e.closureSha256&&digest(checkpoint)===e.checkpointSha256,'stage_six_closure_hash_mismatch');
 const r=JSON.parse(resultBytes),c=JSON.parse(closureBytes);
 requireSafe(r.status==='completed_0005_0006_only'&&c.stage===6&&c.resultSha256===e.resultSha256&&c.checkpointSha256===e.checkpointSha256&&e.fingerprint===stageSixFingerprint&&r.finalCheckpoint.fingerprint===stageSixFingerprint,'stage_six_closure_invalid');
 return {stage:6,fingerprint:stageSixFingerprint,target,fullBackup:false};
}
export function validateStageSixSnapshot(capture){
 requireSafe(capture.stage===6&&schemaDigest(capture.snapshot.schema.filter(s=>s.name!=='d1_migrations'))===schemaHashes[6],'stage_six_schema_mismatch');
 requireSafe(snapshotFingerprint(capture.snapshot)===stageSixFingerprint,'stage_six_fingerprint_mismatch');
 const app=capture.snapshot.tables.filter(t=>!['d1_migrations','sqlite_sequence'].includes(t.name));
 const history=capture.snapshot.tables.find(t=>t.name==='d1_migrations');
 requireSafe(history?.rows.length===6&&history.rows.every((row,i)=>row[1]==='text:'+Buffer.from(migrations[i].name).toString('hex').toUpperCase()),'stage_six_history_mismatch');
 return {stage:6,applicationTables:app.length,historyEntries:6,sourceFingerprint:stageSixFingerprint};
}
