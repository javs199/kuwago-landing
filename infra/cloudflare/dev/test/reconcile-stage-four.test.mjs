import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileStageFour} from '../scripts/safe-d1/reconcile-stage-four.mjs';
import {expectedStageFourSnapshot,stageFourWriteEvidence,checkedStageFourHistory} from '../scripts/safe-d1/stage-four-expectation.mjs';
import {target,migrations,schemaQuery} from '../scripts/safe-d1/policy.mjs';
import {seedQuery} from '../scripts/safe-d1/read.mjs';
import {sequenceQuery,columnsQuery,cellsQuery} from '../scripts/safe-d1/snapshot.mjs';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,dpapi} from '../scripts/safe-d1/windows-custody.mjs';
import {finalBackupPins} from '../scripts/safe-d1/final-backup-receipt.mjs';
import {decryptEnvelope} from '../scripts/safe-d1/encryption.mjs';
const bookmark=n=>`00000001-00000002-${String(n).padStart(8,'0')}-00000000000000000000000000000000`;
let fixturePromise;
async function fixture(){
 if(!fixturePromise)fixturePromise=(async()=>{
  let bytes;try{bytes=await decryptEnvelope(readFileSync(resolve(custodyRoot,finalBackupPins.operationId,'backup.kwgbak')),{protector:dpapi});const p=JSON.parse(bytes.toString('utf8'));
   const {DatabaseSync}=await import('node:sqlite'),db=new DatabaseSync(':memory:');db.exec(Buffer.from(p.sqlBase64,'base64').toString('utf8'));p.sqlBase64=undefined;const history=db.prepare('SELECT id,name,applied_at FROM d1_migrations ORDER BY id').all().map(r=>({...r}));db.close();history.push({id:4,name:migrations[3].name,applied_at:new Date(Date.parse(stageFourWriteEvidence().finishedAt)-10000).toISOString().slice(0,19).replace('T',' ')});
   return {history,expected:await expectedStageFourSnapshot(history)};
  }finally{bytes?.fill(0);}
 })();return fixturePromise;
}
async function run(mode){
 const {history,expected}=await fixture();let reads=0,disposed=false;const privateRecords=[];const actual=structuredClone(expected);
 if(mode==='content')actual.snapshot.tables.find(t=>t.name==='catalog_state').rows[0][1]='integer:31';
 if(mode==='prefix')actual.snapshot.tables.find(t=>t.name==='d1_migrations').rows[0][2]='text:'+Buffer.from('2026-10-25 00:00:00').toString('hex').toUpperCase();
 const decode=cell=>Buffer.from(cell.slice(cell.indexOf(':')+1),'hex').toString('utf8');
 const t={metadata:async()=>({uuid:target.id,name:mode==='target'?'wrong':target.name,version:'production'}),bookmark:async()=>bookmark(mode==='bookmarks'?++reads:(reads++,1)),select:async sql=>{
  if(sql===schemaQuery)return actual.snapshot.schema;
  if(sql==='SELECT id,name,applied_at FROM d1_migrations ORDER BY id')return history;
  if(sql==='PRAGMA quick_check')return [{quick_check:'ok'}];if(sql==='PRAGMA foreign_key_check')return [];
  if(sql===sequenceQuery)return [{name:'sqlite_sequence'}];
  if(sql===seedQuery(4))return [{value:JSON.stringify(['roles','permissions','role_permissions','admin_role_definitions','admin_role_permissions'].map(name=>actual.snapshot.tables.find(t=>t.name===name).rows.map(r=>r.map(decode))))}];
  const count=/^SELECT COUNT\(\*\) AS n FROM (\w+)$/.exec(sql);if(count)return [{n:actual.snapshot.tables.find(t=>t.name===count[1]).rows.length}];
  for(const table of actual.snapshot.tables){if(sql===columnsQuery(table.name))return table.columns.map(name=>({name}));if(sql===cellsQuery(table.name,table.columns))return table.rows.map(row=>Object.fromEntries(row.map((v,i)=>['c'+i,v])));}
  throw Error('unexpected read');
 },dispose(){disposed=true;}};
 const result=await reconcileStageFour(t,async p=>{privateRecords.push(p);if(mode==='evidence')throw Error('failed');},{oracle:async()=>expected});assert.equal(disposed,true);return {result,privateRecords};
}
test('stage4 reconciliation: exact replay from backup confirms full schema, history, data and fingerprints',async()=>{
 const {result,privateRecords}=await run('match');assert.equal(result.status,'confirmed_stage4',JSON.stringify(result));assert.equal(result.confirmed,true);assert.equal(result.hashStoredInD1Ledger,false);assert.equal(privateRecords[0].points.length,3);assert.equal(result.currentFingerprint,result.expectedFingerprint);
});
test('stage4 reconciliation: logical differences and wrong identity stop, not hidden by a newly captured fingerprint',async()=>{
 for(const mode of ['content','prefix','target']){const {result}=await run(mode);assert.equal(result.confirmed,false);if(mode!=='target')assert.equal(result.errorCode,'reconcile_logical_difference');}
});
test('stage4 reconciliation: moving bookmarks are evidence, not permission to write or a stable checkpoint',async()=>{
 const {result}=await run('bookmarks');assert.equal(result.confirmed,true);assert.equal(result.status,'confirmed_logical_checkpoint_unstable');assert.equal(result.bookmarkStable,false);
});
test('stage4 reconciliation: invalid fourth migration timestamp or evidence failure blocks confirmation',async()=>{
 const {history}=await fixture();assert.throws(()=>checkedStageFourHistory(history.map((r,i)=>i===3?{...r,applied_at:'2000-01-01 00:00:00'}:r)));const {result}=await run('evidence');assert.equal(result.confirmed,false);assert.equal(result.errorCode,'reconcile_evidence_failed');
});
