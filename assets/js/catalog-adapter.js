import { PublicCatalogSchema } from './contracts/public.js';
import { staticReferenceCatalog } from './catalog-static.js';

/** @typedef {import('../../packages/contracts/dist/public.js').CatalogAdapter} CatalogAdapter */
/** @typedef {import('../../packages/contracts/dist/public.js').PublicCatalog} PublicCatalog */
/** @typedef {import('../../packages/contracts/dist/public.js').CatalogCartItem} CatalogCartItem */

/** @returns {CatalogAdapter} */
export function createStaticCatalogAdapter() {
  return { async load({signal} = {}) {
    if (signal?.aborted) throw new Error('Aborted');
    return structuredClone(staticReferenceCatalog);
  } };
}

// Future HTTP adapters must implement CatalogAdapter and return unknown JSON.
// Their responses must pass this boundary with expectedSource="api".
// No fetch, endpoint, automatic fallback, or demo replacement is configured here.
/** @param {CatalogAdapter} adapter @param {'api'|'static_reference'} expectedSource */
export async function loadCatalog(adapter, expectedSource, options = {}) {
  let input;
  try { input = await adapter.load(options); }
  catch { return {status:'error',catalog:null,code:'source_unavailable'}; }
  const result = PublicCatalogSchema.safeParse(input);
  if (!result.success || result.data.source !== expectedSource) return {status:'error',catalog:null,code:'invalid_response'};
  return {status:result.data.services.length ? 'ready' : 'empty',catalog:result.data};
}

/** @param {CatalogCartItem} item @param {PublicCatalog|null} catalog */
export function cartAvailability(item, catalog) {
  if (!item || typeof item.id !== 'string' || typeof item.optionId !== 'string' || typeof item.revisionId !== 'string' ||
      !Number.isInteger(item.travelers) || item.travelers < 1 || item.travelers > 99 ||
      typeof item.date !== 'string' || (item.date && (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !Number.isFinite(Date.parse(`${item.date}T12:00:00Z`)) || new Date(`${item.date}T12:00:00Z`).toISOString().slice(0,10) !== item.date))) return 'invalid';
  if (!catalog) return 'unverified';
  const service = catalog.services.find(row => row.id === item.id);
  if (!service) return 'withdrawn';
  if (service.revisionId !== item.revisionId || !service.options.some(option => option.id === item.optionId)) return 'changed';
  return 'available';
}

// This is a presentation adapter, not a commercial price calculation.
/** @param {import('../../packages/contracts/dist/public.js').PublicCatalogService} service */
export function toMarketplaceCard(service) {
  const option = service.options[0], image = [...service.media].sort((a,b) => a.sortOrder-b.sortOrder)[0];
  return {
    id:service.id, revisionId:service.revisionId, optionId:option.id, category:service.categoryId,
    image:image.url, alt:image.alt, es:service.translations.es, en:service.translations.en,
    durationMinutes:option.durationMinutes, experienceType:option.experienceType, venue:option.venue,
    price:option.price, referencePrice:service.referencePrice, source:service.source,
    unit:service.referencePrice?.unit || option.price?.unit || 'service',
  };
}

