import type { Administrator } from '../auth/rbac.js';
import type { CatalogEnvironment } from './types.js';
import { loadService, catalogVersion, categories, type LoadedService } from './repository.js';
import { ApiFailure, record, identifier } from './input.js';
import { commit, type Condition } from './transaction.js';
import { publicationReadiness, projectCatalog } from './projection.js';
import { deliverCatalog,snapshotText } from './delivery.js';
import { publicationHead,sha256 } from './head.js';

function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';
  return JSON.stringify(value);
}
async function contentHash(loaded:LoadedService,revisionId:string):Promise<string> {
  const revision=loaded.admin.revisions.find(r=>r.id===revisionId)!;
  const content={slug:revision.slug,categoryId:revision.categoryId,translations:revision.translations,options:revision.options,
    media:revision.media.map(({id,url,sortOrder,alt})=>({id,url,sortOrder,alt}))};
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(content)));
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function prerequisites(loaded:LoadedService,id:string,version:number,revisionId:string,categoryVersion:number):Condition {
  const clauses=[`EXISTS(SELECT 1 FROM services WHERE id=? AND row_version=? AND working_revision_id=? AND status<>'archived')`,
    `EXISTS(SELECT 1 FROM categories WHERE id=? AND row_version=? AND active=1)`];
  const revision=loaded.admin.revisions.find(r=>r.id===revisionId)!;
  const values:unknown[]=[id,version,revisionId,revision.categoryId,categoryVersion];
  for(const m of loaded.media.filter(m=>m.revision_id===revisionId)){
    clauses.push("EXISTS(SELECT 1 FROM media_assets WHERE id=? AND state='approved' AND provenance='verified' AND usage_approval='approved' AND sha256=? AND derivative_object_key=?)");
    values.push(m.id,m.sha256,m.derivative_object_key);
  }
  return {sql:clauses.join(' AND '),values};
}
export async function checkPublication(env:CatalogEnvironment,id:string,version:number,input:unknown,approving:boolean) {
  const row=record(input,approving?['revisionId','confirmCommercialApproval','confirmSelfApproval']:['revisionId']);
  if(typeof row.revisionId!=='string')throw new ApiFailure(422,'revision_required');identifier(row.revisionId);
  if(approving&&row.confirmCommercialApproval!==true)throw new ApiFailure(422,'explicit_commercial_confirmation_required');
  const loaded=await loadService(env.DB,id);
  if(loaded.version!==version)throw new ApiFailure(409,'version_or_state_conflict');
  if(loaded.admin.service.status==='archived')throw new ApiFailure(409,'archived_service');
  if(loaded.admin.service.workingRevisionId!==row.revisionId)throw new ApiFailure(409,'working_revision_required');
  const candidate=await publicationReadiness(env.DB,loaded,row.revisionId,approving);
  const category=(await categories(env.DB)).find(c=>c.category.id===candidate.admin.revisions.find(r=>r.id===row.revisionId)!.categoryId)!;
  if(!approving&&!loaded.approvals.some(a=>a.revision_id===row.revisionId&&a.category_version===category.version))throw new ApiFailure(422,'approval_stale');
  return {loaded:candidate,revisionId:row.revisionId,categoryVersion:category.version};
}
export async function approve(env:CatalogEnvironment,actor:Administrator,id:string,version:number,input:unknown,requestId:string) {
  const global=await catalogVersion(env.DB);const checked=await checkPublication(env,id,version,input,true);
  const source=checked.loaded.revisions.find(r=>r.id===checked.revisionId)!;
  const self=source.created_by===actor.id;
  if(self&&(actor.role!=='super_admin'||record(input,['revisionId','confirmCommercialApproval','confirmSelfApproval']).confirmSelfApproval!==true))throw new ApiFailure(403,'independent_approval_required');
  if(source.sealed_at!==null)throw new ApiFailure(409,'revision_already_sealed');
  const hash=await contentHash(checked.loaded,checked.revisionId);
  const condition=prerequisites(checked.loaded,id,version,checked.revisionId,checked.categoryVersion);
  await commit(env.DB,actor,'services:publish',global,condition,[
    env.DB.prepare("UPDATE service_revisions SET content_hash=?,sealed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND sealed_at IS NULL").bind(hash,checked.revisionId),
    env.DB.prepare('INSERT INTO commercial_approvals(id,revision_id,content_hash,approved_by,category_version,approval_mode) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),checked.revisionId,hash,actor.id,checked.categoryVersion,self?'super_admin_self':'independent'),
    env.DB.prepare("UPDATE services SET provenance='verified',row_version=row_version+1,modified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(id),
  ],{action:self?'service.super_admin_self_approved':'service.commercially_approved',entity:'service',id,revision:checked.revisionId,requestId});
  return loadService(env.DB,id);
}
export async function changePublication(env:CatalogEnvironment,actor:Administrator,id:string,version:number,input:unknown,
  action:'publish'|'unpublish'|'archive',requestId:string) {
  const global=await catalogVersion(env.DB);let loaded=await loadService(env.DB,id);
  if(loaded.version!==version)throw new ApiFailure(409,'version_or_state_conflict');
  const state=loaded.admin.service.status;
  if(state==='archived'||(action==='unpublish'&&state!=='published'))throw new ApiFailure(409,'invalid_state_transition');
  let condition:Condition={sql:"EXISTS(SELECT 1 FROM services WHERE id=? AND row_version=? AND status=?)",values:[id,version,state]};
  let revisionId=loaded.admin.service.publishedRevisionId;
  if(action==='publish'){
    const checked=await checkPublication(env,id,version,input,false);loaded=checked.loaded;revisionId=checked.revisionId;
    if(loaded.admin.service.publishedRevisionId===revisionId&&state==='published')throw new ApiFailure(409,'revision_already_published');
    const source=loaded.revisions.find(r=>r.id===revisionId)!;
    if(!source.sealed_at||source.content_hash!==await contentHash(loaded,revisionId))throw new ApiFailure(422,'revision_hash_mismatch');
    condition=prerequisites(loaded,id,version,revisionId,checked.categoryVersion);
    condition.sql+=` AND EXISTS(SELECT 1 FROM commercial_approvals a JOIN principals p ON p.id=a.approved_by
      JOIN administrator_roles ar ON ar.principal_id=p.id WHERE a.revision_id=? AND a.content_hash=? AND a.revoked_at IS NULL
      AND a.category_version=? AND p.enabled=1 AND ar.role_id IN ('admin','super_admin'))`;
    condition.values.push(revisionId,source.content_hash,checked.categoryVersion);
    loaded.admin.service.publishedRevisionId=revisionId;loaded.admin.service.status='published';
  }else{
    record(input,[]);loaded.admin.service.status=action==='archive'?'archived':'draft';
    if(action==='unpublish')loaded.admin.service.publishedRevisionId=null;
  }
  const catalog=await projectCatalog(env.DB,loaded);const command=crypto.randomUUID();
  const head=await publicationHead(env.DB);const payloadHash=await sha256(snapshotText(head.epoch,global+1,catalog));
  condition.sql+=" AND EXISTS(SELECT 1 FROM publication_control WHERE id=1 AND mode='ready' AND epoch=?)";condition.values.push(head.epoch);
  const permission=action==='publish'?'services:publish':action==='archive'?'services:archive':'services:unpublish';
  await commit(env.DB,actor,permission,global,condition,[
    env.DB.prepare("UPDATE services SET status=?,published_revision_id=?,row_version=row_version+1,modified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(loaded.admin.service.status,loaded.admin.service.publishedRevisionId,id),
    env.DB.prepare('INSERT INTO publication_commands(id,service_id,actor_id,idempotency_key,action,expected_version) VALUES (?,?,?,?,?,?)').bind(command,id,actor.id,requestId,action,version),
    env.DB.prepare('INSERT INTO publication_outbox(generation,command_id,catalog_json,epoch,payload_hash) VALUES (?,?,?,?,?)').bind(global+1,command,JSON.stringify(catalog),head.epoch,payloadHash),
    env.DB.prepare('UPDATE publication_control SET generation=?,payload_hash=? WHERE id=1').bind(global+1,payloadHash),
  ],{action:`service.${action}`,entity:'service',id,...(revisionId?{revision:revisionId}:{}),requestId});
  const delivered=await deliverCatalog(env.DB,env.PUBLICATION,Date.now(),env);
  const effective=await publicationHead(env.DB);const superseded=effective.epoch!==head.epoch||effective.generation!==global+1;
  const complete=delivered&&!superseded;
  return {loaded:await loadService(env.DB,id),delivery:superseded?'superseded':complete?'visible':'pending',status:complete?200:202,
    synchronization:{epoch:head.epoch,generation:global+1,state:superseded?'superseded':complete?'confirmed':'pending'},
    ...(['unpublish','archive'].includes(action)?{withdrawal:{state:superseded?'superseded':complete?'confirmed':'materialization_pending',readBarrier:'required'}}:{})};
}
