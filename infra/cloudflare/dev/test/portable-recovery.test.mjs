import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encryptEnvelope} from '../scripts/safe-d1/encryption.mjs';
import {verifyPortableRecovery} from '../scripts/safe-d1/portable-recovery.mjs';
import {target,digest,root} from '../scripts/safe-d1/policy.mjs';
import {normalizeSnapshot,snapshotFingerprint} from '../scripts/safe-d1/snapshot.mjs';
const cli=fileURLToPath(new URL('../scripts/d1-backup-portable-verify.mjs',import.meta.url));
async function fixture(){
 const recoverySecret=randomBytes(32),sql=Buffer.from('CREATE TABLE synthetic_recovery(id INTEGER PRIMARY KEY);INSERT INTO synthetic_recovery VALUES(1);');
 const snapshot=normalizeSnapshot([{type:'table',name:'synthetic_recovery',sql:'CREATE TABLE synthetic_recovery(id INTEGER PRIMARY KEY)'}],[{name:'synthetic_recovery',columns:['id'],rows:[['integer:31']]}]);
 const payload=Buffer.from(JSON.stringify({target,operationId:randomUUID(),sqlBase64:sql.toString('base64'),sqlSha256:digest(sql),sourceFingerprint:snapshotFingerprint(snapshot)}));
 try{
  const metadata={operationId:JSON.parse(payload).operationId,mode:'local-synthetic-portable-proof'};
  // Deliberately unusable DPAPI wrapper: independent recovery must not touch it.
  const encrypted=await encryptEnvelope(payload,metadata,recoverySecret,{protect:async()=>Buffer.from('not-a-DPAPI-key')});
  const value=JSON.parse(encrypted);delete value.dpapiKey;
  return {encrypted:Buffer.from(JSON.stringify(value)),recoverySecret};
 }finally{sql.fill(0);payload.fill(0);}
}
test('portable recovery restores a nonempty synthetic backup with DPAPI wrapper absent',async()=>{
 const f=await fixture();try{const result=await verifyPortableRecovery(f.encrypted,f.recoverySecret);assert.equal(result.restoreVerified,true);assert.equal(result.rows,1);assert.equal(result.tables,1);assert.equal(result.dpapiUsed,false);assert.equal(result.externalCustodyVerified,false);}finally{f.recoverySecret.fill(0);}
});
test('portable recovery rejects wrong key, tampering and wrong target',async()=>{
 const f=await fixture(),wrong=randomBytes(32);try{await assert.rejects(verifyPortableRecovery(f.encrypted,wrong));for(const mode of ['cipher','target']){const v=JSON.parse(f.encrypted);if(mode==='cipher')v.payload.tag=Buffer.alloc(16).toString('base64');else v.header.target.id='another-database';await assert.rejects(verifyPortableRecovery(Buffer.from(JSON.stringify(v)),f.recoverySecret));}}finally{f.recoverySecret.fill(0);wrong.fill(0);}
});
test('portable CLI restores in a separate process via private pipe without profile DPAPI or secret output',async()=>{
 const f=await fixture();let input;
 try{const parent=resolve(root,'.wrangler/portable-recovery-tests');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(resolve(parent,'proof-')),file=resolve(dir,'synthetic.kwgbak');writeFileSync(file,f.encrypted,{flag:'wx'});
  input=Buffer.from(JSON.stringify({recoverySecretBase64:f.recoverySecret.toString('base64')}));
  const child=spawnSync(process.execPath,[cli,file],{input,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot??'',PATH:process.env.PATH??''},timeout:20000});
  assert.equal(child.status,0,child.stdout);const result=JSON.parse(child.stdout);assert.equal(result.restoreVerified,true);assert.equal(result.rows,1);assert.equal(result.dpapiUsed,false);assert.equal(result.externalCustodyVerified,false);assert.ok(!child.stdout.includes(f.recoverySecret.toString('base64')));assert.ok(!child.stdout.includes('CREATE TABLE'));assert.ok(!child.stderr.includes(f.recoverySecret.toString('base64')));
  const missing=spawnSync(process.execPath,[cli,file],{input:'{}',encoding:'utf8',timeout:20000});assert.equal(missing.status,2);assert.deepEqual(JSON.parse(missing.stdout),{status:'portable_recovery_failed',externalCustodyVerified:false});
 }finally{f.recoverySecret.fill(0);input?.fill(0);}
});
test('portable import graph contains no Windows protector, network, migration writer or backup transport',()=>{
 const visited=new Set();function visit(file){if(visited.has(file))return;visited.add(file);assert.ok(!/windows-custody|backup-transport|[/\\](write|runner|backup)\.mjs$/.test(file));const text=readFileSync(file,'utf8');assert.ok(!/\bfetch\s*\(|node:https|node:http|node:child_process/.test(text));for(const match of text.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g))visit(resolve(dirname(file),match[1]));}
 visit(cli);
});
