import type { Administrator, Permission } from '../auth/rbac.js';
import type { CatalogEnvironment } from './types.js';
import { ApiFailure, expectedVersion, identifier, jsonBody, page, record } from './input.js';
import { loadService, categories, working, rows } from './repository.js';
import { createDraft, editDraft, listServices, revisions } from './services.js';
import { saveCategory } from './categories.js';
import { approve, changePublication, checkPublication } from './publication.js';
import { deliverCatalog,reconciliationMetrics } from './delivery.js';
import { commit } from './transaction.js';
import { catalogVersion } from './repository.js';
import publicCatalogWorker from '../public.js';
import barrierWorker from '../barrier.js';
type Endpoint={method:string;pattern:RegExp;permission:Permission;action:string};
export const catalogRoutes:readonly Endpoint[]=[
  {method:'GET',pattern:/^\/api\/v1\/catalog\/preview$/,permission:'admin:read',action:'public-preview'},
  {method:'GET',pattern:/^\/api\/v1\/services$/,permission:'admin:read',action:'list'},
  {method:'POST',pattern:/^\/api\/v1\/services$/,permission:'drafts:write',action:'create'},
  {method:'GET',pattern:/^\/api\/v1\/services\/([A-Za-z0-9_-]+)$/,permission:'admin:read',action:'get'},
  {method:'PATCH',pattern:/^\/api\/v1\/services\/([A-Za-z0-9_-]+)$/,permission:'drafts:write',action:'edit'},
  {method:'PATCH',pattern:/^\/api\/v1\/services\/([A-Za-z0-9_-]+)\/translations$/,permission:'translations:write',action:'translations'},
  {method:'GET',pattern:/^\/api\/v1\/services\/([A-Za-z0-9_-]+)\/revisions$/,permission:'admin:read',action:'revisions'},
  {method:'GET',pattern:/^\/api\/v1\/services\/([A-Za-z0-9_-]+)\/revisions\/([A-Za-z0-9_-]+)$/,permission:'admin:read',action:'revision'},
  {method:'POST',pattern:/^\/api\/v1\/services\/([A-Za-z0-9_-]+)\/validate$/,permission:'services:publish',action:'validate'},
  {method:'POST',pattern:/^\/api\/v1\/services\/([A-Za-z0-9_-]+)\/approve$/,permission:'services:publish',action:'approve'},
  {method:'POST',pattern:/^\/api\/v1\/services\/([A-Za-z0-9_-]+)\/publish$/,permission:'services:publish',action:'publish'},
  {method:'POST',pattern:/^\/api\/v1\/services\/([A-Za-z0-9_-]+)\/unpublish$/,permission:'services:unpublish',action:'unpublish'},
  {method:'POST',pattern:/^\/api\/v1\/services\/([A-Za-z0-9_-]+)\/archive$/,permission:'services:archive',action:'archive'},
  {method:'GET',pattern:/^\/api\/v1\/categories$/,permission:'admin:read',action:'categories'},
  {method:'GET',pattern:/^\/api\/v1\/categories\/([A-Za-z0-9_-]+)$/,permission:'admin:read',action:'category'},
  {method:'POST',pattern:/^\/api\/v1\/categories$/,permission:'drafts:write',action:'category-create'},
  {method:'PATCH',pattern:/^\/api\/v1\/categories\/([A-Za-z0-9_-]+)$/,permission:'drafts:write',action:'category-edit'},
  {method:'POST',pattern:/^\/api\/v1\/catalog\/sync$/,permission:'services:publish',action:'sync'},
  {method:'GET',pattern:/^\/api\/v1\/catalog\/status$/,permission:'audit:read',action:'status'},
];
export async function handleCatalog(request:Request,env:CatalogEnvironment,actor:Administrator,requestId:string,headers:Record<string,string>):Promise<Response> {
  const url=new URL(request.url);const route=catalogRoutes.find(r=>r.method===request.method&&r.pattern.test(url.pathname));if(!route)throw new ApiFailure(404,'not_found');
  const match=url.pathname.match(route.pattern)!;const id=match[1]?identifier(match[1]):'';
  const respond=(value:unknown,version?:number,status=200)=>Response.json(value,{status,headers:{...headers,...(version?{ETag:`"${version}"`}:{})}});
  const adminResponse=(loaded:Awaited<ReturnType<typeof loadService>>,status=200)=>respond({data:loaded.admin,version:loaded.version},loaded.version,status);
  if(route.action==='public-preview'){
    if(!env.PUBLICATION)throw new ApiFailure(503,'catalog_unavailable');
    const projected=await publicCatalogWorker.fetch(new Request('https://catalog.internal/v1/catalog'),{APP_ENV:'development',PUBLICATION:env.PUBLICATION,CATALOG_BARRIER:{fetch:request=>barrierWorker.fetch(request,{APP_ENV:'development',DB:env.DB})}});
    return new Response(projected.body,{status:projected.status,headers:{...headers,'Content-Type':'application/json'}});
  }
  if(route.action==='list')return respond(await listServices(env.DB,page(url)));
  if(route.action==='get')return adminResponse(await loadService(env.DB,id));
  if(route.action==='revisions')return respond(await revisions(env.DB,id,page(url)));
  if(route.action==='revision'){
    const revisionId=identifier(match[2]!);const loaded=await loadService(env.DB,id,revisionId);
    const revision=loaded.admin.revisions.find(r=>r.id===revisionId);if(!revision)throw new ApiFailure(404,'revision_not_found');return respond({revision});
  }
  if(route.action==='categories')return respond({items:await categories(env.DB)});
  if(route.action==='status')return respond(await reconciliationMetrics(env.DB));
  if(route.action==='category'){const category=(await categories(env.DB)).find(c=>c.category.id===id);if(!category)throw new ApiFailure(404,'category_not_found');return respond(category,category.version);}
  const input=await jsonBody(request);
  if(route.action==='sync'){
    const options=record(input,['retryEscalated']);if(options.retryEscalated!==undefined&&options.retryEscalated!==true)throw new ApiFailure(422,'explicit_retry_required');
    if(options.retryEscalated===true){
      await commit(env.DB,actor,'services:publish',await catalogVersion(env.DB),{sql:'1',values:[]},[
        env.DB.prepare("UPDATE publication_outbox SET delivery_state='pending',retry_count=0,next_attempt_at=0,lease_until=0,lease_token=NULL WHERE delivery_state='escalated' AND epoch=(SELECT epoch FROM publication_control WHERE id=1) AND generation=(SELECT generation FROM publication_control WHERE id=1)"),
      ],{action:'catalog.retry_authorized',entity:'catalog',id:'current',requestId});
    }
    const visible=await deliverCatalog(env.DB,env.PUBLICATION,Date.now(),env);
    return respond({delivery:visible?'visible':'pending',synchronization:await reconciliationMetrics(env.DB)},undefined,visible?200:202);
  }
  if(route.action==='category-create'){const result=await saveCategory(env.DB,actor,input,requestId);return respond(result,result.version,201);}
  if(route.action==='category-edit'){const result=await saveCategory(env.DB,actor,input,requestId,id,expectedVersion(request));return respond(result,result.version);}
  if(route.action==='create')return adminResponse(await createDraft(env.DB,actor,input,requestId),201);
  const version=expectedVersion(request);
  if(route.action==='edit')return adminResponse(await editDraft(env.DB,actor,id,version,input,requestId));
  if(route.action==='translations'){
    const patch=record(input,['translations']);const current=await loadService(env.DB,id);const revision=working(current);
    return adminResponse(await editDraft(env.DB,actor,id,version,{slug:revision.slug,categoryId:revision.categoryId,translations:patch.translations,options:revision.options,
      media:revision.media.map(({id,sortOrder,alt})=>({id,sortOrder,alt})),internalNotes:current.admin.internalNotes},requestId,'translations:write'));
  }
  if(route.action==='approve')return adminResponse(await approve(env,actor,id,version,input,requestId));
  if(route.action==='validate'){
    // Preview readiness without inventing/persisting a commercial approval.
    const value=record(input,['revisionId']);const checked=await checkPublication(env,id,version,{...value,confirmCommercialApproval:true},true);
    const sealed=checked.loaded.revisions.find(r=>r.id===checked.revisionId)!.sealed_at!==null;
    return respond({contentValid:true,sealed,readyForIndependentApproval:!sealed});
  }
  if(['publish','unpublish','archive'].includes(route.action)){
    const result=await changePublication(env,actor,id,version,input,route.action as 'publish'|'unpublish'|'archive',requestId);
    return respond({data:result.loaded.admin,version:result.loaded.version,delivery:result.delivery,synchronization:result.synchronization,...('withdrawal'in result?{withdrawal:result.withdrawal}:{})},result.loaded.version,result.status);
  }
  throw new ApiFailure(404,'not_found');
}
export async function auditPage(db:CatalogEnvironment['DB'],url:URL) {
  const paging=page(url);const result=await rows(db,'SELECT id,actor_id AS actorId,action,entity_type AS entityType,entity_id AS entityId,revision_id AS revisionId,request_id AS requestId,outcome,created_at AS createdAt FROM audit_events WHERE id>? ORDER BY id LIMIT ?',paging.cursor,paging.limit+1);
  return {items:result.slice(0,paging.limit),nextCursor:result.length>paging.limit?result[paging.limit-1]!.id:null};
}
