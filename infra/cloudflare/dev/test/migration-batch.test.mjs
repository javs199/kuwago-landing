import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {localDatabase} from './auth-fixtures.mjs';
import {root,target,migrations} from '../scripts/safe-d1/policy.mjs';
import {loadBatchBackup,batchBackupPins} from '../scripts/safe-d1/batch-backup-receipt.mjs';
import {decryptEnvelope} from '../scripts/safe-d1/encryption.mjs';
import {custodyRoot,dpapi} from '../scripts/safe-d1/windows-custody.mjs';
import {splitMigration} from '../scripts/safe-d1/sql.mjs';
import {createTransport} from '../scripts/safe-d1/transport.mjs';
import {runRemainingMigrations} from '../scripts/safe-d1/migration-batch-runner.mjs';
import {batchApproved,issueBatchPermit,takeBatchPermit} from '../scripts/safe-d1/migration-batch-permit.mjs';
const token='synthetic_test_credential_not_real_12345';
async function fixture(options={}){
 const backup=await loadBatchBackup(),local=await localDatabase({},0);let clear,sql,writes=0,bookmarkDrift=0;const stages=[],observations=[],postflights=[],base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`;
 try{
  clear=await decryptEnvelope(readFileSync(resolve(custodyRoot,batchBackupPins.operationId,'backup.kwgbak')),{protector:dpapi});const p=JSON.parse(clear.toString('utf8'));sql=Buffer.from(p.sqlBase64,'base64');p.sqlBase64=undefined;
  await local.db.batch(splitMigration(sql.toString('utf8')).map(q=>local.db.prepare(q)));
 }finally{clear?.fill(0);sql?.fill(0);}
 const transport=createTransport(token,{onlyRemainingMigrations:true,simulationFetch:async(url,opts)=>{
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
 return {...local,transport,get writes(){return writes;},stages,observations,postflights,async run(){return runRemainingMigrations({transport,backup,environment:{},recordObservation:async o=>{observations.push(o);},recordPostflight:async p=>{postflights.push(p);if(options.postflightEvidenceFailure)throw Error('checkpoint unavailable');return {bookmarkProtected:true,recordSha256:'b'.repeat(64)};},recordBaseline:async baseline=>{if(options.baselineFailure)throw Error('simulate disk error');if(options.bookmarkRace)bookmarkDrift++;return {stage:baseline.stage,originalBookmarkPreserved:true,recordSha256:'a'.repeat(64)};},recordStage:async(stage,v)=>{stages.push(v);if(options.betweenStages&&v.status==='verified')bookmarkDrift++;if(options.race&&v.status==='outcome_not_confirmed')await local.db.prepare("UPDATE d1_migrations SET applied_at='2026-10-25 22:30:00'").run();if(options.afterStageFailure&&v.status==='verified')throw Error('checkpoint write failed');}});}};
}
test('batch: disabled release rejects forged permits, env overrides and CLI before reading credentials',()=>{
 assert.equal(batchApproved,false);assert.throws(()=>issueBatchPermit());assert.equal(takeBatchPermit({}),false);assert.throws(()=>createTransport(token,{migrationBatchPermit:{}}));assert.throws(()=>createTransport(token,{onlyRemainingMigrations:true}));
 const child=spawnSync(process.execPath,[resolve(root,'scripts/d1-migrate-0002-0006.mjs')],{input:'not JSON',encoding:'utf8',env:{...process.env,BATCH_APPROVED:'true'}});assert.equal(child.status,2);assert.equal(JSON.parse(child.stdout).status,'BLOCKED');
});
test('batch: exact restored stage-one source progresses through only 0002-0006 with guarded real D1 batches',async()=>{
 const f=await fixture();try{const r=await f.run();assert.equal(r.status,'completed_0002_0006_only',JSON.stringify(r));assert.equal(f.writes,5);assert.deepEqual(r.stages.map(s=>s.migration),migrations.slice(1).map(m=>m.name));assert.deepEqual((await f.db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(r=>r.name),migrations.map(m=>m.name));assert.equal(r.credentialDisposed,true);assert.ok(f.stages.filter(s=>s.status==='verified').length===5);assert.equal(f.observations.length,5);assert.deepEqual(f.postflights.map(p=>p.stage),[2,3,4,5,6]);assert.ok(r.stages.every(s=>s.postflightEvidence.bookmarkProtected));}finally{await f.mf.dispose();}
});
test('batch: initial logical change, wrong identity or missing evidence prevents all writes',async()=>{
 for(const mode of ['logical','identity','evidence']){const f=await fixture({wrongIdentity:mode==='identity',baselineFailure:mode==='evidence'});try{if(mode==='logical')await f.db.prepare("UPDATE d1_migrations SET applied_at='2026-10-25 22:00:00'").run();const r=await f.run();assert.equal(r.status,'stopped_before_write');assert.equal(f.writes,0);}finally{await f.mf.dispose();}}
});
test('batch: atomic full-data guard catches a ledger-only race after the final bookmark check',async()=>{
 const f=await fixture({race:true});try{const r=await f.run();assert.equal(r.status,'stopped_review_required');assert.equal(f.writes,1);assert.equal(r.stages.length,0);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').first()).n,1);}finally{await f.mf.dispose();}
});
test('batch: SQL failure at each stage rolls back and stops before the next stage, no retries',async()=>{
 for(let failAt=1;failAt<=5;failAt++){const f=await fixture({failAt});try{const r=await f.run();assert.equal(r.status,'stopped_review_required');assert.equal(f.writes,failAt);assert.equal(r.stages.length,failAt-1);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').first()).n,failAt);assert.deepEqual((await f.db.prepare('PRAGMA foreign_key_check').all()).results,[]);}finally{await f.mf.dispose();}}
});
test('batch: ambiguous network outcome or failed postflight checkpoint never starts the next stage',async()=>{
 for(const options of [{networkFailure:true},{afterStageFailure:true},{postflightEvidenceFailure:true}]){const f=await fixture(options);try{const r=await f.run();assert.equal(r.status,'stopped_review_required');assert.equal(f.writes,1);assert.ok(!JSON.stringify(r).includes('sensitive'));}finally{await f.mf.dispose();}}
});
test('batch: scoped transport has no export and refuses arbitrary writes',async()=>{
 let calls=0;const t=createTransport(token,{onlyRemainingMigrations:true,simulationFetch:async()=>{calls++;throw Error('must not call');}});try{await assert.rejects(async()=>t.fullExport('unused'));await assert.rejects(t.applyBatch([{sql:'DROP TABLE services',params:[]}]));assert.equal(calls,0);}finally{t.dispose();}
});
test('batch: changed bookmark before writing or between stages stops without renewing that baseline silently',async()=>{
 for(const options of [{bookmarkRace:true},{betweenStages:true}]){const f=await fixture(options);try{const r=await f.run();assert.notEqual(r.status,'completed_0002_0006_only');assert.equal(f.writes,options.bookmarkRace?0:1);assert.equal(r.stages.length,options.bookmarkRace?0:1);assert.ok(['live_baseline_changed_before_write','live_baseline_changed_between_stages'].includes(r.errorCode));}finally{await f.mf.dispose();}}
});
test('batch: postflight rejects modified timestamps in earlier migration history',async()=>{
 const f=await fixture({postLedgerRace:true});try{const r=await f.run();assert.equal(r.status,'stopped_review_required');assert.equal(f.writes,1);assert.equal(r.stages.length,0);assert.equal(r.errorCode,'postflight_previous_history_changed');}finally{await f.mf.dispose();}
});
