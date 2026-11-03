import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditBaseline} from '../scripts/safe-d1/baseline-audit.mjs';
import {createBaselineReadTransport} from '../scripts/safe-d1/baseline-readonly-transport.mjs';
import {normalizeSnapshot,snapshotFingerprint} from '../scripts/safe-d1/snapshot.mjs';
import {target} from '../scripts/safe-d1/policy.mjs';
const old='00000001-00000002-00000003-00000000000000000000000000000000';
const current='00000001-00000002-00000004-00000000000000000000000000000000';
const later='00000001-00000002-00000005-00000000000000000000000000000000';
const empty=snapshotFingerprint(normalizeSnapshot([],[]));
function transport({changed=false,moving=false}={}){let calls=0;return {metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),bookmark:async()=>moving&&calls++?later:current,bookmarkAt:async()=>current,select:async sql=>sql==='PRAGMA quick_check'?[{quick_check:'ok'}]:sql.startsWith('SELECT type,name,sql')&&changed?[{type:'table',name:'changed',sql:'CREATE TABLE changed(id TEXT)'}]:sql.startsWith('PRAGMA table_info')?[{name:'id'}]:[],dispose(){}};}
test('baseline audit: logical equality is separate from moving current bookmark and stable fixed timestamp',async()=>{
 const result=await auditBaseline(transport({moving:true}),{bookmark:old,fingerprint:empty});assert.equal(result.safe.status,'logical_match');assert.equal(result.safe.logicalContentStable,true);assert.equal(result.safe.currentBookmarksStable,false);assert.equal(result.safe.fixedTimestampBookmarkStable,true);assert.equal(result.safe.currentEqualsSavedBackup,false);assert.ok(!JSON.stringify(result.safe).includes(old));assert.ok(!JSON.stringify(result.safe).includes(current));
});
test('baseline audit: changed logical schema is reported, never accepted as matching',async()=>{const result=await auditBaseline(transport({changed:true}),{bookmark:old,fingerprint:empty});assert.equal(result.safe.status,'difference_requires_review');assert.equal(result.safe.logicalContentMatchesBackup,false);assert.equal(result.safe.snapshots[0].applicationTables,1);});
test('baseline audit: read transport exposes no writer/export and rejects mutating SQL before requests',async()=>{
 let calls=0;const t=createBaselineReadTransport('synthetic_test_credential_not_real_12345',{fetcher:async()=>{calls++;throw Error('must not call');}});try{for(const sql of ['CREATE TABLE x(id TEXT)','INSERT INTO x VALUES(1)','DROP TABLE x','PRAGMA writable_schema=ON'])await assert.rejects(t.select(sql));assert.equal(t.applyBatch,undefined);assert.equal(t.fullExport,undefined);assert.equal(calls,0);}finally{t.dispose();}
});
test('baseline audit: credential errors and timestamps remain redacted without retry',async()=>{
 let calls=0;const marker='synthetic_test_credential_not_real_12345';const t=createBaselineReadTransport(marker,{fetcher:async()=>{calls++;return Response.json({success:false,errors:[{code:10000,message:marker}]},{status:401});}});try{await assert.rejects(t.metadata());assert.equal(calls,1);const log=t.diagnostics();assert.equal(log[0].httpStatus,401);assert.deepEqual(log[0].codes,[10000]);assert.ok(log[0].startedAt&&log[0].finishedAt);assert.ok(!JSON.stringify(log).includes(marker));}finally{t.dispose();}
 const cli=readFileSync(new URL('../scripts/d1-baseline-audit.mjs',import.meta.url),'utf8');assert.ok(!cli.includes('applyBatch'));assert.ok(!cli.includes('fullExport'));
});
