import {mkdirSync,lstatSync,existsSync,openSync,writeFileSync,fsyncSync,closeSync,readFileSync,renameSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {requireSafe} from './policy.mjs';
export function createEncryptedStore(root,verify){
 const states=new WeakMap();
 const directorySafe=folder=>{const stat=lstatSync(folder);requireSafe(stat.isDirectory()&&!stat.isSymbolicLink(),'custody_reparse_forbidden');};
 const path=(...parts)=>{const value=resolve(root,...parts);requireSafe(value.startsWith(resolve(root)+sep),'custody_path_escape');return value;};
 function writeExclusive(file,bytes){const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
 return Object.freeze({
  async begin(id){await verify();requireSafe(lstatSync(root).isDirectory()&&!lstatSync(root).isSymbolicLink(),'custody_unsafe');requireSafe(/^[a-f0-9-]{36}$/.test(id),'operation_invalid');const lock=path('backup-only.lock');writeExclusive(lock,JSON.stringify({operationId:id}));const handle=Object.freeze({id});const state={lock,pending:path('.pending-'+id),final:path(id),promoted:false};states.set(handle,state);try{mkdirSync(state.pending,{mode:0o700});}catch{unlinkSync(lock);throw Error('custody_create_failed');}return handle;},
  async write(handle,encrypted,evidence){const s=states.get(handle);requireSafe(s&&!s.promoted,'store_handle_invalid');await verify();directorySafe(root);directorySafe(s.pending);writeExclusive(path('.pending-'+handle.id,'backup.kwgbak.part'),encrypted);writeExclusive(path('.pending-'+handle.id,'evidence.json'),JSON.stringify(evidence,null,2));},
  read(handle){const s=states.get(handle);requireSafe(s,'store_handle_invalid');directorySafe(root);directorySafe(s.promoted?s.final:s.pending);const file=path(s.promoted?handle.id:'.pending-'+handle.id,s.promoted?'backup.kwgbak':'backup.kwgbak.part');const stat=lstatSync(file);requireSafe(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=34000000,'encrypted_file_invalid');return readFileSync(file);},
  verifiedEvidence(handle,evidence){const s=states.get(handle);requireSafe(s&&!s.promoted&&evidence.restoreVerified===true,'evidence_invalid');directorySafe(root);directorySafe(s.pending);writeExclusive(path('.pending-'+handle.id,'evidence.verified.json'),JSON.stringify(evidence,null,2));renameSync(path('.pending-'+handle.id,'evidence.verified.json'),path('.pending-'+handle.id,'evidence.json'));},
  async promote(handle){const s=states.get(handle);requireSafe(s&&!s.promoted&&!existsSync(s.final),'promotion_invalid');await verify();directorySafe(root);directorySafe(s.pending);renameSync(path('.pending-'+handle.id,'backup.kwgbak.part'),path('.pending-'+handle.id,'backup.kwgbak'));renameSync(s.pending,s.final);s.promoted=true;return path(handle.id,'backup.kwgbak');},
  cleanup(handle){const s=states.get(handle);if(!s)return;directorySafe(root);if(!s.promoted&&existsSync(s.pending)){directorySafe(s.pending);for(const name of ['backup.kwgbak.part','backup.kwgbak','evidence.json','evidence.verified.json']){const file=path('.pending-'+handle.id,name);if(existsSync(file))unlinkSync(file);}rmdirSync(s.pending);}if(existsSync(s.lock)){requireSafe(!lstatSync(s.lock).isSymbolicLink()&&JSON.parse(readFileSync(s.lock,'utf8')).operationId===handle.id,'lock_ownership_changed');unlinkSync(s.lock);}},
  isVerified:handle=>states.get(handle)?.promoted===true,
  failureEvidence(handle,result){if(!states.has(handle))return;directorySafe(root);writeExclusive(path('failure-'+handle.id+'.json'),JSON.stringify(result,null,2));},
 });
}
