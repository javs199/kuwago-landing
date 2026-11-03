import { useState } from 'react';
import { ArrowLeft, Check, Circle, Eye, FileText, ImageIcon, ShoppingBag, Sparkles } from 'lucide-react';
import { Button, Panel } from '../../../components/ui';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { categories, type Category, type DemoService, type PublicationStatus } from '../model';
import { useServiceCopy } from '../copy';
import { currencies, validateService } from '../validation';
import { useDemoServices } from '../DemoServicesProvider';
import { SelectField, TextField } from './Fields';
import { ImageSelector } from './ImageSelector';
import { PublicationBadge, ServicePreview } from './ServicePreview';
import { demoToAdminContract } from '../contract-adapter';

export function ServiceEditor({ service }: { service: DemoService }) {
  const c = useServiceCopy(), store = useDemoServices();
  const [critical, setCritical] = useState<PublicationStatus | 'discard' | null>(null);
  const [invalid, setInvalid] = useState(false), [showPreview, setShowPreview] = useState(false);
  const validation = validateService(service, store.records);
  const dirty = !!store.drafts[service.id];
  const change = (patch: Partial<DemoService>) => store.change({ ...service, ...patch });
  const apply = () => {
    if (Object.keys(validation.fields).length || (service.status === 'published' && validation.pending.length) || !demoToAdminContract(service).success) { setInvalid(true); return; }
    setInvalid(false); const id = store.apply(service); location.hash = `services/${id}/edit`;
  };
  return <><div className="editor-heading"><Button icon={ArrowLeft} variant="quiet" onClick={() => { if (dirty) setCritical('discard'); else location.hash = 'services'; }}>{c.back}</Button><div className="editor-title"><div><p className="section-eyebrow">{c.editor}</p><h1>{service.id === 'demo-new' ? c.newTitle : c.editing}</h1></div><PublicationBadge status={service.status} /></div><p className="editor-hint">{c.saveHint}</p></div>
    <form className="service-editor" noValidate onSubmit={event => { event.preventDefault(); apply(); }}>
      <div className="editor-fields">
        <Panel className="form-panel" aria-labelledby="general-title"><h2 id="general-title"><FileText size={21} aria-hidden="true" />{c.general}</h2><div className="form-grid"><TextField label={c.titleEs} value={service.title.es} maxLength={100} onChange={value => change({ title: { ...service.title, es: value } })} /><TextField label={c.titleEn} value={service.title.en} maxLength={100} onChange={value => change({ title: { ...service.title, en: value } })} /><TextField label={c.descriptionEs} value={service.description.es} multiline onChange={value => change({ description: { ...service.description, es: value } })} /><TextField label={c.descriptionEn} value={service.description.en} multiline onChange={value => change({ description: { ...service.description, en: value } })} /><SelectField label={c.category} value={service.category} onChange={value => change({ category: value as Category })}>{categories.map(value => <option key={value} value={value}>{c[value]}</option>)}</SelectField><TextField label={c.slug} value={service.slug} maxLength={80} onChange={value => change({ slug: value })} help={c.slugHelp} error={validation.fields.slug ? c[validation.fields.slug] : undefined} /></div></Panel>
        <Panel className="form-panel" aria-labelledby="commercial-title"><h2 id="commercial-title"><ShoppingBag size={21} aria-hidden="true" />{c.commercial}</h2><div className="form-grid"><TextField label={c.duration} value={service.duration} inputMode="numeric" maxLength={4} onChange={value => change({ duration: value })} error={validation.fields.duration ? c[validation.fields.duration] : undefined} /><SelectField label={c.privacy} value={service.privacy} onChange={value => change({ privacy: value as DemoService['privacy'] })}><option value="private">{c.private}</option><option value="shared">{c.shared}</option></SelectField><SelectField label={c.venue} value={service.venue} onChange={value => change({ venue: value as DemoService['venue'] })}><option value="in_property">{c.in_property}</option><option value="off_property">{c.off_property}</option></SelectField><SelectField label={c.priceMode} value={service.priceMode} onChange={value => change({ priceMode: value as DemoService['priceMode'] })}>{(['fixed','from','quote'] as const).map(value => <option key={value} value={value}>{c[value]}</option>)}</SelectField>{service.priceMode !== 'quote' && <TextField label={c.amount} value={service.amount} inputMode="decimal" maxLength={12} onChange={value => change({ amount: value })} help={c.priceHelp} error={validation.fields.amount ? c[validation.fields.amount] : undefined} />}<SelectField label={c.currency} value={service.currency} onChange={value => change({ currency: value })} help={c.currencyHelp} error={validation.fields.currency ? c[validation.fields.currency] : undefined}><option value="">{c.unspecified}</option>{currencies.map(value => <option key={value} value={value}>{value}</option>)}</SelectField><SelectField label={c.unit} value={service.unit} onChange={value => change({ unit: value as DemoService['unit'] })}>{(['person','group','service'] as const).map(value => <option key={value} value={value}>{c[value]}</option>)}</SelectField></div></Panel>
        <Panel className="form-panel" aria-labelledby="media-title"><h2 id="media-title"><ImageIcon size={21} aria-hidden="true" />{c.media}</h2><ImageSelector images={service.images} onChange={images => change({ images })} /></Panel>
      </div>
      <aside className="publication-sidebar"><Panel className="publication-panel" aria-labelledby="publication-title"><h2 id="publication-title"><Sparkles size={21} aria-hidden="true" />{c.publication}</h2><PublicationBadge status={service.status} /><p className="publication-explanation">{c.confirmText}</p><h3>{validation.pending.length ? c.pending : c.complete}</h3><ul className="readiness-list">{(['titleMissing','descriptionMissing','slugMissing','durationMissing','priceMissing','imagesMissing','altMissing'] as const).map(key => <li key={key} className={validation.pending.includes(key) ? 'is-pending' : 'is-complete'}>{validation.pending.includes(key) ? <Circle size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}{c[key]}</li>)}</ul><div className="publication-actions"><Button icon={Eye} onClick={() => setShowPreview(value => !value)} aria-expanded={showPreview} aria-controls="inline-preview">{c.preview}</Button><Button disabled={service.status === 'published' || !!validation.pending.length} onClick={() => setCritical('published')}>{c.rehearsePublish}</Button><Button disabled={service.status === 'draft'} onClick={() => setCritical('draft')}>{c.rehearseDraft}</Button><Button disabled={service.status === 'archived'} onClick={() => setCritical('archived')}>{c.rehearseArchive}</Button></div></Panel></aside>
      {showPreview && <div id="inline-preview" className="inline-preview"><h2>{c.previewTitle}</h2><p>{c.previewNote}</p><ServicePreview service={service} /></div>}
      <div className="editor-save-bar"><div>{invalid && <p role="alert" className="field-error">{c.invalid}</p>}{dirty && <span>{c.unsaved}</span>}</div><Button type="submit" variant="primary">{c.apply}</Button></div>
    </form>
    {critical && <ConfirmDialog title={critical === 'discard' ? c.discardTitle : c.confirmTitle} description={<><p>{critical === 'discard' ? c.discardText : c.confirmText}</p>{critical !== 'discard' && <p><strong>{c[critical]} · {c.example}</strong></p>}</>} cancel={c.cancel} confirm={critical === 'discard' ? c.discard : c.confirm} onCancel={() => setCritical(null)} onConfirm={() => {
      if (critical === 'discard') { store.discard(service.id); location.hash = 'services'; }
      else { change({ status: critical }); setInvalid(false); }
      setCritical(null);
    }} />}
  </>;
}
