import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bath,
  Bed,
  Building2,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Home,
  ImageIcon,
  Info,
  KeyRound,
  Lock,
  MapPin,
  Save,
  Shield,
  Sliders,
  Users,
} from 'lucide-react';
import { PropertyInputSchema, type PropertyInput } from '@kuwago/contracts';
import { adminApi, ApiError, type PropertyDocument } from '../../api/admin-client';
import { useSession } from '../../api/session';
import { Button } from '../../components/ui';
import { ErrorNotice, useUnsaved } from '../services/api-support';
import { usePreferences } from '../../preferences';
import { usePropertyCopy, type PropertyCopy } from './copy';
import { getPropertyCover } from './covers';
import './properties.css';

const blank = (): PropertyInput => ({
  slug: '',
  kind: 'managed',
  sortOrder: 0,
  showOnLanding: false,
  location: null,
  maxGuests: null,
  bedrooms: null,
  bathrooms: null,
  airbnbUrl: null,
  ownerName: null,
  ownerContact: null,
  internalNotes: null,
  translations: {
    es: { name: '', tagline: '', description: '' },
    en: { name: '', tagline: '', description: '' },
  },
});

function editable(p: PropertyInput): PropertyInput {
  return Object.fromEntries(
    Object.keys(blank()).map((k) => [k, structuredClone(p[k as keyof PropertyInput])])
  ) as PropertyInput;
}

type TabKey = 'general' | 'data' | 'photos' | 'guests' | 'owner' | 'calendar';

function resolveIssueTarget(
  path: string,
  c: PropertyCopy
): { tab: TabKey | null; fieldId: string; label: string } {
  if (path.includes('translations.es.name')) {
    return { tab: 'general', fieldId: 'prop-name-es', label: c.nameEs };
  }
  if (path.includes('translations.es.tagline')) {
    return { tab: 'general', fieldId: 'prop-tagline-es', label: c.taglineEs };
  }
  if (path.includes('translations.es.description')) {
    return { tab: 'general', fieldId: 'prop-desc-es', label: c.descriptionEs };
  }
  if (path.includes('translations.en.name')) {
    return { tab: 'general', fieldId: 'prop-name-en', label: c.nameEn };
  }
  if (path.includes('translations.en.tagline')) {
    return { tab: 'general', fieldId: 'prop-tagline-en', label: c.taglineEn };
  }
  if (path.includes('translations.en.description')) {
    return { tab: 'general', fieldId: 'prop-desc-en', label: c.descriptionEn };
  }
  if (path.endsWith('.airbnbUrl')) {
    return { tab: 'data', fieldId: 'prop-airbnb', label: c.airbnbUrl };
  }
  if (path.endsWith('.slug')) {
    return { tab: 'data', fieldId: 'prop-slug', label: c.slug };
  }
  if (path.endsWith('.location')) {
    return { tab: 'data', fieldId: 'prop-location', label: c.location };
  }
  if (path.endsWith('.maxGuests')) {
    return { tab: 'data', fieldId: 'prop-guests', label: c.maxGuests };
  }
  if (path.endsWith('.bedrooms')) {
    return { tab: 'data', fieldId: 'prop-bedrooms', label: c.bedrooms };
  }
  if (path.endsWith('.bathrooms')) {
    return { tab: 'data', fieldId: 'prop-bathrooms', label: c.bathrooms };
  }
  if (path.endsWith('.ownerName')) {
    return { tab: 'owner', fieldId: 'prop-owner-name', label: c.ownerName };
  }
  if (path.endsWith('.ownerContact')) {
    return { tab: 'owner', fieldId: 'prop-owner-contact', label: c.ownerContact };
  }
  if (path.endsWith('.internalNotes')) {
    return { tab: 'owner', fieldId: 'prop-internal-notes', label: c.internalNotes };
  }
  if (path.endsWith('.sortOrder')) {
    return { tab: null, fieldId: 'prop-order', label: c.order };
  }
  return { tab: 'general', fieldId: 'prop-name-es', label: c.name };
}

