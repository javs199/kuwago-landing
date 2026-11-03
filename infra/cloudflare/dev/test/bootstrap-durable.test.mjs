import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {localDatabase} from './auth-fixtures.mjs';
import {ledgerSql,migrations,target,root,schemaQuery} from '../scripts/safe-d1/policy.mjs';
import {createReader} from '../scripts/safe-d1/read.mjs';
import {snapshotFingerprint,identifier} from '../scripts/safe-d1/snapshot.mjs';
import {devAccess,expectedSubject,recipientEmail,verifyBootstrapRecipient,prepareSingleOperatorBootstrap} from '../scripts/single-operator-bootstrap.mjs';
import {createBootstrapJournal} from '../scripts/safe-d1/bootstrap-journal.mjs';
import {scopeForBootstrap,issueBootstrapPermit,bootstrapExecutionApproved} from '../scripts/safe-d1/bootstrap-permit.mjs';
import {createTransport,consumeBootstrapAcknowledgement} from '../scripts/safe-d1/transport.mjs';
import {verifySimulationRecovery,bootstrapRecoveryState,loadBootstrapRecovery} from '../scripts/safe-d1/bootstrap-recovery.mjs';
import {runBootstrap} from '../scripts/safe-d1/bootstrap-runner.mjs';
import {projectBootstrap} from '../scripts/safe-d1/bootstrap-oracle.mjs';
import {validateStageSixSnapshot,verifyStageSixClosure} from '../scripts/safe-d1/backup-stage-six.mjs';
import {projectCompletion} from '../scripts/safe-d1/completion-oracle.mjs';
import {custodyRoot} from '../scripts/safe-d1/windows-custody.mjs';
import {stageSixBackupApproved,issueStageSixBackupPermit} from '../scripts/safe-d1/backup-six-permit.mjs';

