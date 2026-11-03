export const publicationStatuses = ['draft', 'published', 'archived'] as const;
export type PublicationStatus = typeof publicationStatuses[number];
export const currencies = ['USD', 'CRC', 'EUR'] as const;
export type Currency = typeof currencies[number];
export type Locale = 'es' | 'en';
export type Localized<T> = Record<Locale, T>;
export type Provenance = 'demo' | 'stitch_reference' | 'verified';
export type BillingUnit = 'person' | 'group' | 'service' | 'dinner';
export type PriceKind = 'fixed' | 'from' | 'quote';
export type ServiceTranslation = { title: string; description: string };
export type ServicePrice =
  | { kind: 'fixed' | 'from'; amountMinor: number; currency: Currency; unit: BillingUnit }
  | { kind: 'quote'; currency: Currency | null; unit: BillingUnit };
export type PublicCategory = { id: string; slug: string; translations: Localized<{ name: string }> };
export type Category = PublicCategory & { active: boolean };
export type PublicMediaAsset = { id: string; url: string; alt: Localized<string>; sortOrder: number };
export type MediaAsset = PublicMediaAsset & { provenance: Provenance; usageApproval: 'pending' | 'approved' };
export type ServiceOption = {
  id: string; translations: Localized<{ name: string }>;
  durationMinutes: number | null;
  experienceType: 'private' | 'shared' | null;
  venue: 'in_property' | 'off_property' | null;
  price: ServicePrice | null;
};
export type Service = {
  id: string; provenance: Provenance; status: PublicationStatus;
  workingRevisionId: string; publishedRevisionId: string | null; modifiedAt: string;
};
export type ServiceRevision = {
  id: string; serviceId: string; slug: string; number: number; createdAt: string;
  categoryId: string | null; translations: Localized<ServiceTranslation>;
  options: ServiceOption[]; media: MediaAsset[];
  commercialApproval: { status: 'pending' | 'approved'; revisionId: string | null };
};
export type AdminService = { service: Service; revisions: ServiceRevision[]; internalNotes: string };
// A legacy price label is deliberately not money. "$" has no inferred currency.
export type ReferencePrice = { amount: string; symbol: '$'; currency: null; unit: BillingUnit };
export type PublicCatalogService = {
  id: string; revisionId: string; slug: string; categoryId: string;
  source: 'published' | 'stitch_reference';
  translations: Localized<ServiceTranslation>; options: ServiceOption[];
  media: PublicMediaAsset[]; referencePrice: ReferencePrice | null;
};
export type PublicCatalog = {
  schemaVersion: 1; source: 'api' | 'static_reference';
  categories: PublicCategory[]; services: PublicCatalogService[];
};
export interface CatalogAdapter { load(options?: { signal?: AbortSignal }): Promise<unknown> }
export interface HttpCatalogAdapter extends CatalogAdapter { readonly kind: 'http'; readonly responseSource: 'api' }
export type CatalogLoadState =
  | { status: 'loading'; catalog: null }
  | { status: 'ready' | 'empty'; catalog: PublicCatalog }
  | { status: 'error'; catalog: null; code: 'invalid_response' | 'source_unavailable' };
export type CatalogCartItem = { id: string; revisionId: string; optionId: string; date: string; travelers: number };
export type CartAvailability = 'available' | 'withdrawn' | 'changed' | 'invalid' | 'unverified';
