import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {localDatabase} from './auth-fixtures.mjs';
import {fixtureExport} from './backup-fixtures.mjs';
import {root,target,ledgerSql,migrations,digest} from '../scripts/safe-d1/policy.mjs';
import {createReader} from '../scripts/safe-d1/read.mjs';
import {runBackupOnly} from '../scripts/safe-d1/backup-only.mjs';
import {createEncryptedStore} from '../scripts/safe-d1/encrypted-store.mjs';
import {custodyRoot,dpapi} from '../scripts/safe-d1/windows-custody.mjs';
import {verifyStageThreePreparation,validateStageThreeSnapshot} from '../scripts/safe-d1/backup-stage-three.mjs';
import {backupExecutionApproved,backupAuthorizationId,backupAttemptFile,backupResultFile} from '../scripts/safe-d1/backup-once-permit.mjs';
import {batchBackupPins} from '../scripts/safe-d1/batch-backup-receipt.mjs';
const parent=resolve(root,'.wrangler/backup-stage-three-tests');mkdirSync(parent,{recursive:true});
const bookmark='00000001-00000002-00000003-00000000000000000000000000000000';
async function fixture(stage=3){
 const local=await localDatabase({},stage);let exports=0;
 await local.db.prepare(ledgerSql).run();for(let i=0;i<stage;i++)await local.db.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(?,?,?)').bind(i+1,migrations[i].name,'2026-10-25 21:12:20').run();
 const transport={metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async sql=>(await local.db.prepare(sql).all()).results,bookmark:async()=>bookmark,fullExport:async b=>{exports++;return {bookmark:b,bytes:await fixtureExport(local.db)};},dispose(){}};
 return {...local,transport,get exports(){return exports;},async run(override={}){const dir=mkdtempSync(resolve(parent,'run-')),key=Buffer.alloc(32,21),result=await runBackupOnly({transport:{...transport,...override},store:createEncryptedStore(dir,async()=>{}),protector:dpapi,recoverySecret:key,expectedStage:3,mode:'local-stage-three-simulation',environment:{}});assert.ok(key.every(x=>x===0));return {result,dir};}};
}
test('stage three: evidence pins validate locally, fresh ID stays disabled and no previous backup changes',()=>{
 const state=verifyStageThreePreparation();assert.equal(state.stage,3);assert.equal(state.applicationTables,24);assert.equal(state.historicalFullFingerprintAvailable,false);assert.equal(backupExecutionApproved,false);assert.notEqual(backupAuthorizationId,'6d61db52-444c-476d-b258-64dd4e323bd5');
 const file=resolve(custodyRoot,batchBackupPins.operationId,'backup.kwgbak');assert.equal(digest(readFileSync(file)),batchBackupPins.ciphertextSha256);assert.equal(existsSync(backupAttemptFile),false);assert.equal(existsSync(backupResultFile),false);
});
test('stage three: exact complete schema, history, seeds and full snapshot encrypt and restore in isolated SQLite',async()=>{
 const f=await fixture();try{await createReader(f.transport).inspect(3);assert.equal(validateStageThreeSnapshot(await createReader(f.transport).snapshot()).applicationTables,24);const {result}=await f.run();assert.equal(result.status,'verified',JSON.stringify(result));assert.equal(result.sourceStage,3);assert.equal(result.applicationTables,24);assert.equal(result.historyEntries,3);assert.equal(result.restoredTables,26);assert.equal(result.exactSnapshotComparison,true);assert.equal(f.exports,1);}finally{await f.mf.dispose();}
});
test('stage three: stage one/four, incorrect ledger, seed grants, schema or content blocks before export',async()=>{
 for(const mode of ['stage1','stage4','history','seeds','schema','content']){const f=await fixture(mode==='stage1'?1:mode==='stage4'?4:3);try{
  if(mode==='history')await f.db.prepare("UPDATE d1_migrations SET name='wrong' WHERE id=3").run();
  if(mode==='seeds')await f.db.prepare("DELETE FROM admin_role_permissions WHERE role_id='editor'").run();
  if(mode==='schema')await f.db.prepare('CREATE TABLE unexpected(id TEXT)').run();
  if(mode==='content')await f.db.prepare("INSERT INTO categories(id,slug) VALUES('synthetic','synthetic')").run();
  const {result}=await f.run();assert.equal(result.verified,false);assert.equal(f.exports,0);
 }finally{await f.mf.dispose();}}
});
test('stage three: unstable pre-export bookmarks stop before export, without accepting a new baseline',async()=>{
 const f=await fixture();let count=0;try{const {result,dir}=await f.run({bookmark:async()=>++count===1?bookmark:bookmark.replace('00000001','00000009')});assert.equal(result.verified,false);assert.equal(result.errorCode,'pre_export_bookmark_changed');assert.equal(result.preflight.bookmarkChecks.firstEqualsMiddle,false);assert.equal(result.preflight.bookmarkChecks.middleEqualsLast,true);assert.equal(result.preflight.bookmarkChecks.fullSnapshotsEqual,true);assert.equal(f.exports,0);assert.deepEqual(readdirSync(dir),[]);}finally{await f.mf.dispose();}
});
test('stage three: timestamp drift during export or a truncated dump cannot promote a backup',async()=>{
 for(const mode of ['drift','truncated']){const f=await fixture();try{const {result,dir}=await f.run({fullExport:async b=>{const value=await f.transport.fullExport(b);if(mode==='drift')await f.db.prepare("UPDATE d1_migrations SET applied_at='2026-10-25 23:00:00' WHERE id=3").run();else value.bytes=Buffer.from('PRAGMA defer_foreign_keys=TRUE;');return value;}});assert.equal(result.verified,false);assert.equal(f.exports,1);assert.deepEqual(readdirSync(dir),[]);}finally{await f.mf.dispose();}}
});
test('stage three: CLI and private UI remain locked and cannot be enabled with arguments or environment',()=>{
 const child=spawnSync(process.execPath,[resolve(root,'scripts/d1-backup-once.mjs')],{input:'never a secret',encoding:'utf8',env:{...process.env,BACKUP_EXECUTION_APPROVED:'true'}});assert.equal(child.status,2);assert.deepEqual(JSON.parse(child.stdout),{status:'BLOCKED',authorizationId:backupAuthorizationId});
 const status=spawnSync(process.execPath,[resolve(root,'scripts/d1-backup-once-status.mjs')],{encoding:'utf8'});const p=JSON.parse(status.stdout);assert.equal(p.expectedStage,4);assert.equal(p.applicationTables,26);assert.deepEqual(p.expectedHistory,migrations.slice(0,4).map(m=>m.name));assert.equal(p.executionApproved,false);
 const ui=readFileSync(resolve(root,'scripts/backup-once-private.ps1'),'utf8');assert.ok(ui.includes('$plan.expectedStage -ne 4'));assert.ok(ui.includes('$plan.applicationTables -ne 26'));assert.ok(ui.includes('$run.Enabled = $executionApproved'));
});
