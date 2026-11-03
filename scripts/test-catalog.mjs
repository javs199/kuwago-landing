import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createStaticCatalogAdapter, loadCatalog, cartAvailability, toMarketplaceCard } from '../assets/js/catalog-adapter.js';
import { staticReferenceCatalog } from '../assets/js/catalog-static.js';
import { PublicCatalogSchema } from '../packages/contracts/dist/public.js';
const clone = () => structuredClone(staticReferenceCatalog);
const item = () => ({id:'yoga',revisionId:'reference-yoga-v1',optionId:'yoga-default',date:'',travelers:2});

test('static adapter preserves IDs, translations, images, durations and ambiguous reference amounts', async () => {
  const result = await loadCatalog(createStaticCatalogAdapter(),'static_reference');
  assert.equal(result.status,'ready'); assert.deepEqual(result.catalog.services.map(row=>row.id),['yoga','chef']);
  const cards=result.catalog.services.map(toMarketplaceCard);
  assert.deepEqual(cards.map(row=>[row.referencePrice.amount,row.referencePrice.symbol,row.referencePrice.currency,row.durationMinutes,row.unit]),[['120','$',null,90,'person'],['350','$',null,180,'dinner']]);
  assert.equal(cards[0].es.title,'Yoga privado al atardecer'); assert.equal(cards[1].en.title,'Gourmet Private Chef');
  assert.deepEqual(cards.map(row=>row.image),['assets/images/marketplace/yoga.jpg','assets/images/marketplace/chef.jpg']);
  result.catalog.services[0].translations.es.title='changed';
  assert.notEqual((await createStaticCatalogAdapter().load()).services[0].translations.es.title,'changed');
});
test('empty catalog and categories without results are valid states', async () => {
  const empty={...clone(),services:[]};
  assert.equal((await loadCatalog({load:async()=>empty},'static_reference')).status,'empty');
  assert.equal(clone().services.filter(row=>row.categoryId==='water').length,0);
  assert(PublicCatalogSchema.safeParse(empty).success);
});
test('load errors, aborted loads, invalid JSON shapes and wrong sources never fall back to reference services', async () => {
  for (const adapter of [{load:async()=>{throw new Error('private failure');}},{load:async()=>null},{load:async()=>({services:[]})},{load:async()=>({...clone(),services:[{...clone().services[0],internalNotes:'private'}]})}]) {
    const result=await loadCatalog(adapter,'api'); assert.equal(result.status,'error'); assert.equal(result.catalog,null); assert(!JSON.stringify(result).includes('private'));
  }
  assert.equal((await loadCatalog(createStaticCatalogAdapter(),'api')).status,'error');
  const controller=new AbortController(); controller.abort();
  assert.equal((await loadCatalog(createStaticCatalogAdapter(),'static_reference',{signal:controller.signal})).code,'source_unavailable');
});
test('cart tracks removed services, new revisions, removed options and temporarily unknown availability', () => {
  const catalog=clone(); assert.equal(cartAvailability(item(),catalog),'available');
  assert.equal(cartAvailability(item(),{...catalog,services:[]}), 'withdrawn');
  assert.equal(cartAvailability(item(),null),'unverified');
  assert.equal(cartAvailability(item(),{...catalog,services:[{...catalog.services[0],revisionId:'reference-yoga-v2'}]}),'changed');
  assert.equal(cartAvailability({...item(),optionId:'missing'},catalog),'changed');
  for (const change of [{travelers:0},{travelers:100},{travelers:2.5},{date:'2026-02-30'},{date:'invalid'},{revisionId:null}]) assert.equal(cartAvailability({...item(),...change},catalog),'invalid');
});
test('public catalog runtime rejects mismatched sources and identity corruption', () => {
  for (const change of [{source:'api'},{services:[...clone().services,clone().services[0]]},{services:[{...clone().services[0],categoryId:'missing'}]}]) assert.equal(PublicCatalogSchema.safeParse({...clone(),...change}).success,false);
});
test('public UI preserves selection, category filters, modal editing, removal and ES/EN', async () => {
  const require=createRequire(new URL('../apps/admin/package.json',import.meta.url));
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM(readFileSync('concierge-marketplace.html','utf8'),{url:'http://127.0.0.1/concierge-marketplace.html',runScripts:'outside-only'});
  const original={window:globalThis.window,document:globalThis.document,location:globalThis.location};
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.location=dom.window.location;
  try {
    dom.window.eval('var i18n = {en:{},es:{}};'); dom.window.eval(readFileSync('assets/js/marketplace-data.js','utf8'));
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
    dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
    await import(`../assets/js/marketplace.js?test=${Date.now()}`);
    await new Promise(resolve=>setImmediate(resolve));
    const doc=dom.window.document;
    assert.equal(doc.querySelectorAll('#mp-cards article').length,2);
    assert.match(doc.querySelector('#mp-cards').textContent,/From \$120 \/ person · 90 mins/);
    assert.match(doc.querySelector('#mp-cards').textContent,/Private · In-villa/);
    doc.querySelector('#mp-cards .mp-button').click(); assert(doc.querySelector('#mp-dialog').open);
    doc.querySelector('#mp-options').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(doc.querySelector('#mp-count').textContent,'1');
    assert.match(doc.querySelector('#mp-cart-items').textContent,/Private Sunset Yoga/);
    doc.querySelector('#mp-cart-items button').click(); doc.querySelector('#mp-option-travelers').value='3';
    doc.querySelector('#mp-options').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.match(doc.querySelector('#mp-cart-items').textContent,/3 Travelers/);
    doc.dispatchEvent(new dom.window.CustomEvent('kuwago:language',{detail:{lang:'es'}}));
    assert.match(doc.querySelector('#mp-cart-items').textContent,/Yoga privado al atardecer/);
    const water=[...doc.querySelectorAll('#mp-filters button')].find(button=>button.textContent==='Aventuras acuáticas'); water.click();
    assert.equal(doc.querySelectorAll('#mp-cards article').length,0); assert.match(doc.querySelector('#mp-results').textContent,/No hay experiencias/);
    doc.querySelector('#mp-cart-items button:last-child').click(); assert.equal(doc.querySelector('#mp-count').textContent,'0');
  } finally {
    for (const [key,value] of Object.entries(original)) { if (value===undefined) delete globalThis[key]; else globalThis[key]=value; }
    dom.window.close();
  }
});
