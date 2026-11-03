import test from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase} from './auth-fixtures.mjs';
import {target,ledgerSql,migrations} from '../scripts/safe-d1/policy.mjs';
import {captureDatabase,snapshotFingerprint} from '../scripts/safe-d1/snapshot.mjs';
import {captureBatchBaseline,assertVerifiedBaselineCurrent} from '../scripts/safe-d1/verified-baseline-control.mjs';
const point=n=>`00000001-00000002-${String(n).padStart(8,'0')}-00000000000000000000000000000000`;
async function fixture(){
 const local=await localDatabase({},3);await local.db.prepare(ledgerSql).run();for(let i=0;i<3;i++)await local.db.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(?,?,?)').bind(i+1,migrations[i].name,'2026-10-25 21:00:00').run();
 const t={metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async sql=>(await local.db.prepare(sql).all()).results,bookmark:async()=>point(1)};
 const fingerprint=snapshotFingerprint((await captureDatabase(t)).snapshot);return {...local,t,fingerprint};
}
test('baseline observations: success retains strict triplet equality and the final freshness guard',async()=>{
 const f=await fixture();const records=[];try{const {baseline}=await captureBatchBaseline(f.t,{stage:3,fingerprint:f.fingerprint,originalBookmark:point(1),requireOriginalBookmark:true,recordObservation:async o=>records.push(o)});assert.equal(records.length,1);assert.equal(records[0].status,'verified');assert.equal(records[0].points.length,3);assert.equal(records[0].logicalMatch,true);assert.equal(records[0].firstEqualsMiddle,true);assert.equal(records[0].middleEqualsLast,true);await assertVerifiedBaselineCurrent(f.t,baseline);await assert.rejects(assertVerifiedBaselineCurrent({...f.t,bookmark:async()=>point(2)},baseline),/changed_before_write/);}finally{await f.mf.dispose();}
});
test('baseline observations: first/middle and middle/last changes are separately identifiable and still rejected',async()=>{
 for(const points of [[1,2,2],[1,1,2]]){const f=await fixture(),records=[];let n=0;try{await assert.rejects(captureBatchBaseline({...f.t,bookmark:async()=>point(points[n++])},{stage:3,fingerprint:f.fingerprint,originalBookmark:point(1),requireOriginalBookmark:true,recordObservation:async o=>records.push(o)}),/concurrent_bookmark_change/);assert.equal(records.length,1);assert.equal(records[0].logicalMatch,true);assert.equal(records[0].firstEqualsMiddle,points[0]===points[1]);assert.equal(records[0].middleEqualsLast,points[1]===points[2]);assert.equal(records[0].points.length,3);assert.equal(records[0].status,'incomplete');}finally{await f.mf.dispose();}}
});
test('baseline observations: original-checkpoint mismatch stops before snapshots; no silent rebasing',async()=>{
 const f=await fixture(),records=[];try{await assert.rejects(captureBatchBaseline({...f.t,bookmark:async()=>point(2)},{stage:3,fingerprint:f.fingerprint,originalBookmark:point(1),requireOriginalBookmark:true,recordObservation:async o=>records.push(o)}),/changed_between_stages/);assert.equal(records[0].points.length,1);assert.equal(records[0].snapshots.length,0);assert.equal(records[0].originalEqualsFirst,false);}finally{await f.mf.dispose();}
});
test('baseline observations: logical change or failed durable observation cannot produce an accepted baseline',async()=>{
 const f=await fixture(),records=[];try{
  await assert.rejects(captureBatchBaseline(f.t,{stage:3,fingerprint:'0'.repeat(64),originalBookmark:point(1),recordObservation:async o=>records.push(o)}),/logical_change/);assert.equal(records[0].logicalMatch,false);
  await assert.rejects(captureBatchBaseline(f.t,{stage:3,fingerprint:f.fingerprint,originalBookmark:point(1),recordObservation:async()=>{throw Error('synthetic evidence unavailable');}}),/evidence unavailable/);
 }finally{await f.mf.dispose();}
});
