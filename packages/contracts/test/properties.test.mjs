import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicPropertiesSchema, PublicPropertySchema } from '../dist/public.js';
import { PropertyInputSchema, AdminPropertySchema, publicProperty } from '../dist/admin.js';
const dto={slug:'villa-maya',kind:'managed',sortOrder:0,location:null,maxGuests:null,bedrooms:null,bathrooms:2.5,airbnbUrl:null,translations:{es:{name:'Villa Maya',tagline:'Administrada',description:''},en:{name:'Villa Maya',tagline:'Managed',description:''}}};
test('property contracts separate public projection and private working input',()=>{
  const input={...dto,showOnLanding:true,ownerName:'private',ownerContact:'private',internalNotes:'private'};
  assert.ok(PropertyInputSchema.safeParse(input).success);assert.deepEqual(publicProperty(input),dto);
  assert.ok(PublicPropertySchema.safeParse(dto).success);assert.ok(PublicPropertiesSchema.safeParse({properties:[dto]}).success);
  for(const k of ['ownerName','ownerContact','internalNotes','owner_name','contact'])assert.equal(PublicPropertySchema.safeParse({...dto,[k]:'secret'}).success,false);
  assert.equal(PublicPropertiesSchema.safeParse({properties:[dto,dto]}).success,false);
  const admin={...input,id:'test-property',status:'published',slugLocked:true,hasUnpublishedChanges:false,updatedAt:'2026-11-05T12:00:00Z',updatedBy:null,publishedAt:'2026-11-05T12:00:00Z',publishedBy:null};assert.ok(AdminPropertySchema.safeParse(admin).success);
  const accessActor='access:'+'b'.repeat(64);assert.ok(AdminPropertySchema.safeParse({...admin,updatedBy:accessActor,publishedBy:accessActor}).success);
  for(const actor of ['',' ','x'.repeat(201),42])assert.equal(AdminPropertySchema.safeParse({...admin,updatedBy:actor}).success,false);
  for(const patch of [{bathrooms:1.3},{slug:'a'},{sortOrder:-1},{ownerName:'x'.repeat(251)},{airbnbUrl:'https://www.airbnb.com.evil/rooms/123'},{translations:{es:dto.translations.es}}])assert.equal(PropertyInputSchema.safeParse({...input,...patch}).success,false);
});
