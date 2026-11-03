import {readFileSync,openSync,writeFileSync,fsyncSync,closeSync,lstatSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody,dpapi} from './windows-custody.mjs';
import {digest,target,requireSafe} from './policy.mjs';
import {isBookmark} from './export.mjs';
const journals=new WeakSet();
export const isCompletionJournal=j=>journals.has(j);
export function createCompletionJournal({root=custodyRoot,environment,executionId,failCheckpointStage}={}){
 requireSafe(['development','local-simulation'].includes(environment)&&/^[a-f0-9-]{36}$/.test(executionId),'completion_journal_scope_invalid');
 if(environment==='development')requireSafe(resolve(root)===resolve(custodyRoot)&&failCheckpointStage===undefined,'completion_production_journal_override');
 const prefix=resolve(root,'migration-0005-0006-'+executionId),receipts=new WeakMap();
 function verifyRoot(){if(environment==='development')verifyWindowsCustody();requireSafe(lstatSync(root).isDirectory()&&!lstatSync(root).isSymbolicLink(),'completion_journal_root_invalid');}
 function exclusive(file,value){verifyRoot();const bytes=Buffer.from(JSON.stringify(value,null,2)),fd=openSync(file,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}requireSafe(digest(readFileSync(file))===digest(bytes),'completion_journal_readback_failed');return digest(bytes);}
 async function sealPoint(p){requireSafe(isBookmark(p.value),'completion_checkpoint_point_invalid');const bytes=Buffer.concat([Buffer.from(p.value.replaceAll('-',''),'hex'),Buffer.from('BKM1')]);try{return {...p,value:undefined,ciphertext:(await dpapi.protect(bytes)).toString('base64')};}finally{bytes.fill(0);}}
 async function validatePoints(points,expected){
  requireSafe(points.length===expected.length,'completion_checkpoint_points_changed');
  for(let i=0;i<points.length;i++){let bytes;try{bytes=await dpapi.unprotect(Buffer.from(points[i].ciphertext,'base64'));requireSafe(bytes.length===32&&bytes.subarray(28).toString('ascii')==='BKM1'&&bytes.subarray(0,28).toString('hex')===expected[i].value.replaceAll('-','')&&points[i].label===expected[i].label,'completion_checkpoint_decryption_mismatch');}finally{bytes?.fill(0);}}
 }
 const journal=Object.freeze({environment,executionId,
  begin(){verifyRoot();requireSafe(!existsSync(prefix+'.result.json'),'completion_journal_already_finished');exclusive(prefix+'.lock.json',{target,environment,executionId,startedAt:new Date().toISOString()});},
  write(kind,stage,value){requireSafe(['intent','ack','verified','result'].includes(kind)&&[4,5,6].includes(stage),'completion_journal_kind_invalid');return exclusive(kind==='result'?prefix+'.result.json':prefix+`.stage-${stage}.${kind}.json`,{...value,target,environment,executionId});},
  async checkpoint(stage,{fingerprint,points,phase}){
   requireSafe([4,5,6].includes(stage)&&/^[a-f0-9]{64}$/.test(fingerprint)&&['baseline','postflight','observation','before_write'].includes(phase),'completion_checkpoint_invalid');
   const sealed=[];for(const p of points)sealed.push(await sealPoint(p));const file=prefix+`.stage-${stage}.${phase}.private.json`,value={target,environment,executionId,stage,fingerprint,points:sealed,phase,createdAt:new Date().toISOString()};
   const sha256=exclusive(file,value);
   if(environment==='local-simulation'&&stage===failCheckpointStage&&phase==='postflight')throw Error('completion_checkpoint_simulated_readback_failure');
   const stored=JSON.parse(readFileSync(file));requireSafe(digest(readFileSync(file))===sha256&&stored.fingerprint===fingerprint&&stored.executionId===executionId&&stored.environment===environment&&stored.stage===stage,'completion_checkpoint_readback_failed');await validatePoints(stored.points,points);
   const receipt=Object.freeze({});receipts.set(receipt,{file,sha256,stage,fingerprint,points:points.map(p=>({...p}))});return receipt;
  },
  async verifyCheckpoint(receipt){verifyRoot();const r=receipts.get(receipt);requireSafe(r&&digest(readFileSync(r.file))===r.sha256,'completion_checkpoint_receipt_invalid');const v=JSON.parse(readFileSync(r.file));requireSafe(v.executionId===executionId&&v.environment===environment&&v.stage===r.stage&&v.fingerprint===r.fingerprint,'completion_checkpoint_scope_changed');await validatePoints(v.points,r.points);return Object.freeze({stage:r.stage,fingerprint:r.fingerprint,recordSha256:r.sha256});},
  async closeResult(result,receipt){
   const verified=await journal.verifyCheckpoint(receipt);requireSafe(verified.stage===6&&result.status==='completed_0005_0006_only'&&JSON.stringify(result.verifiedStages.map(s=>s.stage))==='[5,6]','completion_close_invalid');
   const resultSha256=journal.write('result',6,result),closure={target,environment,executionId,stage:6,resultSha256,checkpointSha256:verified.recordSha256,closedAt:new Date().toISOString()};
   const closureSha256=exclusive(prefix+'.closed.json',closure),r=JSON.parse(readFileSync(prefix+'.closed.json'));
   requireSafe(r.resultSha256===digest(readFileSync(prefix+'.result.json'))&&r.checkpointSha256===verified.recordSha256&&r.executionId===executionId&&r.environment===environment&&r.stage===6,'completion_closure_readback_failed');return Object.freeze({resultSha256,closureSha256,stage6DurablyClosed:true});
  },
 });journals.add(journal);return journal;
}
