import { AdminPropertySchema, publicProperty } from '../../../../../packages/contracts/src/admin.js';
import { PublicPropertiesSchema } from '../../../../../packages/contracts/src/public.js';
import type { CatalogDatabase } from '../catalog/types.js';
import { rows, type Row } from '../catalog/repository.js';
import { ApiFailure } from '../catalog/input.js';

function hydrate(row: Row, translations: Row[]) {
  const current = {
    slug:row.slug, kind:row.kind, sortOrder:row.sort_order, location:row.location,
    maxGuests:row.max_guests, bedrooms:row.bedrooms, bathrooms:row.bathrooms, airbnbUrl:row.airbnb_url,
    translations:Object.fromEntries(['es','en'].map(locale=>{const t=translations.find(t=>t.property_id===row.id&&t.locale===locale);return [locale,{name:t?.name,tagline:t?.tagline,description:t?.description}];})),
  };
  const changed = row.published_json === null || JSON.stringify(current) !== JSON.stringify(JSON.parse(row.published_json as string));
  return {version:row.row_version as number, data:AdminPropertySchema.parse({
    ...current, id:row.id, status:row.status, showOnLanding:row.show_on_landing===1,
    ownerName:row.owner_name, ownerContact:row.owner_contact, internalNotes:row.internal_notes,
    updatedAt:row.updated_at, updatedBy:row.updated_by, publishedAt:row.published_at, publishedBy:row.published_by,
    slugLocked:row.slug_locked===1, hasUnpublishedChanges:changed || row.published_visibility !== row.show_on_landing,
  })};
}
export async function loadProperty(db:CatalogDatabase,id:string) {
  const result=await db.batch([
    db.prepare('SELECT * FROM properties WHERE id=?').bind(id),
    db.prepare('SELECT * FROM property_translations WHERE property_id=? ORDER BY locale').bind(id),
  ]);
  if(result.some(r=>!r.success)) throw new ApiFailure(503,'database_unavailable');
  const row=result[0]!.results[0]; if(!row) throw new ApiFailure(404,'property_not_found');
  return hydrate(row,result[1]!.results);
}
export async function listProperties(db:CatalogDatabase,limit:number,cursor:string) {
  const result=await db.batch([
    db.prepare('SELECT * FROM properties WHERE id>? ORDER BY id LIMIT ?').bind(cursor,limit+1),
    db.prepare('SELECT * FROM property_translations WHERE property_id IN (SELECT id FROM properties WHERE id>? ORDER BY id LIMIT ?)').bind(cursor,limit+1),
  ]);
  if(result.some(r=>!r.success))throw new ApiFailure(503,'database_unavailable');
  const values=result[0]!.results;
  return {items:values.slice(0,limit).map(r=>hydrate(r,result[1]!.results)),nextCursor:values.length>limit?values[limit-1]!.id:null};
}
export async function publishedProperties(db:CatalogDatabase) {
  const primary=db.withSession?.('first-primary')??db;
  const values=await rows(primary,"SELECT published_json FROM properties WHERE status='published' AND published_visibility=1 ORDER BY json_extract(published_json,'$.sortOrder'),slug LIMIT 1001");
  // Validate the strict allowlist before crossing the private binding boundary.
  return PublicPropertiesSchema.parse({properties:values.map(r=>JSON.parse(r.published_json as string))});
}
export { publicProperty };
