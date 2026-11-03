import {openSync,writeFileSync,fsyncSync,closeSync,readFileSync,lstatSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody,dpapi} from './windows-custody.mjs';
import {target,digest,requireSafe} from './policy.mjs';
import {isBookmark} from './export.mjs';
const journals=new WeakSet();
export const isBootstrapJournal=j=>journals.has(j);
export function createBootstrapJournal({root=custodyRoot,environment,executionId}={}){
 requireSafe(['development','local-simulation'].includes(environment)&&/^[a-f0-9-]{36}$/.test(executionId),'bootstrap_journal_scope_invalid');
 if(environment==='development')requireSafe(resolve(root)===resolve(custodyRoot),'bootstrap_journal_root_override');
 const prefix=resolve(root,'bootstrap-'+executionId),receipts=new WeakMap();
 function verifyRoot(){if(environment==='development')verifyWindowsCustody();requireSafe(lstatSync(root).isDirectory()&&!lstatSync(root).isSymbolicLink(),'bootstrap_custody_invalid');}
 function exclusive(suffix,value){
  verifyRoot();const file=prefix+'.'+suffix+'.json',bytes=Buffer.from(JSON.stringify({...value,target,environment,executionId},null,2));
  const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  requireSafe(digest(readFileSync(file))===digest(bytes),'bootstrap_durable_readback_failed');return {file,sha256:digest(bytes)};
 }
 const journal=Object.freeze({environment,executionId,
  begin(scope){requireSafe(scope.executionId===executionId&&scope.environment===environment&&!existsSync(prefix+'.closed.json'),'bootstrap_journal_scope_changed');return exclusive('attempt',{scope,startedAt:new Date().toISOString(),maximumBatches:1});},
  write(kind,value){requireSafe(['intent','request-invocation','ack','result'].includes(kind),'bootstrap_journal_kind_invalid');return exclusive(kind,value);},
  async checkpoint(stage,{fingerprint,points,phase}){
   requireSafe(stage===6&&/^[a-f0-9]{64}$/.test(fingerprint)&&['baseline','before_write','postflight','observation'].includes(phase),'bootstrap_checkpoint_scope_invalid');
   const sealed=[];
   // Reuse the existing 32-byte bookmark envelope required by backup-dpapi.ps1.
   for(const point of points){requireSafe(isBookmark(point.value),'bootstrap_bookmark_invalid');const bytes=Buffer.concat([Buffer.from(point.value.replaceAll('-',''),'hex'),Buffer.from('BKM1')]);try{sealed.push({label:point.label,observedAt:point.observedAt,ciphertext:(await dpapi.protect(bytes)).toString('base64')});}finally{bytes.fill(0);}}
   const record=exclusive(phase+'.private',{stage,fingerprint,points:sealed,createdAt:new Date().toISOString()});
   const receipt=Object.freeze({});receipts.set(receipt,{...record,fingerprint,points:points.map(p=>({...p}))});await journal.verifyCheckpoint(receipt);return receipt;
  },
  async verifyCheckpoint(receipt){
   verifyRoot();const r=receipts.get(receipt);requireSafe(r&&digest(readFileSync(r.file))===r.sha256,'bootstrap_checkpoint_readback_failed');
   const stored=JSON.parse(readFileSync(r.file));requireSafe(stored.fingerprint===r.fingerprint&&stored.executionId===executionId&&stored.environment===environment&&stored.points.length===r.points.length,'bootstrap_checkpoint_scope_changed');
   for(let i=0;i<stored.points.length;i++){const plain=await dpapi.unprotect(Buffer.from(stored.points[i].ciphertext,'base64'));try{requireSafe(plain.length===32&&plain.subarray(28).toString('ascii')==='BKM1'&&plain.subarray(0,28).toString('hex')===r.points[i].value.replaceAll('-','')&&stored.points[i].label===r.points[i].label,'bootstrap_checkpoint_decryption_failed');}finally{plain.fill(0);}}
   return {stage:6,fingerprint:r.fingerprint,recordSha256:r.sha256};
  },
  async close(result,checkpoint){
   const verified=await journal.verifyCheckpoint(checkpoint);requireSafe(result.status==='PASS'&&result.postflightFingerprint===verified.fingerprint,'bootstrap_closure_invalid');
   const saved=journal.write('result',result),closed=exclusive('closed',{resultSha256:saved.sha256,checkpointSha256:verified.recordSha256,closedAt:new Date().toISOString()});
   const stored=JSON.parse(readFileSync(closed.file));requireSafe(stored.resultSha256===digest(readFileSync(saved.file))&&stored.checkpointSha256===verified.recordSha256,'bootstrap_closure_readback_failed');
   return {durablyClosed:true,closureSha256:closed.sha256};
  },
 });journals.add(journal);return journal;
}
