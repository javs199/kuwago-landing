import {Worker} from 'node:worker_threads';
import {requireSafe} from './policy.mjs';
import {maximumExportBytes} from './export.mjs';
export async function verifyRestorable(bytes,expectedFingerprint){
 requireSafe(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=maximumExportBytes,'export_bytes_invalid');
 requireSafe(typeof expectedFingerprint==='string'&&/^[a-f0-9]{64}$/.test(expectedFingerprint),'backup_fingerprint_invalid');
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./restore-worker.mjs',import.meta.url),{workerData:{bytes,expectedFingerprint},env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:96,stackSizeMb:4}});let settled=false;
  const finish=(ok,result)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();if(ok)resolve(result);else reject(Error('export_restore_verification_failed'));};
  const timer=setTimeout(()=>finish(false),10000);worker.once('message',result=>finish(result?.ok===true,result));worker.once('error',()=>finish(false));worker.once('exit',()=>finish(false));
 });
}
