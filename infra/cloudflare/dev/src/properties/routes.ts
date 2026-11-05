import type { Administrator, Permission } from '../auth/rbac.js';
import type { CatalogEnvironment } from '../catalog/types.js';
import { ApiFailure, expectedVersion, identifier, jsonBody, page, record } from '../catalog/input.js';
import { catalogVersion } from '../catalog/repository.js';
import { commit } from '../catalog/transaction.js';
import { propertyInput } from './input.js';
import { listProperties, loadProperty, publicProperty } from './repository.js';

export const propertyRoutes:readonly {method:string;pattern:RegExp;permission:Permission;action:string}[]=[
  {method:'GET',pattern:/^\/api\/v1\/properties$/,permission:'admin:read',action:'list'},
  {method:'GET',pattern:/^\/api\/v1\/properties\/([A-Za-z0-9_-]+)$/,permission:'admin:read',action:'get'},
  {method:'POST',pattern:/^\/api\/v1\/properties$/,permission:'drafts:write',action:'create'},
  {method:'PUT',pattern:/^\/api\/v1\/properties\/([A-Za-z0-9_-]+)$/,permission:'drafts:write',action:'edit'},
  ...(['publish','unpublish','archive'] as const).map(action=>({method:'POST',pattern:new RegExp('^/api/v1/properties/([A-Za-z0-9_-]+)/'+action+'$'),permission:('services:'+action) as Permission,action})),
];
export async function handleProperties(request:Request,env:CatalogEnvironment,actor:Administrator,requestId:string,headers:Record<string,string>) {
  const url=new URL(request.url),route=propertyRoutes.find(r=>r.method===request.method&&r.pattern.test(url.pathname))!;
  const id=url.pathname.match(route.pattern)?.[1];
  const respond=(doc:Awaited<ReturnType<typeof loadProperty>>,status=200)=>Response.json(doc,{status,headers:{...headers,ETag:`"${doc.version}"`}});
  if(route.action==='list'){const p=page(url);return Response.json(await listProperties(env.DB,p.limit,p.cursor),{headers});}
  if(route.action==='get')return respond(await loadProperty(env.DB,identifier(id!)));
  const value=await jsonBody(request);
  const version=route.action==='create'?undefined:expectedVersion(request);
  const catalog=await catalogVersion(env.DB);
  const propertyId=id?identifier(id):crypto.randomUUID();
  const loaded=id?await loadProperty(env.DB,propertyId):null;
  if(loaded&&loaded.version!==version)throw new ApiFailure(409,'version_or_state_conflict');
  const now=new Date().toISOString();
  const statements=[];
  if(route.action==='create'||route.action==='edit'){
    const input=propertyInput(value);
    if(loaded?.data.slugLocked&&input.slug!==loaded.data.slug)throw new ApiFailure(409,'property_slug_locked');
    const fields=['slug','kind','sort_order','location','max_guests','bedrooms','bathrooms','airbnb_url','show_on_landing','owner_name','owner_contact','internal_notes','updated_at','updated_by'];
    const args=[input.slug,input.kind,input.sortOrder,input.location,input.maxGuests,input.bedrooms,input.bathrooms,input.airbnbUrl,Number(input.showOnLanding),input.ownerName,input.ownerContact,input.internalNotes,now,actor.id];
    statements.push(route.action==='create'?
      env.DB.prepare(`INSERT INTO properties(id,${fields.join(',')}) VALUES (?,${fields.map(()=>'?').join(',')})`).bind(propertyId,...args):
      env.DB.prepare(`UPDATE properties SET ${fields.map(f=>f+'=?').join(',')},row_version=row_version+1 WHERE id=?`).bind(...args,propertyId));
    for(const locale of ['es','en'] as const){const t=input.translations[locale];statements.push(env.DB.prepare('INSERT INTO property_translations(property_id,locale,name,tagline,description) VALUES (?,?,?,?,?) ON CONFLICT(property_id,locale) DO UPDATE SET name=excluded.name,tagline=excluded.tagline,description=excluded.description').bind(propertyId,locale,t.name,t.tagline,t.description));}
  }else{
    record(value,[]);
    if(!loaded)throw new ApiFailure(404,'property_not_found');
    if(route.action==='publish'){
      const input=propertyInput(Object.fromEntries(['slug','kind','sortOrder','location','maxGuests','bedrooms','bathrooms','airbnbUrl','translations','showOnLanding','ownerName','ownerContact','internalNotes'].map(k=>[k,loaded.data[k as keyof typeof loaded.data]])));
      statements.push(env.DB.prepare("UPDATE properties SET status='published',published_json=?,published_visibility=?,published_at=?,published_by=?,slug_locked=1,updated_at=?,updated_by=?,row_version=row_version+1 WHERE id=?")
        .bind(JSON.stringify(publicProperty(input)),Number(input.showOnLanding),now,actor.id,now,actor.id,propertyId));
    }else{
      statements.push(env.DB.prepare('UPDATE properties SET status=?,published_json=NULL,published_visibility=0,updated_at=?,updated_by=?,row_version=row_version+1 WHERE id=?')
        .bind(route.action==='archive'?'archived':'draft',now,actor.id,propertyId));
    }
  }
  await commit(env.DB,actor,route.permission,catalog,loaded?{sql:'EXISTS(SELECT 1 FROM properties WHERE id=? AND row_version=?)',values:[propertyId,version]}:{sql:'1',values:[]},statements,
    {action:'property.'+route.action,entity:'property',id:propertyId,requestId});
  return respond(await loadProperty(env.DB,propertyId),route.action==='create'?201:200);
}
