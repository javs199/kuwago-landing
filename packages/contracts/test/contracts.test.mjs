import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdminServiceSchema, CategorySchema, MediaAssetSchema, PublicationStatusSchema, ServicePriceSchema, ServiceRevisionSchema, ServiceTranslationSchema, PublicCatalogSchema, PublicCatalogServiceSchema, projectPublicCatalog, validateForPublication } from '../dist/index.js';

// Synthetic contract fixtures only. Never included in the public build.
const category = () => ({id:'wellness',slug:'wellness',active:true,translations:{es:{name:'Prueba'},en:{name:'Test'}}});
function fixture() {
  const revision = {slug:'test-service',id:'s1-r1',serviceId:'s1',number:1,createdAt:'2026-10-23T00:00:00Z',categoryId:'wellness',translations:{es:{title:'Prueba',description:'Solo prueba de contrato'},en:{title:'Test',description:'Contract test only'}},options:[{id:'s1-default',translations:{es:{name:'Prueba'},en:{name:'Test'}},durationMinutes:60,experienceType:'private',venue:'in_property',price:{kind:'fixed',amountMinor:1234,currency:'USD',unit:'service'}}],media:[{id:'test-image',url:'assets/images/test.jpg',alt:{es:'Prueba',en:'Test'},sortOrder:0,provenance:'verified',usageApproval:'approved'}],commercialApproval:{status:'approved',revisionId:'s1-r1'}};
  return {service:{id:'s1',provenance:'verified',status:'published',workingRevisionId:revision.id,publishedRevisionId:revision.id,modifiedAt:'2026-10-23T00:00:00Z'},revisions:[revision],internalNotes:'PRIVATE TEST NOTE'};
}
test('model schemas validate complete inputs and reject bad states, dates and types', () => {
  assert(AdminServiceSchema.safeParse(fixture()).success);
  assert(CategorySchema.safeParse(category()).success);
  for (const status of ['draft','published','archived']) assert(PublicationStatusSchema.safeParse(status).success);
  for (const status of ['live','Published',null]) assert.equal(PublicationStatusSchema.safeParse(status).success,false);
  const input=fixture(); input.service.modifiedAt='2026-02-30T00:00:00Z'; assert.equal(AdminServiceSchema.safeParse(input).success,false);
});
test('draft translation text may be incomplete, but public translations may not', () => {
  const input=fixture(); input.revisions[0].translations.en.title='';
  assert(ServiceRevisionSchema.safeParse(input.revisions[0]).success);
  assert.equal(ServiceTranslationSchema.safeParse(input.revisions[0].translations.en).success,false);
  assert(validateForPublication(input,'s1-r1',[category()]).some(i=>i.code==='complete_translation_required'));
  delete input.revisions[0].translations.en; assert.equal(ServiceRevisionSchema.safeParse(input.revisions[0]).success,false);
});
test('money uses explicit supported currencies and safe integer minor units', () => {
  const valid={kind:'from',amountMinor:12000,currency:'CRC',unit:'person'};
  assert(ServicePriceSchema.safeParse(valid).success);
  for (const change of [{currency:'$'},{currency:'CAD'},{currency:null},{amountMinor:12.5},{amountMinor:-1},{amountMinor:Number.MAX_SAFE_INTEGER+1}]) assert.equal(ServicePriceSchema.safeParse({...valid,...change}).success,false);
  assert(ServicePriceSchema.safeParse({...valid,amountMinor:0}).success);
});
test('quote prices cannot silently carry a money amount', () => {
  assert(ServicePriceSchema.safeParse({kind:'quote',currency:null,unit:'dinner'}).success);
  assert(ServicePriceSchema.safeParse({kind:'quote',currency:'EUR',unit:'person'}).success);
  assert.equal(ServicePriceSchema.safeParse({kind:'quote',currency:'CAD',unit:'person'}).success,false);
  assert.equal(ServicePriceSchema.safeParse({kind:'quote',currency:null,unit:'person',amountMinor:100}).success,false);
});
test('unapproved commercial content, category and images block readiness', () => {
  assert.deepEqual(validateForPublication(fixture(),'s1-r1',[category()]),[]);
  const input=fixture(); input.revisions[0].commercialApproval={status:'pending',revisionId:null}; input.revisions[0].media[0].usageApproval='pending';
  const issues=validateForPublication(input,'s1-r1',[{...category(),active:false}]);
  for (const code of ['commercial_approval_required','approved_image_required','active_category_required']) assert(issues.some(i=>i.code===code));
  assert(validateForPublication({...fixture(),service:{...fixture().service,provenance:'demo'}},'s1-r1',[category()]).some(i=>i.code==='unverified_service'));
});
test('new work revision does not alter the published revision or public price', () => {
  const input=fixture(); const next=structuredClone(input.revisions[0]); next.id='s1-r2'; next.number=2; next.slug='edited-slug'; next.translations.es.title='Trabajo nuevo'; next.options[0].price.amountMinor=9999; next.commercialApproval={status:'pending',revisionId:null};
  input.revisions.push(next); input.service.workingRevisionId=next.id;
  const catalog=projectPublicCatalog([input],[category()]);
  assert.equal(catalog.services[0].slug,'test-service'); assert.equal(catalog.services[0].revisionId,'s1-r1'); assert.equal(catalog.services[0].translations.es.title,'Prueba'); assert.equal(catalog.services[0].options[0].price.amountMinor,1234);
  assert(validateForPublication(input,'s1-r2',[category()]).some(i=>i.code==='commercial_approval_required'));
});
test('approval is bound to the exact revision identity', () => {
  const input=fixture(); input.revisions[0].commercialApproval.revisionId='other-r1';
  assert.equal(AdminServiceSchema.safeParse(input).success,false);
});
test('revision ownership, duplicate IDs/numbers and dangling pointers are rejected', () => {
  for (const mutate of [x=>x.revisions[0].serviceId='other',x=>x.revisions.push(structuredClone(x.revisions[0])),x=>x.service.workingRevisionId='absent',x=>x.service.publishedRevisionId=null]) {
    const input=fixture(); mutate(input); assert.equal(AdminServiceSchema.safeParse(input).success,false);
  }
  const input=fixture(); input.revisions[0].options.push(structuredClone(input.revisions[0].options[0])); assert.equal(AdminServiceSchema.safeParse(input).success,false);
});
test('archived/draft/demo services never appear as published public services', () => {
  const input=fixture(); input.service.status='archived'; assert.equal(projectPublicCatalog([input],[category()]).services.length,0);
  input.service.status='draft'; input.service.publishedRevisionId=null; assert.equal(projectPublicCatalog([input],[category()]).services.length,0);
  input.service.status='published'; input.service.publishedRevisionId='s1-r1'; input.service.provenance='demo'; assert.equal(projectPublicCatalog([input],[category()]).services.length,0);
});
test('public projection excludes notes, approvals and working revision data', () => {
  const catalog=projectPublicCatalog([fixture()],[category()]); const json=JSON.stringify(catalog);
  for (const text of ['PRIVATE TEST NOTE','internalNotes','workingRevisionId','commercialApproval','usageApproval','provenance']) assert.equal(json.includes(text),false);
  assert.equal(PublicCatalogServiceSchema.safeParse({...catalog.services[0],internalNotes:'leak'}).success,false);
  assert.equal(PublicCatalogSchema.safeParse({...catalog,secret:'leak'}).success,false);
});
test('catalog rejects duplicate identity, unknown categories and unvalidated references from an API', () => {
  const catalog=projectPublicCatalog([fixture()],[category()]);
  for (const broken of [{...catalog,services:[...catalog.services,...catalog.services]},{...catalog,categories:[]},{...catalog,services:[{...catalog.services[0],source:'stitch_reference'}]}]) assert.equal(PublicCatalogSchema.safeParse(broken).success,false);
  assert.throws(()=>projectPublicCatalog([fixture(),fixture()],[category()]));
});
test('media rejects executable, credential-bearing, signed and private-preview URLs', () => {
  const media=fixture().revisions[0].media[0];
  for (const url of ['javascript:alert(1)','//evil.invalid/x','https://user:pass@example.com/a.jpg','https://example.com/a.jpg?token=secret','assets/../secret','blob:http://127.0.0.1/a']) assert.equal(MediaAssetSchema.safeParse({...media,url}).success,false);
  assert(MediaAssetSchema.safeParse({...media,provenance:'demo',usageApproval:'pending',url:'blob:http://127.0.0.1/a'}).success);
});

