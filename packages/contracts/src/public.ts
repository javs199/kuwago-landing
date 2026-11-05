import { currencies, type ServiceDiscount, type ServicePrice, type ServiceTranslation, type PublicCategory, type ServiceOption, type PublicCatalogService, type PublicCatalog, type PublicMediaAsset, type PublicationStatus, publicationStatuses } from './models.js';
import { schema, object, text, id, slug, enumeration, integer, list, unique, translations, url, issue, type Issue } from './validation-core.js';
export type { Currency, Locale, Localized, ServiceDiscount, ServicePrice, ServiceTranslation, PublicCategory, ServiceOption, PublicCatalogService, PublicCatalog, PublicMediaAsset, CatalogAdapter, HttpCatalogAdapter, CatalogLoadState, CatalogCartItem, CartAvailability, PublicationStatus } from './models.js';
export { currencies, publicationStatuses } from './models.js';
export { ContractError } from './validation-core.js';
export type { Issue, Result, Schema } from './validation-core.js';
export type { PropertyKind, PublicProperty } from './models.js';
import type { PublicProperty } from './models.js';
export const propertyKeys = ['slug','kind','sortOrder','location','maxGuests','bedrooms','bathrooms','airbnbUrl','translations'] as const;
export function validateProperty(value: unknown, issues: Issue[], path: string) {
  const row = object(value, propertyKeys, issues, path);
  if (typeof row.slug !== 'string' || !/^[a-z0-9-]{2,60}$/.test(row.slug)) issue(issues, `${path}.slug`, 'invalid_slug');
  enumeration(row.kind, ['rental','managed'], issues, `${path}.kind`);
  integer(row.sortOrder, 0, Number.MAX_SAFE_INTEGER, issues, `${path}.sortOrder`);
  if (row.location !== null) text(row.location, issues, `${path}.location`, false, 120);
  for (const key of ['maxGuests','bedrooms']) if (row[key] !== null) integer(row[key], 0, Number.MAX_SAFE_INTEGER, issues, `${path}.${key}`);
  if (row.bathrooms !== null && (typeof row.bathrooms !== 'number' || !Number.isSafeInteger(row.bathrooms * 2) || row.bathrooms < 0)) issue(issues, `${path}.bathrooms`, 'invalid_bathrooms');
  if (row.airbnbUrl !== null) {
    let valid = false;
    try {
      const u = new URL(String(row.airbnbUrl));
      // Explicit Airbnb country domains; a suffix such as airbnb.evil is never accepted.
      valid = typeof row.airbnbUrl === 'string' && row.airbnbUrl.length <= 2000 && u.protocol === 'https:' &&
        /^www\.airbnb\.(?:com|co\.cr|es|co\.uk|ca|fr|de|it|pt|com\.br|com\.mx|com\.au|co\.nz|ie|nl|at|ch|be|cl|co\.in|co\.za)$/.test(u.hostname) &&
        !u.username && !u.password && !u.port && !u.hash && !u.search && /^\/rooms\/[0-9]+\/?$/.test(u.pathname);
    } catch { /* Invalid URL. */ }
    if (!valid) issue(issues, `${path}.airbnbUrl`, 'invalid_airbnb_url');
  }
  translations(row.translations, (v,i,p) => {
    const t = object(v, ['name','tagline','description'], i, p);
    text(t.name,i,`${p}.name`,true,80); text(t.tagline,i,`${p}.tagline`,false,120); text(t.description,i,`${p}.description`,false,2000);
  }, issues, `${path}.translations`);
}
export const PublicPropertySchema = schema<PublicProperty>(validateProperty);
export const PublicPropertiesSchema = schema<{properties: PublicProperty[]}>((v,i,p) => {
  const row = object(v, ['properties'], i, p);
  const values = list(row.properties, validateProperty, i, `${p}.properties`);
  unique(values, 'slug', i, `${p}.properties`);
});
const units = ['person','group','service','dinner'];
export function validatePrice(value: unknown, issues: Issue[], path: string) {
  const row = object(value, ['kind','currency','unit', ...(value && typeof value === 'object' && 'kind' in value && value.kind === 'quote' ? [] : ['amountMinor'])], issues, path);
  enumeration(row.kind, ['fixed','from','quote'], issues, `${path}.kind`);
  enumeration(row.unit, units, issues, `${path}.unit`);
  enumeration(row.currency, row.kind === 'quote' ? [...currencies, null] : currencies, issues, `${path}.currency`);
  if (row.kind !== 'quote') integer(row.amountMinor, 0, Number.MAX_SAFE_INTEGER, issues, `${path}.amountMinor`);
}
export function validateTranslation(value: unknown, issues: Issue[], path: string, required = true) {
  const row = object(value, ['title','description'], issues, path);
  text(row.title, issues, `${path}.title`, required, 100);
  text(row.description, issues, `${path}.description`, required);
}
export function validateName(value: unknown, issues: Issue[], path: string, required = true) {
  const row = object(value, ['name'], issues, path); text(row.name, issues, `${path}.name`, required, 100);
}
export function validateCategory(value: unknown, issues: Issue[], path: string) {
  const row = object(value, ['id','slug','translations'], issues, path);
  id(row.id, issues, `${path}.id`); slug(row.slug, issues, `${path}.slug`);
  translations(row.translations, validateName, issues, `${path}.translations`);
}
export function validateOption(value: unknown, issues: Issue[], path: string, complete = false) {
  const row = object(value, ['id','translations','durationMinutes','experienceType','venue','price'], issues, path);
  id(row.id, issues, `${path}.id`);
  translations(row.translations, (v,i,p) => validateName(v,i,p,complete), issues, `${path}.translations`);
  if (row.durationMinutes !== null || complete) integer(row.durationMinutes, 1, 1440, issues, `${path}.durationMinutes`);
  enumeration(row.experienceType, complete ? ['private','shared'] : ['private','shared',null], issues, `${path}.experienceType`);
  enumeration(row.venue, complete ? ['in_property','off_property'] : ['in_property','off_property',null], issues, `${path}.venue`);
  if (row.price !== null || complete) validatePrice(row.price, issues, `${path}.price`);
}
function calendarDay(value: unknown, issues: Issue[], path: string) {
  if (value === null) return;
  const valid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  if (!valid) issue(issues, path, 'invalid_date');
}
export function validateDiscount(value: unknown, issues: Issue[], path: string) {
  if (value === null || value === undefined) return;
  const row = object(value, ['percent','startsOn','endsOn'], issues, path);
  integer(row.percent, 1, 90, issues, `${path}.percent`);
  calendarDay(row.startsOn, issues, `${path}.startsOn`); calendarDay(row.endsOn, issues, `${path}.endsOn`);
  if (typeof row.startsOn === 'string' && typeof row.endsOn === 'string' && row.endsOn < row.startsOn) issue(issues, `${path}.endsOn`, 'discount_ends_before_start');
}
const COSTA_RICA_OFFSET_MS = 6 * 60 * 60 * 1000;
// Costa Rica has no daylight saving time: calendar day = UTC - 6 h.
export function costaRicaDay(now: Date = new Date()): string {
  return new Date(now.getTime() - COSTA_RICA_OFFSET_MS).toISOString().slice(0,10);
}
export function activeDiscount(discount: ServiceDiscount | null | undefined, now: Date = new Date()): ServiceDiscount | null {
  if (!discount) return null;
  const today = costaRicaDay(now);
  if (discount.startsOn !== null && today < discount.startsOn) return null;
  if (discount.endsOn !== null && today > discount.endsOn) return null;
  return { ...discount };
}
export function discountedMinor(amountMinor: number, percent: number): number {
  return Math.round(amountMinor * (100 - percent) / 100);
}
export function validatePublicMedia(value: unknown, issues: Issue[], path: string) {
  const row = object(value, ['id','url','alt','sortOrder'], issues, path);
  id(row.id, issues, `${path}.id`); url(row.url, issues, `${path}.url`);
  translations(row.alt, (v,i,p) => text(v,i,p,true,250), issues, `${path}.alt`);
  integer(row.sortOrder, 0, 7, issues, `${path}.sortOrder`);
}
function validatePublicService(value: unknown, issues: Issue[], path: string) {
  const row = object(value, ['id','revisionId','slug','categoryId','source','translations','options','media','referencePrice','discount'], issues, path);
  for (const key of ['id','revisionId','categoryId']) id(row[key], issues, `${path}.${key}`);
  slug(row.slug, issues, `${path}.slug`);
  enumeration(row.source, ['published','stitch_reference'], issues, `${path}.source`);
  translations(row.translations, validateTranslation, issues, `${path}.translations`);
  const options = list(row.options, (v,i,p) => validateOption(v,i,p,row.source === 'published'), issues, `${path}.options`, 100);
  if (!options.length) issue(issues, `${path}.options`, 'option_required');
  unique(options, 'id', issues, `${path}.options`);
  const media = list(row.media, validatePublicMedia, issues, `${path}.media`, 8);
  if (!media.length) issue(issues, `${path}.media`, 'image_required');
  unique(media, 'id', issues, `${path}.media`); unique(media, 'sortOrder', issues, `${path}.media`);
  validateDiscount(row.discount, issues, `${path}.discount`);
  if (row.source === 'stitch_reference' && row.discount != null) issue(issues, `${path}.discount`, 'reference_is_not_money');
  if (row.source === 'stitch_reference') {
    const price = object(row.referencePrice, ['amount','symbol','currency','unit'], issues, `${path}.referencePrice`);
    if (typeof price.amount !== 'string' || !/^\d{1,9}(?:\.\d{1,2})?$/.test(price.amount)) issue(issues, `${path}.referencePrice.amount`, 'invalid_reference_amount');
    enumeration(price.symbol, ['$'], issues, `${path}.referencePrice.symbol`);
    enumeration(price.currency, [null], issues, `${path}.referencePrice.currency`);
    enumeration(price.unit, units, issues, `${path}.referencePrice.unit`);
    if (options.some(option => option && typeof option === 'object' && 'price' in option && option.price !== null)) issue(issues, path, 'reference_is_not_money');
  } else if (row.referencePrice !== null) issue(issues, `${path}.referencePrice`, 'reference_forbidden');
}
export const PublicationStatusSchema = schema<PublicationStatus>((v,i,p) => enumeration(v, publicationStatuses, i,p));
export const ServiceDiscountSchema = schema<ServiceDiscount>((v,i,p) => { if (v === null || v === undefined) issue(i,p,'object_required'); else validateDiscount(v,i,p); });
export const ServicePriceSchema = schema<ServicePrice>(validatePrice);
export const ServiceTranslationSchema = schema<ServiceTranslation>(validateTranslation);
export const PublicCategorySchema = schema<PublicCategory>(validateCategory);
export const ServiceOptionSchema = schema<ServiceOption>(validateOption);
export const PublicMediaAssetSchema = schema<PublicMediaAsset>(validatePublicMedia);
export const PublicCatalogServiceSchema = schema<PublicCatalogService>(validatePublicService);
export const PublicCatalogSchema = schema<PublicCatalog>((value, issues, path) => {
  const row = object(value, ['schemaVersion','source','categories','services'], issues, path);
  enumeration(row.schemaVersion, [1], issues, `${path}.schemaVersion`);
  enumeration(row.source, ['api','static_reference'], issues, `${path}.source`);
  const categories = list(row.categories, validateCategory, issues, `${path}.categories`);
  const services = list(row.services, validatePublicService, issues, `${path}.services`);
  unique(categories,'id',issues,`${path}.categories`); unique(categories,'slug',issues,`${path}.categories`);
  unique(services,'id',issues,`${path}.services`); unique(services,'slug',issues,`${path}.services`); unique(services,'revisionId',issues,`${path}.services`);
  const categoryIds = new Set(categories.map(v => v && typeof v === 'object' && 'id' in v ? v.id : undefined));
  for (const service of services) {
    if (!service || typeof service !== 'object') continue;
    const item = service as Record<string,unknown>;
    if (!categoryIds.has(item.categoryId)) issue(issues, `${path}.services`, 'unknown_category');
    if ((row.source === 'api' && item.source !== 'published') || (row.source === 'static_reference' && item.source !== 'stitch_reference')) issue(issues, `${path}.services`, 'source_mismatch');
  }
});
