import {AdminServiceSchema,CategorySchema,ServiceRevisionSchema,ServicePriceSchema,type AdminService,type Category,type ServiceRevision,type ServiceDiscount} from '@kuwago/contracts';
import {AdminPropertySchema, type AdminProperty, type PropertyInput} from '@kuwago/contracts';
export type PropertyDocument={data:AdminProperty;version:number};
function propertyDocument(value:unknown,response?:Response):PropertyDocument{
  const row=object(value),version=integer(row.version),data=AdminPropertySchema.parse(row.data);
  if(version<1||response&&etag(response)!==`"${version}"`)throw new ApiError(502,'invalid_response');
  return {data,version};
}
export type MediaDocument={id:string;state:'quarantine'|'validated'|'approved'|'rejected'|'retired'|'deleted';version:number;validationCode:string;mimeType:string|null;width:number|null;height:number|null;byteSize:number|null;usageApproval:'pending'|'approved';uploadedBy:string};
function mediaDocument(value:unknown):MediaDocument{const row=object(value);if(integer(row.version)<1)throw new ApiError(502,'invalid_response');if(!['quarantine','validated','approved','rejected','retired','deleted'].includes(text(row.state))||!['pending','approved'].includes(text(row.usageApproval)))throw new ApiError(502,'invalid_response');return {id:text(row.id),state:row.state as MediaDocument['state'],version:integer(row.version),validationCode:text(row.validationCode),mimeType:row.mimeType===null?null:text(row.mimeType),width:row.width===null?null:integer(row.width),height:row.height===null?null:integer(row.height),byteSize:row.byteSize===null?null:integer(row.byteSize),usageApproval:row.usageApproval as MediaDocument['usageApproval'],uploadedBy:text(row.uploadedBy)};}
function mediaEnvelope(value:unknown,response:Response):MediaDocument{const result=mediaDocument(object(value).media);if(etag(response)!==`"${result.version}"`)throw new ApiError(502,'invalid_response');return result;}
export type Permission='admin:read'|'drafts:write'|'translations:write'|'services:publish'|'services:unpublish'|'services:archive'|'audit:read'|'media:prepare'|'media:read-private'|'admins:manage';
export type Identity={id:string;role:'editor'|'admin'|'super_admin';permissions:Permission[]};
export type DraftInput=Pick<ServiceRevision,'slug'|'categoryId'|'translations'|'options'>&{discount:ServiceDiscount|null;internalNotes:string;media:Pick<ServiceRevision['media'][number],'id'|'sortOrder'|'alt'>[]};
export type ServiceDocument={data:AdminService;version:number;delivery?:'visible'|'pending'|'superseded';synchronization?:{epoch:string;generation:number;state:string}};
export type CategoryDocument={category:Category;version:number};
export type ServiceSummary={id:string;status:'draft'|'published'|'archived';version:number;modifiedAt:string;categoryId:string|null;titleEs:string;titleEn:string;slug:string;prices:{optionId:string;price:unknown}[]};
export type RevisionSummary={id:string;number:number;createdAt:string;sealedAt:string|null};
export type SyncStatus={epoch:string;mode:'ready'|'paused';generation:number|null;pendingCount:number;quarantinedCount:number;oldestPendingMs:number;escalatedCount:number;items:{generation:number;delivery_state:string;lastErrorCode:string|null}[]};
export class ApiError extends Error{constructor(public status:number,public code:string){super(code);}}
// Cloudflare weakens ETags (W/"n") when it compresses a response; the version is the same.
function etag(response:Response):string|null{const value=response.headers.get('ETag');return value?.startsWith('W/')?value.slice(2):value;}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError(502,'invalid_response');return value as Record<string,unknown>;}
function text(value:unknown):string{if(typeof value!=='string')throw new ApiError(502,'invalid_response');return value;}
function integer(value:unknown):number{if(!Number.isSafeInteger(value)||(value as number)<0)throw new ApiError(502,'invalid_response');return value as number;}
function date(value:unknown):string{const result=text(value);if(!Number.isFinite(Date.parse(result)))throw new ApiError(502,'invalid_response');return result;}
function array(value:unknown):unknown[]{if(!Array.isArray(value))throw new ApiError(502,'invalid_response');return value;}
const roles=['editor','admin','super_admin'];
const permissions:Permission[]=['admin:read','drafts:write','translations:write','services:publish','services:unpublish','services:archive','audit:read','media:prepare','media:read-private','admins:manage'];
function identity(value:unknown):Identity{const row=object(object(value).administrator);if(!roles.includes(text(row.role)))throw new ApiError(502,'invalid_response');const grants=array(row.permissions).map(text);if(grants.some(p=>!permissions.includes(p as Permission)))throw new ApiError(502,'invalid_response');return {id:text(row.id),role:row.role as Identity['role'],permissions:grants as Permission[]};}
function document(value:unknown,response:Response):ServiceDocument{
  const row=object(value);const parsed=AdminServiceSchema.safeParse(row.data);const version=integer(row.version);
  if(!parsed.success||version<1||etag(response)!==`"${version}"`)throw new ApiError(502,'invalid_response');
  if(row.delivery!==undefined&&!['visible','pending','superseded'].includes(text(row.delivery)))throw new ApiError(502,'invalid_response');
  const result:ServiceDocument={data:parsed.data,version};
  if(row.delivery!==undefined)result.delivery=row.delivery as NonNullable<ServiceDocument['delivery']>;
  if(row.synchronization!==undefined){const sync=object(row.synchronization);result.synchronization={epoch:text(sync.epoch),generation:integer(sync.generation),state:text(sync.state)};}
  if(response.status===202&&!['pending','superseded'].includes(result.delivery??''))throw new ApiError(502,'invalid_response');
  return result;
}
function category(value:unknown):CategoryDocument{const row=object(value);const version=integer(row.version);const parsed=CategorySchema.safeParse(row.category);if(!parsed.success||version<1)throw new ApiError(502,'invalid_response');return {category:parsed.data,version};}
function syncStatus(value:unknown):SyncStatus{
  const row=object(value);if(!['ready','paused'].includes(text(row.mode)))throw new ApiError(502,'invalid_response');
  return {epoch:text(row.epoch),mode:row.mode as SyncStatus['mode'],generation:row.generation===null?null:integer(row.generation),pendingCount:integer(row.pendingCount),quarantinedCount:integer(row.quarantinedCount),oldestPendingMs:integer(row.oldestPendingMs),escalatedCount:integer(row.escalatedCount),items:array(row.items).map(value=>{const item=object(value);return {generation:integer(item.generation),delivery_state:text(item.delivery_state),lastErrorCode:item.lastErrorCode===null?null:text(item.lastErrorCode)};})};
}
function cursor(value:unknown):string|null{if(value===null)return null;return text(value);}
const segment=(id:string)=>{if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id))throw new ApiError(422,'invalid_identifier');return id;};
export class AdminClient{
  properties(cursorValue='',signal?:AbortSignal){return this.request('/properties'+(cursorValue?'?cursor='+encodeURIComponent(cursorValue):''),value=>{const row=object(value);return {items:array(row.items).map(v=>propertyDocument(v)),nextCursor:cursor(row.nextCursor)};},{signal});}
  property(id:string,signal?:AbortSignal){return this.request('/properties/'+segment(id),propertyDocument,{signal});}
  saveProperty(input:PropertyInput,id?:string,version?:number){return this.request('/properties'+(id?'/'+segment(id):''),propertyDocument,{method:id?'PUT':'POST',body:input,version});}
  publishProperty(id:string,action:'publish'|'unpublish'|'archive',version:number){return this.request('/properties/'+segment(id)+'/'+action,propertyDocument,{method:'POST',body:{},version});}
  constructor(private fetcher:typeof fetch=(...args)=>globalThis.fetch(...args)){}
  private async request<T>(path:string,decode:(value:unknown,response:Response)=>T,{method='GET',body,rawBody,version,signal}:{method?:string;body?:unknown;rawBody?:File;version?:number|undefined;signal?:AbortSignal|undefined}={}):Promise<T>{
    for(let attempt=0;attempt<2;attempt++){
      const timeout=new AbortController();const timer=setTimeout(()=>timeout.abort(),rawBody?40000:10000);
      const abort=()=>timeout.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      try{
        const response=await this.fetcher('/api/v1'+path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:timeout.signal,headers:{Accept:'application/json','X-Kuwago-Request':'1',...(rawBody?{'Content-Type':rawBody.type}:body!==undefined?{'Content-Type':'application/json'}:{}),...(version!==undefined?{'If-Match':`"${version}"`}:{})},...(rawBody?{body:rawBody}:body!==undefined?{body:JSON.stringify(body)}:{})});
        if(!response.ok){
          if(method==='GET'&&attempt===0&&[502,503,504].includes(response.status))continue;
          let code='request_failed';try{const row=object(await response.json());if(typeof row.error==='string'&&/^[a-z0-9_]{1,80}$/.test(row.error))code=row.error;}catch{/* Do not echo arbitrary HTML or diagnostics. */}
          throw new ApiError(response.status,code);
        }
        if(!response.headers.get('Content-Type')?.includes('application/json'))throw new ApiError(502,'invalid_response');
        try{return decode(await response.json(),response);}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(502,'invalid_response');}
      }catch(error){
        if(signal?.aborted)throw new ApiError(0,'cancelled');
        if(error instanceof ApiError)throw error;
        if(method==='GET'&&attempt===0)continue;
        throw new ApiError(0,timeout.signal.aborted?'timeout':'network');
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    }
    throw new ApiError(0,'network');
  }
  mediaList(cursorValue='',signal?:AbortSignal){return this.request('/media'+(cursorValue?'?cursor='+encodeURIComponent(cursorValue):''),value=>{const row=object(value);return {items:array(row.items).map(mediaDocument),nextCursor:cursor(row.nextCursor)};},{signal});}
  uploadMedia(file:File,signal?:AbortSignal){return this.request('/media',mediaEnvelope,{method:'POST',rawBody:file,signal});}
  mediaAction(id:string,action:'validate'|'approve'|'reject'|'retire'|'cleanup',version:number,signal?:AbortSignal,selfApproval=false){return this.request('/media/'+segment(id)+'/'+action,mediaEnvelope,{method:'POST',body:action==='approve'?{confirmUsageRights:true,...(selfApproval?{confirmSelfApproval:true}:{})}:{},version,signal});}
  session(signal?:AbortSignal){return this.request('/session',identity,{signal});}
  list(cursorValue='',signal?:AbortSignal){return this.request('/services?limit=100'+(cursorValue?'&cursor='+encodeURIComponent(cursorValue):''),value=>{
    const row=object(value);return {nextCursor:cursor(row.nextCursor),items:array(row.items).map(value=>{const item=object(value);if(!['draft','published','archived'].includes(text(item.status)))throw new ApiError(502,'invalid_response');const prices=array(item.prices).map(value=>{const price=object(value);if(price.price!==null&&!ServicePriceSchema.safeParse(price.price).success)throw new ApiError(502,'invalid_response');return {optionId:text(price.optionId),price:price.price};});return {id:text(item.id),status:item.status as ServiceSummary['status'],version:integer(item.version),modifiedAt:date(item.modifiedAt),categoryId:item.categoryId===null?null:text(item.categoryId),titleEs:text(item.titleEs),titleEn:text(item.titleEn),slug:text(item.slug),prices};})};
  },{signal});}
  get(id:string,signal?:AbortSignal){return this.request('/services/'+segment(id),document,{signal});}
  categories(signal?:AbortSignal){return this.request('/categories',value=>array(object(value).items).map(category),{signal});}
  saveCategory(input:Omit<Category,'id'>,id?:string,version?:number,signal?:AbortSignal){return this.request('/categories'+(id?'/'+segment(id):''),category,{method:id?'PATCH':'POST',body:input,version,signal});}
  save(input:DraftInput,id?:string,version?:number,signal?:AbortSignal){return this.request('/services'+(id?'/'+segment(id):''),document,{method:id?'PATCH':'POST',body:input,version,signal});}
  revisions(id:string,cursorValue='',signal?:AbortSignal){return this.request('/services/'+segment(id)+'/revisions?limit=100'+(cursorValue?'&cursor='+encodeURIComponent(cursorValue):''),value=>{const row=object(value);return {nextCursor:cursor(row.nextCursor),items:array(row.items).map(value=>{const r=object(value);return {id:text(r.id),number:integer(r.number),createdAt:date(r.createdAt),sealedAt:r.sealedAt===null?null:date(r.sealedAt)};})};},{signal});}
  revision(id:string,revisionId:string,signal?:AbortSignal){return this.request('/services/'+segment(id)+'/revisions/'+segment(revisionId),value=>ServiceRevisionSchema.parse(object(value).revision),{signal});}
  validate(id:string,revisionId:string,version:number,signal?:AbortSignal){return this.request('/services/'+segment(id)+'/validate',value=>{const row=object(value);if(typeof row.contentValid!=='boolean'||typeof row.sealed!=='boolean'||typeof row.readyForIndependentApproval!=='boolean')throw new ApiError(502,'invalid_response');return row;},{method:'POST',body:{revisionId},version,signal});}
  transition(id:string,action:'approve'|'publish'|'unpublish'|'archive',revisionId:string,version:number,signal?:AbortSignal,selfApproval=false){return this.request('/services/'+segment(id)+'/'+action,document,{method:'POST',body:action==='approve'?{revisionId,confirmCommercialApproval:true,...(selfApproval?{confirmSelfApproval:true}:{})}:action==='publish'?{revisionId}:{},version,signal});}
  status(signal?:AbortSignal){return this.request('/catalog/status',syncStatus,{signal});}
  sync(retryEscalated=false,signal?:AbortSignal){return this.request('/catalog/sync',value=>{const row=object(value);if(!['visible','pending'].includes(text(row.delivery)))throw new ApiError(502,'invalid_response');return {delivery:row.delivery as 'visible'|'pending',synchronization:syncStatus(row.synchronization)};},{method:'POST',body:retryEscalated?{retryEscalated:true}:{},signal});}
}
export const adminApi=new AdminClient();
export function draftFromDocument(doc:ServiceDocument):DraftInput{
  const revision=doc.data.revisions.find(r=>r.id===doc.data.service.workingRevisionId)!;
  return {slug:revision.slug,categoryId:revision.categoryId,translations:structuredClone(revision.translations),options:structuredClone(revision.options),discount:revision.discount?structuredClone(revision.discount):null,internalNotes:doc.data.internalNotes,media:revision.media.map(({id,sortOrder,alt})=>({id,sortOrder,alt:structuredClone(alt)}))};
}
export function newDraft():DraftInput{return {slug:'',categoryId:null,translations:{es:{title:'',description:''},en:{title:'',description:''}},internalNotes:'',options:[{id:crypto.randomUUID(),translations:{es:{name:''},en:{name:''}},durationMinutes:null,experienceType:'private',venue:'in_property',price:{kind:'quote',currency:null,unit:'service'}}],discount:null,media:[]};}

