import {randomBytes,createCipheriv,createDecipheriv,scrypt as derive} from 'node:crypto';
import {promisify} from 'node:util';
import {requireSafe,target} from './policy.mjs';
const scrypt=promisify(derive),parameters=Object.freeze({N:32768,r:8,p:1,maxmem:67108864});
function seal(bytes,key,aad){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};}
function open(value,key,aad){const iv=Buffer.from(value.iv,'base64'),tag=Buffer.from(value.tag,'base64');requireSafe(iv.length===12&&tag.length===16,'encrypted_header_invalid');const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(aad);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]);}
export async function encryptEnvelope(bytes,metadata,recoverySecret,protector){
 requireSafe(Buffer.isBuffer(bytes)&&bytes.length<=24000000&&Buffer.isBuffer(recoverySecret)&&recoverySecret.length===32,'encryption_input_invalid');
 const key=randomBytes(32),salt=randomBytes(32);let recoveryKey;
 try{
  const header={format:1,algorithm:'AES-256-GCM',target,operationId:metadata.operationId,mode:metadata.mode??'local-test'};const aad=Buffer.from(JSON.stringify(header));
  recoveryKey=await scrypt(recoverySecret,salt,32,parameters);
  return Buffer.from(JSON.stringify({header,payload:seal(bytes,key,aad),dpapiKey:(await protector.protect(key)).toString('base64'),recovery:{kdf:'scrypt-N32768-r8-p1',salt:salt.toString('base64'),wrapped:seal(key,recoveryKey,aad)}}));
 }catch{throw Error('encryption_failed');}finally{key.fill(0);recoveryKey?.fill(0);}
}
export async function decryptEnvelope(encoded,{protector,recoverySecret}={}){
 let key,recoveryKey;
 try{
  requireSafe(encoded.length>0&&encoded.length<=34000000,'encrypted_size_invalid');const value=JSON.parse(encoded.toString('utf8'));
  requireSafe(value.header?.format===1&&value.header.algorithm==='AES-256-GCM'&&JSON.stringify(value.header.target)===JSON.stringify(target)&&/^[a-f0-9-]{36}$/.test(value.header.operationId),'encrypted_target_invalid');
  const aad=Buffer.from(JSON.stringify(value.header));
  if(recoverySecret){requireSafe(Buffer.isBuffer(recoverySecret)&&recoverySecret.length===32&&value.recovery.kdf==='scrypt-N32768-r8-p1','recovery_invalid');const salt=Buffer.from(value.recovery.salt,'base64');requireSafe(salt.length===32,'recovery_invalid');recoveryKey=await scrypt(recoverySecret,salt,32,parameters);key=open(value.recovery.wrapped,recoveryKey,aad);}
  else{requireSafe(protector,'key_protector_required');key=await protector.unprotect(Buffer.from(value.dpapiKey,'base64'));}
  requireSafe(key.length===32,'key_invalid');return open(value.payload,key,aad);
 }catch{throw Error('backup_decryption_failed');}finally{key?.fill(0);recoveryKey?.fill(0);}
}
