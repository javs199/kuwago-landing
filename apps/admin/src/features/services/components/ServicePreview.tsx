import { ImageIcon, Clock3, MapPin } from 'lucide-react';
import { usePreferences } from '../../../preferences';
import { StatusBadge } from '../../../components/ui';
import type { DemoService } from '../model';
import { useServiceCopy } from '../copy';
export function priceText(service: DemoService, language: 'es' | 'en', c: ReturnType<typeof useServiceCopy>) {
  if (service.priceMode === 'quote') return c.quote;
  if (!['USD', 'CRC', 'EUR'].includes(service.currency) || !service.amount || !Number.isFinite(Number(service.amount))) return c.unspecified;
  const price = new Intl.NumberFormat(language, { style: 'currency', currency: service.currency, currencyDisplay: 'code' }).format(Number(service.amount));
  return `${service.priceMode === 'from' ? c.from + ' ' : ''}${price}`;
}
export function PublicationBadge({ status }: { status: DemoService['status'] }) {
  const c = useServiceCopy();
  return <span className={`publication-badge publication-${status}`}>{c[status]} · {c.example}</span>;
}
export function ServicePreview({ service }: { service: DemoService }) {
  const { language } = usePreferences(); const c = useServiceCopy(); const image = service.images[0];
  return <article className="service-preview-card"><div className="preview-image">{image ? <img src={image.src} alt={image.alt[language]} /> : <ImageIcon size={48} aria-hidden="true" />}<StatusBadge tone="accent">{c.demo}</StatusBadge></div><div className="preview-content"><div className="preview-kicker">{c[service.category]}</div><h2>{service.title[language] || c.untitled}</h2><p className="preview-description">{service.description[language] || c.noDescription}</p><div className="preview-facts"><span><Clock3 size={16} aria-hidden="true" />{service.duration || '—'} min · {c[service.privacy]}</span><span><MapPin size={16} aria-hidden="true" />{c[service.venue]}</span></div><div className="preview-price">{priceText(service, language, c)}<small>{c[service.unit]}</small></div><PublicationBadge status={service.status} /><p className="reference-note">{c.referenceImage}</p></div></article>;
}
