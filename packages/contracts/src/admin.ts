import type { AdminService, Category, Service, ServiceRevision, MediaAsset, PublicCatalogService, PublicCatalog } from './models.js';
import { publicationStatuses } from './models.js';
import type { AdminProperty, PropertyInput, PublicProperty } from './models.js';
import { propertyKeys, validateProperty } from './public.js';
export type { AdminProperty, PropertyInput } from './models.js';
export function publicProperty(input: PublicProperty): PublicProperty {
  return Object.fromEntries(propertyKeys.map(key => [key, input[key]])) as PublicProperty;
}
const propertyInputKeys = [...propertyKeys,'showOnLanding','ownerName','ownerContact','internalNotes'];
function validatePropertyInput(v: unknown, i: Issue[], p: string) {
  const row = object(v, propertyInputKeys, i, p);
  validateProperty(Object.fromEntries(propertyKeys.map(key => [key,row[key]])), i, p);
  if (typeof row.showOnLanding !== 'boolean') issue(i,p,'boolean_required');
  for (const key of ['ownerName','ownerContact','internalNotes']) if (row[key] !== null) text(row[key],i,`${p}.${key}`,false,key==='internalNotes'?10000:250);
}
export const PropertyInputSchema = schema<PropertyInput>(validatePropertyInput);
export const AdminPropertySchema = schema<AdminProperty>((v,i,p) => {
  const row = object(v,[...propertyInputKeys,'id','status','slugLocked','hasUnpublishedChanges','updatedAt','updatedBy','publishedAt','publishedBy'],i,p);
  validatePropertyInput(Object.fromEntries(propertyInputKeys.map(key=>[key,row[key]])),i,p);
  id(row.id,i,`${p}.id`); enumeration(row.status,publicationStatuses,i,`${p}.status`);
  for (const key of ['slugLocked','hasUnpublishedChanges']) if (typeof row[key]!=='boolean') issue(i,`${p}.${key}`,'boolean_required');
  date(row.updatedAt,i,`${p}.updatedAt`);
  if(row.publishedAt!==null) date(row.publishedAt,i,`${p}.publishedAt`);
  // Principal ids come from Access as `access:<sha256>`, so they are not catalog ids.
  for(const key of ['updatedBy','publishedBy']) if(row[key]!==null) text(row[key],i,`${p}.${key}`,true,200);
});
import { schema, object, text, id, slug, enumeration, integer, list, unique, translations, date, url, issue, type Issue } from './validation-core.js';
import { validateCategory, validateTranslation, validateOption, validateDiscount, PublicCatalogSchema, ServiceOptionSchema, ServiceTranslationSchema } from './public.js';

function validateService(value: unknown, issues: Issue[], path: string) {
  const row = object(value, ['id','provenance','status','workingRevisionId','publishedRevisionId','modifiedAt'], issues, path);
  id(row.id,issues,`${path}.id`);
  enumeration(row.provenance,['demo','stitch_reference','verified'],issues,`${path}.provenance`);
  enumeration(row.status,publicationStatuses,issues,`${path}.status`);
  id(row.workingRevisionId,issues,`${path}.workingRevisionId`);
  if (row.publishedRevisionId !== null) id(row.publishedRevisionId,issues,`${path}.publishedRevisionId`);
  if (row.status === 'published' && row.publishedRevisionId === null) issue(issues,path,'published_revision_required');
  if (row.status === 'draft' && row.publishedRevisionId !== null) issue(issues,path,'draft_has_public_revision');
  date(row.modifiedAt,issues,`${path}.modifiedAt`);
}
function validateMedia(value: unknown, issues: Issue[], path: string) {
  const row = object(value,['id','url','alt','sortOrder','provenance','usageApproval'],issues,path);
  id(row.id,issues,`${path}.id`); url(row.url,issues,`${path}.url`,row.provenance === 'demo');
  translations(row.alt,(v,i,p) => text(v,i,p,false,250),issues,`${path}.alt`);
  integer(row.sortOrder,0,7,issues,`${path}.sortOrder`);
  enumeration(row.provenance,['demo','stitch_reference','verified'],issues,`${path}.provenance`);
  enumeration(row.usageApproval,['pending','approved'],issues,`${path}.usageApproval`);
}
function validateRevision(value: unknown, issues: Issue[], path: string) {
  const row = object(value,['id','serviceId','slug','number','createdAt','categoryId','translations','options','media','discount','commercialApproval'],issues,path);
  slug(row.slug,issues,`${path}.slug`,false);
  id(row.id,issues,`${path}.id`); id(row.serviceId,issues,`${path}.serviceId`);
  integer(row.number,1,Number.MAX_SAFE_INTEGER,issues,`${path}.number`); date(row.createdAt,issues,`${path}.createdAt`);
  if (row.categoryId !== null) id(row.categoryId,issues,`${path}.categoryId`);
  translations(row.translations,(v,i,p) => validateTranslation(v,i,p,false),issues,`${path}.translations`);
  const options = list(row.options,validateOption,issues,`${path}.options`,100); unique(options,'id',issues,`${path}.options`);
  const media = list(row.media,validateMedia,issues,`${path}.media`,8); unique(media,'id',issues,`${path}.media`); unique(media,'sortOrder',issues,`${path}.media`);
  validateDiscount(row.discount,issues,`${path}.discount`);
  const approval = object(row.commercialApproval,['status','revisionId'],issues,`${path}.commercialApproval`);
  enumeration(approval.status,['pending','approved'],issues,`${path}.commercialApproval.status`);
  if (approval.status === 'approved' && approval.revisionId !== row.id) issue(issues,`${path}.commercialApproval`,'approval_revision_mismatch');
  if (approval.status === 'pending' && approval.revisionId !== null) issue(issues,`${path}.commercialApproval`,'pending_approval_reference');
}
export const ServiceSchema = schema<Service>(validateService);
export const MediaAssetSchema = schema<MediaAsset>(validateMedia);
export const CategorySchema = schema<Category>((value,issues,path) => {
  const row = object(value,['id','slug','translations','active'],issues,path);
  validateCategory({id:row.id,slug:row.slug,translations:row.translations},issues,path);
  if (typeof row.active !== 'boolean') issue(issues,`${path}.active`,'boolean_required');
});
export const ServiceRevisionSchema = schema<ServiceRevision>(validateRevision);
export const AdminServiceSchema = schema<AdminService>((value,issues,path) => {
  const row = object(value,['service','revisions','internalNotes'],issues,path);
  validateService(row.service,issues,`${path}.service`);
  const revisions = list(row.revisions,validateRevision,issues,`${path}.revisions`);
  unique(revisions,'id',issues,`${path}.revisions`); unique(revisions,'number',issues,`${path}.revisions`);
  text(row.internalNotes,issues,`${path}.internalNotes`,false,10000);
  if (!row.service || typeof row.service !== 'object') return;
  const service = row.service as Record<string,unknown>;
  const ids = new Set(revisions.map(v => v && typeof v === 'object' && 'id' in v ? v.id : undefined));
  if (!ids.has(service.workingRevisionId) || (service.publishedRevisionId !== null && !ids.has(service.publishedRevisionId))) issue(issues,path,'missing_revision');
  for (const revision of revisions) if (revision && typeof revision === 'object' && 'serviceId' in revision && revision.serviceId !== service.id) issue(issues,path,'revision_service_mismatch');
});

