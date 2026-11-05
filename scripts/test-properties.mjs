import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { applyProperties, loadProperties } from '../assets/js/properties-adapter.js';
const require=createRequire(new URL('../apps/admin/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const slugs=['carabao-villa','villa-maya','casa-bella-mia','casa-heliconia'];
const dto=(slug,sortOrder=0)=>({slug,kind:'managed',sortOrder,location:null,maxGuests:null,bedrooms:null,bathrooms:null,airbnbUrl:null,translations:{es:{name:'Nombre '+slug,tagline:'Administrada',description:''},en:{name:'Name '+slug,tagline:'Managed',description:''}}});
const cards=d=>[...d.querySelectorAll('#properties-grid [data-property-card]')];
test('landing keeps exact four static cards and content on offline, HTTP, JSON or contract failure',async()=>{
  for(const fetcher of [async()=>{throw Error('offline');},async()=>new Response('',{status:503}),async()=>Response.json({properties:[{slug:'bad'}]}),async()=>new Response('not JSON'),async()=>Response.json({properties:[{...dto(slugs[0]),ownerName:'private'}]})]){
    const dom=new JSDOM(html),d=dom.window.document,before=d.getElementById('properties-grid').outerHTML;
    assert.equal(await loadProperties(d,'https://test.invalid',fetcher),null);
    assert.equal(d.getElementById('properties-grid').outerHTML,before);assert.deepEqual(cards(d).map(c=>c.dataset.propertyCard),slugs);dom.window.close();
  }
});
test('valid snapshot reorders/hides only existing cards, preserves gallery nodes and uses safe bilingual text',async()=>{
  const dom=new JSDOM(html),d=dom.window.document;
  const oldCards=cards(d),images=oldCards.map(c=>c.querySelector('img'));
  const properties=[dto('villa-maya',0),dto('carabao-villa',1),dto('casa-cielo',2)];
  properties[0].translations.es.name='<script>literal</script>';
  d.documentElement.lang='es';let request;
  const result=await loadProperties(d,'https://test.invalid/',async(url,options)=>{request={url,options};return Response.json({properties});});
  assert.ok(result);assert.equal(request.url,'https://test.invalid/v1/properties');assert.equal(request.options.credentials,'omit');assert.equal(request.options.cache,'no-store');
  assert.deepEqual(cards(d).filter(c=>!c.hidden).map(c=>c.dataset.propertyCard),['villa-maya','carabao-villa']);
  assert.equal(d.querySelector('[data-property-card="villa-maya"] h3').textContent,'<script>literal</script>');
  assert.equal(d.querySelector('[data-property-card="villa-maya"] h3 script'),null);
  assert.equal(d.querySelector('[data-property-card="casa-cielo"]'),null);
  assert.ok(oldCards.every((c,i)=>c.querySelector('img')===images[i]));
  d.documentElement.lang='en';applyProperties(d,result);assert.equal(d.querySelector('[data-property-card="villa-maya"] h3').textContent,'Name villa-maya');
  assert.equal(d.querySelector('[data-property-card="villa-maya"]').getAttribute('aria-label'),'Open Name villa-maya');
  assert.equal(d.querySelector('[data-property-card="villa-maya"] [data-property-tagline]').textContent,'Managed');
  assert.ok(applyProperties(d,{properties:[]}));assert.equal(cards(d).filter(c=>!c.hidden).length,0);dom.window.close();
});
