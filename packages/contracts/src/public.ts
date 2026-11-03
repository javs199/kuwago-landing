import { currencies, type ServicePrice, type ServiceTranslation, type PublicCategory, type ServiceOption, type PublicCatalogService, type PublicCatalog, type PublicMediaAsset, type PublicationStatus, publicationStatuses } from './models.js';
import { schema, object, text, id, slug, enumeration, integer, list, unique, translations, url, issue, type Issue } from './validation-core.js';
export type { Currency, Locale, Localized, ServicePrice, ServiceTranslation, PublicCategory, ServiceOption, PublicCatalogService, PublicCatalog, PublicMediaAsset, CatalogAdapter, HttpCatalogAdapter, CatalogLoadState, CatalogCartItem, CartAvailability, PublicationStatus } from './models.js';
export { currencies, publicationStatuses } from './models.js';
export { ContractError } from './validation-core.js';
export type { Issue, Result, Schema } from './validation-core.js';
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
export function validatePublicMedia(value: unknown, issues: Issue[], path: string) {
  const row = object(value, ['id','url','alt','sortOrder'], issues, path);
  id(row.id, issues, `${path}.id`); url(row.url, issues, `${path}.url`);
  translations(row.alt, (v,i,p) => text(v,i,p,true,250), issues, `${path}.alt`);
  integer(row.sortOrder, 0, 7, issues, `${path}.sortOrder`);
}
function validatePublicService(value: unknown, issues: Issue[], path: string) {
  const row = object(value, ['id','revisionId','slug','categoryId','source','translations','options','media','referencePrice'], issues, path);
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