// Readiness only: never changes state, persists data, or authorizes publication.
export function validateForPublication(input: unknown, revisionId: string, categories: readonly Category[]): Issue[] {
  const result = AdminServiceSchema.safeParse(input);
  if (!result.success) return result.issues;
  const admin = result.data, issues: Issue[] = [];
  const revision = admin.revisions.find(row => row.id === revisionId);
  if (!revision) return [{path:'revisionId',code:'missing_revision'}];
  if (admin.service.provenance !== 'verified') issue(issues,'service.provenance','unverified_service');
  slug(revision.slug,issues,'revision.slug');
  const category = categories.find(row => row.id === revision.categoryId);
  if (!category || !CategorySchema.safeParse(category).success || !category.active) issue(issues,'categoryId','active_category_required');
  for (const locale of ['es','en'] as const) {
    const checked = ServiceTranslationSchema.safeParse(revision.translations[locale]);
    if (!checked.success) issue(issues,`translations.${locale}`,'complete_translation_required');
  }
  if (!revision.options.length) issue(issues,'options','option_required');
  revision.options.forEach((option,index) => {
    if (!ServiceOptionSchema.safeParse(option).success) issue(issues,`options[${index}]`,'invalid_option');
    validateOption(option,issues,`options[${index}]`,true);
  });
  if (!revision.media.length) issue(issues,'media','image_required');
  revision.media.forEach((media,index) => {
    if (media.provenance !== 'verified' || media.usageApproval !== 'approved') issue(issues,`media[${index}]`,'approved_image_required');
    for (const locale of ['es','en'] as const) text(media.alt[locale],issues,`media[${index}].alt.${locale}`,true,250);
    url(media.url,issues,`media[${index}].url`);
  });
  if (revision.commercialApproval.status !== 'approved' || revision.commercialApproval.revisionId !== revision.id) issue(issues,'commercialApproval','commercial_approval_required');
  return issues;
}
export function projectPublicCatalog(inputs: readonly AdminService[], categories: readonly Category[]): PublicCatalog {
  const services: PublicCatalogService[] = [];
  const ids = new Set<string>();
  for (const input of inputs) {
    const admin = AdminServiceSchema.parse(input), service = admin.service;
    if (ids.has(service.id)) throw new Error('Duplicate service identity');
    ids.add(service.id);
    if (service.status !== 'published' || service.provenance !== 'verified') continue;
    const revisionId = service.publishedRevisionId!;
    const issues = validateForPublication(admin,revisionId,categories);
    if (issues.length) throw new Error('Published revision failed publication validation');
    const revision = admin.revisions.find(row => row.id === revisionId)!;
    services.push({ id:service.id, slug:revision.slug, revisionId, source:'published', categoryId:revision.categoryId!,
      translations:structuredClone(revision.translations), options:structuredClone(revision.options), referencePrice:null,
      // Omitted when absent so services without a discount keep the pre-0008 public shape.
      ...(revision.discount ? {discount:structuredClone(revision.discount)} : {}),
      media:revision.media.map(({id,url,alt,sortOrder}) => ({id,url,alt:structuredClone(alt),sortOrder})).sort((a,b) => a.sortOrder-b.sortOrder),
    });
  }
  return PublicCatalogSchema.parse({schemaVersion:1,source:'api',services,categories:categories.filter(row => row.active).map(({id,slug,translations}) => ({id,slug,translations}))});
}
