import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {localDatabase} from './auth-fixtures.mjs';
import {fixtureExport} from './backup-fixtures.mjs';
import {root,target,ledgerSql,migrations,digest} from '../scripts/safe-d1/policy.mjs';
import {createReader} from '../scripts/safe-d1/read.mjs';
import {validateStageOneSnapshot,verifyStageOnePreparation,backupExpectedStage} from '../scripts/safe-d1/backup-stage-one.mjs';
import {runBackupOnly} from '../scripts/safe-d1/backup-only.mjs';
import {createEncryptedStore} from '../scripts/safe-d1/encrypted-store.mjs';
import {dpapi} from '../scripts/safe-d1/windows-custody.mjs';
import {backupAuthorizationId,backupExecutionApproved,backupAttemptFile,backupResultFile} from '../scripts/safe-d1/backup-once-permit.mjs';
import {encryptedBackupPins} from '../scripts/safe-d1/encrypted-backup-receipt.mjs';
const bookmark='00000001-00000002-00000003-00000000000000000000000000000000';
const parent=resolve(root,'.wrangler/backup-stage-one-tests');mkdirSync(parent,{recursive:true});
async function fixture(stage=1){
 const local=await localDatabase({},stage);let exports=0;
 if(stage>0){await local.db.prepare(ledgerSql).run();for(let i=0;i<stage;i++)await local.db.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(?,?,?)').bind(i+1,migrations[i].name,'2026-10-25 21:12:20').run();}
 const transport={metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async sql=>(await local.db.prepare(sql).all()).results,bookmark:async()=>bookmark,fullExport:async point=>{exports++;return {bookmark:point,bytes:await fixtureExport(local.db)};},dispose(){}};
 return {...local,transport,get exports(){return exports;},async run(override={}){
  const dir=mkdtempSync(resolve(parent,'run-')),store=createEncryptedStore(dir,async()=>{}),key=Buffer.alloc(32,17);
  const result=await runBackupOnly({transport:{...transport,...override},store,protector:dpapi,recoverySecret:key,expectedStage:backupExpectedStage,mode:'local-stage-one-simulation',environment:{}});
  assert.ok(key.every(n=>n===0));return {result,dir};
 }};
}
test('stage one: fixed plan is new, disabled and validates original backup and approved 0001 evidence locally',()=>{
 assert.equal(backupExecutionApproved,false);assert.equal(backupExpectedStage,1);assert.notEqual(backupAuthorizationId,'d4c76ea9-2bab-4817-a99e-f8032685aa35');
 assert.equal(verifyStageOnePreparation().priorPostflightVerified,true);
 assert.equal(digest(readFileSync(encryptedBackupPins.file)),encryptedBackupPins.ciphertextSha256);
 const status=spawnSync(process.execPath,[resolve(root,'scripts/d1-backup-once-status.mjs')],{encoding:'utf8'});assert.equal(status.status,0);
 const plan=JSON.parse(status.stdout);assert.equal(plan.expectedStage,4);assert.equal(plan.applicationTables,26);assert.deepEqual(plan.expectedHistory,migrations.slice(0,4).map(m=>m.name));assert.equal(plan.alreadyUsed,false);
});
test('stage one: valid complete snapshot is encrypted and exactly restored including ledger, seeds and sequence',async()=>{
 const f=await fixture();try{
  await createReader(f.transport).inspect(1);const snapshot=await createReader(f.transport).snapshot();assert.equal(validateStageOneSnapshot(snapshot).applicationTables,21);
  const before=digest(readFileSync(encryptedBackupPins.file)),{result}=await f.run();assert.equal(result.status,'verified',JSON.stringify(result));assert.equal(result.exactSnapshotComparison,true);assert.equal(result.applicationTables,21);assert.equal(result.restoredTables,23);assert.ok(result.restoredRows>1);assert.equal(f.exports,1);
  const evidence=JSON.parse(readFileSync(resolve(dirname(result.artifact),'evidence.json')));assert.equal(evidence.sourceStage,1);assert.equal(evidence.restoreVerified,true);assert.equal(evidence.historyEntries,1);assert.equal(digest(readFileSync(encryptedBackupPins.file)),before);
 }finally{await f.mf.dispose();}
});
test('stage one: empty or stage two database is rejected before starting an export',async()=>{
 for(const stage of [0,2]){const f=await fixture(stage);try{const {result}=await f.run();assert.equal(result.verified,false);assert.equal(f.exports,0);}finally{await f.mf.dispose();}}
});
test('stage one: unexpected tables, history, seeds or content block before export',async()=>{
 for(const mode of ['schema','history','seeds','content']){const f=await fixture();try{
  if(mode==='schema')await f.db.prepare('CREATE TABLE unexpected(id TEXT)').run();
  if(mode==='history')await f.db.prepare("UPDATE d1_migrations SET name='wrong.sql'").run();
  if(mode==='seeds')await f.db.prepare("DELETE FROM role_permissions WHERE role_id='viewer'").run();
  if(mode==='content')await f.db.prepare("INSERT INTO categories(id,slug,active) VALUES('test','test',1)").run();
  const {result}=await f.run();assert.equal(result.verified,false);assert.equal(f.exports,0);
 }finally{await f.mf.dispose();}}
});
test('stage one: ledger timestamp drift changes full fingerprint and prevents promotion',async()=>{
 const f=await fixture();try{const {result,dir}=await f.run({fullExport:async point=>{const value=await f.transport.fullExport(point);await f.db.prepare("UPDATE d1_migrations SET applied_at='2026-10-25 21:13:20'").run();return value;}});assert.equal(result.verified,false);assert.equal(result.errorCode,'source_changed');assert.equal(f.exports,1);assert.deepEqual(readdirSync(dir),[]);}finally{await f.mf.dispose();}
});
test('stage one: missing bookmark, changed bookmark, invalid dump or export interruption cannot promote',async()=>{
 for(const mode of ['missing','changed','invalid','interrupted']){const f=await fixture();let calls=0;try{
  const overrides=mode==='missing'?{bookmark:async()=>null}:mode==='changed'?{bookmark:async()=>++calls===1?bookmark:bookmark.replace('00000001','00000009')}:mode==='invalid'?{fullExport:async point=>({bookmark:point,bytes:Buffer.from('PRAGMA defer_foreign_keys=TRUE;')})}:{fullExport:async()=>{calls++;throw Error('private URL must never appear');}};
  const {result,dir}=await f.run(overrides);assert.equal(result.verified,false);assert.deepEqual(readdirSync(dir),[]);assert.ok(!JSON.stringify(result).includes('private URL'));if(mode==='interrupted')assert.equal(calls,1);
 }finally{await f.mf.dispose();}}
});
test('stage one: CLI blocks before reading input or issuing network requests; graph contains no writer',()=>{
 const cli=resolve(root,'scripts/d1-backup-once.mjs'),before=[readFileSync(encryptedBackupPins.file),readFileSync(encryptedBackupPins.evidenceFile)];
 const child=spawnSync(process.execPath,[cli],{input:'not a credential',encoding:'utf8',timeout:10000,env:{...process.env,BACKUP_EXECUTION_APPROVED:'true'}});assert.equal(child.status,2);assert.deepEqual(JSON.parse(child.stdout),{status:'BLOCKED',authorizationId:backupAuthorizationId});
 const visited=new Set();function visit(file){if(visited.has(file))return;visited.add(file);assert.ok(!/[/\\](write|runner|backup)\.mjs$/.test(file));for(const m of readFileSync(file,'utf8').matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g))visit(resolve(dirname(file),m[1]));}visit(cli);
 assert.deepEqual(readFileSync(encryptedBackupPins.file),before[0]);assert.deepEqual(readFileSync(encryptedBackupPins.evidenceFile),before[1]);
 for(const file of [backupAttemptFile,backupResultFile])assert.throws(()=>readFileSync(file),{code:'ENOENT'});
});
