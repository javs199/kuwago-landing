import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createWorker } from '../.wrangler/build/worker.js';
import publicWorker from '../.wrangler/build/public.js';
import { localDatabase, seedAdministrators, signingFixture, issuer, audience, origin, localBarrier } from './auth-fixtures.mjs';
import { PublicPropertySchema, PublicPropertiesSchema } from '../../../../packages/contracts/dist/public.js';
import { PropertyInputSchema } from '../../../../packages/contracts/dist/admin.js';

const inputFrom=p=>Object.fromEntries(['slug','kind','sortOrder','location','maxGuests','bedrooms','bathrooms','airbnbUrl','translations','showOnLanding','ownerName','ownerContact','internalNotes'].map(k=>[k,structuredClone(p[k])]));
test('properties: seed, contracts, authorization, snapshots, privacy and mutation guards',async t=>{
  const {mf,db}=await localDatabase();
  try{
    await seedAdministrators(db);
    const key=await signingFixture();
    const worker=createWorker(async()=>Response.json({keys:[key.publicJwk]}),()=>{});
    const env={APP_ENV:'development',DB:db,ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin,MUTATIONS_ENABLED:'true'};
    async function call(method,path='',body,version,subject='subject-admin',overrides={},headers={}){
      const response=await worker.fetch(new Request(origin+'/api/v1/properties'+path,{method,headers:{'Cf-Access-Jwt-Assertion':await key.token(subject),Origin:origin,'Content-Type':'application/json','X-Kuwago-Request':'1',...(version?{'If-Match':`"${version}"`}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),{...env,...overrides});
      return {status:response.status,body:await response.json(),headers:response.headers};
    }
    const pub=()=>publicWorker.fetch(new Request('https://public.test.invalid/v1/properties',{headers:{Origin:'https://landing.test.invalid'}}),{APP_ENV:'development',PUBLICATION:{},CATALOG_BARRIER:localBarrier(db),ALLOWED_ORIGINS:'https://landing.test.invalid'});
    let list,id,input,doc;
    await t.test('0009 hashes intact, exact existing texts and NULL unknown fields',async()=>{
      const manifest=JSON.parse(readFileSync(new URL('../../../../packages/database/migrations.sha256.json',import.meta.url)));
      for(const m of manifest.migrations)assert.equal(createHash('sha256').update(readFileSync(new URL('../../../../packages/database/migrations/'+m.file,import.meta.url))).digest('hex'),m.sha256);
      list=(await call('GET')).body.items;assert.equal(list.length,5);
      assert.equal(list.filter(p=>p.data.status==='published').length,4);
      assert.equal(list.find(p=>p.data.slug==='casa-cielo').data.status,'draft');
      assert.equal(list.find(p=>p.data.slug==='casa-cielo').data.showOnLanding,false);
      for(const {data:p} of list){for(const k of ['location','maxGuests','bedrooms','bathrooms','airbnbUrl','ownerName','ownerContact','internalNotes'])assert.equal(p[k],null);if(p.status==='published')assert.equal(p.hasUnpublishedChanges,false);}
      const response=await pub();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://landing.test.invalid');
      const body=PublicPropertiesSchema.parse(await response.json());assert.deepEqual(body.properties.map(p=>p.slug),['carabao-villa','villa-maya','casa-bella-mia','casa-heliconia']);
      assert.equal(body.properties[0].translations.es.tagline,'Propiedad administrada');assert.equal(body.properties[0].translations.en.tagline,'Managed Property');
      doc=list.find(p=>p.data.slug==='villa-maya');id=doc.data.id;input=inputFrom(doc.data);
    });
    await t.test('public contract excludes private fields and input rejects unsafe Airbnb/numbers/unknown metadata',async()=>{
      const publicDto=(await (await pub()).json()).properties[0];
      for(const k of ['ownerName','owner_name','ownerContact','contact','internalNotes','id'])assert.equal(PublicPropertySchema.safeParse({...publicDto,[k]:'private'}).success,false);
      assert.equal(PublicPropertiesSchema.safeParse({properties:[publicDto,publicDto]}).success,false);
      for(const patch of [{airbnbUrl:'https://www.airbnb.com.evil/rooms/1'},{airbnbUrl:'https://www.airbnb.evil/rooms/1'},{airbnbUrl:'http://www.airbnb.com/rooms/1'},{airbnbUrl:'https://user@www.airbnb.com/rooms/1'},{bathrooms:1.2},{bedrooms:-1},{maxGuests:1.5},{sortOrder:-1},{slug:'Bad Slug'},{status:'published'},{translations:{es:input.translations.es}}]){
        assert.equal(PropertyInputSchema.safeParse({...input,...patch}).success,false);
        assert.equal((await call('PUT','/'+id,{...input,...patch},doc.version)).status,422);
      }
      assert.equal(PropertyInputSchema.safeParse({...input,bathrooms:2.5,airbnbUrl:'https://www.airbnb.co.cr/rooms/12345'}).success,true);
    });
    await t.test('auth, origin, feature switch and version enforced before mutation',async()=>{
      assert.equal((await call('PUT','/'+id,input,doc.version,'subject-admin',{MUTATIONS_ENABLED:'false'})).status,501);
      assert.equal((await call('PUT','/'+id,input,doc.version,'subject-admin',{}, {Origin:'https://evil.invalid'})).status,403);
      assert.equal((await call('PUT','/'+id,input)).status,428);
      assert.equal((await call('PUT','/'+id,input,999)).status,409);
      assert.equal((await call('GET','/missing')).status,404);
      assert.equal((await call('GET','',undefined,undefined,'subject-disabled')).status,403);
    });
    await t.test('edit published working data, snapshot immutable until publish, editor forbidden/admin allowed',async()=>{
      const before=await (await pub()).text();
      input={...input,sortOrder:0,ownerName:'PRIVATE OWNER',ownerContact:'PRIVATE CONTACT',internalNotes:'PRIVATE NOTES',translations:{...input.translations,es:{...input.translations.es,name:'Villa Maya editada'}}};
      doc=(await call('PUT','/'+id,input,doc.version,'subject-editor')).body;
      assert.equal(doc.version,2);assert.equal(doc.data.hasUnpublishedChanges,true);
      assert.equal(await (await pub()).text(),before);
      assert.equal((await call('POST','/'+id+'/publish',{},doc.version,'subject-editor')).status,403);
      const published=await call('POST','/'+id+'/publish',{},doc.version);assert.equal(published.status,200);doc=published.body;
      assert.equal(doc.data.hasUnpublishedChanges,false);
      const publicBody=await (await pub()).text();assert.match(publicBody,/Villa Maya editada/);
      assert.doesNotMatch(publicBody,/owner|contact|internalNotes|PRIVATE/i);
      const snapshot=(await db.prepare('SELECT published_json FROM properties WHERE id=?').bind(id).first()).published_json;
      assert.doesNotMatch(snapshot,/owner|contact|internalNotes|PRIVATE/i);PublicPropertySchema.parse(JSON.parse(snapshot));
      assert.equal((await call('PUT','/'+id,{...input,slug:'different-slug'},doc.version)).status,409);
    });
    await t.test('working visibility waits for publish, unpublish/archive withdraw and slug remains locked',async()=>{
      doc=(await call('PUT','/'+id,{...input,showOnLanding:false},doc.version)).body;
      assert.equal((await (await pub()).json()).properties.length,4);assert.equal(doc.data.hasUnpublishedChanges,true);
      doc=(await call('POST','/'+id+'/publish',{},doc.version)).body;
      assert.equal((await (await pub()).json()).properties.length,3);assert.equal(doc.data.hasUnpublishedChanges,false);
      doc=(await call('POST','/'+id+'/unpublish',{},doc.version)).body;assert.equal(doc.data.status,'draft');
      assert.equal((await call('PUT','/'+id,{...input,slug:'cannot-change'},doc.version)).status,409);
      doc=(await call('PUT','/'+id,{...input,showOnLanding:true},doc.version)).body;
      doc=(await call('POST','/'+id+'/publish',{},doc.version)).body;
      assert.equal((await (await pub()).json()).properties.length,4);
      doc=(await call('POST','/'+id+'/archive',{},doc.version)).body;assert.equal(doc.data.status,'archived');assert.equal((await (await pub()).json()).properties.length,3);
    });
    await t.test('create draft, pagination, duplicate slug and current DB permission guard',async()=>{
      const created=await call('POST','',{...input,slug:'new-property'},undefined,'subject-editor');assert.equal(created.status,201);assert.equal(created.body.data.status,'draft');
      assert.equal((await call('POST','',{...input,slug:'new-property'})).status,409);
      const first=await worker.fetch(new Request(origin+'/api/v1/properties?limit=2',{headers:{'Cf-Access-Jwt-Assertion':await key.token('subject-admin')}}),env);const page=await first.json();assert.equal(page.items.length,2);assert.ok(page.nextCursor);
      await db.prepare("UPDATE publication_control SET mode='paused'").run();assert.equal((await call('PUT','/'+id,input,doc.version)).status,409);
      await db.prepare("UPDATE publication_control SET mode='ready'").run();
      await db.prepare("DELETE FROM admin_role_permissions WHERE role_id='admin' AND permission='services:publish'").run();
      assert.equal((await call('POST','/'+id+'/publish',{},doc.version)).status,403);
      const audits=await db.prepare("SELECT action,entity_type FROM audit_events WHERE entity_type='property'").all();assert.ok(audits.results.length>=8);assert.ok(audits.results.every(a=>a.action.startsWith('property.')));
    });
    await t.test('public boundary rejects corrupt/private snapshots, method/query and absent binding',async()=>{
      const p=list[0];await db.prepare("UPDATE properties SET published_json=json_set(published_json,'$.ownerName','private') WHERE id=?").bind(p.data.id).run();assert.equal((await pub()).status,503);
      for(const [method,path,status] of [['POST','/v1/properties',405],['GET','/v1/properties?owner=true',422],['GET','/v1/unknown',404]]){
        const response=await publicWorker.fetch(new Request('https://public.test.invalid'+path,{method}),{APP_ENV:'development',PUBLICATION:{},CATALOG_BARRIER:localBarrier(db)});assert.equal(response.status,status);
      }
      assert.equal((await publicWorker.fetch(new Request('https://public.test.invalid/v1/properties'),{APP_ENV:'development',PUBLICATION:{}})).status,503);
    });
  }finally{await mf.dispose();}
});
