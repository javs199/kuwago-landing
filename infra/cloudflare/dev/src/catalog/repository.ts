import { AdminServiceSchema, CategorySchema } from '../../../../../packages/contracts/src/admin.js';
import type { AdminService, ServiceRevision, ServiceOption, Category } from '../../../../../packages/contracts/src/models.js';
import type { CatalogDatabase } from './types.js';
import { ApiFailure } from './input.js';

export type Row = Record<string,unknown>;
export async function rows(db:CatalogDatabase,query:string,...args:unknown[]):Promise<Row[]> {
  const result=await db.prepare(query).bind(...args).all<Row>();if(!result.success)throw new ApiFailure(503,'database_unavailable');return result.results;
}
export async function catalogVersion(db:CatalogDatabase):Promise<number> {
  const row=(await rows(db,'SELECT version FROM catalog_state WHERE id=1'))[0];
  if(!row||!Number.isSafeInteger(row.version))throw new ApiFailure(503,'catalog_unavailable');return row.version as number;
}
export async function categories(db:CatalogDatabase):Promise<{category:Category;version:number}[]> {
  const result=await db.batch([
    db.prepare('SELECT * FROM categories ORDER BY id LIMIT 1001'),
    db.prepare('SELECT * FROM category_translations ORDER BY category_id,locale LIMIT 2002'),
  ]);
  const values=result[0]!.results;const translations=result[1]!.results;
  if(values.length>1000)throw new ApiFailure(503,'catalog_capacity_exceeded');
  return values.map(row=>({version:row.row_version as number,category:CategorySchema.parse({id:row.id,slug:row.slug,active:row.active===1,
    translations:Object.fromEntries(translations.filter(t=>t.category_id===row.id).map(t=>[t.locale,{name:t.name}]))})}));
}
export type LoadedService = {admin:AdminService;version:number;media:Row[];revisions:Row[];approvals:Row[]};
export async function loadService(db:CatalogDatabase,id:string,extraRevision=''):Promise<LoadedService> {
  const selected=`SELECT id FROM service_revisions WHERE service_id=? AND
    (id IN (SELECT working_revision_id FROM services WHERE id=?) OR id IN (SELECT published_revision_id FROM services WHERE id=?) OR id=?)`;
  const select=(query:string)=>db.prepare(query).bind(id,id,id,extraRevision);
  const result=await db.batch([
    db.prepare('SELECT * FROM services WHERE id=?').bind(id),
    select(`SELECT * FROM service_revisions WHERE id IN (${selected}) ORDER BY number`),
    select(`SELECT * FROM service_translations WHERE revision_id IN (${selected})`),
    select(`SELECT * FROM service_options WHERE revision_id IN (${selected}) ORDER BY sort_order`),
    select(`SELECT * FROM option_translations WHERE revision_id IN (${selected})`),
    select(`SELECT * FROM option_prices WHERE revision_id IN (${selected})`),
    select(`SELECT rm.revision_id,rm.sort_order,ma.* FROM revision_media rm JOIN media_assets ma ON ma.id=rm.media_id WHERE rm.revision_id IN (${selected}) ORDER BY rm.sort_order`),
    select(`SELECT * FROM revision_media_translations WHERE revision_id IN (${selected})`),
    select(`SELECT * FROM commercial_approvals WHERE revision_id IN (${selected}) AND revoked_at IS NULL`),
    select(`SELECT * FROM revision_discounts WHERE revision_id IN (${selected})`),
  ]);
  const data=result.map(r=>r.results);const s=data.shift()![0];
  if(!s)throw new ApiFailure(404,'service_not_found');
  return hydrateService(s,data);
}
export function hydrateService(s:Row,[revisions,translations,options,names,prices,media,alts,approvals,discounts]:Row[][]):LoadedService {
  const mapped=revisions!.map(r=>{
    const optionRows=options!.filter(o=>o.revision_id===r.id).map(o=>{
      const p=prices!.find(p=>p.revision_id===r.id&&p.option_id===o.option_id);
      return {id:o.option_id,translations:Object.fromEntries(names!.filter(n=>n.revision_id===r.id&&n.option_id===o.option_id).map(n=>[n.locale,{name:n.name}])),
        durationMinutes:o.duration_minutes,experienceType:o.experience_type,venue:o.venue,
        price:p?{kind:p.kind,currency:p.currency,unit:p.unit,...(p.kind==='quote'?{}:{amountMinor:p.amount_minor})}:null} as ServiceOption;
    });
    return {id:r.id,serviceId:r.service_id,number:r.number,createdAt:r.created_at,slug:r.slug,categoryId:r.category_id,
      translations:Object.fromEntries(translations!.filter(t=>t.revision_id===r.id).map(t=>[t.locale,{title:t.title,description:t.description}])),
      options:optionRows,media:media!.filter(m=>m.revision_id===r.id).map(m=>({id:m.id,url:`/api/v1/media/${m.id}`,sortOrder:m.sort_order,
        provenance:m.provenance,usageApproval:m.usage_approval,alt:Object.fromEntries(alts!.filter(a=>a.revision_id===r.id&&a.media_id===m.id).map(a=>[a.locale,a.alt_text]))})),
      discount:(d=>d?{percent:d.percent,startsOn:d.starts_on,endsOn:d.ends_on}:null)((discounts??[]).find(d=>d.revision_id===r.id)),
      commercialApproval:{status:approvals!.some(a=>a.revision_id===r.id)?'approved':'pending',revisionId:approvals!.some(a=>a.revision_id===r.id)?r.id:null}};
  });
  return {version:s.row_version as number,revisions:revisions!,media:media!,approvals:approvals!,admin:AdminServiceSchema.parse({
    service:{id:s.id,provenance:s.provenance,status:s.status,workingRevisionId:s.working_revision_id,publishedRevisionId:s.published_revision_id,modifiedAt:s.modified_at},
    internalNotes:s.internal_notes,revisions:mapped})};
}
export function working(loaded:LoadedService):ServiceRevision {
  return loaded.admin.revisions.find(r=>r.id===loaded.admin.service.workingRevisionId)!;
}