export function PropertyEditor({ id }: { id: string | null }) {
  const c = usePropertyCopy();
  const { identity, reject } = useSession();
  const { language } = usePreferences();

  const [doc, setDoc] = useState<PropertyDocument | null>(null);
  const [form, setForm] = useState<PropertyInput>(blank);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<ApiError | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [invalidFieldId, setInvalidFieldId] = useState<string | null>(null);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<string | null>(null);

  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useUnsaved(dirty);

  useEffect(() => {
    if (!invalid || !pendingFocusRef.current) return;
    const fieldId = pendingFocusRef.current;
    const el = document.getElementById(fieldId);
    if (el) {
      el.focus();
      pendingFocusRef.current = null;
    }
  }, [activeTab, invalid, invalidFieldId]);

  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    adminApi
      .property(id, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) {
          setDoc(value);
          setForm(editable(value.data));
          setDirty(false);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!abort.signal.aborted) {
          const reason = e instanceof ApiError ? e : new ApiError(0, 'network');
          setError(reason);
          reject(reason);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [id, revision, reject]);

  function update<K extends keyof PropertyInput>(key: K, value: PropertyInput[K]) {
    setForm((old) => ({ ...old, [key]: value }));
    setDirty(true);
    setInvalid(false);
    setInvalidFieldId(null);
    setInvalidReason(null);
  }

  async function save() {
    if (!identity?.permissions.includes('drafts:write')) return;
    const parsed = PropertyInputSchema.safeParse(form);
    if (!parsed.success) {
      const firstIssue = parsed.issues[0];
      const target = resolveIssueTarget(firstIssue?.path ?? '', c);
      setInvalid(true);
      setInvalidFieldId(target.fieldId);
      setInvalidReason(target.label);
      pendingFocusRef.current = target.fieldId;
      if (target.tab && target.tab !== activeTab) {
        setActiveTab(target.tab);
      } else {
        const el = document.getElementById(target.fieldId);
        if (el) {
          el.focus();
          pendingFocusRef.current = null;
        }
      }
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const value = await adminApi.saveProperty(form, id ?? undefined, doc?.version);
      if (!active.current) return;
      setDoc(value);
      setForm(editable(value.data));
      setDirty(false);
      if (!id) location.hash = '#properties/' + value.data.id;
    } catch (e) {
      if (active.current) {
        const reason = e instanceof ApiError ? e : new ApiError(0, 'network');
        setError(reason);
        reject(reason);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }

  async function transition(action: 'publish' | 'unpublish' | 'archive') {
    if (!doc || dirty || !identity?.permissions.includes(`services:${action}`) || !confirm(c.confirm))
      return;
    setBusy(true);
    setError(null);
    try {
      const value = await adminApi.publishProperty(doc.data.id, action, doc.version);
      if (active.current) setDoc(value);
    } catch (e) {
      if (active.current) {
        const reason = e instanceof ApiError ? e : new ApiError(0, 'network');
        setError(reason);
        reject(reason);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }

  const tabDefs: Array<{ key: TabKey; label: string; disabled: boolean; soon?: boolean; icon: typeof FileText }> = [
    { key: 'general', label: c.general, disabled: false, icon: FileText },
    { key: 'data', label: c.data, disabled: false, icon: Sliders },
    { key: 'photos', label: c.photos, disabled: false, icon: ImageIcon },
    { key: 'guests', label: c.guests, disabled: true, soon: true, icon: Users },
    { key: 'owner', label: c.owner, disabled: false, icon: Shield },
    { key: 'calendar', label: c.calendar, disabled: true, soon: true, icon: Home },
  ];

  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const enabledTabs = tabDefs.filter((t) => !t.disabled);
    const enabledIndex = enabledTabs.findIndex((t) => t.key === tabDefs[currentIndex]?.key);

    let nextTabKey: TabKey | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = (enabledIndex + 1) % enabledTabs.length;
      nextTabKey = enabledTabs[nextIdx]?.key ?? null;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = (enabledIndex - 1 + enabledTabs.length) % enabledTabs.length;
      nextTabKey = enabledTabs[prevIdx]?.key ?? null;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextTabKey = enabledTabs[0]?.key ?? null;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextTabKey = enabledTabs[enabledTabs.length - 1]?.key ?? null;
    }

    if (nextTabKey) {
      setActiveTab(nextTabKey);
      const btn = tabsListRef.current?.querySelector<HTMLButtonElement>(`button[data-tab="${nextTabKey}"]`);
      btn?.focus();
    }
  }

  if (loading) return <p role="status">{c.loading}</p>;
  if (id && !doc) {
    return (
      <div className="property-editor-container">
        <ErrorNotice error={error} />
        <Button onClick={() => { setLoading(true); setRevision((v) => v + 1); }}>
          {c.retry}
        </Button>
      </div>
    );
  }

  const writable = !!identity?.permissions.includes('drafts:write');
  const canPublish = !!identity?.permissions.includes('services:publish');
  const canUnpublish = !!identity?.permissions.includes('services:unpublish');
  const canArchive = !!identity?.permissions.includes('services:archive');

  const cover = getPropertyCover(form.slug || doc?.data.slug || '');
  const propertyTitle = form.translations[language]?.name || form.translations.es?.name || (doc ? doc.data.slug : c.new);
  const statusBadgeText = doc ? (doc.data.status === 'published' ? c.published : doc.data.status === 'draft' ? c.draft : c.archived) : c.draft;

  const formattedPublishedAt = doc?.data.publishedAt
    ? new Date(doc.data.publishedAt).toLocaleDateString(language === 'es' ? 'es-CR' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="property-editor-container" style={{ paddingBottom: '96px' }}>
      <nav aria-label={c.breadcrumbProperties} className="editor-breadcrumbs">
        <a className="button-quiet" href="#properties">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{c.breadcrumbProperties}</span>
        </a>
        <span>/</span>
        <span style={{ fontWeight: 600 }}>{propertyTitle}</span>
      </nav>

      <div className="editor-header">
        <div className="editor-title-row">
          <h1>{doc ? `${c.editTitle}: ${propertyTitle}` : c.new}</h1>
          <span
            className={`badge-status ${
              doc?.data.status === 'published'
                ? 'badge-status-published'
                : doc?.data.status === 'draft'
                ? 'badge-status-draft'
                : 'badge-status-archived'
            }`}
          >
            <span className="badge-dot" />
            <span>{statusBadgeText}</span>
          </span>
        </div>

        {form.slug && (
          <a
            className="button button-secondary"
            href={`https://grupokuwago.com/#${form.slug}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span>{c.viewOnSite}</span>
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        )}
      </div>

      {doc && (
        <div className="editor-hero-card">
          <div className="editor-hero-thumb">
            {cover ? (
              <img alt={propertyTitle} src={cover} />
            ) : (
              <div className="property-card-placeholder">
                <ImageIcon size={28} aria-hidden="true" />
                <small>{c.noCover}</small>
              </div>
            )}
          </div>
          <div className="editor-hero-info">
            <span className="properties-eyebrow">
              <Home size={14} aria-hidden="true" />
              {form.kind === 'rental' ? c.rental : c.managed} · #{form.sortOrder}
            </span>
            <strong style={{ fontSize: '20px', color: 'var(--text)' }}>{propertyTitle}</strong>
            {form.translations[language]?.tagline && (
              <p className="editor-hero-tagline">{form.translations[language]?.tagline}</p>
            )}
            <div className="editor-hero-stats">
              {form.location && (
                <span>
                  <MapPin size={14} aria-hidden="true" />
                  {form.location}
                </span>
              )}
              {form.maxGuests != null && (
                <span>
                  <Users size={14} aria-hidden="true" />
                  {form.maxGuests} {c.guestsShort}
                </span>
              )}
              {form.bedrooms != null && (
                <span>
                  <Bed size={14} aria-hidden="true" />
                  {form.bedrooms} {c.bedsShort}
                </span>
              )}
              {form.bathrooms != null && (
                <span>
                  <Bath size={14} aria-hidden="true" />
                  {form.bathrooms} {c.bathsShort}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <ErrorNotice error={error} />
      {error?.status === 409 && <p role="alert">{c.conflict}</p>}
      {invalid && (
        <p role="alert" className="field-error">
          {invalidReason ? `${c.invalid} (${invalidReason})` : c.invalid}
        </p>
      )}

      <div
        ref={tabsListRef}
        aria-label={c.editorTabsLabel}
        className="editor-tabs-bar"
        role="tablist"
      >
        {tabDefs.map((tab, idx) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              aria-controls={`tabpanel-${tab.key}`}
              aria-selected={isSelected}
              className="editor-tab-button"
              data-tab={tab.key}
              disabled={tab.disabled}
              id={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              role="tab"
              tabIndex={isSelected ? 0 : -1}
              type="button"
            >
              <Icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
              {tab.soon && <span className="editor-tab-soon">{c.soon}</span>}
            </button>
          );
        })}
      </div>

      <form
        className="editor-workspace"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || !writable} className="editor-form-col">
          {/* TAB 1: GENERAL */}
          <div
            aria-labelledby="tab-general"
            id="tabpanel-general"
            role="tabpanel"
            style={{ display: activeTab === 'general' ? 'block' : 'none' }}
          >
            <section className="panel form-panel">
              <h2>
                <FileText size={20} aria-hidden="true" />
                <span>{c.identitySection}</span>
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
                {c.identitySectionDesc}
              </p>

              <div className="bilingual-grid">
                {/* Spanish Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="service-field">
                    <label htmlFor="prop-name-es">{c.nameEs}</label>
                    <input
                      aria-invalid={invalid && invalidFieldId === 'prop-name-es' ? true : undefined}
                      id="prop-name-es"
                      maxLength={80}
                      onChange={(e) =>
                        update('translations', {
                          ...form.translations,
                          es: { ...form.translations.es, name: e.target.value },
                        })
                      }
                      type="text"
                      value={form.translations.es.name}
                    />
                  </div>

                  <div className="service-field field-with-counter">
                    <label htmlFor="prop-tagline-es">{c.taglineEs}</label>
                    <input
                      aria-invalid={invalid && invalidFieldId === 'prop-tagline-es' ? true : undefined}
                      id="prop-tagline-es"
                      maxLength={120}
                      onChange={(e) =>
                        update('translations', {
                          ...form.translations,
                          es: { ...form.translations.es, tagline: e.target.value },
                        })
                      }
                      type="text"
                      value={form.translations.es.tagline}
                    />
                    <span className="field-counter">{form.translations.es.tagline.length} / 120</span>
                  </div>

                  <div className="service-field field-with-counter">
                    <label htmlFor="prop-desc-es">{c.descriptionEs}</label>
                    <textarea
                      aria-invalid={invalid && invalidFieldId === 'prop-desc-es' ? true : undefined}
                      id="prop-desc-es"
                      maxLength={2000}
                      onChange={(e) =>
                        update('translations', {
                          ...form.translations,
                          es: { ...form.translations.es, description: e.target.value },
                        })
                      }
                      rows={8}
                      value={form.translations.es.description}
                    />
                    <span className="field-counter">{form.translations.es.description.length} / 2000</span>
                  </div>
                </div>

                {/* English Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="service-field">
                    <label htmlFor="prop-name-en">{c.nameEn}</label>
                    <input
                      aria-invalid={invalid && invalidFieldId === 'prop-name-en' ? true : undefined}
                      id="prop-name-en"
                      maxLength={80}
                      onChange={(e) =>
                        update('translations', {
                          ...form.translations,
                          en: { ...form.translations.en, name: e.target.value },
                        })
                      }
                      type="text"
                      value={form.translations.en.name}
                    />
                  </div>

                  <div className="service-field field-with-counter">
                    <label htmlFor="prop-tagline-en">{c.taglineEn}</label>
                    <input
                      aria-invalid={invalid && invalidFieldId === 'prop-tagline-en' ? true : undefined}
                      id="prop-tagline-en"
                      maxLength={120}
                      onChange={(e) =>
                        update('translations', {
                          ...form.translations,
                          en: { ...form.translations.en, tagline: e.target.value },
                        })
                      }
                      type="text"
                      value={form.translations.en.tagline}
                    />
                    <span className="field-counter">{form.translations.en.tagline.length} / 120</span>
                  </div>

                  <div className="service-field field-with-counter">
                    <label htmlFor="prop-desc-en">{c.descriptionEn}</label>
                    <textarea
                      aria-invalid={invalid && invalidFieldId === 'prop-desc-en' ? true : undefined}
                      id="prop-desc-en"
                      maxLength={2000}
                      onChange={(e) =>
                        update('translations', {
                          ...form.translations,
                          en: { ...form.translations.en, description: e.target.value },
                        })
                      }
                      rows={8}
                      value={form.translations.en.description}
                    />
                    <span className="field-counter">{form.translations.en.description.length} / 2000</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* TAB 2: DATOS (Tarjetas separadas según diseño 06 móvil y escritorio) */}
          <div
            aria-labelledby="tab-data"
            id="tabpanel-data"
            role="tabpanel"
            style={{ display: activeTab === 'data' ? 'block' : 'none' }}
          >
            <div className="data-cards-stack">
              {/* 1. Modalidad Operativa */}
              <section className="panel data-card service-field">
                <div className="data-card-header">
                  <label className="data-card-label">
                    <span>{c.operationalMode}</span>
                  </label>
                  <Building2 size={18} aria-hidden="true" className="data-card-icon-muted" />
                </div>
                <div className="segmented-control" role="group" aria-label={c.operationalMode}>
                  <button
                    aria-pressed={form.kind === 'rental'}
                    className="segmented-button"
                    onClick={() => update('kind', 'rental')}
                    type="button"
                  >
                    <KeyRound size={16} aria-hidden="true" />
                    <span>{c.rental}</span>
                  </button>
                  <button
                    aria-pressed={form.kind === 'managed'}
                    className="segmented-button"
                    onClick={() => update('kind', 'managed')}
                    type="button"
                  >
                    <Building2 size={16} aria-hidden="true" />
                    <span>{c.managed}</span>
                  </button>
                </div>
              </section>

              {/* 2. Ubicación */}
              <section className="panel data-card service-field">
                <label htmlFor="prop-location" className="data-card-label">
                  <MapPin size={18} aria-hidden="true" className="data-card-icon-accent" />
                  <span>{c.location}</span>
                </label>
                <input
                  aria-invalid={invalid && invalidFieldId === 'prop-location' ? true : undefined}
                  id="prop-location"
                  maxLength={120}
                  onChange={(e) => update('location', e.target.value || null)}
                  placeholder={c.locationPlaceholder}
                  type="text"
                  value={form.location ?? ''}
                />
                <small className="data-card-help">
                  <Info size={14} aria-hidden="true" />
                  <span>{c.locationHelp}</span>
                </small>
              </section>

              {/* 3. Distribución y Aforo (3 columnas incluso a 390 px) */}
              <section className="panel data-card service-field">
                <div className="data-card-header">
                  <span className="data-card-label">
                    <Users size={18} aria-hidden="true" className="data-card-icon-accent" />
                    <span>{c.capacitySection}</span>
                  </span>
                  {form.maxGuests != null && (
                    <span className="data-card-meta">
                      {form.maxGuests} {c.guestsShort}
                    </span>
                  )}
                </div>
                <div className="capacity-grid">
                  <div className="capacity-item">
                    <label htmlFor="prop-guests">{c.maxGuests}</label>
                    <input
                      aria-invalid={invalid && invalidFieldId === 'prop-guests' ? true : undefined}
                      aria-label={c.maxGuestsLabel}
                      id="prop-guests"
                      min="0"
                      onChange={(e) => update('maxGuests', e.target.value === '' ? null : Number(e.target.value))}
                      step="1"
                      style={{ textAlign: 'center' }}
                      type="number"
                      value={form.maxGuests ?? ''}
                    />
                  </div>

                  <div className="capacity-item">
                    <label htmlFor="prop-bedrooms">{c.bedrooms}</label>
                    <input
                      aria-invalid={invalid && invalidFieldId === 'prop-bedrooms' ? true : undefined}
                      aria-label={c.bedrooms}
                      id="prop-bedrooms"
                      min="0"
                      onChange={(e) => update('bedrooms', e.target.value === '' ? null : Number(e.target.value))}
                      step="1"
                      style={{ textAlign: 'center' }}
                      type="number"
                      value={form.bedrooms ?? ''}
                    />
                  </div>

                  <div className="capacity-item">
                    <label htmlFor="prop-bathrooms">{c.bathrooms}</label>
                    <input
                      aria-invalid={invalid && invalidFieldId === 'prop-bathrooms' ? true : undefined}
                      aria-label={c.bathrooms}
                      id="prop-bathrooms"
                      min="0"
                      onChange={(e) => update('bathrooms', e.target.value === '' ? null : Number(e.target.value))}
                      step="0.5"
                      style={{ textAlign: 'center' }}
                      type="number"
                      value={form.bathrooms ?? ''}
                    />
                  </div>
                </div>
              </section>

              {/* 4. Enlace Airbnb */}
              <section className="panel data-card service-field">
                <div className="data-card-header">
                  <label htmlFor="prop-airbnb" className="data-card-label">
                    <Home size={18} aria-hidden="true" className="data-card-icon-accent" />
                    <span>{c.airbnbUrl}</span>
                  </label>
                  {form.airbnbUrl && (
                    <a
                      className="button-quiet data-card-link"
                      href={form.airbnbUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                      <span>{c.openLink}</span>
                    </a>
                  )}
                </div>
                <input
                  aria-invalid={invalid && invalidFieldId === 'prop-airbnb' ? true : undefined}
                  id="prop-airbnb"
                  maxLength={2000}
                  onChange={(e) => update('airbnbUrl', e.target.value || null)}
                  placeholder="https://www.airbnb.com/rooms/..."
                  type="url"
                  value={form.airbnbUrl ?? ''}
                />
              </section>

              {/* 5. Slug Web */}
              <section className="panel data-card service-field">
                <div className="data-card-header">
                  <label htmlFor="prop-slug" className="data-card-label">
                    <Globe size={18} aria-hidden="true" className="data-card-icon-accent" />
                    <span>{c.slug}</span>
                  </label>
                </div>
                <div className="slug-input-wrapper">
                  <span className="slug-prefix">grupokuwago.com/</span>
                  <input
                    aria-invalid={invalid && invalidFieldId === 'prop-slug' ? true : undefined}
                    disabled={!!doc?.data.slugLocked}
                    id="prop-slug"
                    maxLength={60}
                    onChange={(e) => update('slug', e.target.value)}
                    type="text"
                    value={form.slug}
                  />
                </div>
                <small className="data-card-help">
                  <Lock size={14} aria-hidden="true" />
                  <span>{c.locked}</span>
                </small>
              </section>
            </div>
          </div>

          {/* TAB 3: FOTOS */}
          <div
            aria-labelledby="tab-photos"
            id="tabpanel-photos"
            role="tabpanel"
            style={{ display: activeTab === 'photos' ? 'block' : 'none' }}
          >
            <section className="photos-tab-card">
              <h2>
                <ImageIcon size={20} aria-hidden="true" />
                <span>{c.photos}</span>
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{c.photosNotice}</p>

              <div className="photos-tab-preview">
                {cover ? (
                  <img alt={propertyTitle} src={cover} />
                ) : (
                  <div className="property-card-placeholder">
                    <ImageIcon size={36} aria-hidden="true" />
                    <span>{c.noCover}</span>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* TAB 4: HUÉSPEDES (SOON) */}
          <div
            aria-labelledby="tab-guests"
            id="tabpanel-guests"
            role="tabpanel"
            style={{ display: activeTab === 'guests' ? 'block' : 'none' }}
          >
            <section className="panel form-panel">
              <h2>
                <Users size={20} aria-hidden="true" />
                <span>{c.guests}</span>
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>{c.soonDescription}</p>
            </section>
          </div>

          {/* TAB 5: PROPIETARIO */}
          <div
            aria-labelledby="tab-owner"
            id="tabpanel-owner"
            role="tabpanel"
            style={{ display: activeTab === 'owner' ? 'block' : 'none' }}
          >
            <section className="panel form-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h2>
                <Shield size={20} aria-hidden="true" />
                <span>{c.ownerSection}</span>
              </h2>

              <div className="owner-private-notice">
                <Lock size={16} aria-hidden="true" />
                <span>{c.private}</span>
                <span style={{ marginLeft: 'auto' }}>{c.teamOnly}</span>
              </div>

              <div className="service-field">
                <label htmlFor="prop-owner-name">{c.ownerName}</label>
                <input
                  aria-invalid={invalid && invalidFieldId === 'prop-owner-name' ? true : undefined}
                  id="prop-owner-name"
                  maxLength={250}
                  onChange={(e) => update('ownerName', e.target.value || null)}
                  type="text"
                  value={form.ownerName ?? ''}
                />
              </div>

              <div className="service-field">
                <label htmlFor="prop-owner-contact">{c.ownerContact}</label>
                <input
                  aria-invalid={invalid && invalidFieldId === 'prop-owner-contact' ? true : undefined}
                  id="prop-owner-contact"
                  maxLength={250}
                  onChange={(e) => update('ownerContact', e.target.value || null)}
                  type="text"
                  value={form.ownerContact ?? ''}
                />
              </div>

              <div className="service-field">
                <label htmlFor="prop-internal-notes">{c.internalNotes}</label>
                <textarea
                  aria-invalid={invalid && invalidFieldId === 'prop-internal-notes' ? true : undefined}
                  id="prop-internal-notes"
                  maxLength={10000}
                  onChange={(e) => update('internalNotes', e.target.value || null)}
                  rows={6}
                  value={form.internalNotes ?? ''}
                />
              </div>
            </section>
          </div>

          {/* TAB 6: CALENDARIO (SOON) */}
          <div
            aria-labelledby="tab-calendar"
            id="tabpanel-calendar"
            role="tabpanel"
            style={{ display: activeTab === 'calendar' ? 'block' : 'none' }}
          >
            <section className="panel form-panel">
              <h2>
                <Home size={20} aria-hidden="true" />
                <span>{c.calendar}</span>
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>{c.soonDescription}</p>
            </section>
          </div>
        </fieldset>

        {/* RIGHT COLUMN: STICKY PUBLICATION & VISIBILITY PANEL */}
        <aside className="publication-sidebar-col">
          <div className="publication-card">
            <div className="publication-card-header">
              <h3>
                <FileText size={18} aria-hidden="true" />
                <span>{c.publicationPanel}</span>
              </h3>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: doc?.data.status === 'published' ? 'var(--success)' : 'var(--warning)',
                }}
              />
            </div>

            <div className="publication-status-box">
              <div className="publication-status-row">
                <span style={{ color: 'var(--text-secondary)' }}>{c.currentStatus}</span>
                <strong style={{ color: 'var(--text)' }}>{statusBadgeText}</strong>
              </div>
              <small style={{ color: 'var(--text-muted)' }}>
                {formattedPublishedAt ? `${c.lastPublished}: ${formattedPublishedAt}` : c.neverPublished}
              </small>
            </div>

            {(dirty || doc?.data.hasUnpublishedChanges) && (
              <div className="publication-notice-box">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>{dirty ? c.unsaved : c.changes}</span>
                </div>
                <small>{c.unpublishedChangesNotice}</small>
              </div>
            )}

            <div className="publication-switch-row">
              <div className="switch-label-group">
                <strong>{c.showPublic}</strong>
                <small>{c.showPublicDesc}</small>
              </div>
              <label className="toggle-switch">
                <input
                  aria-label={c.show}
                  checked={form.showOnLanding}
                  disabled={busy || !writable}
                  onChange={(e) => update('showOnLanding', e.target.checked)}
                  type="checkbox"
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="publication-order-row">
              <label htmlFor="prop-order" style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>
                {c.order}
              </label>
              <div className="publication-order-input-wrap">
                <input
                  aria-invalid={invalid && invalidFieldId === 'prop-order' ? true : undefined}
                  className="publication-order-input"
                  disabled={busy || !writable}
                  id="prop-order"
                  min="0"
                  onChange={(e) => update('sortOrder', e.target.value === '' ? NaN : Number(e.target.value))}
                  step="1"
                  type="number"
                  value={form.sortOrder}
                />
                <small>{c.orderHelp}</small>
              </div>
            </div>

            <div className="publication-buttons">
              <Button
                disabled={busy || !writable}
                type="submit"
                variant="primary"
              >
                <Save size={16} aria-hidden="true" />
                <span>{c.save}</span>
              </Button>

              <Button
                disabled={busy || dirty || !doc || !canPublish}
                onClick={() => void transition('publish')}
                variant="secondary"
              >
                <Check size={16} aria-hidden="true" />
                <span>{c.publish}</span>
              </Button>

              <Button
                disabled={busy || dirty || !doc || !canUnpublish || doc.data.status !== 'published'}
                onClick={() => void transition('unpublish')}
                variant="quiet"
              >
                <EyeOff size={16} aria-hidden="true" />
                <span>{c.unpublish}</span>
              </Button>

              <Button
                disabled={busy || dirty || !doc || !canArchive || doc.data.status === 'archived'}
                onClick={() => void transition('archive')}
                variant="quiet"
              >
                <Eye size={16} aria-hidden="true" />
                <span>{c.archive}</span>
              </Button>

              {id && error?.status === 409 && (
                <Button
                  onClick={() => {
                    if (!dirty || confirm(c.confirm)) {
                      setLoading(true);
                      setRevision((v) => v + 1);
                    }
                  }}
                >
                  {c.refresh}
                </Button>
              )}
            </div>
          </div>
        </aside>
      </form>

      {/* MOBILE STICKY BOTTOM PUBLICATION BAR */}
      <div className="mobile-publication-bar">
        <div className="mobile-bar-status">
          <span>{dirty ? c.unsaved : doc?.data.hasUnpublishedChanges ? c.pendingDraft : c.saved}</span>
          <small>{statusBadgeText}</small>
        </div>
        <div className="mobile-bar-actions">
          <Button
            disabled={busy || !writable}
            onClick={() => void save()}
            variant="secondary"
          >
            <span>{c.saveDraft}</span>
          </Button>
          <Button
            disabled={busy || dirty || !doc || !canPublish}
            onClick={() => void transition('publish')}
            variant="primary"
          >
            <span>{c.publishChanges}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
