import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {localDatabase} from './auth-fixtures.mjs';
import {target,approvedSources,verifySourceSet,verifyManifest,migrations,root,schemaHashes,assertEnvironment,remoteExecutionEnabled} from '../scripts/safe-d1/policy.mjs';
import {createReader,schemaQuery} from '../scripts/safe-d1/read.mjs';
import {captureBackup,verifyBackup} from '../scripts/safe-d1/backup.mjs';
import {createStageWriter} from '../scripts/safe-d1/write.mjs';
import {runMigration} from '../scripts/safe-d1/runner.mjs';
import {createTransport} from '../scripts/safe-d1/transport.mjs';
import {splitMigration} from '../scripts/safe-d1/sql.mjs';
import {fixtureExport} from './backup-fixtures.mjs';
import {snapshotFingerprint} from '../scripts/safe-d1/snapshot.mjs';
const parent=resolve(root,'.wrangler/safe-runner-tests');mkdirSync(parent,{recursive:true});
const directory=()=>mkdtempSync(resolve(parent,'run-'));
async function fixture(options={}){
 const local=await localDatabase({},0);const writes=[],reads=[];let disposed=0;
 const transport={
  async metadata(){reads.push('metadata');return options.metadata?.(writes.length)??{uuid:target.id,name:target.name,version:'production'};},
  async select(sql){reads.push(sql);const rows=(await local.db.prepare(sql).all()).results;return options.rows?.(sql,rows,writes.length)??rows;},
  async bookmark(){reads.push('bookmark');return options.bookmark===undefined?'00000001-00000002-00000003-00000000000000000000000000000000':options.bookmark;},
  async fullExport(bookmark){return {bookmark,bytes:await fixtureExport(local.db)};},
  async applyBatch(batch){writes.push(batch);if(options.networkFailure)throw Error('synthetic sensitive credential should never appear in logs');const statements=batch.map(q=>local.db.prepare(q.sql).bind(...q.params));if(options.failAt===writes.length)statements.push(local.db.prepare('INSERT INTO definitely_absent_table VALUES (1)'));await local.db.batch(statements);},
  dispose(){disposed++;},
 };
 return {...local,transport,writes,reads,get disposed(){return disposed;},async run(dir=directory(),env={}){return runMigration({transport,evidenceDirectory:dir,environment:env});}};
}
test('safe runner: pinned six-file allowlist and hashes reject alteration, reordering, extra SQL and modified manifest entries',()=>{
 const files=approvedSources().map((sql,i)=>({name:migrations[i].name,sql}));verifySourceSet(files);assert.equal(files.length,6);
 for(const mutated of [files.slice(1),[...files,{name:'0007.sql',sql:'SELECT 1'}],[files[1],files[0],...files.slice(2)],files.map((f,i)=>i?f:{...f,sql:f.sql+'\n'}),files.map((f,i)=>i?f:{...f,name:'evil.sql'})])assert.throws(()=>verifySourceSet(mutated));
 const manifest={algorithm:'SHA-256',migrations:migrations.map(m=>({file:m.name,sha256:m.sha256}))};verifyManifest(manifest);manifest.migrations[0].sha256='0'.repeat(64);assert.throws(()=>verifyManifest(manifest));
 assert.ok(Object.isFrozen(target));assert.ok(migrations.every(Object.isFrozen));assert.equal(remoteExecutionEnabled,false);
 assert.throws(()=>assertEnvironment({CLOUDFLARE_ACCOUNT_ID:'other'}));assert.throws(()=>assertEnvironment({KUWAGO_D1_DATABASE_ID:'other'}));assert.throws(()=>assertEnvironment({CF_API_KEY:'forbidden'}));
});
test('safe runner: full six-stage first install uses actual workerd transactional D1 with postflight after each stage',async()=>{
 const f=await fixture();try{const env={CLOUDFLARE_API_TOKEN:'synthetic_test_credential_not_real_12345'},dir=directory();const result=await f.run(dir,env);assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(result.stages.length,6);assert.equal(f.writes.length,6);assert.equal(f.disposed,1);assert.equal(env.CLOUDFLARE_API_TOKEN,undefined);
  assert.deepEqual((await f.db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(r=>r.name),migrations.map(m=>m.name));
  assert.deepEqual((await f.db.prepare('PRAGMA foreign_key_check').all()).results,[]);assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='kuwago_migration_guard'").first()).n,0);
  assert.equal((await createReader(f.transport).inspect(6)).schemaHash,schemaHashes[6]);assert.ok(!readFileSync(resolve(dir,'result.json'),'utf8').includes('synthetic_test_credential'));
  assert.equal(JSON.parse(readFileSync(resolve(dir,'operation.lock'),'utf8')).operationId,result.operationId);assert.equal(JSON.parse(readFileSync(resolve(dir,'complete-backup.json'),'utf8')).operationId,result.operationId);assert.deepEqual(result.target,target);
 }finally{await f.mf.dispose();}
});
test('safe runner: wrong resource ID, name, account and storage version prevent all writes',async()=>{
 for(const mismatch of [{uuid:'wrong-id'},{name:'wrong-name'},{version:'alpha'}]){const f=await fixture({metadata:()=>({uuid:target.id,name:target.name,version:'production',...mismatch})});try{assert.notEqual((await f.run()).status,'completed');assert.equal(f.writes.length,0);}finally{await f.mf.dispose();}}
 const f=await fixture();try{await f.run(directory(),{CLOUDFLARE_ACCOUNT_ID:'wrong'});assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);}finally{await f.mf.dispose();}
});
test('safe runner: unexpected schema and pre-existing partial installations cannot start or resume',async()=>{
 const f=await fixture();try{await f.db.prepare('CREATE TABLE unexpected_table(id TEXT)').run();assert.notEqual((await f.run()).status,'completed');assert.equal(f.writes.length,0);}finally{await f.mf.dispose();}
 const g=await fixture({failAt:2});try{await g.run();assert.equal(g.writes.length,2);const before=g.writes.length;assert.notEqual((await g.run(directory())).status,'completed');assert.equal(g.writes.length,before);}finally{await g.mf.dispose();}
});
test('safe runner: missing/invalid Time Travel blocks backup and writing',async()=>{
 for(const bookmark of [null,'',{},'bad bookmark with spaces']){const f=await fixture({bookmark});try{assert.notEqual((await f.run()).status,'completed');assert.equal(f.writes.length,0);}finally{await f.mf.dispose();}}
});
test('safe runner: fabricated, missing, altered backup and fabricated preflight cannot authorize a stage',async()=>{
 const f=await fixture();try{const reader=createReader(f.transport),state=await reader.inspect(0),writer=createStageWriter(f.transport);
  await assert.rejects(writer.apply(state,{}));await assert.rejects(writer.apply({...state},{}));
  for(const damage of ['alter','remove']){const dir=directory(),file=resolve(dir,'backup.json'),backup=await captureBackup(reader,file,'test-operation');if(damage==='alter')writeFileSync(file,'{}');else unlinkSync(file);assert.throws(()=>verifyBackup(backup,state));await assert.rejects(writer.apply(state,backup));}
  assert.equal(f.writes.length,0);
 }finally{await f.mf.dispose();}
});
test('safe runner: corrupt migration history halts the next stage',async()=>{
 const f=await fixture({rows:(sql,rows,writes)=>sql.startsWith('SELECT id,name,applied_at')&&writes?rows.map(r=>({...r,name:'0000_unknown.sql'})):rows});
 try{assert.notEqual((await f.run()).status,'completed');assert.equal(f.writes.length,1);}finally{await f.mf.dispose();}
});
test('safe runner: failure within a migration rolls back its SQL and ledger and stops the entire operation',async()=>{
 for(const stage of [1,3,5]){const f=await fixture({failAt:stage});try{const result=await f.run();assert.notEqual(result.status,'completed');assert.equal(f.writes.length,stage);assert.equal(result.stages.length,stage-1);await createReader(f.transport).inspect(stage-1);}finally{await f.mf.dispose();}}
});
test('safe runner: postflight error stops after the single attempted write, without retry',async()=>{
 const f=await fixture({metadata:writes=>({uuid:target.id,name:writes?'changed-name':target.name,version:'production'})});try{const result=await f.run();assert.notEqual(result.status,'completed');assert.equal(f.writes.length,1);assert.equal(result.stages.length,0);}finally{await f.mf.dispose();}
 const g=await fixture({networkFailure:true});try{const result=await g.run();assert.notEqual(result.status,'completed');assert.equal(g.writes.length,1);await createReader(g.transport).inspect(0);}finally{await g.mf.dispose();}
});
test('safe runner: one-use stage capability and DB guards prevent duplicate/concurrent batch execution',async()=>{
 const f=await fixture();try{const reader=createReader(f.transport),state=await reader.inspect(0),other=await reader.inspect(0),backup=await captureBackup(reader,resolve(directory(),'backup.json'),'test-operation'),writer=createStageWriter(f.transport);
  const results=await Promise.allSettled([writer.apply(state,backup),writer.apply(other,backup)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);await assert.rejects(writer.apply(state,backup));await assert.rejects(writer.apply(other,backup));await reader.inspect(1);
 }finally{await f.mf.dispose();}
});
test('safe runner: persistent process lock prevents double execution and unsafe restart even on a fresh DB',async()=>{
 const f=await fixture({bookmark:null});try{const dir=directory();await f.run(dir);const readCount=f.reads.length;await f.run(dir);assert.equal(f.reads.length,readCount);assert.equal(f.writes.length,0);}finally{await f.mf.dispose();}
});
test('safe runner: REST transport has fixed destination, rejects arbitrary SQL, redirections, invalid credentials and never retries',async()=>{
 assert.throws(()=>createTransport(''));assert.throws(()=>createTransport('short',{simulationFetch:()=>{throw Error('not called');}}));
 for(const mode of ['throw','redirect','reject','invalid']){let calls=0;const transport=createTransport('synthetic_test_credential_not_real_12345',{simulationFetch:async(url,options)=>{calls++;assert.equal(url,`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`);assert.equal(options.redirect,'manual');if(mode==='throw')throw Error('sensitive test text');if(mode==='redirect')return Response.redirect('https://untrusted.invalid',302);if(mode==='reject')return Response.json({success:false,errors:[{code:10000,message:'sensitive test text'}]},{status:403});return new Response('not JSON');}});
  await assert.rejects(transport.metadata(),e=>!e.message.includes('sensitive'));assert.equal(calls,1);await assert.rejects(transport.select('SELECT 1; DROP TABLE services'));await assert.rejects(transport.applyBatch([{sql:'DROP TABLE services',params:[]}]));assert.equal(calls,1);transport.dispose();await assert.rejects(transport.metadata());
 }
});
test('safe runner: normal CLI and credential form remain remote-locked and accept no arbitrary arguments',()=>{
 for(const args of [[],['--remote'],['--database','other']]){const result=spawnSync(process.execPath,[resolve(root,'scripts/d1-safe-migrate.mjs'),...args],{encoding:'utf8',env:{...process.env,CLOUDFLARE_API_TOKEN:'synthetic_test_credential_not_real_12345'}});assert.equal(result.status,2);assert.deepEqual(JSON.parse(result.stdout),{status:'blocked',remoteExecutionEnabled:false});assert.ok(!result.stdout.includes('synthetic_test_credential'));}
 const form=readFileSync(resolve(root,'scripts/d1-read-credential.ps1'),'utf8');assert.match(form,/\[switch\]\$MigrationRunner/);assert.match(form,/if \(\$MigrationRunner\)/);
});
test('safe runner: SQL splitter preserves quoted semicolons and complete trigger/CASE bodies',()=>{
 const statements=splitMigration("CREATE TABLE t(v TEXT); CREATE TRIGGER tr BEFORE INSERT ON t BEGIN SELECT CASE WHEN NEW.v='a;b' THEN RAISE(ABORT,'x;y') END; END; INSERT INTO t VALUES ('c;d');");assert.equal(statements.length,3);assert.match(statements[1],/END; END$/);assert.throws(()=>splitMigration("CREATE TABLE t(v TEXT DEFAULT 'unterminated)"));
});
test('safe runner: complete empty SQL export restores and is tied to a live simulated bookmark',async()=>{
 const f=await fixture(),g=await fixture();try{const reader=createReader(f.transport),file=resolve(directory(),'backup.json');const backup=await captureBackup(reader,file,'recovery-test');const original=JSON.parse(readFileSync(file,'utf8'));const recovered=await createReader(g.transport).inspect(0);assert.equal(original.sourceFingerprint,snapshotFingerprint((await createReader(g.transport).snapshot()).snapshot));assert.equal(original.restoreVerified,true);verifyBackup(backup,recovered);assert.equal(f.writes.length,0);assert.equal(g.writes.length,0);assert.ok(f.reads.includes('bookmark'));assert.ok(f.reads.filter(q=>q===schemaQuery).length>=2);}finally{await f.mf.dispose();await g.mf.dispose();}
});
test('safe runner: complete REST protocol simulation feeds real local D1 and uses exactly six one-shot write requests',async()=>{
 const f=await fixture();let requests=0,writes=0;const base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`;
 const transport=createTransport('synthetic_test_credential_not_real_12345',{simulationFetch:async(url,options)=>{
  requests++;assert.equal(options.redirect,'manual');
  if(url==='https://synthetic-export.r2.cloudflarestorage.com/full.sql?X-Amz-Signature=synthetic'){assert.equal(options.headers,undefined);return new Response((await f.transport.fullExport('00000001-00000002-00000003-00000000000000000000000000000000')).bytes);}
  assert.equal(options.headers.Authorization,'Bearer synthetic_test_credential_not_real_12345');
  if(url===base){assert.equal(options.method,'GET');return Response.json({success:true,result:await f.transport.metadata()});}
  if(url===base+'/time_travel/bookmark'){assert.equal(options.method,'GET');return Response.json({success:true,result:{bookmark:await f.transport.bookmark()}});}
  if(url===base+'/export'){assert.equal(options.method,'POST');return Response.json({success:true,result:{success:true,type:'export',status:'complete',at_bookmark:'00000001-00000002-00000003-00000000000000000000000000000000',result:{signed_url:'https://synthetic-export.r2.cloudflarestorage.com/full.sql?X-Amz-Signature=synthetic'}}});}
  assert.equal(url,base+'/query');assert.equal(options.method,'POST');const body=JSON.parse(options.body);
  if(body.batch){writes++;await f.transport.applyBatch(body.batch);return Response.json({success:true,result:body.batch.map(()=>({success:true,results:[]}))});}
  const rows=await f.transport.select(body.sql);return Response.json({success:true,result:[{success:true,results:rows}]});
 }});
 try{const result=await runMigration({transport,evidenceDirectory:directory(),environment:{}});assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(writes,6);assert.ok(requests>6);assert.equal(f.writes.length,6);}finally{await f.mf.dispose();}
});
test('safe runner: a stale read followed by an unexpected row cannot commit the next migration',async()=>{
 const f=await fixture();try{const reader=createReader(f.transport),writer=createStageWriter(f.transport),backup=await captureBackup(reader,resolve(directory(),'backup.json'),'race-test');await writer.apply(await reader.inspect(0),backup);const state=await reader.inspect(1);
  await f.db.prepare("INSERT INTO principals(id,issuer,subject) VALUES ('synthetic-race','https://synthetic.invalid','synthetic-subject')").run();
  await assert.rejects(writer.apply(state,backup));assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').first()).n,1);assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='trigger'").first()).n,0);
 }finally{await f.mf.dispose();}
});
test('safe runner: corrupted seed grants and unexpected underscore objects fail closed',async()=>{
 const f=await fixture();try{const reader=createReader(f.transport),writer=createStageWriter(f.transport),backup=await captureBackup(reader,resolve(directory(),'backup.json'),'seed-test');await writer.apply(await reader.inspect(0),backup);
  await f.db.prepare("DELETE FROM role_permissions WHERE role_id='viewer'").run();await assert.rejects(reader.inspect(1),/seed_data_mismatch/);
 }finally{await f.mf.dispose();}
 const g=await fixture();try{await g.db.prepare('CREATE TABLE _unexpected(id TEXT)').run();await assert.rejects(createReader(g.transport).inspect(0),/schema_mismatch/);}finally{await g.mf.dispose();}
});
test('safe runner: expired backups and stale preflights cannot authorize writes',async()=>{
 const f=await fixture();const now=Date.now;
 try{const reader=createReader(f.transport),state=await reader.inspect(0),backup=await captureBackup(reader,resolve(directory(),'backup.json'),'expiry-test'),writer=createStageWriter(f.transport);
  Date.now=()=>now()+600001;assert.throws(()=>verifyBackup(backup,state));await assert.rejects(writer.apply(state,backup));
  Date.now=()=>now()+31000;await assert.rejects(writer.apply(state,backup),/preflight_stale/);assert.equal(f.writes.length,0);
 }finally{Date.now=now;await f.mf.dispose();}
});
