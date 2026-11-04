import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createStaticCatalogAdapter, loadCatalog, cartAvailability, toMarketplaceCard, salePrice, cartTotals } from '../assets/js/catalog-adapter.js';
import { staticReferenceCatalog } from '../assets/js/catalog-static.js';
import { PublicCatalogSchema, activeDiscount, costaRicaDay } from '../packages/contracts/dist/public.js';
const clone = () => structuredClone(staticReferenceCatalog);
const item = () => ({id:'yoga',revisionId:'reference-yoga-v1',optionId:'yoga-default',date:'',travelers:2});

test('static adapter preserves IDs, translations, images, durations and ambiguous reference amounts', async () => {
  const result = await loadCatalog(createStaticCatalogAdapter(),'static_reference');
  assert.equal(result.status,'ready'); assert.deepEqual(result.catalog.services.map(row=>row.id),['yoga','chef']);
  const cards=result.catalog.services.map(toMarketplaceCard);
  assert.deepEqual(cards.map(row=>[row.referencePrice.amount,row.referencePrice.symbol,row.referencePrice.currency,row.durationMinutes,row.unit]),[['120','$',null,90,'person'],['350','$',null,180,'dinner']]);
  assert.equal(cards[0].es.title,'Yoga privado al atardecer'); assert.equal(cards[1].en.title,'Gourmet Private Chef');
  assert.deepEqual(cards.map(row=>row.image),['assets/images/marketplace/yoga.jpg','assets/images/marketplace/chef.jpg']);
  assert.equal(cards[0].options[0].id,'yoga-default'); assert.equal(cards[0].options[0].es.name,'Yoga privado al atardecer'); assert.equal(cards[0].options[0].en.name,'Private Sunset Yoga');
  assert.equal(cards[0].options[0].durationMinutes,90); assert.equal(cards[0].options[0].experienceType,'private'); assert.equal(cards[0].options[0].venue,'in_property');
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
test('service with multiple options draws radios, updates dialog meta, preserves chosen option in cart, and shows From/Desde lowest price on card', async () => {
  const require=createRequire(new URL('../apps/admin/package.json',import.meta.url));
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM(readFileSync('concierge-marketplace.html','utf8'),{url:'http://127.0.0.1/concierge-marketplace.html',runScripts:'outside-only'});
  const original={window:globalThis.window,document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.location=dom.window.location;

  const mockCatalog = {
    schemaVersion: 1, source: 'api',
    categories: [{ id: 'wellness', slug: 'wellness', translations: { es: { name: 'Bienestar' }, en: { name: 'Wellness' } } }],
    services: [
      {
        id: 'massage', revisionId: 'massage-v1', slug: 'massage', categoryId: 'wellness', source: 'published',
        translations: {
          en: { title: 'Massage Session', description: 'Personalized massage experience' },
          es: { title: 'Sesión de Masaje', description: 'Experiencia de masaje personalizado' },
        },
        options: [
          { id: 'opt-130', translations: { es: { name: 'Relajante 90 min' }, en: { name: 'Relaxing 90 min' } }, durationMinutes: 90, experienceType: 'private', venue: 'in_property', price: { kind: 'fixed', currency: 'USD', amountMinor: 13000, unit: 'person' } },
          { id: 'opt-90', translations: { es: { name: 'Relajante 60 min' }, en: { name: 'Relaxing 60 min' } }, durationMinutes: 60, experienceType: 'private', venue: 'in_property', price: { kind: 'fixed', currency: 'USD', amountMinor: 9000, unit: 'person' } },
          { id: 'opt-stones', translations: { es: { name: 'Piedras calientes 60 min' }, en: { name: 'Hot stones 60 min' } }, durationMinutes: 60, experienceType: 'private', venue: 'in_property', price: { kind: 'fixed', currency: 'USD', amountMinor: 11000, unit: 'person' } },
        ],
        media: [{ id: 'img-massage', url: 'assets/images/marketplace/yoga.jpg', sortOrder: 0, alt: { es: 'Masaje', en: 'Massage' } }],
        referencePrice: null,
      }
    ]
  };

  dom.window.KUWAGO_CATALOG_API = { baseUrl: 'https://api.example.com' };
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/v1/catalog')) {
      return { ok: true, status: 200, json: async () => structuredClone(mockCatalog) };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    dom.window.eval('var i18n = {en:{},es:{}};');
    dom.window.eval(readFileSync('assets/js/marketplace-data.js','utf8'));
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
    dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};

    await import(`../assets/js/marketplace.js?test=${Date.now()}`);
    await new Promise(resolve=>setImmediate(resolve));
    const doc=dom.window.document;

    // Switch to Spanish to test "Desde USD 90" (lowest option price)
    doc.dispatchEvent(new dom.window.CustomEvent('kuwago:language',{detail:{lang:'es'}}));
    const cardPriceText = doc.querySelector('#mp-cards .mp-price').textContent;
    assert.match(cardPriceText, /Desde/);
    assert.match(cardPriceText, /90/);
    assert.match(cardPriceText, /USD/);

    // Open options dialog
    doc.querySelector('#mp-cards .mp-button').click();
    assert(doc.querySelector('#mp-dialog').open);

    // 3 options draw 3 radios
    const radios = doc.querySelectorAll('#mp-option-choices input[type="radio"]');
    assert.equal(radios.length, 3);
    assert.equal(radios[0].value, 'opt-130');
    assert.equal(radios[1].value, 'opt-90');
    assert.equal(radios[2].value, 'opt-stones');

    // 1st option is selected by default
    assert.equal(radios[0].checked, true);
    assert.match(doc.querySelector('#mp-dialog-meta').textContent, /130/);

    // Choosing 2nd radio updates meta and submitting saves 2nd option in cart
    radios[1].checked = true;
    radios[1].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.match(doc.querySelector('#mp-dialog-meta').textContent, /90/);

    doc.querySelector('#mp-options').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(doc.querySelector('#mp-count').textContent, '1');

    // Cart shows option name under service title
    const cartText = doc.querySelector('#mp-cart-items').textContent;
    assert.match(cartText, /Sesión de Masaje/);
    assert.match(cartText, /Relajante 60 min/);

    // Editing item opens dialog with 2nd option marked
    doc.querySelector('#mp-cart-items button').click();
    assert(doc.querySelector('#mp-dialog').open);
    const editRadios = doc.querySelectorAll('#mp-option-choices input[type="radio"]');
    assert.equal(editRadios[1].checked, true);
    assert.equal(editRadios[0].checked, false);
    assert.match(doc.querySelector('#mp-dialog-meta').textContent, /90/);

    // Language change updates option choices
    doc.dispatchEvent(new dom.window.CustomEvent('kuwago:language', { detail: { lang: 'en' } }));
    assert.match(doc.querySelector('#mp-option-choices').textContent, /Relaxing 60 min/);
    assert.match(doc.querySelector('#mp-cart-items').textContent, /Relaxing 60 min/);
  } finally {
    for (const [key,value] of Object.entries(original)) { if (value===undefined) delete globalThis[key]; else globalThis[key]=value; }
    dom.window.close();
  }
});

const discountService = (discount) => ({
  id:'massage', revisionId:'massage-v1', slug:'massage', categoryId:'wellness', source:'published',
  translations:{en:{title:'Massage Session',description:'Personalized massage'},es:{title:'Sesión de Masaje',description:'Masaje personalizado'}},
  options:[
    {id:'opt-90',translations:{es:{name:'Relajante 60 min'},en:{name:'Relaxing 60 min'}},durationMinutes:60,experienceType:'private',venue:'in_property',price:{kind:'fixed',currency:'USD',amountMinor:9000,unit:'person'}},
    {id:'opt-quote',translations:{es:{name:'Sesión a medida'},en:{name:'Custom session'}},durationMinutes:90,experienceType:'private',venue:'in_property',price:{kind:'quote',currency:null,unit:'service'}},
  ],
  media:[{id:'img-massage',url:'assets/images/marketplace/yoga.jpg',sortOrder:0,alt:{es:'Masaje',en:'Massage'}}],
  referencePrice:null, ...(discount === undefined ? {} : {discount}),
});
const discountCatalog = (discount) => ({schemaVersion:1,source:'api',categories:[{id:'wellness',slug:'wellness',translations:{es:{name:'Bienestar'},en:{name:'Wellness'}}}],services:[discountService(discount)]});
test('discount contract: optional, 1-90 %, real calendar dates, end not before start, never on reference prices', () => {
  assert(PublicCatalogSchema.safeParse(discountCatalog(undefined)).success);
  assert(PublicCatalogSchema.safeParse(discountCatalog(null)).success);
  assert(PublicCatalogSchema.safeParse(discountCatalog({percent:15,startsOn:'2026-12-01',endsOn:'2026-12-31'})).success);
  for (const bad of [{percent:0,startsOn:null,endsOn:null},{percent:91,startsOn:null,endsOn:null},{percent:12.5,startsOn:null,endsOn:null},{percent:15,startsOn:'2026-02-30',endsOn:null},{percent:15,startsOn:'2026-12-31',endsOn:'2026-12-01'},{percent:15,startsOn:null},{percent:15,startsOn:null,endsOn:null,code:'x'}])
    assert.equal(PublicCatalogSchema.safeParse(discountCatalog(bad)).success,false,JSON.stringify(bad));
  const reference=clone(); reference.services[0].discount={percent:10,startsOn:null,endsOn:null};
  assert.equal(PublicCatalogSchema.safeParse(reference).success,false);
});
test('discount validity uses the Costa Rica calendar day (UTC-6) and rounds minor units', () => {
  assert.equal(costaRicaDay(new Date('2026-12-02T05:59:59Z')),'2026-12-01');
  assert.equal(costaRicaDay(new Date('2026-12-02T06:00:00Z')),'2026-12-02');
  const window={percent:15,startsOn:'2026-12-01',endsOn:'2026-12-01'};
  assert.equal(activeDiscount(window,new Date('2026-12-01T06:00:00Z'))?.percent,15);
  assert.equal(activeDiscount(window,new Date('2026-12-02T05:59:59Z'))?.percent,15);
  assert.equal(activeDiscount(window,new Date('2026-12-01T05:59:59Z')),null);
  assert.equal(activeDiscount(window,new Date('2026-12-02T06:00:00Z')),null);
  assert.equal(salePrice({kind:'fixed',currency:'USD',amountMinor:9000,unit:'person'},{percent:15})?.amountMinor,7650);
  assert.equal(salePrice({kind:'from',currency:'USD',amountMinor:999,unit:'person'},{percent:15})?.amountMinor,849);
  assert.equal(salePrice({kind:'quote',currency:null,unit:'service'},{percent:15}),null);
  assert.equal(salePrice({kind:'fixed',currency:'USD',amountMinor:9000,unit:'person'},null),null);
  const today=costaRicaDay();
  assert.equal(toMarketplaceCard(discountService({percent:15,startsOn:today,endsOn:today})).discount.percent,15);
  assert.equal(toMarketplaceCard(discountService({percent:15,startsOn:'2020-01-01',endsOn:'2020-01-31'})).discount,null);
  assert.equal(toMarketplaceCard(discountService(undefined)).discount,null);
});
test('marketplace shows -15 %, crossed regular price and USD 76.50 for a USD 90 option, and no discount on quotes', async () => {
  const require=createRequire(new URL('../apps/admin/package.json',import.meta.url));
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM(readFileSync('concierge-marketplace.html','utf8'),{url:'http://127.0.0.1/concierge-marketplace.html',runScripts:'outside-only'});
  const original={window:globalThis.window,document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.location=dom.window.location;
  dom.window.KUWAGO_CATALOG_API={baseUrl:'https://api.example.com'};
  globalThis.fetch=async url=>{ if (String(url).endsWith('/v1/catalog')) return {ok:true,status:200,json:async()=>discountCatalog({percent:15,startsOn:null,endsOn:null})}; throw new Error(`Unexpected fetch: ${url}`); };
  try {
    dom.window.eval('var i18n = {en:{},es:{}};'); dom.window.eval(readFileSync('assets/js/marketplace-data.js','utf8'));
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
    dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
    await import(`../assets/js/marketplace.js?test=${Date.now()}`);
    await new Promise(resolve=>setImmediate(resolve));
    const doc=dom.window.document, card=doc.querySelector('#mp-cards .mp-price');
    assert.equal(card.querySelector('.mp-discount-tag').textContent,'-15%');
    assert.match(card.querySelector('s.mp-regular-price').textContent,/USD\s90\.00/);
    assert.match(card.querySelector('.mp-sale-price').textContent,/USD\s76\.50/);
    assert.match(card.textContent,/^Discount: -15% From Regular price: USD\s90\.00 Discounted price: USD\s76\.50 \/ person$/);
    doc.querySelector('#mp-cards .mp-button').click();
    const choices=doc.querySelectorAll('#mp-option-choices .mp-option-meta');
    assert(choices[0].querySelector('.mp-discount-tag')); assert.equal(choices[1].querySelector('.mp-discount-tag'),null); assert.equal(choices[1].querySelector('s'),null);
    assert.match(doc.querySelector('#mp-dialog-meta .mp-sale-price').textContent,/76\.50/);
    doc.dispatchEvent(new dom.window.CustomEvent('kuwago:language',{detail:{lang:'es'}}));
    const es=doc.querySelector('#mp-cards .mp-price');
    assert.equal(es.querySelector('.mp-discount-tag').textContent,'-15\u00a0%');
    assert.match(es.querySelector('.mp-sale-price').textContent,/76,50/);
    assert.match(es.textContent,/Precio normal/);
  } finally {
    for (const [key,value] of Object.entries(original)) { if (value===undefined) delete globalThis[key]; else globalThis[key]=value; }
    dom.window.close();
  }
});

test('cart totals: price x travelers per person, x1 per service, discount, from, quote, mixed and reference', () => {
  const now=new Date('2026-11-04T12:00:00Z');
  const line=(optionId,travelers=2)=>({id:'massage',revisionId:'massage-v1',optionId,date:'',travelers});
  const base=discountCatalog(undefined);
  let totals=cartTotals([line('opt-90')],base,now);
  assert.equal(totals.status,'priced'); assert.equal(totals.subtotalMinor,18000); assert.equal(totals.currency,'USD'); assert.equal(totals.isMinimum,false);
  totals=cartTotals([line('opt-90')],discountCatalog({percent:15,startsOn:null,endsOn:null}),now);
  assert.equal(totals.subtotalMinor,15300); assert.equal(totals.lines[0].unitMinor,7650);
  totals=cartTotals([line('opt-90')],discountCatalog({percent:15,startsOn:'2026-12-01',endsOn:null}),now);
  assert.equal(totals.subtotalMinor,18000);
  const perService=structuredClone(base); perService.services[0].options[0].price={kind:'from',currency:'USD',amountMinor:20000,unit:'service'};
  totals=cartTotals([line('opt-90',3)],perService,now);
  assert.equal(totals.subtotalMinor,20000); assert.equal(totals.lines[0].quantity,1); assert.equal(totals.isMinimum,true);
  totals=cartTotals([line('opt-90'),line('opt-quote')],base,now);
  assert.equal(totals.status,'partial'); assert.equal(totals.subtotalMinor,18000); assert.equal(totals.unpriced,1);
  totals=cartTotals([line('opt-quote')],base,now);
  assert.equal(totals.status,'pending'); assert.equal(totals.subtotalMinor,null);
  const mixed=structuredClone(base); mixed.services.push({...structuredClone(mixed.services[0]),id:'other',slug:'other'}); mixed.services[1].options[0].price.currency='CRC';
  assert.equal(cartTotals([line('opt-90'),{...line('opt-90'),id:'other'}],mixed,now).subtotalMinor,null);
  assert.equal(cartTotals([line('opt-90')],{...base,services:[]},now).status,'pending');
  assert.equal(cartTotals([],base,now).status,'empty');
  assert.equal(cartTotals([item()],clone(),now).subtotalMinor,null);
});
test('cart summary shows subtotal, total + taxes, line amount and keeps pending for quotes and Stitch reference', async () => {
  const require=createRequire(new URL('../apps/admin/package.json',import.meta.url));
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM(readFileSync('concierge-marketplace.html','utf8'),{url:'http://127.0.0.1/concierge-marketplace.html',runScripts:'outside-only'});
  const original={window:globalThis.window,document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.location=dom.window.location;
  dom.window.KUWAGO_CATALOG_API={baseUrl:'https://api.example.com'};
  globalThis.fetch=async url=>{ if (String(url).endsWith('/v1/catalog')) return {ok:true,status:200,json:async()=>discountCatalog(undefined)}; throw new Error(`Unexpected fetch: ${url}`); };
  try {
    dom.window.eval('var i18n = {en:{},es:{}};'); dom.window.eval(readFileSync('assets/js/marketplace-data.js','utf8'));
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
    dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
    await import(`../assets/js/marketplace.js?test=${Date.now()}`);
    await new Promise(resolve=>setImmediate(resolve));
    const doc=dom.window.document, submit=()=>doc.querySelector('#mp-options').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.match(doc.querySelector('#mp-cards .mp-meta').textContent,/^60–90 mins/);
    assert.equal(doc.querySelector('#mp-subtotal').textContent,'To be confirmed');
    doc.querySelector('#mp-cards .mp-button').click(); doc.querySelector('#mp-option-travelers').value='2'; submit();
    assert.match(doc.querySelector('#mp-subtotal').textContent,/^USD\s180\.00$/);
    assert.match(doc.querySelector('#mp-total-value').textContent,/^USD\s180\.00 \+ taxes$/);
    assert.match(doc.querySelector('.mp-cart-amount').textContent,/USD\s90\.00 × 2 = USD\s180\.00/);
    doc.querySelector('#mp-cards .mp-button').click();
    const quote=doc.querySelectorAll('#mp-option-choices input')[1]; quote.checked=true; submit();
    assert.match(doc.querySelector('#mp-subtotal').textContent,/^USD\s180\.00 \+ items to be quoted$/);
    doc.dispatchEvent(new dom.window.CustomEvent('kuwago:language',{detail:{lang:'es'}}));
    assert.match(doc.querySelector('#mp-total-value').textContent,/^180,00\sUSD \+ impuestos$|^USD\s180,00 \+ impuestos$/);
    doc.querySelector('#mp-cart-items .mp-cart-item:first-child button:last-child').click();
    assert.equal(doc.querySelector('#mp-subtotal').textContent,'Por confirmar');
    assert.equal(doc.querySelector('#mp-total-value').textContent,'Por confirmar');
  } finally {
    for (const [key,value] of Object.entries(original)) { if (value===undefined) delete globalThis[key]; else globalThis[key]=value; }
    dom.window.close();
  }
});
