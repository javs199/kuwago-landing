import {target,requireSafe} from './policy.mjs';
import {allowedReadSql} from './read.mjs';
import {isBackupRead} from './snapshot.mjs';
export function createBaselineReadTransport(token,{fetcher=fetch}={}){
 requireSafe(typeof token==='string'&&/^[-_A-Za-z0-9]{20,256}$/.test(token),'credential_invalid');
 let secret=token;token=undefined;requireSafe(token===undefined,'credential_transfer_failed');const log=[];const base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`;
 async function request(path,body){
  requireSafe(secret!==undefined,'credential_disposed');
  const item={operation:path===''?'metadata':path.startsWith('/time_travel/bookmark')?'bookmark':'read_query',startedAt:new Date().toISOString(),httpStatus:null,codes:[]};log.push(item);
  try{
   const response=await fetcher(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000),...(body?{body:JSON.stringify(body)}:{})});item.httpStatus=response.status;requireSafe(response.body,'response_invalid');
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;requireSafe(size<=2000000,'response_limit');chunks.push(Buffer.from(p.value));}}finally{await reader.cancel().catch(()=>{});}
   const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));item.codes=Array.isArray(value.errors)?value.errors.map(e=>e?.code).filter(Number.isSafeInteger).slice(0,8):[];
   requireSafe(response.ok&&value.success===true,'read_rejected');return value.result;
  }finally{item.finishedAt=new Date().toISOString();}
 }
 return Object.freeze({metadata:()=>request(''),bookmark:async()=>(await request('/time_travel/bookmark'))?.bookmark,
  bookmarkAt:async timestamp=>{requireSafe(typeof timestamp==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp),'timestamp_invalid');return (await request('/time_travel/bookmark?timestamp='+encodeURIComponent(timestamp)))?.bookmark;},
  select:async sql=>{requireSafe(allowedReadSql.includes(sql)||isBackupRead(sql),'read_sql_forbidden');const rows=await request('/query',{sql,params:[]});requireSafe(Array.isArray(rows)&&rows.length===1&&rows[0].success===true&&Array.isArray(rows[0].results),'read_response_invalid');return rows[0].results;},
  diagnostics:()=>log.map(v=>({...v,codes:[...v.codes]})),dispose(){secret=undefined;},
 });
}
