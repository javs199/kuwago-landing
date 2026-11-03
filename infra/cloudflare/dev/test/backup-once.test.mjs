import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createBackupTransport,backupRemoteEnabled} from '../scripts/safe-d1/backup-transport.mjs';
import {takeBackupOncePermit,issueBackupOncePermit,backupAuthorizationId,backupExecutionApproved,backupIntendedPermission,backupAttemptFile,backupResultFile} from '../scripts/safe-d1/backup-once-permit.mjs';
import {target} from '../scripts/safe-d1/policy.mjs';
const marker='synthetic_test_credential_not_real_12345';
const bookmark='00000001-00000002-00000003-00000000000000000000000000000000';
test('backup once: default remains disabled and a forged permit cannot authorize remote access',()=>{
 assert.equal(backupRemoteEnabled,false);assert.equal(takeBackupOncePermit({}),false);assert.throws(()=>createBackupTransport(marker));assert.throws(()=>createBackupTransport(marker,{oneShotPermit:{}}));
});

test('backup Edit plan: tests never consume a live approval; inactive gate blocks before credentials or network',()=>{
 assert.equal(backupIntendedPermission,'D1 Read + D1 Write');assert.ok(!['610ee96e-140a-42ab-89ab-4db6072726bd','490de7b9-dc5b-443c-9a29-9cd876f37b68'].includes(backupAuthorizationId));
 const before=[existsSync(backupAttemptFile),existsSync(backupResultFile)];
 // A real approval is exercised only by the user's private form, never tests.
 if(!backupExecutionApproved){
  assert.throws(()=>issueBackupOncePermit(),/remote_backup_not_authorized/);
  const file=fileURLToPath(new URL('../scripts/d1-backup-once.mjs',import.meta.url));const child=spawnSync(process.execPath,[file],{input:'not JSON; must not be parsed while blocked',encoding:'utf8',timeout:10000,env:{...process.env,BACKUP_EXECUTION_APPROVED:'true'}});
  assert.equal(child.status,2);assert.deepEqual(JSON.parse(child.stdout),{status:'BLOCKED',authorizationId:backupAuthorizationId});
 }
 assert.deepEqual([existsSync(backupAttemptFile),existsSync(backupResultFile)],before);
 const status=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/d1-backup-once-status.mjs',import.meta.url))],{encoding:'utf8',timeout:10000});assert.equal(status.status,0);const plan=JSON.parse(status.stdout);assert.equal(plan.executionApproved,backupExecutionApproved);assert.equal(plan.authorizationId,backupAuthorizationId);assert.equal(plan.intendedPermission,backupIntendedPermission);assert.deepEqual(plan.target,target);
});

test('backup Edit preparation: even a more privileged token cannot send SQL writes through the transport',async()=>{
 let calls=0;const client=createBackupTransport(marker,{simulationFetch:async()=>{calls++;throw Error('must not request');}});
 try{for(const sql of ['CREATE TABLE x(id INTEGER)','INSERT INTO x VALUES(1)','UPDATE x SET id=2','DELETE FROM x','DROP TABLE x','ALTER TABLE x ADD y TEXT','PRAGMA writable_schema=ON','SELECT COUNT(*) AS n FROM principals; DROP TABLE services'])await assert.rejects(client.select(sql));assert.equal(calls,0);assert.equal(client.applyBatch,undefined);assert.equal(client.restore,undefined);assert.equal(client.publish,undefined);}finally{client.dispose();}
});

test('backup Edit preparation: form gets the same plan, labels power accurately and disables inputs while unapproved',()=>{
 const ui=readFileSync(new URL('../scripts/backup-once-private.ps1',import.meta.url),'utf8');
 for(const item of ['d1-backup-once-status.mjs','$authorizationId = $plan.authorizationId','$executionApproved = ($plan.executionApproved -eq $true)','$tokenBox.Enabled = $executionApproved','$keyBox.Enabled = $executionApproved','$run.Enabled = $executionApproved','if (-not $executionApproved) { return }','Token temporal D1 Read + D1 Write','El token puede escribir fuera de esta herramienta','PROHIBE SQL remoto de escritura'])assert.ok(ui.includes(item),item);
 assert.ok(!ui.includes('Sin permisos Edit'));assert.ok(!ui.includes('Token D1 Read existente'));assert.ok(!ui.includes('610ee96e-140a-42ab-89ab-4db6072726bd'));assert.ok(!ui.includes('490de7b9-dc5b-443c-9a29-9cd876f37b68'));
});
test('backup once: export denied is sanitized and cannot restart within the transport',async()=>{
 let calls=0;const client=createBackupTransport(marker,{simulationFetch:async(url,options)=>{calls++;assert.ok(url.endsWith('/export'));assert.equal(JSON.parse(options.body).current_bookmark,undefined);return Response.json({success:false,errors:[{code:10000,message:'do not echo '+marker}]},{status:403});}});
 try{await assert.rejects(client.fullExport(bookmark));await assert.rejects(async()=>client.fullExport(bookmark));assert.equal(calls,1);const log=client.diagnostics();assert.equal(log.length,1);assert.equal(log[0].httpStatus,403);assert.deepEqual(log[0].codes,[10000]);assert.ok(!JSON.stringify(log).includes(marker));}finally{client.dispose();}
});
test('backup once: continuing polling is one export start, never a restarted job',async()=>{
 const seen=[];const client=createBackupTransport(marker,{simulationFetch:async(url,options)=>{seen.push(url);if(url.endsWith('/export')){const input=JSON.parse(options.body);if(seen.length===1){assert.equal(input.current_bookmark,undefined);return Response.json({success:true,result:{success:true,type:'export',status:'active',at_bookmark:bookmark}});}assert.equal(input.current_bookmark,bookmark);return Response.json({success:true,result:{success:true,type:'export',status:'complete',at_bookmark:bookmark,result:{signed_url:'https://synthetic-local.r2.cloudflarestorage.com/data'}}});}assert.equal(options.headers,undefined);return new Response('PRAGMA defer_foreign_keys=TRUE;');}});
 try{const exported=await client.fullExport(bookmark);assert.ok(exported.bytes.length);assert.equal(client.diagnostics().filter(item=>item.operation==='export_start').length,1);assert.equal(client.diagnostics().filter(item=>item.operation==='export_poll').length,1);assert.ok(seen.every(url=>url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`)||url==='https://synthetic-local.r2.cloudflarestorage.com/data'));}finally{client.dispose();}
});
test('backup once: authorization is exclusive on disk, UI masks both secrets, exact stage four enforced',()=>{
 const permit=readFileSync(new URL('../scripts/safe-d1/backup-once-permit.mjs',import.meta.url),'utf8');assert.ok(permit.includes("openSync(backupAttemptFile,'wx'"));assert.ok(!/unlink|rmSync|reset/i.test(permit.replace(/^\s*\/\/.*$/gm,'')));
 const cli=readFileSync(new URL('../scripts/d1-backup-once.mjs',import.meta.url),'utf8');assert.ok(cli.includes('expectedStage:backupExpectedStage'));assert.ok(cli.includes('verifyStageFourPreparation();'));assert.ok(cli.includes('decodeRecoverySecret'));assert.ok(!/write\.mjs|runner\.mjs|migrate/.test(cli));
 const ui=readFileSync(new URL('../scripts/backup-once-private.ps1',import.meta.url),'utf8');assert.equal((ui.match(/UseSystemPasswordChar = \$true/g)??[]).length,2);assert.ok(ui.includes('$start.Environment.Clear()'));assert.ok(ui.includes('$run.Enabled = $false'));assert.ok(!ui.includes('RandomNumberGenerator'));
});
