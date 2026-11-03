import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {localDatabase} from './auth-fixtures.mjs';
import {root,target,migrations} from '../scripts/safe-d1/policy.mjs';
import {splitMigration} from '../scripts/safe-d1/sql.mjs';
import {withCompletionSql,loadCompletionBackup} from '../scripts/safe-d1/completion-backup.mjs';
import {createTransport,consumeCompletionAcknowledgement} from '../scripts/safe-d1/transport.mjs';
import {createCompletionJournal} from '../scripts/safe-d1/completion-journal.mjs';
import {runCompletion} from '../scripts/safe-d1/completion-runner.mjs';
import {createReader} from '../scripts/safe-d1/read.mjs';
import {createStageWriter} from '../scripts/safe-d1/write.mjs';
import {completionApproved,issueCompletionPermit} from '../scripts/safe-d1/completion-permit.mjs';
const parent=resolve(root,'.wrangler/completion-directed-tests');mkdirSync(parent,{recursive:true});
async function fixture(options={}){
 const local=await localDatabase({},0),backup=await loadCompletionBackup(),executionId=randomUUID(),dir=mkdtempSync(resolve(parent,'run-'));let writes=0,books=0,extra=0;
 await withCompletionSql(sql=>local.db.batch(splitMigration(sql.toString('utf8')).map(q=>local.db.prepare(q))));
 const base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`,transport=createTransport('synthetic_test_credential_not_real_12345',{onlyCompletionMigrations:true,simulationExecutionId:executionId,simulationFetch:async(url,opts)=>{
  assert.ok(url.startsWith(base));const ok=result=>Response.json({success:true,result});if(url===base)return ok({uuid:target.id,name:target.name,version:'production'});
  if(url.endsWith('/time_travel/bookmark')){books++;if(options.bookmarkRace&&books===7)extra++;return ok({bookmark:`00000001-00000002-${String(writes+extra).padStart(8,'0')}-00000000000000000000000000000000`});}
  assert.equal(url,base+'/query');const q=JSON.parse(opts.body);
  if(q.batch){writes++;if(options.atomicRace)await local.db.prepare('UPDATE catalog_state SET version=1').run();let result;
   try{result=await local.db.batch(q.batch.map(x=>local.db.prepare(x.sql).bind(...x.params)));}catch{return Response.json({success:false,errors:[{code:7500}]},{status:400});}
   if(options.ambiguous)throw Error('synthetic connection lost after local commit');
   if(options.catalogRace)await local.db.prepare('UPDATE catalog_state SET version=1').run();
   if(options.epochRace)await local.db.prepare("UPDATE publication_control SET epoch='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'").run();
   if(options.badAckControl){const index=q.batch.findIndex(x=>x.sql==='SELECT id,epoch,mode,generation,payload_hash FROM publication_control WHERE id=1');result[index].results[0].mode='paused';}
   return ok(result);
  }
  return ok([await local.db.prepare(q.sql).all()]);
 }});
 const journal=createCompletionJournal({root:dir,environment:'local-simulation',executionId,failCheckpointStage:options.failCheckpointStage}),prefix=resolve(dir,'migration-0005-0006-'+executionId);
 return {...local,backup,transport,journal,executionId,prefix,get writes(){return writes;},run:()=>runCompletion({transport,backup,journal,executionId,environment:'local-simulation',processEnvironment:{}})};
}
test('0005→0006: exclusive blocked scope, original migrations, projected generated values and durable stage-6 closure',async()=>{
 assert.equal(completionApproved,false);assert.throws(()=>issueCompletionPermit());assert.throws(()=>createTransport('synthetic_test_credential_not_real_12345',{onlyCompletionMigrations:true,simulationExecutionId:randomUUID()}));
 const child=spawnSync(process.execPath,[resolve(root,'scripts/d1-migrate-0005-0006.mjs')],{input:'not a credential',encoding:'utf8',env:{...process.env,COMPLETION_APPROVED:'true'}});assert.equal(child.status,2);assert.equal(JSON.parse(child.stdout).status,'BLOCKED');
 const f=await fixture();try{
  const r=await f.run();assert.equal(r.status,'completed_0005_0006_only',JSON.stringify({status:r.status,error:r.errorCode,accepted:r.writesAccepted}));assert.equal(f.writes,2);assert.deepEqual(r.verifiedStages.map(s=>s.stage),[5,6]);assert.equal(r.closure.stage6DurablyClosed,true);
  const closure=JSON.parse(readFileSync(f.prefix+'.closed.json')),stored=JSON.parse(readFileSync(f.prefix+'.result.json'));assert.equal(closure.stage,6);assert.equal(stored.finalCheckpoint.stage,6);assert.equal(stored.status,'completed_0005_0006_only');assert.deepEqual((await f.db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(r=>r.name),migrations.map(m=>m.name));
  const a=JSON.parse(readFileSync(f.prefix+'.stage-5.ack.json')),b=JSON.parse(readFileSync(f.prefix+'.stage-6.ack.json'));assert.match(a.completionOutput.control[0].epoch,/^[a-f0-9]{32}$/);assert.equal(a.completionOutput.control[0].epoch,b.completionOutput.control[0].epoch);assert.ok(Date.parse(a.requestStartedAt)<=Date.parse(a.responseCompletedAt));
  await assert.rejects(f.transport.applyBatch([{sql:'DROP TABLE services',params:[]}]));await assert.rejects(async()=>f.transport.fullExport('unused'));assert.equal(f.writes,2);
 }finally{f.transport.dispose();await f.mf.dispose();}
});
test('concurrent changes: SQL CAS, postwrite data/epoch, bookmark, transaction output and ACK binding fail closed',async()=>{
 for(const options of [{atomicRace:true},{catalogRace:true},{epochRace:true},{bookmarkRace:true},{badAckControl:true}]){const f=await fixture(options);try{const r=await f.run();assert.notEqual(r.status,'completed_0005_0006_only');assert.equal(f.writes,1);assert.equal(r.verifiedStages.length,0);assert.equal(existsSync(f.prefix+'.closed.json'),false);}finally{f.transport.dispose();await f.mf.dispose();}}
 const f=await fixture();try{
  const reader=createReader(f.transport),state=await reader.inspect(4),snapshot=await reader.snapshot();let intent;await createStageWriter(f.transport).apply(state,f.backup,{snapshot,captureCompletionOutput:true,beforeSubmit:async x=>{intent=x;}});
  const receipt=f.transport.writeAcknowledgement(),binding={transport:f.transport,environment:'local-simulation',executionId:f.executionId,stage:5,migrationSha256:intent.migrationSha256,batchSha256:intent.batchSha256};
  for(const bad of [{transport:{}},{environment:'development'},{executionId:randomUUID()},{stage:6},{migrationSha256:'0'.repeat(64)},{batchSha256:'0'.repeat(64)}])assert.throws(()=>consumeCompletionAcknowledgement(receipt,{...binding,...bad}),/binding_mismatch/);
  const ack=consumeCompletionAcknowledgement(receipt,binding);assert.equal(ack.stage,5);assert.throws(()=>consumeCompletionAcknowledgement(receipt,binding),/binding_mismatch/);assert.equal(f.writes,1);
 }finally{f.transport.dispose();await f.mf.dispose();}
});
test('ambiguous response after a real local commit: no ACK, no retry, no 0006 and durable unknown outcome',async()=>{
 const f=await fixture({ambiguous:true});try{const r=await f.run();assert.equal(r.status,'stopped_review_required');assert.equal(r.errorCode,'request_outcome_unknown');assert.equal(f.writes,1);assert.equal(r.writesAccepted.length,0);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').first()).n,5);assert.equal(f.transport.writeAcknowledgement(),undefined);assert.equal(existsSync(f.prefix+'.stage-6.intent.json'),false);assert.equal(existsSync(f.prefix+'.closed.json'),false);assert.ok(existsSync(f.prefix+'.stage-5.intent.json'));}finally{await f.mf.dispose();}
});
test('persistence failure after checkpoint write: stop at 0005 or final 0006 and never claim stage-6 closure',async()=>{
 for(const stage of [5,6]){const f=await fixture({failCheckpointStage:stage});try{const r=await f.run();assert.equal(r.status,'stopped_review_required',JSON.stringify({status:r.status,error:r.errorCode}));assert.equal(f.writes,stage-4);assert.deepEqual(r.verifiedStages.map(s=>s.stage),stage===5?[]:[5]);assert.equal(existsSync(f.prefix+'.closed.json'),false);assert.equal(existsSync(f.prefix+`.stage-${stage}.verified.json`),false);assert.ok(existsSync(f.prefix+`.stage-${stage}.postflight.private.json`));assert.equal(r.credentialDisposed,true);}finally{await f.mf.dispose();}}
});
