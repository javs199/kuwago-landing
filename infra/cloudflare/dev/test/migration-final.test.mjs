import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {localDatabase} from './auth-fixtures.mjs';
import {root,target,migrations} from '../scripts/safe-d1/policy.mjs';
import {loadFinalBackup as loadBatchBackup,finalBackupPins as batchBackupPins} from '../scripts/safe-d1/final-backup-receipt.mjs';
import {decryptEnvelope} from '../scripts/safe-d1/encryption.mjs';
import {custodyRoot,dpapi} from '../scripts/safe-d1/windows-custody.mjs';
import {splitMigration} from '../scripts/safe-d1/sql.mjs';
import {createTransport} from '../scripts/safe-d1/transport.mjs';
import {runRemainingMigrations} from '../scripts/safe-d1/migration-batch-runner.mjs';
import {finalApproved,issueFinalPermit,takeFinalPermit} from '../scripts/safe-d1/migration-final-permit.mjs';
const token='synthetic_test_credential_not_real_12345';
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
 return {...local,transport,get writes(){return writes;},stages,observations,postflights,async run(){return runRemainingMigrations({transport,backup,environment:{},recordObservation:async o=>{observations.push(o);},recordPostflight:async p=>{postflights.push(p);if(options.postflightEvidenceFailure)throw Error('checkpoint unavailable');return {bookmarkProtected:true,recordSha256:'b'.repeat(64)};},recordBaseline:async baseline=>{if(options.baselineFailure)throw Error('simulate disk error');if(options.bookmarkRace)bookmarkDrift++;return {stage:baseline.stage,originalBookmarkPreserved:true,recordSha256:'a'.repeat(64)};},recordStage:async(stage,v)=>{stages.push(v);if(options.betweenStages&&v.status==='verified')bookmarkDrift++;if(options.race&&v.status==='outcome_not_confirmed')await local.db.prepare("UPDATE d1_migrations SET applied_at='2026-10-25 22:30:00'").run();if(options.afterStageFailure&&v.status==='verified')throw Error('checkpoint write failed');}});}};
}
test('final batch: only the new fixed scope can authorize 0004-0006; disabled CLI ignores env overrides',()=>{
 assert.equal(finalApproved,false);assert.throws(()=>issueFinalPermit());assert.equal(takeFinalPermit({}),false);assert.throws(()=>createTransport(token,{migrationFinalPermit:{}}));assert.throws(()=>createTransport(token,{onlyFinalMigrations:true}));
 const child=spawnSync(process.execPath,[resolve(root,'scripts/d1-migrate-0004-0006.mjs')],{input:'never a token',encoding:'utf8',env:{...process.env,FINAL_APPROVED:'true'}});assert.equal(child.status,2);assert.equal(JSON.parse(child.stdout).status,'BLOCKED');
});
test('final batch: restored stage-three snapshot progresses only 0004-0006 with observations and postflight checkpoints',async()=>{
 const f=await fixture();try{const r=await f.run();assert.equal(r.status,'completed_0004_0006_only',JSON.stringify({status:r.status,error:r.errorCode,stages:r.stages}));assert.equal(f.writes,3);assert.deepEqual(r.stages.map(s=>s.migration),migrations.slice(3).map(m=>m.name));assert.deepEqual((await f.db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(r=>r.name),migrations.map(m=>m.name));assert.equal(f.observations.length,3);assert.deepEqual(f.postflights.map(p=>p.stage),[4,5,6]);assert.ok(r.stages.every(s=>s.postflightEvidence.bookmarkProtected));}finally{await f.mf.dispose();}
});
test('final batch: logical mismatch, wrong target or missing durable evidence prevent all writes',async()=>{
 for(const mode of ['logical','target','evidence']){const f=await fixture({wrongIdentity:mode==='target',baselineFailure:mode==='evidence'});try{if(mode==='logical')await f.db.prepare("UPDATE d1_migrations SET applied_at='2026-10-25 22:00:00' WHERE id=3").run();const r=await f.run();assert.equal(r.status,'stopped_before_write');assert.equal(f.writes,0);}finally{await f.mf.dispose();}}
});
test('final batch: SQL failure at each of the three steps rolls back and never retries or advances',async()=>{
 for(let failAt=1;failAt<=3;failAt++){const f=await fixture({failAt});try{const r=await f.run();assert.equal(r.status,'stopped_review_required');assert.equal(f.writes,failAt);assert.equal(r.stages.length,failAt-1);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').first()).n,failAt+2);assert.deepEqual((await f.db.prepare('PRAGMA foreign_key_check').all()).results,[]);}finally{await f.mf.dispose();}}
});
test('final batch: bookmark or data race, ambiguous response, or failed checkpoint stops immediately',async()=>{
 for(const options of [{bookmarkRace:true},{betweenStages:true},{race:true},{networkFailure:true},{postflightEvidenceFailure:true},{postLedgerRace:true}]){const f=await fixture(options);try{const r=await f.run();assert.notEqual(r.status,'completed_0004_0006_only');assert.equal(f.writes,options.bookmarkRace?0:1);}finally{await f.mf.dispose();}}
});
test('final batch: even simulated scoped transport cannot export or submit arbitrary SQL',async()=>{
 let calls=0;const t=createTransport(token,{onlyFinalMigrations:true,simulationFetch:async()=>{calls++;throw Error('must not call');}});try{await assert.rejects(async()=>t.fullExport('unused'));await assert.rejects(t.applyBatch([{sql:'DROP TABLE services',params:[]}]));assert.equal(calls,0);}finally{t.dispose();}
});
