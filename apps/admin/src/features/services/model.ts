import type { Language } from '../../i18n';
import type { PublicationStatus as SharedPublicationStatus, PriceKind } from '@kuwago/contracts';

export type Localized = Record<Language, string>;
export const categories = ['wellness', 'dining', 'adventure'] as const;
export type Category = typeof categories[number];
export type PublicationStatus = SharedPublicationStatus;
export type PriceMode = PriceKind;
export type DemoImage = { id: string; src: string; name: string; alt: Localized };
export type DemoService = {
  id: string; title: Localized; description: Localized; slug: string; category: Category;
  status: PublicationStatus; duration: string; privacy: 'private' | 'shared'; venue: 'in_property' | 'off_property';
  priceMode: PriceMode; amount: string; currency: string; unit: 'person' | 'group' | 'service';
  images: DemoImage[]; modifiedAt: string;
};
export type DemoViewState = 'ready' | 'empty' | 'loading' | 'error';
export function newService(id: string): DemoService {
  return { id, title: { es: '', en: '' }, description: { es: '', en: '' }, slug: '', category: 'wellness', status: 'draft', duration: '', privacy: 'private', venue: 'in_property', priceMode: 'quote', amount: '', currency: '', unit: 'service', images: [], modifiedAt: '' };
}


