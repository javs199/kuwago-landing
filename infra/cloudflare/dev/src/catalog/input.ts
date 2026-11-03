import { ServiceRevisionSchema, CategorySchema } from '../../../../../packages/contracts/src/admin.js';
import type { ServiceRevision, Category } from '../../../../../packages/contracts/src/models.js';
import { ApiFailure } from './errors.js';
export { ApiFailure } from './errors.js';
export function record(value:unknown,keys:readonly string[]):Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k))) throw new ApiFailure(422,'invalid_input');
  return value as Record<string,unknown>;
}
export async function jsonBody(request:Request):Promise<unknown> {
  if (!request.body) throw new ApiFailure(422,'json_required');
  const reader=request.body.getReader();const buffer=new Uint8Array(65536);let bytes=0;
  let expired=false;const timeout=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>undefined);},10000);
  try {
    while(true){const {done,value}=await reader.read();if(done)break;if(bytes+value.byteLength>65536)throw new ApiFailure(413,'body_too_large');buffer.set(value,bytes);bytes+=value.byteLength;}
  }catch(error){await reader.cancel().catch(()=>undefined);throw error;}finally{clearTimeout(timeout);}
  if(expired)throw new ApiFailure(408,'body_timeout');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,bytes)));}catch{throw new ApiFailure(422,'invalid_json');}
}
export function expectedVersion(request:Request):number {
  const value=request.headers.get('If-Match');
  if(value===null)throw new ApiFailure(428,'version_required');
  if(!/^"[1-9][0-9]*"$/.test(value))throw new ApiFailure(422,'invalid_version');
  const number=Number(value.slice(1,-1));if(!Number.isSafeInteger(number))throw new ApiFailure(422,'invalid_version');return number;
}
export function identifier(value:string):string {
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value))throw new ApiFailure(422,'invalid_identifier');return value;
}
export type DraftInput = Pick<ServiceRevision,'slug'|'categoryId'|'translations'|'options'> & {
  media:{id:string;sortOrder:number;alt:{es:string;en:string}}[];internalNotes:string;
};
export function draftInput(input:unknown):DraftInput {
  const row=record(input,['slug','categoryId','translations','options','media','internalNotes']);
  if(typeof row.internalNotes!=='string'||row.internalNotes.length>10000||!Array.isArray(row.media))throw new ApiFailure(422,'invalid_input');
  const media=row.media.map(value=>{
    const entry=record(value,['id','sortOrder','alt']);
    return {...entry,url:'/v1/media/pending',provenance:'demo',usageApproval:'pending'};
  });
  // Build only server-owned revision metadata; clients cannot supply approvals, URLs or provenance.
  const parsed=ServiceRevisionSchema.safeParse({id:'validation-only',serviceId:'validation-only',number:1,createdAt:'2026-01-01T00:00:00.000Z',
    slug:row.slug,categoryId:row.categoryId,translations:row.translations,options:row.options,media,
    commercialApproval:{status:'pending',revisionId:null}});
  if(!parsed.success)throw new ApiFailure(422,'invalid_draft');
  return {slug:parsed.data.slug,categoryId:parsed.data.categoryId,translations:parsed.data.translations,options:parsed.data.options,
    media:parsed.data.media.map(({id,sortOrder,alt})=>({id,sortOrder,alt})),internalNotes:row.internalNotes};
}
export function categoryInput(input:unknown,id:string):Category {
  const row=record(input,['slug','active','translations']);const result=CategorySchema.safeParse({id,...row});
  if(!result.success)throw new ApiFailure(422,'invalid_category');return result.data;
}
export type PageInput={limit:number;cursor:string;q:string};
export function page(url:URL):PageInput {
  if([...url.searchParams.keys()].some(k=>!['limit','cursor','q'].includes(k)))throw new ApiFailure(422,'invalid_query');
  const raw=url.searchParams.get('limit')??'20';const limit=Number(raw);
  if(!/^[1-9][0-9]*$/.test(raw)||limit>100)throw new ApiFailure(422,'invalid_limit');
  const cursor=url.searchParams.get('cursor')??'';if(cursor)identifier(cursor);
  const q=url.searchParams.get('q')??'';if(q.length>100)throw new ApiFailure(422,'invalid_query');
  return {limit,cursor,q};
}
