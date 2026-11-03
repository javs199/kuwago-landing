import {existsSync,openSync,closeSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody,dpapi} from './safe-d1/windows-custody.mjs';
import {loadApprovedEncryptedBackup,approvedBackupState,encryptedBackupPins} from './safe-d1/encrypted-backup-receipt.mjs';
import {createBaselineReadTransport} from './safe-d1/baseline-readonly-transport.mjs';
import {auditBaseline} from './safe-d1/baseline-audit.mjs';
import {requireSafe,target} from './safe-d1/policy.mjs';
const auditId='9e727e66-ad85-4d6f-b1a8-e976ab2397ce',prefix=resolve(custodyRoot,'baseline-audit-'+auditId);
const chunks=[];let joined,token,transport,consumed=false;
function exclusive(file,bytes){const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,bytes);}finally{closeSync(fd);}}
try{
 requireSafe(process.argv.length===2&&!process.stdin.isTTY,'private_input_required');verifyWindowsCustody();requireSafe(!existsSync(prefix+'.attempt.json')&&!existsSync(prefix+'.result.json'),'audit_already_attempted');
 let size=0;for await(const p of process.stdin){chunks.push(p);size+=p.length;requireSafe(size<=4096,'private_input_limit');}joined=Buffer.concat(chunks);const input=JSON.parse(joined.toString('utf8'));requireSafe(Object.keys(input).length===1,'private_input_invalid');token=input.token;input.token=undefined;
 requireSafe(typeof token==='string'&&/^[-_A-Za-z0-9]{20,256}$/.test(token),'credential_invalid');const backup=await loadApprovedEncryptedBackup();
 exclusive(prefix+'.attempt.json',JSON.stringify({auditId,target,startedAt:new Date().toISOString(),readOnly:true}));consumed=true;
 transport=createBaselineReadTransport(token);token=undefined;
 const result=await auditBaseline(transport,approvedBackupState(backup));const wrapped=[];
 for(const entry of result.privateBookmarks){const plain=Buffer.concat([Buffer.from(entry.value.replaceAll('-',''),'hex'),Buffer.from('BKM1')]);try{requireSafe(plain.length===32,'bookmark_encoding_invalid');const ciphertext=await dpapi.protect(plain);wrapped.push({...entry,value:undefined,dpapiCiphertext:ciphertext.toString('base64')});}finally{plain.fill(0);entry.value=undefined;}}
 exclusive(prefix+'.private-bookmarks.json',JSON.stringify({format:1,auditId,target,backupOperationId:encryptedBackupPins.operationId,encoding:'28-byte bookmark + BKM1; DPAPI CurrentUser',records:wrapped},null,2));
 result.safe.auditId=auditId;result.safe.target=target;result.safe.backupOperationId=encryptedBackupPins.operationId;result.safe.requests=transport.diagnostics();result.safe.credentialDisposed=true;
 transport.dispose();exclusive(prefix+'.result.json',JSON.stringify(result.safe,null,2));console.log(JSON.stringify({status:result.safe.status,auditId}));
}catch{
 if(consumed)try{exclusive(prefix+'.result.json',JSON.stringify({auditId,status:'audit_failed',requests:transport?.diagnostics()??[],credentialDisposed:true}));}catch{/* Preserve existing evidence. */}
 console.log(JSON.stringify({status:'audit_failed',auditId}));process.exitCode=2;
}finally{transport?.dispose();token=undefined;joined?.fill(0);for(const p of chunks)p.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;requireSafe(token===undefined,'credential_cleanup_failed');}
