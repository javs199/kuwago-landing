import {encryptEnvelope} from './encryption.mjs';
import {verifyPortableRecovery} from './portable-recovery.mjs';
import {normalizeSnapshot,snapshotFingerprint} from './snapshot.mjs';
import {digest,target,requireSafe} from './policy.mjs';
export const recoveryProofMode='synthetic-custodied-key-proof-v1';
export function recoveryFixture(){
 const create='CREATE TABLE synthetic_recovery_probe(id INTEGER PRIMARY KEY,label TEXT NOT NULL)';
 const labels=['Kuwago synthetic only','Prueba de recuperación: sin datos reales'];
 const hex=labels.map(value=>Buffer.from(value).toString('hex').toUpperCase());
 const sql=Buffer.from(create+';'+hex.map((value,i)=>`INSERT INTO synthetic_recovery_probe VALUES(${i+1},CAST(X'${value}' AS TEXT));`).join(''));
 const snapshot=normalizeSnapshot([{type:'table',name:'synthetic_recovery_probe',sql:create}],[{name:'synthetic_recovery_probe',columns:['id','label'],rows:hex.map((value,i)=>['integer:'+Buffer.from(String(i+1)).toString('hex').toUpperCase(),'text:'+value])}]);
 return {sql,fingerprint:snapshotFingerprint(snapshot)};
}
export async function createRecoveryProof(operationId,recoverySecret){
 const {sql,fingerprint}=recoveryFixture();let payload;
 try{
  requireSafe(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(operationId),'operation_invalid');
  payload=Buffer.from(JSON.stringify({operationId,target,sqlBase64:sql.toString('base64'),sqlSha256:digest(sql),sourceFingerprint:fingerprint}));
  // Synthetic recovery-only package: no DPAPI capability is stored or used.
  const raw=await encryptEnvelope(payload,{operationId,mode:recoveryProofMode},recoverySecret,{protect:async()=>Buffer.alloc(0)});
  const value=JSON.parse(raw.toString('utf8'));delete value.dpapiKey;
  return Buffer.from(JSON.stringify(value));
 }finally{sql.fill(0);payload?.fill(0);}
}
export async function verifyRecoveryProof(encrypted,operationId,recoverySecret){
 const header=JSON.parse(encrypted.toString('utf8'));
 requireSafe(header.header?.operationId===operationId&&header.header?.mode===recoveryProofMode&&!Object.hasOwn(header,'dpapiKey'),'synthetic_proof_invalid');
 const fixture=recoveryFixture();
 try{
  const result=await verifyPortableRecovery(encrypted,recoverySecret,{expectedFingerprint:fixture.fingerprint});
  requireSafe(result.restoreVerified===true&&result.tables===1&&result.rows===2&&result.dpapiUsed===false,'synthetic_integrity_failed');
  return result;
 }finally{fixture.sql.fill(0);}
}
