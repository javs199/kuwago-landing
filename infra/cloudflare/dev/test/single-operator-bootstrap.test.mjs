import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {localDatabase} from './auth-fixtures.mjs';
import {administratorFor} from '../.wrangler/build/security.js';
import {approvedSources,ledgerSql,migrations,target} from '../scripts/safe-d1/policy.mjs';
import {createReader} from '../scripts/safe-d1/read.mjs';
import {snapshotFingerprint} from '../scripts/safe-d1/snapshot.mjs';
import {devAccess,expectedSubject,recipientEmail,technicalIssuer,verifyBootstrapRecipient,prepareSingleOperatorBootstrap,rehearseBootstrap,remoteBootstrapEnabled} from '../scripts/single-operator-bootstrap.mjs';

const executionId='b982bb50-5a12-4999-98a6-943fef341c50'; // Synthetic; no remote permit.
const authorizationReference='a'.repeat(64);
const keys=await generateKeyPair('RS256');
const jwk={...await exportJWK(keys.publicKey),kid:'local-bootstrap-test',alg:'RS256'};
const fetcher=async(url,options)=>{assert.equal(String(url),devAccess.issuer+'/cdn-cgi/access/certs');assert.equal(options.redirect,'manual');return Response.json({keys:[jwk]});};
async function identity(overrides={}){
 const now=Math.floor(Date.now()/1000);
 const token=await new SignJWT({iss:devAccess.issuer,aud:devAccess.audience,sub:expectedSubject,email:recipientEmail,iat:now,exp:now+120,...overrides}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).sign(keys.privateKey);
 return verifyBootstrapRecipient(new Request('https://local.invalid',{headers:{'Cf-Access-Jwt-Assertion':token}}),{fetcher});
}
async function fixture(){
 const local=await localDatabase();
 await local.db.batch([local.db.prepare(ledgerSql),...migrations.map(m=>local.db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').bind(m.name))]);
 const reader=createReader({metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async sql=>(await local.db.prepare(sql).all()).results});
 const preflight=await reader.inspect(6),snapshot=await reader.snapshot();
 const args={preflight,snapshot,expectedFingerprint:snapshotFingerprint(snapshot.snapshot),identity:await identity(),executionId,authorizationReference};
 return {...local,args};
}
test('identity requires real RS256/issuer/audience/subject/email and fresh token; no raw token retained',async()=>{
 const verified=await identity();assert.equal(verified.subject,expectedSubject);assert.equal('token' in verified,false);
 for(const overrides of [{sub:'other-user'},{email:'other@example.invalid'},{aud:'other-app'},{iss:'https://other.cloudflareaccess.com'},{exp:1}])await assert.rejects(identity(overrides));
 await assert.rejects(verifyBootstrapRecipient(new Request('https://local.invalid',{headers:{'Cf-Access-Authenticated-User-Email':recipientEmail}}),{fetcher}));
 assert.equal(remoteBootstrapEnabled,false);
});
test('single operator local D1: technical actor disabled, real recipient only super_admin, faithful audit and no self-grant',async()=>{
 const f=await fixture();try{
  const plan=prepareSingleOperatorBootstrap(f.args);assert.equal(plan.remoteEnabled,false);
  assert.equal((await rehearseBootstrap(plan,f.db)).status,'local_rehearsal_pass');
  const admin=await administratorFor(f.db,f.args.identity);assert.equal(admin.role,'super_admin');assert.ok(admin.permissions.includes('admins:manage'));
  await assert.rejects(administratorFor(f.db,{issuer:technicalIssuer,subject:executionId}),e=>e.status===403);
  assert.equal((await f.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  await assert.rejects(rehearseBootstrap(plan,f.db),/consumed/);
  await assert.rejects(f.db.prepare('UPDATE audit_events SET action=?').bind('changed').run(),/audit_append_only/);
 }finally{await f.mf.dispose();}
});
test('concurrent data changes and another bootstrap invalidate full-state SQL guard with atomic rollback',async()=>{
 for(const fault of ['data','bootstrap']){
  const f=await fixture();try{
   const first=prepareSingleOperatorBootstrap(f.args),second=prepareSingleOperatorBootstrap({...f.args,executionId:'b982bb50-5a12-4999-98a6-943fef341c51'});
   if(fault==='data')await f.db.prepare("INSERT INTO categories(id,slug) VALUES ('concurrent','concurrent')").run();
   else await rehearseBootstrap(first,f.db);
   await assert.rejects(rehearseBootstrap(fault==='data'?first:second,f.db));
   assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM principals').first()).n,fault==='data'?0:2);
  }finally{await f.mf.dispose();}
 }
});
test('missing/fabricated receipts, changed fingerprint and incomplete snapshots are rejected before a batch',async()=>{
 const f=await fixture();try{
  for(const override of [{preflight:{...f.args.preflight}},{identity:{...f.args.identity}},{expectedFingerprint:'0'.repeat(64)},{authorizationReference:''}])assert.throws(()=>prepareSingleOperatorBootstrap({...f.args,...override}));
  const snapshot=structuredClone(f.args.snapshot);snapshot.snapshot.tables=snapshot.snapshot.tables.filter(t=>t.name!=='media_assets');
  assert.throws(()=>prepareSingleOperatorBootstrap({...f.args,snapshot,expectedFingerprint:snapshotFingerprint(snapshot.snapshot)}),/incomplete/);
 }finally{await f.mf.dispose();}
});
test('ambiguous response and late SQL failure consume plan without retry or partial grant',async()=>{
 for(const mode of ['ambiguous','rollback']){
  const f=await fixture();try{
   const plan=prepareSingleOperatorBootstrap(f.args);let calls=0;
   const db={prepare:sql=>f.db.prepare(sql),batch:async stmts=>{calls++;if(mode==='rollback')stmts.push(f.db.prepare('INSERT INTO no_such_table VALUES (1)'));await f.db.batch(stmts);if(mode==='ambiguous')throw Error('ambiguous');}};
   await assert.rejects(rehearseBootstrap(plan,db));
   await assert.rejects(rehearseBootstrap(plan,db),/consumed/);assert.equal(calls,1);
   assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM administrator_roles').first()).n,mode==='ambiguous'?1:0);
  }finally{await f.mf.dispose();}
 }
});
test('six original migrations remain SQLite-compatible and SQL CHECK still rejects a self-grant',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('PRAGMA foreign_keys=ON');for(const sql of approvedSources())db.exec(sql);
  db.prepare('INSERT INTO principals(id,issuer,subject,enabled) VALUES (?,?,?,1)').run('synthetic','urn:test','synthetic');
  assert.throws(()=>db.exec("INSERT INTO administrator_roles(principal_id,role_id,granted_by) VALUES ('synthetic','super_admin','synthetic')"),/CHECK/);
 }finally{db.close();}
});
