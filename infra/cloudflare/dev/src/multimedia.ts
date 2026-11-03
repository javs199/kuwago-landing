import {processImage} from './images/processor.js';
import type {Administrator} from './auth/rbac.js';
import type {CatalogEnvironment} from './catalog/types.js';
import {ApiFailure,identifier,jsonBody,record,expectedVersion} from './catalog/input.js';
import {rows,catalogVersion} from './catalog/repository.js';
import {commit} from './catalog/transaction.js';
import {imagePolicy,privateObjectKey,canTransitionMedia} from './media.js';
export interface MediaBucket {
  get(key:string):Promise<{arrayBuffer():Promise<ArrayBuffer>}|null>;
  put(key:string,value:ArrayBuffer,options:{onlyIf:{etagDoesNotMatch:string}}):Promise<unknown|null>;
  delete(key:string):Promise<void>;
}
export const mediaRoutes=[
  {method:'POST',pattern:/^\/api\/v1\/media$/,permission:'media:prepare' as const},
  {method:'GET',pattern:/^\/api\/v1\/media$/,permission:'media:read-private' as const},
  {method:'GET',pattern:/^\/api\/v1\/media\/([A-Za-z0-9_-]+)(?:\/(preview))?$/,permission:'media:read-private' as const},
  {method:'POST',pattern:/^\/api\/v1\/media\/([A-Za-z0-9_-]+)\/(validate|approve|reject|retire|cleanup)$/,permission:'media:prepare' as const},
];
const manager=(actor:Administrator)=>actor.permissions.includes('services:publish');
async function owned(env:CatalogEnvironment,actor:Administrator,id:string){
  const row=(await rows(env.DB,'SELECT a.*,p.version,p.validation_code,p.normalized_sha256 FROM media_assets a LEFT JOIN media_processing p ON p.media_id=a.id WHERE a.id=?',id))[0];
  if(!row||(!manager(actor)&&row.uploaded_by!==actor.id))throw new ApiFailure(404,'media_not_found');
  return row;
}
function dto(row:Record<string,unknown>){return {id:row.id,state:row.state,version:row.version??1,validationCode:row.validation_code??'legacy_requires_review',mimeType:row.mime_type,width:row.width,height:row.height,byteSize:row.byte_size,usageApproval:row.usage_approval,uploadedBy:row.uploaded_by};}
export async function boundedBytes(stream:ReadableStream<Uint8Array>|null,max:number):Promise<ArrayBuffer>{
  if(!stream)throw new ApiFailure(422,'empty_file');const reader=stream.getReader(),bytes=new Uint8Array(max);let size=0;
  let expired=false;const timer=setTimeout(()=>{expired=true;void reader.cancel('read_timeout');},30000);
  try{while(true){const {done,value}=await reader.read();if(done)break;if(size+value.length>max){await reader.cancel();throw new ApiFailure(413,'file_too_large');}bytes.set(value,size);size+=value.length;}if(expired)throw new ApiFailure(408,'body_timeout');if(!size)throw new ApiFailure(422,'empty_file');return bytes.slice(0,size).buffer;}finally{clearTimeout(timer);reader.releaseLock();}
}
function sniff(bytes:ArrayBuffer):string|null{const v=new Uint8Array(bytes);if(v.length>24&&[137,80,78,71,13,10,26,10].every((x,i)=>v[i]===x))return 'image/png';if(v.length>3&&v[0]===255&&v[1]===216&&v[2]===255)return 'image/jpeg';if(v.length>16&&String.fromCharCode(...v.slice(0,4))==='RIFF'&&String.fromCharCode(...v.slice(8,12))==='WEBP')return 'image/webp';return null;}
export async function handleMedia(request:Request,env:CatalogEnvironment,actor:Administrator,requestId:string,headers:Record<string,string>){
  if(!env.PRIVATE_MEDIA)throw new ApiFailure(503,'media_storage_unavailable');
  if(request.method==='GET'){const window=Math.floor(Date.now()/60000);const result=await env.DB.prepare('INSERT INTO media_read_limits VALUES (?,?,1) ON CONFLICT(principal_id,window_start) DO UPDATE SET attempts=attempts+1 WHERE attempts<300 RETURNING attempts').bind(actor.id,window).all();if(!result.results.length)throw new ApiFailure(429,'read_rate_limited');await env.DB.prepare('DELETE FROM media_read_limits WHERE window_start<?').bind(window-60).run();}
  const bucket=env.PRIVATE_MEDIA,url=new URL(request.url),match=url.pathname.match(/^\/api\/v1\/media\/([A-Za-z0-9_-]+)(?:\/([a-z]+))?$/);const id=match?identifier(match[1]!):'',action=match?.[2];
  const respond=(row:Record<string,unknown>,status=200)=>Response.json({media:dto(row)},{status,headers:{...headers,ETag:`"${row.version??1}"`}});
  if(request.method==='GET'&&!id){
    if([...url.searchParams.keys()].some(k=>k!=='cursor'))throw new ApiFailure(422,'invalid_query');const cursor=url.searchParams.get('cursor')??'';if(cursor)identifier(cursor);
    const result=await rows(env.DB,`SELECT a.*,p.version,p.validation_code FROM media_assets a LEFT JOIN media_processing p ON p.media_id=a.id WHERE a.id>? AND (a.uploaded_by=? OR ?=1) AND (a.state<>'deleted' OR p.deleted_at IS NULL) ORDER BY a.id LIMIT 51`,cursor,actor.id,manager(actor)?1:0);
    return Response.json({items:result.slice(0,50).map(dto),nextCursor:result.length>50?result[49]!.id:null},{headers});
  }
  if(request.method==='POST'&&!id){
    if([...url.searchParams.keys()].length)throw new ApiFailure(422,'invalid_query');
    const declared=request.headers.get('Content-Type')?.split(';')[0]??'';if(!(imagePolicy.allowedMimeTypes as readonly string[]).includes(declared)||env.DEV_IMAGE_INPUT_SHA256&&declared!=='image/png')throw new ApiFailure(415,'unsupported_mime');
    const window=Math.floor(Date.now()/3600000);const limit=await env.DB.prepare(`INSERT INTO media_upload_limits VALUES (?,?,1) ON CONFLICT(principal_id,window_start) DO UPDATE SET attempts=attempts+1 WHERE attempts<30 RETURNING attempts`).bind(actor.id,window).all();if(!limit.results.length)throw new ApiFailure(429,'upload_rate_limited');
    const configured=env.MEDIA_MAX_BYTES===undefined?imagePolicy.maxBytes:Number(env.MEDIA_MAX_BYTES);if(!Number.isSafeInteger(configured)||configured<1||configured>imagePolicy.maxBytes)throw new ApiFailure(503,'invalid_media_limit');const max=configured;
    if(Number(request.headers.get('Content-Length'))>max)throw new ApiFailure(413,'file_too_large');
    const bytes=await boundedBytes(request.body,max);if(sniff(bytes)!==declared)throw new ApiFailure(422,'mime_content_mismatch');
    const generated=crypto.randomUUID(),key=privateObjectKey(generated),global=await catalogVersion(env.DB);
    // Create a tracked quarantine record FIRST: even an ambiguous R2 failure leaves a cleanable row.
    await commit(env.DB,actor,'media:prepare',global,{sql:'1',values:[]},[
      env.DB.prepare("INSERT INTO media_assets(id,private_object_key,state,provenance,mime_type,byte_size,uploaded_by) VALUES (?,?,'quarantine','demo',?,?,?)").bind(generated,key,declared,bytes.byteLength,actor.id),
      env.DB.prepare("INSERT INTO media_processing(media_id,validation_code) VALUES (?,'upload_pending')").bind(generated),
    ],{action:'media.upload_started',entity:'media',id:generated,requestId});
    try{if(!await bucket.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'}}))throw new Error('collision');}catch{throw new ApiFailure(503,'media_storage_unavailable');}
    await validateMedia(env,actor,generated,1,bytes,requestId);
    return respond(await owned(env,actor,generated),201);
  }
  if([...url.searchParams.keys()].length)throw new ApiFailure(422,'invalid_query');
  const asset=await owned(env,actor,id);
  if(request.method==='GET'&&!action)return respond(asset);
  if(request.method==='GET'&&action==='preview'){
    if(!['validated','approved','retired'].includes(String(asset.state))||!asset.derivative_object_key)throw new ApiFailure(409,'private_preview_unavailable');
    const object=await bucket.get(String(asset.derivative_object_key));if(!object)throw new ApiFailure(503,'media_object_missing');const bytes=await object.arrayBuffer();
    if(bytes.byteLength>imagePolicy.maxBytes||await digest(bytes)!==asset.sha256)throw new ApiFailure(503,'media_integrity_failed');
    return new Response(bytes,{headers:{...headers,'Content-Type':'image/png','Content-Disposition':'inline; filename="preview.png"','Cross-Origin-Resource-Policy':'same-origin'}});
  }
  const input=record(await jsonBody(request),action==='approve'?['confirmUsageRights','confirmSelfApproval']:[]),version=expectedVersion(request);
  if(asset.version!==version)throw new ApiFailure(409,'version_or_state_conflict');
  if(action==='validate'){
    if(asset.state!=='quarantine')throw new ApiFailure(409,'invalid_state_transition');const object=await bucket.get(String(asset.private_object_key));if(!object)throw new ApiFailure(503,'media_object_missing');await validateMedia(env,actor,id,version,await object.arrayBuffer(),requestId);return respond(await owned(env,actor,id));
  }
  if(['approve','reject','retire','cleanup'].includes(action??'')&&!manager(actor))throw new ApiFailure(403,'forbidden');
  const to=action==='approve'?'approved':action==='reject'?'rejected':action==='retire'?'retired':action==='cleanup'?'deleted':null;
  if(!to||!(action==='cleanup'&&asset.state==='deleted')&&!canTransitionMedia(asset.state as Parameters<typeof canTransitionMedia>[0],to))throw new ApiFailure(409,'invalid_state_transition');
  const self=action==='approve'&&asset.uploaded_by===actor.id;
  if(action==='approve'&&(input.confirmUsageRights!==true||self&&(actor.role!=='super_admin'||input.confirmSelfApproval!==true)))throw new ApiFailure(403,'independent_usage_approval_required');
  if(action==='approve'){
    const object=asset.derivative_object_key?await bucket.get(String(asset.derivative_object_key)):null;if(!object||await digest(await object.arrayBuffer())!==asset.normalized_sha256)throw new ApiFailure(503,'media_integrity_failed');
  }
  const refs="EXISTS(SELECT 1 FROM revision_media WHERE media_id=?)";
  if((action==='retire'||action==='cleanup')&&(await rows(env.DB,`SELECT 1 FROM revision_media rm JOIN services s ON s.published_revision_id=rm.revision_id WHERE rm.media_id=? AND s.status='published'`,id)).length)throw new ApiFailure(409,'published_media_in_use');
  if(action==='cleanup'&&(Date.now()-Date.parse(String(asset.retired_at??asset.created_at))<30*86400000||(await rows(env.DB,`SELECT 1 FROM revision_media WHERE media_id=? LIMIT 1`,id)).length))throw new ApiFailure(409,'retention_or_history_reference');
  const global=await catalogVersion(env.DB);
  await commit(env.DB,actor,'services:publish',global,{sql:`EXISTS(SELECT 1 FROM media_processing WHERE media_id=? AND version=?) AND ${action==='cleanup'?`NOT ${refs}`:action==='retire'?"NOT EXISTS(SELECT 1 FROM revision_media rm JOIN services s ON s.published_revision_id=rm.revision_id WHERE rm.media_id=? AND s.status='published')":'1'}`,values:[id,version,...(['cleanup','retire'].includes(action??'')?[id]:[])]},[
    env.DB.prepare(`UPDATE media_assets SET approval_mode=CASE WHEN ?='approved' THEN ? ELSE approval_mode END,state=?,provenance=CASE WHEN ?='approved' THEN 'verified' ELSE provenance END,usage_approval=CASE WHEN ?='approved' THEN 'approved' ELSE usage_approval END,reviewed_by=CASE WHEN ?='approved' THEN ? ELSE reviewed_by END,reviewed_at=CASE WHEN ?='approved' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE reviewed_at END,retired_at=CASE WHEN ? IN ('retired','rejected') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE retired_at END WHERE id=?`).bind(to,self?'super_admin_self':'independent',to,to,to,to,actor.id,to,to,id),
    env.DB.prepare("UPDATE media_processing SET version=version+1,validation_code=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE media_id=?").bind(to,id),
  ],{action:self?'media.super_admin_self_approved':`media.${to}`,entity:'media',id,requestId});
  if(to==='deleted'){
    // Tombstone commits before deletion; no future association is permitted. Retry is an operator task if R2 fails.
    try{await bucket.delete(String(asset.private_object_key));await bucket.delete(`development/derived/${id}`);if(asset.derivative_object_key&&asset.derivative_object_key!==`development/derived/${id}`)await bucket.delete(String(asset.derivative_object_key));}catch{throw new ApiFailure(503,'media_cleanup_pending');}
    await env.DB.prepare("UPDATE media_processing SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE media_id=?").bind(id).run();
  }
  return respond(await owned(env,actor,id));
}
async function digest(bytes:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
async function validateMedia(env:CatalogEnvironment,actor:Administrator,id:string,version:number,bytes:ArrayBuffer,requestId:string){
  let normalized;
  try{
    if(env.IMAGE_PROCESSOR==='cloudflare-images-v1'){
      if(!env.DEV_IMAGE_INPUT_SHA256||await digest(bytes)!==env.DEV_IMAGE_INPUT_SHA256)throw new ApiFailure(403,'image_input_not_authorized');
      // Consume before contacting Images. Failure/timeout never restores this single-use authorization.
      const claim=await env.DB.prepare('INSERT INTO dev_image_transform_claim(id,media_id,input_sha256) VALUES (1,?,?) ON CONFLICT(id) DO NOTHING RETURNING id').bind(id,env.DEV_IMAGE_INPUT_SHA256).all();
      if(!claim.results.length)throw new ApiFailure(409,'image_transform_authorization_consumed');
    }
    normalized=await processImage(env,bytes);
  }catch(error){
    const failure=error instanceof ApiFailure?error:new ApiFailure(503,'image_processor_unavailable');
    await setValidation(env,actor,id,version,failure.status===422?'rejected':'quarantine',failure.code,requestId);
    throw failure;
  }
  if(!normalized){await setValidation(env,actor,id,version,'quarantine','decoder_unavailable',requestId);return;}
  const key=`development/derived/${id}`;
  const existing=await env.PRIVATE_MEDIA!.get(key);if(existing){if(await digest(await existing.arrayBuffer())!==normalized.hash)throw new ApiFailure(409,'media_integrity_failed');}else if(!await env.PRIVATE_MEDIA!.put(key,normalized.output,{onlyIf:{etagDoesNotMatch:'*'}}))throw new ApiFailure(409,'version_or_state_conflict');
  const global=await catalogVersion(env.DB);
  await commit(env.DB,actor,'media:prepare',global,{sql:"EXISTS(SELECT 1 FROM media_processing p JOIN media_assets a ON a.id=p.media_id WHERE media_id=? AND version=? AND a.state='quarantine')",values:[id,version]},[
    env.DB.prepare("UPDATE media_assets SET state='validated',derivative_object_key=?,sha256=?,mime_type='image/png',byte_size=?,width=?,height=? WHERE id=?").bind(key,normalized.hash,normalized.output.byteLength,normalized.width,normalized.height,id),
    env.DB.prepare("UPDATE media_processing SET version=version+1,normalized_sha256=?,validation_code=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE media_id=?").bind(normalized.hash,`${normalized.policy}/${normalized.processor}`,id),
  ],{action:'media.validated',entity:'media',id,requestId});
}
async function setValidation(env:CatalogEnvironment,actor:Administrator,id:string,version:number,state:string,code:string,requestId:string){
  await commit(env.DB,actor,'media:prepare',await catalogVersion(env.DB),{sql:'EXISTS(SELECT 1 FROM media_processing WHERE media_id=? AND version=?)',values:[id,version]},[
    env.DB.prepare('UPDATE media_assets SET state=? WHERE id=?').bind(state,id),env.DB.prepare('UPDATE media_processing SET version=version+1,validation_code=? WHERE media_id=?').bind(code,id),
  ],{action:`media.${state}`,entity:'media',id,requestId});
}
// Publication never copies originals. Only managed, approved, normalized bytes, addressed by digest.
export async function stagePublicMedia(env:CatalogEnvironment,catalog:{services:{media:{id:string;url:string}[]}[]}){
  for(const id of new Set(catalog.services.flatMap(s=>s.media.map(m=>m.id)))){
    const asset=(await rows(env.DB,"SELECT a.* FROM media_assets a JOIN media_processing p ON p.media_id=a.id WHERE a.id=? AND a.state='approved' AND a.usage_approval='approved' AND a.sha256=p.normalized_sha256",id))[0];
    if(!asset){const managed=await rows(env.DB,'SELECT 1 FROM media_processing WHERE media_id=?',id);if(managed.length)throw new Error('unapproved_media');continue;} // Legacy records are not promoted into the media pipeline.
    if(!env.PRIVATE_MEDIA||!env.PUBLICATION)throw new Error('media_binding_missing');
    const object=await env.PRIVATE_MEDIA.get(String(asset.derivative_object_key));if(!object)throw new Error('approved_media_missing');const bytes=await object.arrayBuffer();if(bytes.byteLength>imagePolicy.maxBytes||await digest(bytes)!==asset.sha256)throw new Error('approved_media_integrity_failed');
    const key=`media/${asset.sha256}`,existing=await env.PUBLICATION.get(key);
    if(existing){if(!existing.arrayBuffer||await digest(await existing.arrayBuffer())!==asset.sha256)throw new Error('public_media_integrity_failed');}
    else if(!await env.PUBLICATION.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'}}))throw new Error('concurrent_media_delivery');
  }
}

