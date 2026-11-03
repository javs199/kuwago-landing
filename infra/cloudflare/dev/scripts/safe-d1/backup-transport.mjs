// Deliberately no import of write.mjs, migration runner, bootstrap or generic administrative API.
import {target,requireSafe} from './policy.mjs';
import {allowedReadSql} from './read.mjs';
import {isBackupRead} from './snapshot.mjs';
import {createExporter} from './export.mjs';
import {takeBackupOncePermit} from './backup-once-permit.mjs';
import {takeStageSixBackupPermit} from './backup-six-permit.mjs';
import {takeCurrentBackupPermit} from './backup-current-permit.mjs';
export const backupRemoteEnabled=false;
export function createBackupTransport(token,{simulationFetch,oneShotPermit,stageSixPermit,currentPermit}={}){
 requireSafe(backupRemoteEnabled||typeof simulationFetch==='function'||takeBackupOncePermit(oneShotPermit)||takeStageSixBackupPermit(stageSixPermit)||takeCurrentBackupPermit(currentPermit),'remote_backup_not_authorized');
 requireSafe(typeof token==='string'&&/^[-_A-Za-z0-9]{20,256}$/.test(token),'credential_invalid');
 const fetcher=simulationFetch??fetch,base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`,shutdown=new AbortController();
 let secret=token,exportUsed=false;const diagnostics=[];token=undefined;requireSafe(token===undefined,'credential_transfer_failed');
 const fetchBound=(url,options)=>fetcher(url,{...options,signal:AbortSignal.any([shutdown.signal,options.signal??AbortSignal.timeout(20000)])});
 async function api(path,body){
  requireSafe(secret!==undefined&&['','/query','/export','/time_travel/bookmark'].includes(path),'backup_operation_forbidden');
  const item={operation:path===''?'metadata':path==='/query'?'read_query':path==='/export'?(body?.current_bookmark?'export_poll':'export_start'):'bookmark',method:body?'POST':'GET',httpStatus:null,codes:[],description:'No response'};diagnostics.push(item);
  let response;try{response=await fetchBound(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},redirect:'manual',...(body?{body:JSON.stringify(body)}:{})});item.httpStatus=response.status;}catch{item.description='Network or timeout failure; no retry';throw Error('backup_request_interrupted');}
  requireSafe(response.body,'backup_request_rejected');const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;requireSafe(size<=2000000,'backup_response_limit');parts.push(Buffer.from(part.value));}}catch{throw Error('backup_response_invalid');}finally{await reader.cancel().catch(()=>{});}
  let result;try{result=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Error('backup_response_invalid');}
  item.codes=Array.isArray(result.errors)?result.errors.map(error=>error?.code).filter(Number.isSafeInteger).slice(0,8):[];
  item.description=response.ok&&result.success===true?'Request accepted':item.codes.includes(10000)?'Authentication or authorization rejected; no retry':'Request rejected; details omitted; no retry';
  requireSafe(response.ok&&result.success===true&&(!result.errors||result.errors.length===0),'backup_request_rejected');return result.result;
 }
 const exporter=createExporter(api,fetchBound);
 return Object.freeze({
  metadata:()=>api(''),bookmark:async()=>(await api('/time_travel/bookmark'))?.bookmark,
  select:async sql=>{requireSafe(allowedReadSql.includes(sql)||isBackupRead(sql),'backup_read_forbidden');const result=await api('/query',{sql,params:[]});requireSafe(Array.isArray(result)&&result.length===1&&result[0].success===true&&Array.isArray(result[0].results),'backup_read_invalid');return result[0].results;},
  fullExport:bookmark=>{requireSafe(!exportUsed,'export_already_attempted');exportUsed=true;return exporter.fullExport(bookmark);},
  diagnostics:()=>diagnostics.map(item=>({...item,codes:[...item.codes]})),
  dispose(){shutdown.abort();secret=undefined;},
 });
}
