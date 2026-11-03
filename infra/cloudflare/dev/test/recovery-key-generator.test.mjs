import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {decodeRecoverySecret} from '../scripts/safe-d1/recovery-format.mjs';
const validator=fileURLToPath(new URL('../scripts/d1-recovery-key-validate.mjs',import.meta.url));

test('private generator: deterministic bytes use the exact portable verifier format',()=>{
 const bytes=Buffer.from(Array.from({length:32},(_,i)=>i)),text=bytes.toString('base64');let decoded;
 try{decoded=decodeRecoverySecret(text);assert.equal(text.length,44);assert.equal(text.at(-1),'=');assert.deepEqual(decoded,bytes);
  for(const invalid of ['',text+'\n',' '+text,text.replace('=', ''),'A'.repeat(42)+'B=','phrase is not a recovery key',Buffer.alloc(31).toString('base64'),Buffer.alloc(33).toString('base64')])assert.throws(()=>decodeRecoverySecret(invalid));
 }finally{bytes.fill(0);decoded?.fill(0);}
});
test('private generator: validator accepts synthetic pipe input without echo and rejects extra fields',()=>{
 const text=Buffer.alloc(32,0xa5).toString('base64');
 for(const [input,accepted] of [[{recoverySecretBase64:text},true],[{recoverySecretBase64:text,extra:true},false],[{recoverySecretBase64:'A'.repeat(42)+'B='},false]]){
  const child=spawnSync(process.execPath,[validator],{input:JSON.stringify(input),encoding:'utf8',timeout:10000});assert.equal(child.status,accepted?0:2);assert.equal(JSON.parse(child.stdout).accepted,accepted);assert.ok(!child.stdout.includes(text));assert.ok(!child.stderr.includes(text));
 }
});
test('private generator: PowerShell synthetic conversion, verifier bridge, cleanup and parser tests without UI or RNG',()=>{
 const file=fileURLToPath(new URL('./recovery-key-private.test.ps1',import.meta.url));
 const child=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',file],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stdout+child.stderr);const result=JSON.parse(child.stdout);assert.equal(result.status,'synthetic_private_tests_passed');assert.equal(result.checks,13);assert.equal(result.windowOpened,false);assert.equal(result.productionGeneratorCalled,false);
});
test('private generator: UI has only explicit OS RNG, guarded copy and transient reveal; no file/network/log calls',()=>{
 const ui=readFileSync(new URL('../scripts/recovery-key-generator.ps1',import.meta.url),'utf8');
 assert.ok(ui.indexOf('$generate.Add_Click({')<ui.indexOf('$rng.GetBytes($bytes)'));
 assert.equal((ui.match(/GetBytes\(/g)??[]).length,1);
 for(const snippet of ['RandomNumberGenerator]::Create()','[byte[]]::new(32)','Test-KuwagoRecoveryWithVerifier','UseSystemPasswordChar = $true','Interval = 15000','Interval = 45000','CanIncludeInClipboardHistory','CanUploadToCloudClipboard','SetDataObject($data, $false, 0, 0)','if (-not $consent.Checked','[Array]::Clear($bytes','Clear-OwnedRecoveryClipboard','$state.Key = $null'])assert.ok(ui.includes(snippet),snippet);
 assert.ok(!/Invoke-WebRequest|Invoke-RestMethod|Start-Transcript|Set-Content|Out-File|WriteAll|Get-Random|System\.Random\]|Start-Process|fetch\(/i.test(ui.replace(/^\s*#.*$/gm,'')));
 const verifier=readFileSync(new URL('../scripts/d1-backup-portable-verify.mjs',import.meta.url),'utf8');assert.ok(verifier.includes('decodeRecoverySecret(input.recoverySecretBase64)'));
});
