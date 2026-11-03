import type { CatalogDatabase } from './types.js';
import { ApiFailure } from './errors.js';
export type PublicationHead={epoch:string;mode:'ready'|'paused';generation:number|null;payloadHash:string|null};
export interface BarrierBinding {fetch(request:Request):Promise<Response>}
export async function publicationHead(db:CatalogDatabase):Promise<PublicationHead>{
  // This boundary must use a primary D1 read, not an unconstrained read replica/session.
  const primary=db.withSession?.('first-primary')??db;
  const result=await primary.prepare('SELECT epoch,mode,generation,payload_hash AS payloadHash FROM publication_control WHERE id=1').all<PublicationHead>();
  if(!result.success||!result.results[0])throw new ApiFailure(503,'catalog_unavailable');
  return parseHead(result.results[0]);
}
export function parseHead(value:unknown):PublicationHead{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiFailure(503,'catalog_unavailable');
  const head=value as PublicationHead;
  if(Object.keys(head).sort().join(',')!=='epoch,generation,mode,payloadHash'||!/^[a-f0-9]{32}$/.test(head.epoch)||!['ready','paused'].includes(head.mode)||
    !(head.generation===null&&head.payloadHash===null)&&(!Number.isSafeInteger(head.generation)||head.generation!<0||typeof head.payloadHash!=='string'||!/^[a-f0-9]{64}$/.test(head.payloadHash)))throw new ApiFailure(503,'catalog_unavailable');
  return head;
}
export async function readBarrier(binding:BarrierBinding|undefined):Promise<PublicationHead>{
  if(!binding)throw new ApiFailure(503,'catalog_unavailable');
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
    const response=await Promise.race([binding.fetch(new Request('https://catalog-barrier.internal/head')),
      new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new ApiFailure(503,'catalog_unavailable')),3000);})]);
    if(response.status!==200)throw new ApiFailure(503,'catalog_unavailable');
    const text=await response.text();if(text.length>512)throw new ApiFailure(503,'catalog_unavailable');
    return parseHead(JSON.parse(text));
  }finally{if(timeout)clearTimeout(timeout);}
}
export async function sha256(text:string):Promise<string>{
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function snapshotKey(head:PublicationHead):string{return `catalog/v2/${head.epoch}/${head.generation}-${head.payloadHash}.json`;}
