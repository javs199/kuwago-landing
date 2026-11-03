import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {localDatabase,seedAdministrators} from './auth-fixtures.mjs';
import {target,root,ledgerSql,migrations} from '../scripts/safe-d1/policy.mjs';
import {captureDatabase,snapshotFingerprint} from '../scripts/safe-d1/snapshot.mjs';
import {createReader} from '../scripts/safe-d1/read.mjs';
import {captureBackup,verifyBackupFiles,verifyBackup} from '../scripts/safe-d1/backup.mjs';
import {verifyRestorable} from '../scripts/safe-d1/restore.mjs';
import {createExporter} from '../scripts/safe-d1/export.mjs';
import {fixtureExport} from './backup-fixtures.mjs';
import {runMigration} from '../scripts/safe-d1/runner.mjs';
import {splitMigration} from '../scripts/safe-d1/sql.mjs';
const parent=resolve(root,'.wrangler/backup-readiness-tests');mkdirSync(parent,{recursive:true});
const directory=()=>mkdtempSync(resolve(parent,'run-'));
const bookmark='00000001-00000002-00000003-00000000000000000000000000000000'; // Synthetic only.
const signed='https://synthetic-backup.r2.cloudflarestorage.com/export.sql?X-Amz-Signature=synthetic_private_download';
async function fixture(stage=0,options={}){
 const local=await localDatabase({},stage);let writeCount=0,bookmarkCalls=0;
 if(stage){await local.db.prepare(ledgerSql).run();for(const m of migrations.slice(0,stage))await local.db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').bind(m.name).run();}
 const transport={metadata:async()=>({uuid:target.id,name:target.name,version:'production',...options.metadata}),select:async sql=>(await local.db.prepare(sql).all()).results,
  bookmark:async()=>{bookmarkCalls++;return options.bookmark===undefined?bookmark:options.bookmark;},
  fullExport:async b=>{if(options.interrupt)throw Error('synthetic sensitive interruption');return {bookmark:b,bytes:options.bytes??await fixtureExport(local.db)};},
  applyBatch:async()=>{writeCount++;throw Error('unexpected write in backup-only test');},dispose(){}
 };
 return {...local,transport,reader:createReader(transport),get writes(){return writeCount;},get bookmarks(){return bookmarkCalls;}};
}
test('backup: complete empty SQL and Time Travel receipt restore, hash and target verify without writes',async()=>{
 const f=await fixture();try{const file=resolve(directory(),'backup.json'),receipt=await captureBackup(f.reader,file,'synthetic-operation'),data=verifyBackupFiles(receipt);assert.equal(data.format,2);assert.equal(data.kind,'complete-sql-and-time-travel');assert.deepEqual(data.target,target);assert.equal(data.stage,0);assert.equal(data.restoreVerified,true);assert.ok(data.exportBytes>0);assert.equal(f.bookmarks,2);assert.equal(f.writes,0);assert.ok(!readFileSync(file,'utf8').includes('signed_url'));await verifyRestorable(readFileSync(file+'.sql'),data.sourceFingerprint);}finally{await f.mf.dispose();}
});
test('backup: full Kuwago schema, bilingual content, history, audit, NUL text and max safe integers survive isolated restore',async()=>{
 const f=await fixture(6);try{
  await seedAdministrators(f.db);
  await f.db.batch([
   f.db.prepare("INSERT INTO categories(id,slug,active) VALUES ('synthetic-category','synthetic-category',1)"),
   f.db.prepare("INSERT INTO category_translations VALUES ('synthetic-category','es','Prueba'),('synthetic-category','en','Test')"),
   f.db.prepare("INSERT INTO services(id,provenance,working_revision_id,internal_notes,row_version) VALUES ('synthetic-service','demo','synthetic-r2',?,9007199254740991)").bind("PRIVATE synthetic; ' café\n\0end"),
   f.db.prepare("INSERT INTO service_revisions(id,service_id,number,category_id,created_by) VALUES ('synthetic-r1','synthetic-service',1,'synthetic-category','fixture-editor'),('synthetic-r2','synthetic-service',2,'synthetic-category','fixture-editor')"),
   f.db.prepare("INSERT INTO service_translations VALUES ('synthetic-r1','es','Prueba','Descripción'),('synthetic-r1','en','Test','Description'),('synthetic-r2','es','Nueva','Versión'),('synthetic-r2','en','New','Version')"),
   f.db.prepare("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,request_id,outcome) VALUES ('synthetic-audit','fixture-admin','synthetic.backup','service','synthetic-service','synthetic-request','allowed')"),
  ]);
  const before=await captureDatabase(f.transport),file=resolve(directory(),'with-data.json'),receipt=await captureBackup(f.reader,file,'synthetic-data-operation');const result=verifyBackupFiles(receipt);
  assert.equal(result.stage,6);assert.equal(result.sourceFingerprint,snapshotFingerprint(before.snapshot));assert.ok(result.rowCount>20);assert.ok(result.tableCount>=33);assert.equal(f.writes,0);assert.equal(snapshotFingerprint((await captureDatabase(f.transport)).snapshot),result.sourceFingerprint);
  await assert.rejects(f.reader.inspect(6),/nonempty_installation/);assert.throws(()=>verifyBackup({...receipt},{stage:0}));
  const restored=await fixture();try{const sql=readFileSync(file+'.sql','utf8');await restored.db.batch(splitMigration(sql).map(s=>restored.db.prepare(s)));assert.equal(snapshotFingerprint((await captureDatabase(restored.transport)).snapshot),result.sourceFingerprint);assert.deepEqual((await restored.db.prepare('PRAGMA foreign_key_check').all()).results,[]);}finally{await restored.mf.dispose();}
 }finally{await f.mf.dispose();}
});
test('backup: missing bookmark, empty/malformed/incomplete export and interruptions cannot mint a receipt or reach migration',async()=>{
 for(const options of [{bookmark:null},{bytes:Buffer.alloc(0)},{bytes:Buffer.from('CREATE TABLE damaged(')},{bytes:Buffer.from('CREATE TABLE incomplete(id TEXT);')},{interrupt:true}]){const f=await fixture(0,options);try{await assert.rejects(captureBackup(f.reader,resolve(directory(),'bad.json'),'bad-operation'));const result=await runMigration({transport:f.transport,evidenceDirectory:directory(),environment:{}});assert.notEqual(result.status,'completed');assert.equal(f.writes,0);}finally{await f.mf.dispose();}}
});
test('backup: SQL file corruption/deletion and forged legacy baseline receipt are rejected',async()=>{
 const f=await fixture();try{for(const damage of ['alter','remove']){const file=resolve(directory(),'backup.json'),receipt=await captureBackup(f.reader,file,'file-operation');if(damage==='alter')writeFileSync(file+'.sql','PRAGMA defer_foreign_keys=TRUE; -- altered');else unlinkSync(file+'.sql');assert.throws(()=>verifyBackupFiles(receipt));}assert.throws(()=>verifyBackupFiles({file:'old-empty-baseline.json',operationId:'pretend'}));}finally{await f.mf.dispose();}
});
test('backup: changed source state/bookmark or target blocks acceptance',async()=>{
 const f=await fixture();try{let count=0;const reader={...f.reader,bookmark:async()=>++count===1?bookmark:'different_synthetic_bookmark'};await assert.rejects(captureBackup(reader,resolve(directory(),'changed.json'),'change-operation'),/source_changed/);}finally{await f.mf.dispose();}
 const g=await fixture(0,{metadata:{uuid:'another-db'}});try{await assert.rejects(captureBackup(g.reader,resolve(directory(),'wrong.json'),'wrong-operation'),/target/);assert.equal(g.bookmarks,0);}finally{await g.mf.dispose();}
});
test('backup: export polling stays on same job, requests all schema/data and never forwards API credentials to download',async()=>{
 const calls=[];let poll=0;const exporter=createExporter(async(path,body)=>{calls.push({path,body});poll++;return {success:true,type:'export',at_bookmark:bookmark,...(poll===1?{}:{status:'complete',result:{signed_url:signed}})};},async(url,options)=>{assert.equal(url,signed);assert.equal(options.headers,undefined);assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');return new Response('PRAGMA defer_foreign_keys=TRUE;');});
 const result=await exporter.fullExport(bookmark);assert.equal(result.bookmark,bookmark);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.path==='/export'&&c.body.dump_options.no_data===false&&c.body.dump_options.no_schema===false&&c.body.dump_options.tables.length===0));assert.equal(calls[1].body.current_bookmark,bookmark);
});
test('backup: export errors, job drift, invalid download origin, redirect, truncation and interruption fail closed',async()=>{
 for(const mode of ['job-error','job-drift','origin','redirect','truncated','download-error']){
  let apiCalls=0,downloadCalls=0;const exporter=createExporter(async()=>{apiCalls++;return {success:true,type:'export',status:mode==='job-error'?'error':'complete',at_bookmark:mode==='job-drift'?'wrong_bookmark':bookmark,result:{signed_url:mode==='origin'?'http://127.0.0.1/private':signed}};},async()=>{downloadCalls++;if(mode==='download-error')throw Error(signed);if(mode==='redirect')return Response.redirect('https://untrusted.invalid',302);if(mode==='truncated')return new Response('short',{headers:{'Content-Length':'100'}});return new Response('valid');});
  await assert.rejects(exporter.fullExport(bookmark),e=>!e.message.includes('synthetic_private_download'));assert.equal(apiCalls,1);assert.equal(downloadCalls,['job-error','job-drift','origin'].includes(mode)?0:1);
 }
});
test('backup: isolated verifier rejects external file access, extensions, expensive SELECTs and invalid UTF-8',async()=>{
 const f=await fixture();try{const expected=snapshotFingerprint((await captureDatabase(f.transport)).snapshot);for(const sql of ["ATTACH DATABASE 'private.sqlite' AS private;",'PRAGMA writable_schema=ON;',"CREATE TABLE t AS SELECT zeroblob(1000000000);","CREATE TABLE t(x); INSERT INTO t SELECT 1;","CREATE TABLE t(x); INSERT INTO t VALUES(load_extension('private'));",'BEGIN; COMMIT;'])await assert.rejects(verifyRestorable(Buffer.from(sql),expected));await assert.rejects(verifyRestorable(Buffer.from([0xff,0xfe,0x00]),expected));}finally{await f.mf.dispose();}
});
test('backup: a syntactically valid dump missing data or referenced identities is not considered restored',async()=>{
 const f=await fixture(6);try{await seedAdministrators(f.db);const before=await captureDatabase(f.transport),sql=(await fixtureExport(f.db)).toString('utf8');
  for(const table of ['role_permissions','principals']){const incomplete=sql.split('\n').filter(line=>!line.startsWith(`INSERT INTO "${table}"`)).join('\n');assert.notEqual(incomplete,sql);await assert.rejects(verifyRestorable(Buffer.from(incomplete),snapshotFingerprint(before.snapshot)));}
 }finally{await f.mf.dispose();}
});
test('backup: source content mutation during export prevents a valid receipt even if bookmark mocks remain unchanged',async()=>{
 const f=await fixture(6);try{const exporter=f.transport.fullExport;f.transport.fullExport=async b=>{const data=await exporter(b);await f.db.prepare("INSERT INTO categories(id,slug) VALUES ('synthetic-drift','synthetic-drift')").run();return data;};await assert.rejects(captureBackup(f.reader,resolve(directory(),'drift.json'),'drift-operation'),/source_changed/);assert.equal(f.writes,0);}finally{await f.mf.dispose();}
});
test('backup: polling and maximum file size are bounded, without restarting an export job',async()=>{
 let calls=0;const pending=createExporter(async()=>{calls++;return {success:true,type:'export',at_bookmark:bookmark};},async()=>{throw Error('download must not run');});await assert.rejects(pending.fullExport(bookmark),/poll_limit/);assert.equal(calls,12);
 const oversized=createExporter(async()=>({success:true,type:'export',at_bookmark:bookmark,status:'complete',result:{signed_url:signed}}),async()=>new Response('small',{headers:{'Content-Length':'16000001'}}));await assert.rejects(oversized.fullExport(bookmark),/size_limit/);
});
