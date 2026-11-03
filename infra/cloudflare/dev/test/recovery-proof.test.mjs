import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecoveryProof,verifyRecoveryProof} from '../scripts/safe-d1/recovery-fixture.mjs';
import {verifyPortableRecovery} from '../scripts/safe-d1/portable-recovery.mjs';
import {custodyRoot} from '../scripts/safe-d1/windows-custody.mjs';
const cli=fileURLToPath(new URL('../scripts/d1-recovery-proof-stage.mjs',import.meta.url));
test('recovery ceremony: exact synthetic rows restore without DPAPI; wrong key and expected content fail',async()=>{
 const key=Buffer.alloc(32,0xa5),wrong=Buffer.alloc(32,0x5a),id=randomUUID();
 try{const encrypted=await createRecoveryProof(id,key);assert.equal(Object.hasOwn(JSON.parse(encrypted),'dpapiKey'),false);const result=await verifyRecoveryProof(encrypted,id,key);assert.equal(result.rows,2);assert.equal(result.tables,1);assert.equal(result.dpapiUsed,false);await assert.rejects(verifyRecoveryProof(encrypted,id,wrong));await assert.rejects(verifyPortableRecovery(encrypted,key,{expectedFingerprint:'0'.repeat(64)}));await assert.rejects(verifyRecoveryProof(encrypted,randomUUID(),key));}finally{key.fill(0);wrong.fill(0);}
});
test('recovery ceremony: separate synthetic CLI processes preserve ciphertext, issue sanitized PASS and reject duplicate encryption',()=>{
 const key=Buffer.alloc(32,0x3c),id=randomUUID();let input;
 try{input=Buffer.from(JSON.stringify({recoverySecretBase64:key.toString('base64')}));const stages=[];
  for(const stage of ['Encrypt','Restore']){const child=spawnSync(process.execPath,[cli,stage,id],{input,encoding:'utf8',timeout:20000});assert.equal(child.status,0,child.stdout);stages.push(JSON.parse(child.stdout));assert.ok(!child.stdout.includes(key.toString('base64')));}
  assert.equal(stages[0].status,'ENCRYPTED');assert.equal(stages[1].status,'PASS');const folder=resolve(custodyRoot,'recovery-proof-'+id),before=readFileSync(resolve(folder,'synthetic.kwgbak'));const restored=JSON.parse(readFileSync(resolve(folder,'restore.json')));assert.equal(restored.exactFixtureMatch,true);assert.equal(restored.dpapiUsed,false);assert.notEqual(restored.pid,restored.encryptionPid);
  const duplicate=spawnSync(process.execPath,[cli,'Encrypt',id],{input,encoding:'utf8',timeout:10000});assert.equal(duplicate.status,2);assert.deepEqual(readFileSync(resolve(folder,'synthetic.kwgbak')),before);
 }finally{key.fill(0);input?.fill(0);}
});
test('recovery ceremony: wrong synthetic second-session key yields FAIL, never PASS',()=>{
 const key=Buffer.alloc(32,0x11),wrong=Buffer.alloc(32,0x22),id=randomUUID();let first,second;
 try{first=Buffer.from(JSON.stringify({recoverySecretBase64:key.toString('base64')}));second=Buffer.from(JSON.stringify({recoverySecretBase64:wrong.toString('base64')}));const encrypted=spawnSync(process.execPath,[cli,'Encrypt',id],{input:first,encoding:'utf8',timeout:20000});assert.equal(encrypted.status,0);const restored=spawnSync(process.execPath,[cli,'Restore',id],{input:second,encoding:'utf8',timeout:20000});assert.equal(restored.status,2);assert.equal(JSON.parse(restored.stdout).status,'FAIL');const evidence=JSON.parse(readFileSync(resolve(custodyRoot,'recovery-proof-'+id,'restore-failure.json')));assert.equal(evidence.status,'FAIL');}finally{key.fill(0);wrong.fill(0);first?.fill(0);second?.fill(0);}
});
test('recovery ceremony: scripts parse; UI input is masked and launcher waits for independent processes',()=>{
 for(const name of ['recovery-proof-private.ps1','recovery-proof-launch.ps1']){const file=fileURLToPath(new URL('../scripts/'+name,import.meta.url));const command="$t=$null;$e=$null;$null=[Management.Automation.Language.Parser]::ParseFile('"+file.replaceAll("'","''")+"',[ref]$t,[ref]$e);if($e.Count){exit 2}";const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);}
 const ui=readFileSync(new URL('../scripts/recovery-proof-private.ps1',import.meta.url),'utf8');assert.ok(ui.includes('UseSystemPasswordChar = $true'));assert.ok(!ui.includes('RandomNumberGenerator'));assert.ok(ui.includes('$privateText = $null'));
 const launch=readFileSync(new URL('../scripts/recovery-proof-launch.ps1',import.meta.url),'utf8');assert.ok(launch.includes("@('Encrypt', 'Restore')"));assert.ok(launch.includes('$child.WaitForExit()'));assert.ok(!/recoverySecretBase64|privateText/.test(launch));
});