const parent=resolve(root,'.wrangler/bootstrap-directed-tests');mkdirSync(parent,{recursive:true});
const keys=await generateKeyPair('RS256'),jwk={...await exportJWK(keys.publicKey),kid:'synthetic-bootstrap-directed',alg:'RS256'};
async function fixture(options={}){
 const f=await localDatabase(),executionId=randomUUID(),directory=mkdtempSync(resolve(parent,'run-'));
 try{
  await f.db.batch([f.db.prepare(ledgerSql),...migrations.map(m=>f.db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').bind(m.name))]);
  const reader=createReader({metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async q=>(await f.db.prepare(q).all()).results}),preflight=await reader.inspect(6),snapshot=await reader.snapshot();
  const now=Math.floor(Date.now()/1000),token=await new SignJWT({iss:devAccess.issuer,aud:devAccess.audience,sub:expectedSubject,email:recipientEmail,iat:now,exp:now+(options.identityTtlSeconds??600)}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).sign(keys.privateKey);
  const identity=await verifyBootstrapRecipient(new Request('https://synthetic.invalid',{headers:{'Cf-Access-Jwt-Assertion':token}}),{fetcher:async()=>Response.json({keys:[jwk]})});
  const plan=prepareSingleOperatorBootstrap({preflight,snapshot,expectedFingerprint:snapshotFingerprint(snapshot.snapshot),identity,executionId,authorizationReference:'a'.repeat(64)});
  // Export a synthetic local D1 snapshot into SQL only in memory, then use the
  // existing isolated SQLite restorer to establish the simulation recovery proof.
  const raw=(await f.db.prepare(schemaQuery).all()).results.filter(r=>!['_cf_KV','_cf_METADATA'].includes(r.name));
  const statements=['PRAGMA defer_foreign_keys=TRUE',...raw.filter(r=>r.type==='table').map(r=>r.sql)];
  const literal=cell=>{const [type,hex]=cell.split(':');return type==='null'?'NULL':type==='text'?`CAST(X'${hex}' AS TEXT)`:type==='blob'?`X'${hex}'`:Buffer.from(hex,'hex').toString('utf8');};
  for(const table of snapshot.snapshot.tables){if(table.name==='sqlite_sequence')statements.push('DELETE FROM sqlite_sequence');for(const row of table.rows)statements.push(`INSERT INTO ${identifier(table.name)} (${table.columns.map(identifier).join(',')}) VALUES (${row.map(literal).join(',')})`);}
  statements.push(...raw.filter(r=>r.type!=='table').map(r=>r.sql));
  const sql=Buffer.from(statements.join(';\n')+';'),recovery=await verifySimulationRecovery(sql,plan.baselineFingerprint);sql.fill(0);
  const recoveryState=bootstrapRecoveryState(recovery,'local-simulation'),scope={...scopeForBootstrap(plan,recoveryState.evidenceSha256),environment:'local-simulation'};
  const journal=createBootstrapJournal({root:directory,environment:'local-simulation',executionId});
  let writes=0,books=0,disposed=false;
  const base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`;
  const transport=createTransport('synthetic_test_credential_not_real_12345',{simulationBootstrapScope:scope,bootstrapJournal:journal,simulationFetch:async(url,opts)=>{
   assert.ok(url===base||url===base+'/query'||url===base+'/time_travel/bookmark');const ok=result=>Response.json({success:true,result});
   if(url===base)return ok({uuid:options.wrongTarget?'incorrect':target.id,name:target.name,version:'production'});
   if(url.endsWith('/time_travel/bookmark')){books++;const n=options.bookmarkRace&&books>=5?2:writes?3:1;return ok({bookmark:`00000001-00000002-0000000${n}-00000000000000000000000000000000`});}
   const body=JSON.parse(opts.body);
   if(body.batch){
    writes++;const intent=resolve(directory,'bootstrap-'+executionId+'.intent.json');assert.equal(existsSync(intent),true);
    const durable=JSON.parse(readFileSync(intent));assert.equal(durable.scope.batchSha256,plan.batchSha256);
    if(options.atomicRace)await f.db.prepare("INSERT INTO categories(id,slug) VALUES ('concurrent','concurrent')").run();
    const result=await f.db.batch(body.batch.map(s=>f.db.prepare(s.sql).bind(...s.params)));
    if(options.ambiguous)throw Error('synthetic ambiguous response after commit');
    if(options.corruptCheckpoint)writeFileSync(resolve(directory,'bootstrap-'+executionId+'.postflight.private.json'),'occupied');
    if(options.badIdentity)result[plan.readbackStart].results[0].subject='wrong';
    return ok(result);
   }
   return ok([await f.db.prepare(body.sql).bind(...body.params).all()]);
  }});
  const wrapped=new Proxy(transport,{get(t,k){if(k==='dispose')return ()=>{disposed=true;t.dispose();};return t[k];}});
  // ACK ownership is tied to the real transport object; runner uses it directly.
  return {...f,plan,recovery,scope,journal,transport,directory,executionId,wrapped,get writes(){return writes;},get disposed(){return disposed;},run:()=>runBootstrap({transport,plan,recovery,journal,scope})};
 }catch(error){await f.mf.dispose();throw error;}
}
test('durable bootstrap: fixed target, single request, verified independent oracle and durable closure',async()=>{
 const f=await fixture();try{
  const r=await f.run();assert.equal(r.status,'PASS',JSON.stringify(r));assert.equal(r.durablyClosed,true);assert.equal(f.writes,1);
  const prefix=resolve(f.directory,'bootstrap-'+f.executionId);assert.equal(JSON.parse(readFileSync(prefix+'.closed.json')).executionId,f.executionId);
  assert.equal(JSON.parse(readFileSync(prefix+'.request-invocation.json')).meaning,'about-to-invoke-fetch; not confirmation of server receipt');
  await assert.rejects(f.transport.applyBatch(f.plan.statements));assert.equal(f.writes,1);
  assert.notEqual((await f.run()).status,'PASS');assert.equal(f.writes,1);
 }finally{await f.mf.dispose();}
});
test('durable bootstrap: target mismatch, bookmark race and SQL concurrent change stop without retries',async()=>{
 for(const options of [{wrongTarget:true},{bookmarkRace:true},{atomicRace:true}]){const f=await fixture(options);try{
  const r=await f.run();assert.notEqual(r.status,'PASS');assert.equal(r.durablyClosed,false);assert.equal(f.writes,options.atomicRace?1:0);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM administrator_roles').first()).n,0);
 }finally{await f.mf.dispose();}}
});
test('durable bootstrap: commit with ambiguous response, bad readback or checkpoint collision never claims PASS or retries',async()=>{
 for(const options of [{ambiguous:true},{badIdentity:true},{corruptCheckpoint:true}]){const f=await fixture(options);try{
  const r=await f.run();assert.equal(r.status,'UNCERTAIN_OR_POSTFLIGHT_FAILED');assert.equal(r.requiresReadOnlyReconciliation,true);assert.equal(f.writes,1);
  assert.equal(r.intentionRecorded,true);assert.equal(r.requestInvocationRecorded,true);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM administrator_roles').first()).n,1);
  assert.equal(existsSync(resolve(f.directory,'bootstrap-'+f.executionId+'.closed.json')),false);
  assert.notEqual((await f.run()).status,'PASS');assert.equal(f.writes,1);
 }finally{await f.mf.dispose();}}
});
test('capabilities: remote gate and recovery evidence; no exports, arbitrary SQL, forged recovery or changed scope',async()=>{
 assert.equal(bootstrapExecutionApproved,false);assert.throws(()=>issueBootstrapPermit({},'a'.repeat(64)),/not_authorized/);
 const recoveryPlan=JSON.parse(readFileSync(resolve(root,'next-stage/bootstrap-authorization.json')));
 if(recoveryPlan.stageSixBackupOperationId){
  const savedRecovery=bootstrapRecoveryState(await loadBootstrapRecovery(),'development');
  assert.equal(savedRecovery.fingerprint,recoveryPlan.baselineFingerprint);
 }else await assert.rejects(loadBootstrapRecovery(),/stage_six_backup_missing/);
 const child=spawnSync(process.execPath,[resolve(root,'scripts/d1-bootstrap-private.mjs')],{input:'not a credential',encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH}});
 assert.equal(child.status,2);assert.equal(JSON.parse(child.stdout).status,'BLOCKED');
 assert.equal(stageSixBackupApproved,false);assert.throws(()=>issueStageSixBackupPermit(),/not_authorized/);
 const backupChild=spawnSync(process.execPath,[resolve(root,'scripts/d1-backup-six-private.mjs')],{input:'not a credential',encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH}});
 assert.equal(backupChild.status,2);assert.equal(JSON.parse(backupChild.stdout).status,'BLOCKED');
 assert.throws(()=>createTransport('synthetic_test_credential_not_real_12345',{simulationBootstrapScope:{}}),/simulation_transport_required/);
 const f=await fixture();try{
  await assert.rejects(async()=>f.transport.fullExport('unused'));
  await assert.rejects(f.transport.applyBatch([{sql:'DELETE FROM principals',params:[]}]));
  await assert.rejects(f.transport.bootstrapSelect(f.plan,'SELECT * FROM principals',[]));
  assert.throws(()=>bootstrapRecoveryState(f.recovery,'development'));
  assert.throws(()=>consumeBootstrapAcknowledgement({}, {transport:f.transport,scope:f.scope}));
  assert.throws(()=>projectBootstrap(f.plan,{stage:6,executionId:'wrong',batchSha256:f.plan.batchSha256}));
  const r=await runBootstrap({transport:f.transport,plan:f.plan,recovery:{},journal:f.journal,scope:f.scope});assert.equal(r.status,'STOPPED_BEFORE_SEND');assert.equal(f.writes,0);
 }finally{await f.mf.dispose();}
});
test('bootstrap ACK binds transport, environment, execution, stage, batch and source hash, and is consumed once',async()=>{
 const f=await fixture();try{
  f.journal.begin(f.scope);f.journal.write('intent',{scope:f.scope});await f.transport.applyBatch(f.plan.statements);
  const receipt=f.transport.writeAcknowledgement();
  for(const changed of [{environment:'development'},{executionId:randomUUID()},{batchSha256:'f'.repeat(64)},{sourceSetSha256:'f'.repeat(64)}])assert.throws(()=>consumeBootstrapAcknowledgement(receipt,{transport:f.transport,scope:{...f.scope,...changed}}));
  assert.throws(()=>consumeBootstrapAcknowledgement(receipt,{transport:{},scope:f.scope}));
  const ack=consumeBootstrapAcknowledgement(receipt,{transport:f.transport,scope:f.scope});assert.equal(ack.stage,6);
  assert.throws(()=>consumeBootstrapAcknowledgement(receipt,{transport:f.transport,scope:f.scope}));
  const expected=projectBootstrap(f.plan,ack),snapshot=await createReader(f.transport).snapshot();assert.equal(snapshotFingerprint(expected.snapshot),snapshotFingerprint(snapshot.snapshot));
 }finally{f.transport.dispose();await f.mf.dispose();}
});
test('stage-six recovery profile validates real closure locally, does not call remote, rejects stage-four/fingerprint mismatch',async()=>{
 const proof=verifyStageSixClosure();assert.equal(proof.stage,6);assert.equal(proof.fullBackup,false);
 assert.throws(()=>validateStageSixSnapshot({stage:4,snapshot:{schema:[],tables:[]}}));
 const f=await fixture();try{assert.throws(()=>validateStageSixSnapshot(f.plan.baselineSnapshot),/fingerprint_mismatch/);}finally{await f.mf.dispose();}
 const plan=JSON.parse(readFileSync(resolve(root,'next-stage/development-plan.json'))),prefix=resolve(custodyRoot,'migration-0005-0006-'+plan.migrationEvidence.executionId);
 const ack5=JSON.parse(readFileSync(prefix+'.stage-5.ack.json')),ack6=JSON.parse(readFileSync(prefix+'.stage-6.ack.json'));
 const p5=await projectCompletion(ack5),p6=await projectCompletion(ack6,p5.generated);
 assert.equal(validateStageSixSnapshot(p6.expected).applicationTables,32);
 assert.equal(snapshotFingerprint(p6.expected.snapshot),plan.migrationEvidence.fingerprint);
});

test('JWT expires or identity ages during request journal persistence: zero mutating fetches',async t=>{
 for(const cause of ['expiration','verification-age']){
  const f=await fixture({identityTtlSeconds:cause==='expiration'?60:600});let clock;
  try{
   const marker=resolve(f.directory,'bootstrap-'+f.executionId+'.request-invocation.json');
   const realNow=Date.now.bind(Date),deadline=cause==='expiration'?f.plan.identity.expiresAt:f.plan.identity.verifiedAt+300000;
   // Time advances only AFTER the durable about-to-invoke marker exists. The
   // runner's earlier freshness check has passed, reproducing the reviewed gap.
   clock=t.mock.method(Date,'now',()=>existsSync(marker)?deadline:realNow());
   const r=await f.run();
   // Restore before querying Miniflare: its own internal request credentials must
   // not inherit the synthetic future clock used only for the final send guard.
   clock.mock.restore();clock=undefined;
   assert.equal(r.status,'STOPPED_BEFORE_SEND');assert.equal(r.errorCode,'bootstrap_identity_stale');
   assert.equal(r.intentionRecorded,true);assert.equal(r.requestInvocationRecorded,true);
   assert.equal(r.requestActuallyInvoked,false);assert.equal(r.requiresReadOnlyReconciliation,false);
   assert.equal(f.writes,0);assert.equal(f.transport.diagnostics().filter(d=>d.operation==='bootstrap_batch').length,0);
   assert.equal(existsSync(marker),true);assert.equal(existsSync(resolve(f.directory,'bootstrap-'+f.executionId+'.intent.json')),true);
   assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM administrator_roles').first()).n,0);
   assert.notEqual((await f.run()).status,'PASS');assert.equal(f.writes,0);
  }finally{clock?.mock.restore();f.transport.dispose();await f.mf.dispose();}
 }
});
