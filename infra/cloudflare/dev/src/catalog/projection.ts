import { projectPublicCatalog, validateForPublication } from '../../../../../packages/contracts/src/admin.js';
import type { PublicCatalog } from '../../../../../packages/contracts/src/models.js';
import { categories, hydrateService, type LoadedService } from './repository.js';
import type { CatalogDatabase } from './types.js';
import { ApiFailure } from './input.js';
export function publicReady(loaded:LoadedService,revisionId:string):LoadedService {
  const copy=structuredClone(loaded);const revision=copy.admin.revisions.find(r=>r.id===revisionId);
  if(!revision)throw new ApiFailure(422,'revision_not_found');
  for(const media of revision.media){
    const record=copy.media.find(m=>m.id===media.id&&m.revision_id===revisionId);
    if(!record||record.state!=='approved'||record.provenance!=='verified'||record.usage_approval!=='approved'||
      typeof record.sha256!=='string'||!/^[a-f0-9]{64}$/.test(record.sha256)||typeof record.derivative_object_key!=='string'||!record.derivative_object_key.startsWith('development/derived/'))throw new ApiFailure(422,'image_not_approved');
    media.url=`/v1/media/${record.sha256}`;
  }
  return copy;
}
export async function publicationReadiness(db:CatalogDatabase,loaded:LoadedService,revisionId:string,approving=false):Promise<LoadedService> {
  const candidate=publicReady(loaded,revisionId);const revision=candidate.admin.revisions.find(r=>r.id===revisionId)!;
  if(revision.media.length&&!revision.media.some(m=>m.sortOrder===0))throw new ApiFailure(422,'main_image_required');
  if(approving){candidate.admin.service.provenance='verified';revision.commercialApproval={status:'approved',revisionId};}
  const issues=validateForPublication(candidate.admin,revisionId,(await categories(db)).map(c=>c.category));
  if(issues.length)throw new ApiFailure(422,'publication_requirements_incomplete');return candidate;
}
export async function projectCatalog(db:CatalogDatabase,override?:LoadedService):Promise<PublicCatalog> {
  // Fixed-count batched reads: no per-service N+1 and no private working drafts in this projection.
  const selected="SELECT published_revision_id FROM services WHERE status='published' AND provenance='verified'";
  const result=await db.batch([
    db.prepare("SELECT id,provenance,status,published_revision_id AS working_revision_id,published_revision_id,modified_at,row_version,'' AS internal_notes FROM services WHERE status='published' AND provenance='verified' ORDER BY id LIMIT 1001"),
    db.prepare(`SELECT * FROM service_revisions WHERE id IN (${selected})`),
    db.prepare(`SELECT * FROM service_translations WHERE revision_id IN (${selected})`),
    db.prepare(`SELECT * FROM service_options WHERE revision_id IN (${selected}) ORDER BY sort_order`),
    db.prepare(`SELECT * FROM option_translations WHERE revision_id IN (${selected})`),
    db.prepare(`SELECT * FROM option_prices WHERE revision_id IN (${selected})`),
    db.prepare(`SELECT rm.revision_id,rm.sort_order,ma.* FROM revision_media rm JOIN media_assets ma ON ma.id=rm.media_id WHERE rm.revision_id IN (${selected})`),
    db.prepare(`SELECT * FROM revision_media_translations WHERE revision_id IN (${selected})`),
    db.prepare(`SELECT * FROM commercial_approvals WHERE revision_id IN (${selected}) AND revoked_at IS NULL`),
  ]);
  const all=result.map(r=>r.results);const services=all.shift()!;
  if(services.length>1000)throw new ApiFailure(422,'catalog_capacity_exceeded');
  const grouped=all.map((table,index)=>{
    const map=new Map<unknown,typeof table>();
    for(const row of table){const key=index===0?row.id:row.revision_id;const group=map.get(key)??[];group.push(row);map.set(key,group);}return map;
  });
  const loaded=services.filter(s=>s.id!==override?.admin.service.id).map(s=>{
    const data=grouped.map(group=>group.get(s.published_revision_id)??[]);
    return publicReady(hydrateService(s,data),s.published_revision_id as string).admin;
  });
  if(override?.admin.service.status==='published')loaded.push(publicReady(override,override.admin.service.publishedRevisionId!).admin);
  const catalog=projectPublicCatalog(loaded,(await categories(db)).map(c=>c.category));
  const used=new Set(catalog.services.map(s=>s.categoryId));catalog.categories=catalog.categories.filter(c=>used.has(c.id));
  if(new TextEncoder().encode(JSON.stringify(catalog)).length>1_048_576)throw new ApiFailure(422,'catalog_capacity_exceeded');
  return catalog;
}
