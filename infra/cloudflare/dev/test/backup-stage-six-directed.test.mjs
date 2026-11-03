// One missing integration proof: exact stage-6 profile through the existing
// backup-only encryption/isolated-restore pipeline. All HTTP is simulated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {localDatabase} from './auth-fixtures.mjs';
import {withCompletionSql} from '../scripts/safe-d1/completion-backup.mjs';
import {approvedSources,migrations,root,target,schemaQuery} from '../scripts/safe-d1/policy.mjs';
import {splitMigration} from '../scripts/safe-d1/sql.mjs';
import {custodyRoot,dpapi} from '../scripts/safe-d1/windows-custody.mjs';
import {createBackupTransport} from '../scripts/safe-d1/backup-transport.mjs';
import {createEncryptedStore} from '../scripts/safe-d1/encrypted-store.mjs';
import {runBackupOnly} from '../scripts/safe-d1/backup-only.mjs';
import {stageSixFingerprint} from '../scripts/safe-d1/backup-stage-six.mjs';
import {snapshotFingerprint,captureDatabase,identifier} from '../scripts/safe-d1/snapshot.mjs';

test('stage-six backup-only: simulated export, exact pinned baseline, encryption and isolated restoration; no remote writes',async()=>{
 const f=await localDatabase({},0),sources=approvedSources(),e=JSON.parse(readFileSync(resolve(root,'next-stage/development-plan.json'))).migrationEvidence;
 const ack=JSON.parse(readFileSync(resolve(custodyRoot,'migration-0005-0006-'+e.executionId+'.stage-6.ack.json')));
 let clearSql,exportStarts=0,remoteWrites=0;const recoverySecret=randomBytes(32);
 try{
  await withCompletionSql(async bytes=>{
   const parts=[bytes.toString('utf8')];
   for(const stage of [5,6]){
    parts.push(sources[stage-1]);
    const history=ack.completionOutput.history[stage-1];
    assert.match(history.applied_at,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    parts.push(`INSERT INTO d1_migrations(id,name,applied_at) VALUES (${stage},'${migrations[stage-1].name}','${history.applied_at}');`);
    if(stage===5){const epoch=ack.completionOutput.control[0].epoch;assert.match(epoch,/^[a-f0-9]{32}$/);parts.push(`UPDATE publication_control SET epoch='${epoch}' WHERE id=1;`);}
   }
   clearSql=Buffer.from(parts.join('\n'));
   await f.db.batch(splitMigration(clearSql.toString('utf8')).map(sql=>f.db.prepare(sql)));
  });
  const expected=await captureDatabase({metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async sql=>(await f.db.prepare(sql).all()).results});
  assert.equal(snapshotFingerprint(expected.snapshot),stageSixFingerprint);
  // Model an official full dump of the final schema, NOT a migration script.
  // The isolated restorer correctly forbids ALTER/UPDATE and SELECT statements.
  const schema=(await f.db.prepare(schemaQuery).all()).results.filter(r=>!['_cf_KV','_cf_METADATA'].includes(r.name));
  const dump=['PRAGMA defer_foreign_keys=TRUE',...schema.filter(r=>r.type==='table').map(r=>r.sql)];
  const literal=cell=>{const [type,hex]=cell.split(':');return type==='null'?'NULL':type==='text'?`CAST(X'${hex}' AS TEXT)`:type==='blob'?`X'${hex}'`:Buffer.from(hex,'hex').toString('utf8');};
  for(const table of expected.snapshot.tables){if(table.name==='sqlite_sequence')dump.push('DELETE FROM sqlite_sequence');for(const row of table.rows)dump.push(`INSERT INTO ${identifier(table.name)} (${table.columns.map(identifier).join(',')}) VALUES (${row.map(literal).join(',')})`);}
  dump.push(...schema.filter(r=>r.type!=='table').map(r=>r.sql));
  clearSql.fill(0);clearSql=Buffer.from(dump.join(';\n')+';');
  const base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`,bookmark='00000001-00000002-00000003-00000000000000000000000000000000';
  const transport=createBackupTransport('synthetic_test_credential_not_real_12345',{simulationFetch:async(url,options)=>{
   const ok=result=>Response.json({success:true,result});
   if(url===base)return ok({uuid:target.id,name:target.name,version:'production'});
   if(url===base+'/time_travel/bookmark')return ok({bookmark});
   if(url===base+'/query'){const body=JSON.parse(options.body);assert.equal(body.batch,undefined);if(!/^(SELECT|PRAGMA)\b/.test(body.sql))remoteWrites++;return ok([await f.db.prepare(body.sql).all()]);}
   if(url===base+'/export'){exportStarts++;return ok({success:true,type:'export',status:'complete',at_bookmark:bookmark,result:{signed_url:'https://synthetic-stage-six.r2.cloudflarestorage.com/proof.sql?X-Amz-Signature=synthetic'}});}
   if(url.startsWith('https://synthetic-stage-six.r2.cloudflarestorage.com/'))return new Response(clearSql);
   throw Error('unexpected_simulated_request');
  }});
  const parent=resolve(root,'.wrangler/stage-six-backup-directed');mkdirSync(parent,{recursive:true});
  const store=createEncryptedStore(mkdtempSync(resolve(parent,'run-')),async()=>{});
  const result=await runBackupOnly({transport,store,protector:dpapi,recoverySecret,mode:'local-simulation-stage-six-only',expectedStage:6,environment:{}});
  assert.equal(result.status,'verified',JSON.stringify({status:result.status,step:result.step,errorCode:result.errorCode}));
  assert.equal(result.sourceStage,6);assert.equal(result.applicationTables,32);assert.equal(result.historyEntries,6);assert.equal(result.exactSnapshotComparison,true);
  assert.equal(result.cleanupComplete,true);assert.equal(result.credentialDisposed,true);assert.equal(exportStarts,1);assert.equal(remoteWrites,0);
  const evidence=JSON.parse(readFileSync(resolve(dirname(result.artifact),'evidence.json')));assert.equal(evidence.restoreVerified,true);assert.equal(evidence.sourceStage,6);
  assert.ok(recoverySecret.every(n=>n===0));
 }finally{clearSql?.fill(0);recoverySecret.fill(0);await f.mf.dispose();}
});
