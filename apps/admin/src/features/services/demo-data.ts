import referencePhoto from '../../assets/carabao.webp';
import { newService, type DemoService } from './model';

// Presentation fixtures only. None of these services, prices or publication states is real.
export function demoServices(): DemoService[] {
  const first: DemoService = { ...newService('demo-wellness'), title: { es: 'Bienestar · Ejemplo A', en: 'Wellness · Example A' }, description: { es: 'Contenido ficticio para evaluar el catálogo. No representa un servicio disponible.', en: 'Fictional content for evaluating the catalog. This is not an available service.' }, slug: 'demo-wellness', duration: '90', currency: 'USD', amount: '100', priceMode: 'fixed', status: 'published', modifiedAt: '2026-10-22T12:00:00Z', images: [{ id: 'reference', src: referencePhoto, name: 'Carabao · referencia pública', alt: { es: 'Foto de referencia de Kuwago; no representa este servicio de prueba.', en: 'Kuwago reference photo; it does not represent this demo service.' } }] };
  const second: DemoService = { ...newService('demo-dining'), title: { es: 'Gastronomía · Ejemplo B', en: 'Dining · Example B' }, slug: 'demo-dining', category: 'dining', duration: '120', privacy: 'shared', modifiedAt: '2026-10-21T12:00:00Z' };
  const third: DemoService = { ...first, id: 'demo-adventure', title: { es: 'Actividad · Ejemplo C', en: 'Activity · Example C' }, slug: 'demo-adventure', category: 'adventure', venue: 'off_property', priceMode: 'from', amount: '180', status: 'archived', modifiedAt: '2026-10-20T12:00:00Z', images: [] };
  return [first, second, third];
}
