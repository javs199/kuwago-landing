import {decryptEnvelope} from './encryption.mjs';
import {verifyRestorable} from './restore.mjs';
import {digest,requireSafe,target} from './policy.mjs';

// No DPAPI, Windows profile, HTTP, migration runner or plaintext output.
export async function verifyPortableRecovery(encrypted,recoverySecret,{expectedFingerprint}={}){
 let bytes,sql;
 try{
  bytes=await decryptEnvelope(encrypted,{recoverySecret});
  const payload=JSON.parse(bytes.toString('utf8')),header=JSON.parse(encrypted.toString('utf8')).header;
  requireSafe(payload.operationId===header.operationId&&JSON.stringify(payload.target)===JSON.stringify(target),'recovery_target_invalid');
  requireSafe(typeof payload.sqlBase64==='string','recovery_payload_invalid');
  sql=Buffer.from(payload.sqlBase64,'base64');payload.sqlBase64=undefined;
  requireSafe(digest(sql)===payload.sqlSha256,'recovery_hash_invalid');
  if(expectedFingerprint!==undefined)requireSafe(payload.sourceFingerprint===expectedFingerprint,'recovery_fixture_mismatch');
  const result=await verifyRestorable(sql,payload.sourceFingerprint);
  return {status:'verified_portable_recovery',operationId:header.operationId,mode:header.mode??'legacy-local-proof',encryptedSha256:digest(encrypted),restoreVerified:result.ok,tables:result.tables,rows:result.rows,dpapiUsed:false,externalCustodyVerified:false};
 }catch{throw Error('portable_recovery_failed');}
 finally{bytes?.fill(0);sql?.fill(0);}
}
