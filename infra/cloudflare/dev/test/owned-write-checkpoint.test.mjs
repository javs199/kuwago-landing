import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {localDatabase} from './auth-fixtures.mjs';
import {target} from '../scripts/safe-d1/policy.mjs';
import {loadFinalBackup as loadBatchBackup,finalBackupPins as batchBackupPins} from '../scripts/safe-d1/final-backup-receipt.mjs';
import {decryptEnvelope} from '../scripts/safe-d1/encryption.mjs';
import {custodyRoot,dpapi} from '../scripts/safe-d1/windows-custody.mjs';
import {splitMigration} from '../scripts/safe-d1/sql.mjs';
import {createTransport} from '../scripts/safe-d1/transport.mjs';
import {runRemainingMigrations} from '../scripts/safe-d1/migration-batch-runner.mjs';

const token='synthetic_test_credential_not_real_12345';
import {createReader} from '../scripts/safe-d1/read.mjs';
import {createStageWriter} from '../scripts/safe-d1/write.mjs';
import {captureOwnedWriteCheckpoint} from '../scripts/safe-d1/owned-write-checkpoint.mjs';
async function fixture(options={}){
 const backup=await loadBatchBackup(),local=await localDatabase({},0);let clear,sql,writes=0,bookmarkDrift=0;const stages=[],observations=[],postflights=[],base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`;
 try{
  clear=await decryptEnvelope(readFileSync(resolve(custodyRoot,batchBackupPins.operationId,'backup.kwgbak')),{protector:dpapi});const p=JSON.parse(clear.toString('utf8'));sql=Buffer.from(p.sqlBase64,'base64');p.sqlBase64=undefined;
  await local.db.batch(splitMigration(sql.toString('utf8')).map(q=>local.db.prepare(q)));
 }finally{clear?.fill(0);sql?.fill(0);}
 const transport=createTransport(token,{onlyFinalMigrations:true,simulationFetch:async(url,opts)=>{
  assert.ok(url.startsWith(base));const ok=result=>Response.json({success:true,result});
  if(url===base)return ok({uuid:target.id,name:options.wrongIdentity?'wrong':target.name,version:'production'});
  if(url.endsWith('/time_travel/bookmark'))return ok({bookmark:`00000099-00000002-${String(writes+bookmarkDrift).padStart(8,'0')}-00000000000000000000000000000000`});
  assert.equal(url,base+'/query');const body=JSON.parse(opts.body);
  if(body.batch){writes++;if(options.networkFailure)throw Error('sensitive simulated network exception');
   const batch=body.batch.map(q=>local.db.prepare(q.sql).bind(...q.params));if(options.failAt===writes)batch.push(local.db.prepare('INSERT INTO absent_table VALUES(1)'));
   try{const result=await local.db.batch(batch);if(options.postLedgerRace)await local.db.prepare("UPDATE d1_migrations SET applied_at='2026-10-25 23:00:00' WHERE id=1").run();return ok(result);}catch{return Response.json({success:false,errors:[{code:7500}]},{status:400});}
  }
  return ok([await local.db.prepare(body.sql).all()]);
 }});
 return {...local,backup,transport,get writes(){return writes;},stages,observations,postflights,async run(){return runRemainingMigrations({transport,backup,environment:{},recordObservation:async o=>{observations.push(o);},recordPostflight:async p=>{postflights.push(p);if(options.postflightEvidenceFailure)throw Error('checkpoint unavailable');return {bookmarkProtected:true,recordSha256:'b'.repeat(64)};},recordBaseline:async baseline=>{if(options.baselineFailure)throw Error('simulate disk error');if(options.bookmarkRace)bookmarkDrift++;return {stage:baseline.stage,originalBookmarkPreserved:true,recordSha256:'a'.repeat(64)};},recordStage:async(stage,v)=>{stages.push(v);if(options.betweenStages&&v.status==='verified')bookmarkDrift++;if(options.race&&v.status==='outcome_not_confirmed')await local.db.prepare("UPDATE d1_migrations SET applied_at='2026-10-25 22:30:00'").run();if(options.afterStageFailure&&v.status==='verified')throw Error('checkpoint write failed');}});}};
}
async function writtenFixture(){const f=await fixture(),reader=createReader(f.transport),state=await reader.inspect(3),snapshot=await reader.snapshot();await createStageWriter(f.transport).apply(state,f.backup,{snapshot});const expected=await reader.snapshot();return {...f,expected,acknowledgement:f.transport.writeAcknowledgement()};}
test('owned checkpoint prototype: genuine local own-write ack and exact expected state establish a fresh stable checkpoint',async()=>{
 const f=await writtenFixture(),observations=[];try{const result=await captureOwnedWriteCheckpoint(f.transport,{acknowledgement:f.acknowledgement,expectedSnapshot:f.expected,recordEvidence:async()=>({bookmarkProtected:true,recordSha256:'a'.repeat(64)}),recordObservation:async o=>observations.push(o)});assert.equal(result.writeValidated,true);assert.equal(result.stableCheckpointEstablished,true);assert.equal(observations[0].logicalMatch,true);}finally{f.transport.dispose();await f.mf.dispose();}
});
test('owned checkpoint prototype: forged acknowledgement, logical difference and unavailable evidence cannot establish checkpoints',async()=>{
 for(const mode of ['forged','logical','evidence']){const f=await writtenFixture();try{if(mode==='logical')await f.db.prepare('UPDATE catalog_state SET version=1').run();await assert.rejects(captureOwnedWriteCheckpoint(f.transport,{acknowledgement:mode==='forged'?{}:f.acknowledgement,recordEvidence:async()=>{if(mode==='evidence')throw Error('disk failure');return {bookmarkProtected:true,recordSha256:'a'.repeat(64)};},recordObservation:async()=>{}}));}finally{f.transport.dispose();await f.mf.dispose();}}
});
test('owned checkpoint prototype: bookmark change after boundary remains terminal, never renewed or retried',async()=>{
 const f=await writtenFixture();let calls=0;const t={...f.transport,bookmark:async()=>`00000001-00000002-${String(++calls>1?2:1).padStart(8,'0')}-00000000000000000000000000000000`};try{await assert.rejects(captureOwnedWriteCheckpoint(t,{acknowledgement:f.acknowledgement,expectedSnapshot:f.expected,recordEvidence:async()=>({bookmarkProtected:true,recordSha256:'a'.repeat(64)}),recordObservation:async()=>{}}),/changed_between_stages/);assert.equal(calls,2);}finally{f.transport.dispose();await f.mf.dispose();}
});
