import { PublicPropertiesSchema } from './contracts/public.js';

/** Validate the whole response before changing any existing photo card. */
export function applyProperties(document, input) {
  const parsed = PublicPropertiesSchema.safeParse(input);
  const grid = document.getElementById('properties-grid');
  if (!parsed.success || grid === null) return false;
  // Existing cards are the photo-backed PROPERTY_DATA entries. Never create cards for unknown slugs.
  const cards = new Map([...grid.querySelectorAll('[data-property-card]')].map(card => [card.getAttribute('data-property-card'), card]));
  const visible = [...parsed.data.properties].sort((a,b) => a.sortOrder-b.sortOrder || a.slug.localeCompare(b.slug));
  const slugs = new Set(visible.map(p => p.slug));
  const lang = document.documentElement.lang === 'es' ? 'es' : 'en';
  for (const [slug,card] of cards) {
    card.hidden = !slugs.has(slug);
    // The landing's flex utility overrides the UA [hidden] rule.
    card.style.display = card.hidden ? 'none' : '';
  }
  for (const property of visible) {
    const card = cards.get(property.slug);
    if (!card) continue;
    const title = card.querySelector('h3'), tagline = card.querySelector('p[data-i18n], p[data-property-tagline]');
    if (title) { title.removeAttribute('data-i18n'); title.textContent = property.translations[lang].name; }
    if (tagline) { tagline.removeAttribute('data-i18n'); tagline.setAttribute('data-property-tagline',''); tagline.textContent = property.translations[lang].tagline; }
    card.setAttribute('aria-label', `${lang === 'es' ? 'Abrir' : 'Open'} ${property.translations[lang].name}`);
    grid.append(card);
  }
  return true;
}

export async function loadProperties(document, baseUrl, fetcher = fetch) {
  if (!baseUrl) return null;
  try {
    const response = await fetcher(`${baseUrl.replace(/\/$/,'')}/v1/properties`, {
      credentials:'omit', cache:'no-store', headers:{Accept:'application/json'}, signal:AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const input = await response.json();
    return applyProperties(document, input) ? input : null;
  } catch { return null; } // Keep the original four cards, including their static translations.
}

if (typeof window !== 'undefined' && document.getElementById('properties-grid')) {
  let published = null;
  document.addEventListener('kuwago:language', () => {
    // main.js updates card aria-labels after dispatch; apply the published labels last.
    queueMicrotask(() => { if (published) applyProperties(document, published); });
  });
  void loadProperties(document, window.KUWAGO_CATALOG_API?.baseUrl ?? '').then(value => { published = value; });
}
