import type { DemoService } from './model';
import type { ServiceCopy } from './copy';
import { currencies as sharedCurrencies } from '@kuwago/contracts';
export type FieldName = 'slug' | 'duration' | 'amount' | 'currency';
export type Validation = { fields: Partial<Record<FieldName, keyof ServiceCopy>>; pending: (keyof ServiceCopy)[] };
export const currencies = sharedCurrencies;
export function validateService(service: DemoService, records: readonly DemoService[]): Validation {
  const fields: Validation['fields'] = {}, pending: Validation['pending'] = [];
  if (!service.title.es.trim() || !service.title.en.trim()) pending.push('titleMissing');
  if (!service.description.es.trim() || !service.description.en.trim()) pending.push('descriptionMissing');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service.slug) || service.slug.length > 80 || records.some(row => row.id !== service.id && row.slug === service.slug)) {
    pending.push('slugMissing'); if (service.slug) fields.slug = 'invalidSlug';
  }
  if (!/^\d+$/.test(service.duration) || Number(service.duration) < 1 || Number(service.duration) > 1440) {
    pending.push('durationMissing'); if (service.duration) fields.duration = 'invalidDuration';
  }
  if (service.priceMode !== 'quote') {
    if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(service.amount) || Number(service.amount) <= 0) fields.amount = 'invalidAmount';
    if (!currencies.some(currency => currency === service.currency)) fields.currency = 'invalidCurrency';
    if (fields.amount || fields.currency) pending.push('priceMissing');
    if (!service.amount) delete fields.amount;
    if (!service.currency) delete fields.currency;
  }
  if (!service.images.length) pending.push('imagesMissing');
  if (service.images.some(image => !image.alt.es.trim() || !image.alt.en.trim())) pending.push('altMissing');
  return { fields, pending };
}
export function validImageFiles(files: readonly File[], currentCount: number) {
  return currentCount + files.length <= 8 && files.every(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 2 * 1024 * 1024);
}
export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items];
  const result = [...items]; const [item] = result.splice(from, 1);
  if (item !== undefined) result.splice(to, 0, item);
  return result;
}

