import { ArrowLeft, FlaskConical } from 'lucide-react';
import { Panel } from '../../components/ui';
import type { AdminRoute } from '../../routing';
import { newService } from './model';
import { useDemoServices } from './DemoServicesProvider';
import { useServiceCopy } from './copy';
import { ServicesList } from './components/ServicesList';
import { ServiceEditor } from './components/ServiceEditor';
import { ServicePreview } from './components/ServicePreview';
export function ServicesModule({ route }: { route: Extract<AdminRoute, { page: 'services' }> }) {
  const store = useDemoServices(), c = useServiceCopy();
  const id = route.mode === 'new' ? 'demo-new' : 'id' in route ? route.id : '';
  const service = store.drafts[id] || store.records.find(row => row.id === id) || (id === 'demo-new' ? newService(id) : undefined);
  return <div className="services-module"><div className="demo-disclaimer" role="note"><FlaskConical size={20} aria-hidden="true" /><div><strong>{c.demo}</strong><p>{c.notice}</p></div></div>{store.message && <p className="demo-feedback" role="status">{c.applied}</p>}
    {route.mode === 'list' ? <ServicesList records={store.records} /> : !service ? <Panel className="service-empty"><h1>{c.missing}</h1><p>{c.missingText}</p><a href="#services" className="button button-secondary">{c.back}</a></Panel> : route.mode === 'preview' ? <div className="standalone-preview"><a href="#services" className="button button-quiet"><ArrowLeft size={18} aria-hidden="true" />{c.back}</a><h1>{c.previewTitle}</h1><p>{c.previewNote}</p><ServicePreview service={service} /><a className="button button-primary" href={`#services/${id}/edit`}>{c.edit}</a></div> : <ServiceEditor key={id} service={service} />}
  </div>;
}
