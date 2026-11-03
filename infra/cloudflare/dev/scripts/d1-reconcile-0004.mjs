import {readFileSync,existsSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody,dpapi} from './safe-d1/windows-custody.mjs';
import {requireSafe,target,assertEnvironment,digest} from './safe-d1/policy.mjs';
import {createBaselineReadTransport} from './safe-d1/baseline-readonly-transport.mjs';
import {reconcileStageFour} from './safe-d1/reconcile-stage-four.mjs';
const auditId='597b711f-55c9-432d-945d-12eaa3ac5cae',prefix=resolve(custodyRoot,'stage4-audit-'+auditId),chunks=[];let joined,token,transport,consumed=false;
function record(file,value){const bytes=Buffer.from(JSON.stringify(value,null,2)),fd=openSync(file,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}requireSafe(digest(readFileSync(file))===digest(bytes),'audit_readback_failed');}
try{
 requireSafe(process.argv.length===2&&!process.stdin.isTTY,'private_pipe_required');assertEnvironment(process.env);verifyWindowsCustody();requireSafe(!existsSync(prefix+'.attempt.json')&&!existsSync(prefix+'.result.json'),'audit_already_consumed');
 let size=0;for await(const c of process.stdin){chunks.push(c);size+=c.length;requireSafe(size<=4096,'private_input_limit');}joined=Buffer.concat(chunks);const input=JSON.parse(joined.toString('utf8'));requireSafe(Object.keys(input).join(',')==='token','private_input_invalid');token=input.token;input.token=undefined;requireSafe(typeof token==='string'&&/^[-_A-Za-z0-9]{20,256}$/.test(token),'credential_invalid');
 record(prefix+'.attempt.json',{auditId,target,readOnly:true,startedAt:new Date().toISOString()});consumed=true;transport=createBaselineReadTransport(token);token=undefined;
 const result=await reconcileStageFour(transport,async observation=>{
  const points=[];for(const p of observation.points){const plain=Buffer.concat([Buffer.from(p.value.replaceAll('-',''),'hex'),Buffer.from('BKM1')]);try{points.push({label:p.label,startedAt:p.startedAt,observedAt:p.observedAt,dpapiCiphertext:(await dpapi.protect(plain)).toString('base64')});}finally{plain.fill(0);p.value=undefined;}}
  record(prefix+'.private.json',{auditId,target,points,snapshots:observation.snapshots,confirmed:observation.confirmed,protection:'DPAPI CurrentUser; BKM1 encoding'});
 });result.auditId=auditId;result.target=target;record(prefix+'.result.json',result);console.log(JSON.stringify({status:result.confirmed?'confirmed_stage4':'failed',auditId}));process.exitCode=result.confirmed?0:2;
}catch{if(consumed)try{record(prefix+'.result.json',{auditId,status:'failed_local_or_read',credentialDisposed:true});}catch{/* Preserve evidence. */}console.log(JSON.stringify({status:'failed',auditId}));process.exitCode=2;}
finally{transport?.dispose();token=undefined;joined?.fill(0);for(const c of chunks)c.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;requireSafe(token===undefined,'credential_cleanup_failed');}
