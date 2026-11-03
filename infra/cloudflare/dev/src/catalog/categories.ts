import type { Administrator } from '../auth/rbac.js';
import type { CatalogDatabase } from './types.js';
import { categories, catalogVersion } from './repository.js';
import { categoryInput, ApiFailure } from './input.js';
import { commit } from './transaction.js';
export async function saveCategory(db:CatalogDatabase,actor:Administrator,input:unknown,requestId:string,id?:string,version?:number) {
  const key=id??crypto.randomUUID();const data=categoryInput(input,key);const globalVersion=await catalogVersion(db);
  if(!id&&(await categories(db)).length>=1000)throw new ApiFailure(422,'catalog_capacity_exceeded');
  const statements=[];
  if(id){
    const existing=(await categories(db)).find(row=>row.category.id===id);
    if(!existing)throw new ApiFailure(404,'category_not_found');
    if(existing.version!==version)throw new ApiFailure(409,'version_or_state_conflict');
    statements.push(db.prepare('UPDATE categories SET slug=?,active=?,row_version=row_version+1 WHERE id=?').bind(data.slug,data.active?1:0,key));
    for(const locale of ['es','en'] as const)statements.push(db.prepare('UPDATE category_translations SET name=? WHERE category_id=? AND locale=?').bind(data.translations[locale].name,key,locale));
  }else{
    statements.push(db.prepare('INSERT INTO categories(id,slug,active) VALUES (?,?,?)').bind(key,data.slug,data.active?1:0));
    for(const locale of ['es','en'] as const)statements.push(db.prepare('INSERT INTO category_translations VALUES (?,?,?)').bind(key,locale,data.translations[locale].name));
  }
  await commit(db,actor,'drafts:write',globalVersion,id?{sql:`EXISTS(SELECT 1 FROM categories WHERE id=? AND row_version=?) AND NOT EXISTS(
      SELECT 1 FROM services s JOIN service_revisions r ON r.id=s.published_revision_id WHERE s.status='published' AND r.category_id=?)`,values:[key,version,key]}:{sql:'1',values:[]},statements,
    {action:id?'category.updated':'category.created',entity:'category',id:key,requestId});
  return (await categories(db)).find(row=>row.category.id===key)!;
}
