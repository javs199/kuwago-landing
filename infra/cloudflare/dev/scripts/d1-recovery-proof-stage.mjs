import {mkdirSync,readFileSync,writeFileSync,lstatSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody} from './safe-d1/windows-custody.mjs';
import {decodeRecoverySecret} from './safe-d1/recovery-format.mjs';
import {createRecoveryProof,verifyRecoveryProof,recoveryProofMode} from './safe-d1/recovery-fixture.mjs';
import {requireSafe,digest} from './safe-d1/policy.mjs';

// Fixed synthetic proof only. Never imports a Cloudflare client or migration runner.
const chunks=[];let joined,key,folder,stage,operationId;
function writeExclusive(file,bytes){const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
function readBounded(file,max){const stat=lstatSync(file);requireSafe(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=max,'proof_file_invalid');return readFileSync(file);}
try{
 [stage,operationId]=process.argv.slice(2);
 requireSafe(process.argv.length===4&&['Encrypt','Restore'].includes(stage)&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(operationId)&&!process.stdin.isTTY,'proof_arguments_invalid');
 verifyWindowsCustody();folder=resolve(custodyRoot,'recovery-proof-'+operationId);
 if(stage==='Encrypt')mkdirSync(folder,{mode:0o700});
 requireSafe(lstatSync(folder).isDirectory()&&!lstatSync(folder).isSymbolicLink(),'proof_directory_invalid');
 let size=0;for await(const part of process.stdin){chunks.push(part);size+=part.length;requireSafe(size<=4096,'private_input_limit');}
 joined=Buffer.concat(chunks);const input=JSON.parse(joined.toString('utf8'));
 requireSafe(Object.keys(input).length===1,'private_input_invalid');key=decodeRecoverySecret(input.recoverySecretBase64);input.recoverySecretBase64=undefined;
 let result;
 if(stage==='Encrypt'){
  const encrypted=await createRecoveryProof(operationId,key);
  writeExclusive(resolve(folder,'synthetic.kwgbak'),encrypted);
  requireSafe(digest(readBounded(resolve(folder,'synthetic.kwgbak'),34000000))===digest(encrypted),'ciphertext_readback_failed');
  result={operationId,stage,status:'ENCRYPTED',mode:recoveryProofMode,encryptedSha256:digest(encrypted),pid:process.pid,dpapiIncluded:false,createdAt:new Date().toISOString()};
 }else{
  const previous=JSON.parse(readBounded(resolve(folder,'encrypt.json'),8192));const encrypted=readBounded(resolve(folder,'synthetic.kwgbak'),34000000);
  requireSafe(previous.operationId===operationId&&previous.status==='ENCRYPTED'&&previous.mode===recoveryProofMode&&previous.encryptedSha256===digest(encrypted),'proof_evidence_invalid');
  const verified=await verifyRecoveryProof(encrypted,operationId,key);
  result={operationId,stage,status:'PASS',mode:recoveryProofMode,encryptedSha256:digest(encrypted),pid:process.pid,encryptionPid:previous.pid,restoreVerified:true,exactFixtureMatch:true,tables:verified.tables,rows:verified.rows,dpapiUsed:false,createdAt:new Date().toISOString()};
 }
 writeExclusive(resolve(folder,stage.toLowerCase()+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,operationId,stage}));
}catch{
 // Do not serialize input, raw errors, paths derived from secrets, or key hashes.
 const result={status:'FAIL',stage:['Encrypt','Restore'].includes(stage)?stage:'unknown'};
 if(folder&&operationId&&stage==='Restore')try{writeExclusive(resolve(folder,'restore-failure.json'),JSON.stringify({...result,operationId}));}catch{/* Preserve original sanitized failure; never overwrite evidence. */}
 console.log(JSON.stringify(result));process.exitCode=2;
}finally{key?.fill(0);joined?.fill(0);for(const part of chunks)part.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;}
