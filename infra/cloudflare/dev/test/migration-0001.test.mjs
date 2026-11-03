import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localDatabase} from './auth-fixtures.mjs';
import {loadApprovedEncryptedBackup,approvedBackupState,encryptedBackupPins} from '../scripts/safe-d1/encrypted-backup-receipt.mjs';
import {runFirstMigration} from '../scripts/safe-d1/migration-0001-runner.mjs';
import {createTransport} from '../scripts/safe-d1/transport.mjs';
import {createReader} from '../scripts/safe-d1/read.mjs';
import {createStageWriter} from '../scripts/safe-d1/write.mjs';
import {target,migrations,approvedSources,remoteExecutionEnabled,schemaHashes} from '../scripts/safe-d1/policy.mjs';
import {takeFirstMigrationPermit} from '../scripts/safe-d1/migration-0001-permit.mjs';
import {loadReviewedBaselineCandidate} from '../scripts/safe-d1/verified-baseline-control.mjs';
async function fixture(options={}){
 const local=await localDatabase({},0),backup=await loadApprovedEncryptedBackup(),source=approvedBackupState(backup);let writes=0,bookmarkCalls=0;
 const client=createTransport('synthetic_test_credential_not_real_12345',{onlyFirstMigration:true,simulationFetch:async(url,request)=>{
  const base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`;
  if(url===base)return Response.json({success:true,result:{uuid:target.id,name:target.name,version:'production'}});
  if(url===base+'/time_travel/bookmark'){bookmarkCalls++;const value=options.movingBookmark&&bookmarkCalls>1?'00000001-00000002-00000004-00000000000000000000000000000000':options.wrongBookmark?'00000001-00000002-00000003-00000000000000000000000000000000':source.bookmark;return Response.json({success:true,result:{bookmark:value}});}
  assert.equal(url,base+'/query');const body=JSON.parse(request.body);
  if(body.batch){writes++;if(options.networkFailure)throw Error('synthetic outcome unknown');const statements=body.batch.map(s=>local.db.prepare(s.sql).bind(...s.params));if(options.rollback)statements.push(local.db.prepare('INSERT INTO nonexistent_failure VALUES(1)'));await local.db.batch(statements);return Response.json({success:true,result:body.batch.map(()=>({success:true,results:[]}))});}
  const rows=(await local.db.prepare(body.sql).all()).results;return Response.json({success:true,result:[{success:true,results:rows}]});
 }});
 return {...local,backup,client,get writes(){return writes;}};
}
test('0001 only: pinned encrypted backup restores locally without plaintext file; manifest/hash unchanged',async()=>{
 const backup=await loadApprovedEncryptedBackup();assert.equal(backup.operationId,encryptedBackupPins.operationId);assert.equal(approvedBackupState(backup).fingerprint.length,64);assert.equal(approvedSources().length,6);assert.equal(migrations[0].sha256,'33bd2451b568acf1c316fcc5355bca1e1cd87deacace72d3819233a00e670abd');assert.equal(remoteExecutionEnabled,false);assert.equal(takeFirstMigrationPermit({}),false);
});

test('verified baseline proposal: reviewed evidence plus fresh equal state permits one local 0001 without replacing historical backup',async()=>{
 const f=await fixture({wrongBookmark:true});try{const original=approvedBackupState(f.backup).bookmark;const candidate=await loadReviewedBaselineCandidate(f.backup);let recorded=0;
  const result=await runFirstMigration({transport:f.client,backup:f.backup,baselineCandidate:candidate,environment:{},recordVerifiedBaseline:async()=>{recorded++;return {originalBookmarkPreserved:true,fingerprint:approvedBackupState(f.backup).fingerprint,recordSha256:'1'.repeat(64)};}});
  assert.equal(result.status,'completed_0001_only',JSON.stringify(result));assert.equal(f.writes,1);assert.equal(recorded,1);assert.ok(approvedBackupState(f.backup).bookmark===original);assert.equal(result.verifiedBaseline.originalBookmarkPreserved,true);
 }finally{await f.mf.dispose();}
});
test('verified baseline proposal: concurrent bookmark change and absent durable evidence both prevent writing',async()=>{
 for(const fault of ['moving','recorder']){const f=await fixture({wrongBookmark:true,movingBookmark:fault==='moving'});try{const candidate=await loadReviewedBaselineCandidate(f.backup);const result=await runFirstMigration({transport:f.client,backup:f.backup,baselineCandidate:candidate,environment:{},recordVerifiedBaseline:async()=>undefined});assert.equal(result.status,'stopped_before_write');assert.equal(f.writes,0);assert.equal(result.errorCode,fault==='moving'?'live_baseline_concurrent_bookmark_change':'baseline_evidence_not_confirmed');}finally{await f.mf.dispose();}}
});
test('0001 only: real local D1 batch applies exactly first migration, records one ledger row and no principals',async()=>{
 const f=await fixture();try{
  const result=await runFirstMigration({transport:f.client,backup:f.backup,environment:{}});assert.equal(result.status,'completed_0001_only',JSON.stringify(result));assert.equal(f.writes,1);assert.equal(result.historyVerified,true);assert.equal(result.credentialDisposed,true);assert.deepEqual(result.history,[{id:1,name:migrations[0].name}]);assert.equal(result.schemaHash,schemaHashes[1]);
  const history=(await f.db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results;assert.deepEqual(history.map(r=>r.name),[migrations[0].name]);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM principals').first()).n,0);
  const state=await createReader({metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async sql=>(await f.db.prepare(sql).all()).results}).inspect(1);assert.equal(state.schemaHash,schemaHashes[1]);
  await assert.rejects(createStageWriter(f.client).apply(state,f.backup));assert.equal(f.writes,1);
 }finally{await f.mf.dispose();}
});
test('0001 only: changed bookmark or unexpected schema prevents all writes',async()=>{
 for(const damage of ['bookmark','schema']){const f=await fixture({wrongBookmark:damage==='bookmark'});try{if(damage==='schema')await f.db.prepare('CREATE TABLE unexpected(id TEXT)').run();const result=await runFirstMigration({transport:f.client,backup:f.backup,environment:{}});assert.equal(result.status,'stopped_before_write');assert.equal(f.writes,0);assert.equal(result.credentialDisposed,true);}finally{await f.mf.dispose();}}
});
test('0001 only: batch failure rolls back locally and network ambiguity never retries',async()=>{
 for(const fault of ['rollback','networkFailure']){const f=await fixture({[fault]:true});try{const result=await runFirstMigration({transport:f.client,backup:f.backup,environment:{}});assert.equal(result.status,'stopped_outcome_requires_review');assert.equal(f.writes,1);assert.equal(result.postflightVerified,false);assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='d1_migrations'").first()).n,0);}finally{await f.mf.dispose();}}
});
test('0001 only: scoped transport cannot export or accept arbitrary batches; entry has no multi-stage loop',async()=>{
 const f=await fixture();try{assert.throws(()=>f.client.fullExport(approvedBackupState(f.backup).bookmark));await assert.rejects(f.client.applyBatch([{sql:'DROP TABLE services',params:[]}]));assert.equal(f.writes,0);}finally{f.client.dispose();await f.mf.dispose();}
 const runner=readFileSync(new URL('../scripts/safe-d1/migration-0001-runner.mjs',import.meta.url),'utf8');assert.ok(runner.includes('inspect(0)'));assert.ok(runner.includes('inspect(1)'));assert.ok(!/for\s*\(|while\s*\(|captureBackup|fullExport/.test(runner));
});
