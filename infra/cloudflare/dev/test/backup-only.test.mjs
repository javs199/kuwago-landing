import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync,mkdtempSync,readdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root,target} from '../scripts/safe-d1/policy.mjs';
import {createEncryptedStore} from '../scripts/safe-d1/encrypted-store.mjs';
import {runBackupOnly} from '../scripts/safe-d1/backup-only.mjs';
import {encryptEnvelope,decryptEnvelope} from '../scripts/safe-d1/encryption.mjs';
import {dpapi,verifyWindowsCustody,custodyRoot} from '../scripts/safe-d1/windows-custody.mjs';
import {createBackupTransport} from '../scripts/safe-d1/backup-transport.mjs';
import {syntheticFetch} from '../scripts/d1-backup-only.mjs';
import {verifyRestorable} from '../scripts/safe-d1/restore.mjs';
import {normalizeSnapshot,snapshotFingerprint} from '../scripts/safe-d1/snapshot.mjs';
const parent=resolve(root,'.wrangler/backup-only-tests');mkdirSync(parent,{recursive:true});
const directory=()=>mkdtempSync(resolve(parent,'run-'));
const transport=()=>createBackupTransport('synthetic_test_credential_not_real_12345',{simulationFetch:syntheticFetch});
function listFiles(path){return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?listFiles(resolve(path,e.name)):[resolve(path,e.name)]);}
async function run(options={}){
 const dir=options.dir??directory(),store=options.store??createEncryptedStore(dir,async()=>{}),client=options.transport??transport(),recoverySecret=randomBytes(32),environment={CLOUDFLARE_API_TOKEN:'synthetic_test_credential_not_real_12345'};
 const result=await runBackupOnly({transport:client,store,protector:options.protector??dpapi,recoverySecret,environment});
 assert.equal(environment.CLOUDFLARE_API_TOKEN,undefined);assert.ok(recoverySecret.every(n=>n===0));return {dir,store,result};
}
test('backup-only: actual Windows custody has exactly the operator and SYSTEM and resides outside Git',()=>{
 const state=verifyWindowsCustody();assert.equal(state.ok,true);assert.equal(state.aclProtected,true);assert.equal(state.ntfs,true);assert.equal(state.allowedSids.length,2);assert.ok(state.allowedSids.includes('S-1-5-18'));assert.ok(!custodyRoot.startsWith(root));
});
test('backup-only: nonempty synthetic SQL decrypts and restores in isolated SQLite without applying migration files',async()=>{
 const create='CREATE TABLE synthetic_notes(id INTEGER PRIMARY KEY,note TEXT)',text='Solo prueba sintética, sin datos privados',hex=Buffer.from(text).toString('hex').toUpperCase();
 const sql=Buffer.from(`PRAGMA defer_foreign_keys=TRUE;${create};INSERT INTO synthetic_notes VALUES(1,CAST(X'${hex}' AS TEXT));`);
 const expected=normalizeSnapshot([{type:'table',name:'synthetic_notes',sql:create}],[{name:'synthetic_notes',columns:['id','note'],rows:[['integer:31','text:'+hex]]}]);
 const secret=randomBytes(32);let recovered;
 try{const encrypted=await encryptEnvelope(sql,{operationId:randomUUID()},secret,dpapi);recovered=await decryptEnvelope(encrypted,{recoverySecret:secret});const result=await verifyRestorable(recovered,snapshotFingerprint(expected));assert.equal(result.rows,1);assert.equal(result.tables,1);}finally{secret.fill(0);sql.fill(0);recovered?.fill(0);}
});
test('backup-only: real AES-GCM + DPAPI and independent recovery decrypt; wrong key/ciphertext fail',async()=>{
 const payload=Buffer.from('synthetic SQL recovery demonstration; no private data'),secret=randomBytes(32),wrong=randomBytes(32);let clear,recovery;
 try{const encrypted=await encryptEnvelope(payload,{operationId:randomUUID()},secret,dpapi);assert.ok(!encrypted.toString('utf8').includes(payload.toString('utf8')));clear=await decryptEnvelope(encrypted,{protector:dpapi});recovery=await decryptEnvelope(encrypted,{recoverySecret:secret});assert.deepEqual(clear,payload);assert.deepEqual(recovery,payload);await assert.rejects(decryptEnvelope(encrypted,{recoverySecret:wrong}));
  const corrupt=JSON.parse(encrypted);corrupt.payload.tag=Buffer.alloc(16).toString('base64');await assert.rejects(decryptEnvelope(Buffer.from(JSON.stringify(corrupt)),{protector:dpapi}));
 }finally{secret.fill(0);wrong.fill(0);payload.fill(0);clear?.fill(0);recovery?.fill(0);}
});
test('backup-only: successful pipeline verifies encrypted disk bytes and isolated restore, with no plaintext SQL or URL on disk',async()=>{
 const {dir,result}=await run();assert.equal(result.status,'verified',JSON.stringify(result));assert.equal(result.verified,true);assert.equal(result.cleanupComplete,true);assert.ok(existsSync(result.artifact));assert.equal(existsSync(resolve(dir,'backup-only.lock')),false);
 for(const file of listFiles(dir)){assert.ok(!file.endsWith('.sql'));const contents=readFileSync(file,'utf8');assert.ok(!contents.includes('PRAGMA defer_foreign_keys=TRUE'));assert.ok(!contents.includes('X-Amz-Signature'));assert.ok(!contents.includes('synthetic_test_credential_not_real_12345'));}
 const evidence=JSON.parse(readFileSync(resolve(dirname(result.artifact),'evidence.json'),'utf8'));assert.equal(evidence.restoreVerified,true);
});
test('backup-only: nonexistent folder and unsafe ACL fail before any source request',async()=>{
 for(const mode of ['missing','unsafe']){const dir=resolve(directory(),mode);if(mode==='unsafe')mkdirSync(dir);let reads=0;const client={metadata:async()=>{reads++;throw Error('must not run');},dispose(){}};const store=createEncryptedStore(dir,async()=>{if(mode==='unsafe')throw Error('simulated unsafe ACL');});const {result}=await run({dir,store,transport:client});assert.equal(result.verified,false);assert.equal(reads,0);}
});
test('backup-only: failed encryption and export interruption do not leave SQL, partial ciphertext or retry locks',async()=>{
 const badProtector={protect:async()=>{throw Error('synthetic secret must not be logged');},unprotect:dpapi.unprotect};const encrypted=await run({protector:badProtector});assert.equal(encrypted.result.verified,false);assert.deepEqual(listFiles(encrypted.dir),[]);
 const client={metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async sql=>sql==='PRAGMA quick_check'?[{quick_check:'ok'}]:[],bookmark:async()=>'00000001-00000002-00000003-00000000000000000000000000000000',fullExport:async()=>{throw Error('synthetic signed URL');},dispose(){}};
 const interrupted=await run({transport:client});assert.equal(interrupted.result.verified,false);assert.deepEqual(listFiles(interrupted.dir),[]);
});
test('backup-only: corrupted ciphertext or SQL restoration failure cannot promote a backup',async()=>{
 const dir=directory(),store=createEncryptedStore(dir,async()=>{});const corrupted={...store,read:handle=>{const bytes=store.read(handle);bytes[0]=0;return bytes;}};const first=await run({dir,store:corrupted});assert.equal(first.result.verified,false);assert.deepEqual(listFiles(dir),[]);
 const client=transport(),badSql={...client,fullExport:async bookmark=>({bookmark,bytes:Buffer.from('INVALID SYNTHETIC SQL;')})};const second=await run({transport:badSql});assert.equal(second.result.verified,false);assert.equal(second.result.step,'restoration');assert.deepEqual(listFiles(second.dir),[]);
});
test('backup-only: wrong D1 target and partial download are rejected without promotion or automatic retries',async()=>{
 for(const mode of ['target','partial']){let downloads=0;const client=createBackupTransport('synthetic_test_credential_not_real_12345',{simulationFetch:async(url,options)=>{if(mode==='target'&&url.endsWith('/'+target.id))return Response.json({success:true,result:{uuid:'wrong-db',name:target.name,version:'production'}});if(url.startsWith('https://synthetic-local.')){downloads++;return new Response('short',{headers:{'Content-Length':'100'}});}return syntheticFetch(url,options);}});const {dir,result}=await run({transport:client});assert.equal(result.verified,false);assert.equal(downloads,mode==='target'?0:1);assert.deepEqual(listFiles(dir),[]);}
});
test('backup-only: cleanup failure preserves encrypted pending bytes, safe evidence and a retry-blocking lock',async()=>{
 const dir=directory(),store=createEncryptedStore(dir,async()=>{});const fault={...store,read:()=>{throw Error('simulated corruption');},cleanup:()=>{throw Error('simulated cleanup failure');}};const {result}=await run({dir,store:fault});assert.equal(result.status,'failed_cleanup_pending');assert.equal(result.cleanupComplete,false);assert.ok(existsSync(resolve(dir,'backup-only.lock')));const files=listFiles(dir);assert.ok(files.some(p=>p.endsWith('.kwgbak.part')));assert.ok(files.some(p=>p.includes('failure-')));assert.ok(files.every(p=>!p.endsWith('.sql')));
 const retry=await run({dir,store});assert.equal(retry.result.verified,false);assert.equal(existsSync(resolve(dir,'backup-only.lock')),true);
});
test('backup-only: failure after promotion never deletes an already verified encrypted backup',async()=>{
 const dir=directory(),store=createEncryptedStore(dir,async()=>{});const fault={...store,cleanup:()=>{throw Error('simulated post-commit cleanup failure');}};const {result}=await run({dir,store:fault});assert.equal(result.status,'verified_cleanup_pending');assert.equal(result.verified,true);assert.ok(existsSync(result.artifact));const prior=readFileSync(result.artifact);await run({dir,store});assert.deepEqual(readFileSync(result.artifact),prior);
});
test('backup-only: encrypted store has no recursive deletion, rejects duplicate runs and never accepts SQL paths',async()=>{
 const dir=directory(),store=createEncryptedStore(dir,async()=>{}),id=randomUUID(),handle=await store.begin(id);await assert.rejects(store.begin(randomUUID()));assert.throws(()=>store.read({id:'../escape'}));store.cleanup(handle);await assert.rejects(store.begin('../escape'));
});
test('backup-only: import graph and public transport contain no migration/SQL writer and CLI is remotely locked',()=>{
 const visited=new Set();function visit(file){if(visited.has(file))return;visited.add(file);assert.ok(!/[/\\](write|runner|backup)\.mjs$/.test(file),file);const text=readFileSync(file,'utf8');for(const match of text.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g))visit(resolve(dirname(file),match[1]));}
 visit(fileURLToPath(new URL('../scripts/d1-backup-only.mjs',import.meta.url)));
 const client=transport();assert.equal(client.applyBatch,undefined);assert.equal(client.publish,undefined);client.dispose();
 const processResult=spawnSync(process.execPath,[resolve(root,'scripts/d1-backup-only.mjs')],{encoding:'utf8'});assert.equal(processResult.status,2);assert.deepEqual(JSON.parse(processResult.stdout),{status:'blocked',remoteBackupEnabled:false});
});
