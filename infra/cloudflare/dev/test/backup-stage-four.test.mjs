import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {localDatabase} from './auth-fixtures.mjs';
import {fixtureExport} from './backup-fixtures.mjs';
import {root,target,approvedSources,migrations} from '../scripts/safe-d1/policy.mjs';
import {captureDatabase,snapshotFingerprint} from '../scripts/safe-d1/snapshot.mjs';
import {splitMigration} from '../scripts/safe-d1/sql.mjs';
import {decryptEnvelope} from '../scripts/safe-d1/encryption.mjs';
import {custodyRoot,dpapi} from '../scripts/safe-d1/windows-custody.mjs';
import {finalBackupPins} from '../scripts/safe-d1/final-backup-receipt.mjs';
import {stageFourWriteEvidence} from '../scripts/safe-d1/stage-four-expectation.mjs';
import {verifyStageFourPreparation,expectedStageFourFingerprint} from '../scripts/safe-d1/backup-stage-four.mjs';
import {runBackupOnly} from '../scripts/safe-d1/backup-only.mjs';
import {createEncryptedStore} from '../scripts/safe-d1/encrypted-store.mjs';
import {backupExecutionApproved,backupAttemptFile,backupResultFile} from '../scripts/safe-d1/backup-once-permit.mjs';
const parent=resolve(root,'.wrangler/backup-stage-four-tests');mkdirSync(parent,{recursive:true});let matchedTimestamp;
const bookmark='00000001-00000002-00000003-00000000000000000000000000000000';
async function fixture(){
 const local=await localDatabase({},0);let clear,exports=0;
 try{clear=await decryptEnvelope(readFileSync(resolve(custodyRoot,finalBackupPins.operationId,'backup.kwgbak')),{protector:dpapi});const p=JSON.parse(clear.toString('utf8'));const bytes=Buffer.from(p.sqlBase64,'base64');p.sqlBase64=undefined;try{await local.db.batch(splitMigration(bytes.toString('utf8')).map(q=>local.db.prepare(q)));}finally{bytes.fill(0);}
  await local.db.batch(splitMigration(approvedSources()[3]).map(q=>local.db.prepare(q)));await local.db.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(4,?,?)').bind(migrations[3].name,matchedTimestamp??'2026-10-26 01:38:00').run();
 }finally{clear?.fill(0);}
 const t={metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async q=>(await local.db.prepare(q).all()).results,bookmark:async()=>bookmark,fullExport:async b=>{exports++;return {bookmark:b,bytes:await fixtureExport(local.db)};},dispose(){}};
 if(!matchedTimestamp){
  // Reconstruct only the known nondeterministic CURRENT_TIMESTAMP field in memory.
  // No remote query and no modification of the reconciliation evidence.
  const capture=await captureDatabase(t),ledger=capture.snapshot.tables.find(t=>t.name==='d1_migrations'),window=stageFourWriteEvidence();
  const first=Math.floor(Date.parse(window.startedAt)/1000)-1,last=Math.ceil(Date.parse(window.finishedAt)/1000)+1;assert.ok(last-first<120);
  for(let s=first;s<=last;s++){const stamp=new Date(s*1000).toISOString().slice(0,19).replace('T',' ');ledger.rows[3][2]='text:'+Buffer.from(stamp).toString('hex').toUpperCase();if(snapshotFingerprint(capture.snapshot)===expectedStageFourFingerprint){matchedTimestamp=stamp;break;}}
  assert.ok(matchedTimestamp,'confirmed fingerprint must be reproducible from approved transition');await local.db.prepare('UPDATE d1_migrations SET applied_at=? WHERE id=4').bind(matchedTimestamp).run();
 }
 return {...local,transport:t,get exports(){return exports;},async run(override={}){const dir=mkdtempSync(resolve(parent,'run-')),key=Buffer.alloc(32,25);const result=await runBackupOnly({transport:{...t,...override},store:createEncryptedStore(dir,async()=>{}),protector:dpapi,recoverySecret:key,expectedStage:4,mode:'local-stage-four-proof',environment:{}});assert.ok(key.every(b=>b===0));return {result,dir};}};
}
test('stage4 backup: pinned reconciliation, exact fingerprint and disabled fresh ID validate locally',()=>{
 const p=verifyStageFourPreparation();assert.equal(p.stage,4);assert.equal(p.applicationTables,26);assert.equal(p.expectedFingerprint,expectedStageFourFingerprint);assert.equal(backupExecutionApproved,false);assert.equal(existsSync(backupAttemptFile),false);assert.equal(existsSync(backupResultFile),false);
 const child=spawnSync(process.execPath,[resolve(root,'scripts/d1-backup-once.mjs')],{input:'not credentials',encoding:'utf8'});assert.equal(child.status,2);assert.equal(JSON.parse(child.stdout).status,'BLOCKED');
});
test('stage4 backup: approved complete transition reproduces the actual reconciled fingerprint and restores exactly',async()=>{
 const f=await fixture();try{assert.equal(snapshotFingerprint((await captureDatabase(f.transport)).snapshot),expectedStageFourFingerprint);const {result}=await f.run();assert.equal(result.status,'verified',JSON.stringify(result));assert.equal(result.sourceStage,4);assert.equal(result.applicationTables,26);assert.equal(result.historyEntries,4);assert.equal(result.restoredTables,28);assert.equal(result.restoredRows,53);assert.equal(f.exports,1);}finally{await f.mf.dispose();}
});
test('stage4 backup: changed catalog state or ledger timestamp cannot silently establish a new fingerprint',async()=>{
 for(const mode of ['catalog','ledger']){const f=await fixture();try{await f.db.prepare(mode==='catalog'?'UPDATE catalog_state SET version=1':"UPDATE d1_migrations SET applied_at='2026-10-25 00:00:00' WHERE id=4").run();const {result,dir}=await f.run();assert.equal(result.verified,false);assert.equal(f.exports,0);assert.equal(result.errorCode,'stage_four_fingerprint_mismatch');assert.deepEqual(readdirSync(dir),[]);}finally{await f.mf.dispose();}}
});
test('stage4 backup: changing bookmarks or incomplete dump fail without automatic retry',async()=>{
 for(const mode of ['bookmark','dump']){const f=await fixture();let calls=0;try{const {result}=await f.run(mode==='bookmark'?{bookmark:async()=>++calls>1?bookmark.replace('00000001','00000009'):bookmark}:{fullExport:async b=>({bookmark:b,bytes:Buffer.from('PRAGMA defer_foreign_keys=TRUE;')})});assert.equal(result.verified,false);assert.equal(f.exports,0);}finally{await f.mf.dispose();}}
});
