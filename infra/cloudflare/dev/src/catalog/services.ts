import type { D1Statement } from '../auth/types.js';
import type { Administrator } from '../auth/rbac.js';
import type { CatalogDatabase } from './types.js';
import { draftInput, ApiFailure, type DraftInput, type PageInput } from './input.js';
import { loadService, catalogVersion, working, rows } from './repository.js';
import { commit } from './transaction.js';

function revisionStatements(db:CatalogDatabase,serviceId:string,revisionId:string,number:number,input:DraftInput,actor:string):D1Statement[] {
  const statements=[db.prepare(`INSERT INTO service_revisions(id,service_id,number,slug,category_id,created_by) VALUES (?,?,?,?,?,?)`)
    .bind(revisionId,serviceId,number,input.slug,input.categoryId,actor)];
  for(const locale of ['es','en'] as const)statements.push(db.prepare('INSERT INTO service_translations VALUES (?,?,?,?)').bind(revisionId,locale,input.translations[locale].title,input.translations[locale].description));
  input.options.forEach((option,index)=>{
    statements.push(db.prepare('INSERT INTO option_identities(id,service_id) VALUES (?,?) ON CONFLICT(id) DO NOTHING').bind(option.id,serviceId),
      db.prepare('INSERT INTO service_options(revision_id,service_id,option_id,sort_order,duration_minutes,experience_type,venue) VALUES (?,?,?,?,?,?,?)')
        .bind(revisionId,serviceId,option.id,index,option.durationMinutes,option.experienceType,option.venue));
    for(const locale of ['es','en'] as const)statements.push(db.prepare('INSERT INTO option_translations VALUES (?,?,?,?)').bind(revisionId,option.id,locale,option.translations[locale].name));
    if(option.price)statements.push(db.prepare('INSERT INTO option_prices VALUES (?,?,?,?,?,?)').bind(revisionId,option.id,option.price.kind,option.price.kind==='quote'?null:option.price.amountMinor,option.price.currency,option.price.unit));
  });
  if(input.discount)statements.push(db.prepare('INSERT INTO revision_discounts(revision_id,percent,starts_on,ends_on) VALUES (?,?,?,?)')
    .bind(revisionId,input.discount.percent,input.discount.startsOn,input.discount.endsOn));
  for(const media of input.media){
    statements.push(db.prepare('INSERT INTO revision_media VALUES (?,?,?)').bind(revisionId,media.id,media.sortOrder));
    for(const locale of ['es','en'] as const)statements.push(db.prepare('INSERT INTO revision_media_translations VALUES (?,?,?,?)').bind(revisionId,media.id,locale,media.alt[locale]));
  }
  return statements;
}
async function authorizeMedia(db:CatalogDatabase,actor:Administrator,data:DraftInput,previous?:Awaited<ReturnType<typeof loadService>>){
  const retained=new Set(previous?working(previous).media.map(m=>m.id):[]);
  for(const media of data.media){
    const asset=(await rows(db,'SELECT * FROM media_assets WHERE id=?',media.id))[0];
    if(!asset||['deleted','retired','rejected'].includes(String(asset.state))||(!retained.has(media.id)&&asset.uploaded_by!==actor.id&&!actor.permissions.includes('services:publish')))throw new ApiFailure(404,'media_not_found');
  }
}
export async function createDraft(db:CatalogDatabase,actor:Administrator,input:unknown,requestId:string) {
  const data=draftInput(input);const globalVersion=await catalogVersion(db);await authorizeMedia(db,actor,data);const id=crypto.randomUUID();const revisionId=crypto.randomUUID();
  await commit(db,actor,'drafts:write',globalVersion,{sql:'1',values:[]},[
    // Local drafts have no commercially verified provenance until independent explicit approval.
    db.prepare("INSERT INTO services(id,provenance,working_revision_id,internal_notes) VALUES (?,'demo',?,?)").bind(id,revisionId,data.internalNotes),
    ...revisionStatements(db,id,revisionId,1,data,actor.id),
  ],{action:'service.draft_created',entity:'service',id,revision:revisionId,requestId});
  return loadService(db,id);
}
export async function editDraft(db:CatalogDatabase,actor:Administrator,id:string,version:number,input:unknown,requestId:string,permission:'drafts:write'|'translations:write'='drafts:write') {
  const data=draftInput(input);const globalVersion=await catalogVersion(db);const previous=await loadService(db,id);
  await authorizeMedia(db,actor,data,previous);
  if(previous.version!==version)throw new ApiFailure(409,'version_or_state_conflict');
  if(previous.admin.service.status==='archived')throw new ApiFailure(409,'archived_service');
  const revisionId=crypto.randomUUID();
  await commit(db,actor,permission,globalVersion,{sql:"EXISTS(SELECT 1 FROM services WHERE id=? AND row_version=? AND status<>'archived')",values:[id,version]},[
    ...revisionStatements(db,id,revisionId,working(previous).number+1,data,actor.id),
    db.prepare("UPDATE services SET working_revision_id=?,internal_notes=?,row_version=row_version+1,modified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(revisionId,data.internalNotes,id),
  ],{action:'service.draft_revised',entity:'service',id,revision:revisionId,requestId});
  return loadService(db,id);
}
export async function listServices(db:CatalogDatabase,page:PageInput) {
  const escaped=page.q.replace(/[\\%_]/g,'\\$&');
  const result=await rows(db,`SELECT s.id,s.status,s.provenance,s.row_version AS version,s.modified_at AS modifiedAt,
    r.id AS revisionId,s.published_revision_id AS publishedRevisionId,r.category_id AS categoryId,r.slug,
    (SELECT title FROM service_translations WHERE revision_id=r.id AND locale='es') AS titleEs,
    (SELECT title FROM service_translations WHERE revision_id=r.id AND locale='en') AS titleEn
    FROM services s JOIN service_revisions r ON r.id=s.working_revision_id
    WHERE s.id>? AND (?='' OR EXISTS(SELECT 1 FROM service_translations t WHERE t.revision_id=r.id AND t.title LIKE ? ESCAPE '\\'))
    ORDER BY s.id LIMIT ?`,page.cursor,page.q,`%${escaped}%`,page.limit+1);
  const items=result.slice(0,page.limit);
  const pricing=items.length?await rows(db,`SELECT o.revision_id,o.option_id,p.kind,p.amount_minor,p.currency,p.unit FROM service_options o
    LEFT JOIN option_prices p ON p.revision_id=o.revision_id AND p.option_id=o.option_id WHERE o.revision_id IN (${items.map(()=>'?').join(',')}) ORDER BY o.sort_order`,...items.map(i=>i.revisionId)):[];
  return {items:items.map(item=>({...item,prices:pricing.filter(p=>p.revision_id===item.revisionId).map(p=>({optionId:p.option_id,price:p.kind?{kind:p.kind,currency:p.currency,unit:p.unit,...(p.kind==='quote'?{}:{amountMinor:p.amount_minor})}:null}))})),nextCursor:result.length>page.limit?result[page.limit-1]!.id:null};
}
export async function revisions(db:CatalogDatabase,id:string,page:PageInput) {
  await loadService(db,id);
  const list=await rows(db,'SELECT id,number,created_at AS createdAt,sealed_at AS sealedAt FROM service_revisions WHERE service_id=? AND id>? ORDER BY id LIMIT ?',id,page.cursor,page.limit+1);
  return {items:list.slice(0,page.limit),nextCursor:list.length>page.limit?list[page.limit-1]!.id:null};
}
