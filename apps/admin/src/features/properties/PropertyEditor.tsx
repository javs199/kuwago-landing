import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bath,
  Bed,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Home,
  ImageIcon,
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
import { usePropertyCopy } from './copy';
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
  const [revision, setRevision] = useState(0);

  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const tabsListRef = useRef<HTMLDivElement | null>(null);

  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useUnsaved(dirty);

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
  }

  async function save() {
    if (!identity?.permissions.includes('drafts:write')) return;
    if (!PropertyInputSchema.safeParse(form).success) {
      setInvalid(true);
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
          {c.invalid}
        </p>
      )}

      <div
        ref={tabsListRef}
        aria-label="Pestañas del editor de propiedades"
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

          {/* TAB 2: DATOS */}
          <div
            aria-labelledby="tab-data"
            id="tabpanel-data"
            role="tabpanel"
            style={{ display: activeTab === 'data' ? 'block' : 'none' }}
          >
            <section className="panel form-panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <h2>
                <Sliders size={20} aria-hidden="true" />
                <span>{c.data}</span>
              </h2>

              {/* Modalidad Operativa (Segmented Control) */}
              <div className="service-field">
                <label>{c.operationalMode}</label>
                <div className="segmented-control" role="group" aria-label={c.operationalMode}>
                  <button
                    aria-pressed={form.kind === 'rental'}
                    className="segmented-button"
                    onClick={() => update('kind', 'rental')}
                    type="button"
                  >
                    {c.rental}
                  </button>
                  <button
                    aria-pressed={form.kind === 'managed'}
                    className="segmented-button"
                    onClick={() => update('kind', 'managed')}
                    type="button"
                  >
                    {c.managed}
                  </button>
                </div>
              </div>

              {/* Ubicación */}
              <div className="service-field">
                <label htmlFor="prop-location">{c.location}</label>
                <input
                  id="prop-location"
                  maxLength={120}
                  onChange={(e) => update('location', e.target.value || null)}
                  placeholder="Ej. Uvita, Costa Rica"
                  type="text"
                  value={form.location ?? ''}
                />
                <small>{c.locationHelp}</small>
              </div>

              {/* Capacidad (Guests / Bedrooms / Bathrooms) */}
              <div className="service-field">
                <label>{c.capacitySection}</label>
                <div className="capacity-grid">
                  <div className="capacity-item">
                    <label htmlFor="prop-guests">{c.maxGuests}</label>
                    <input
                      id="prop-guests"
                      aria-label={c.maxGuestsLabel}
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
                      id="prop-bedrooms"
                      aria-label={c.bedrooms}
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
                      id="prop-bathrooms"
                      aria-label={c.bathrooms}
                      min="0"
                      onChange={(e) => update('bathrooms', e.target.value === '' ? null : Number(e.target.value))}
                      step="0.5"
                      style={{ textAlign: 'center' }}
                      type="number"
                      value={form.bathrooms ?? ''}
                    />
                  </div>
                </div>
              </div>

              {/* Enlace Airbnb */}
              <div className="service-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="prop-airbnb">{c.airbnbUrl}</label>
                  {form.airbnbUrl && (
                    <a
                      className="button-quiet"
                      href={form.airbnbUrl}
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}
                      target="_blank"
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                      <span>{c.openLink}</span>
                    </a>
                  )}
                </div>
                <input
                  id="prop-airbnb"
                  maxLength={2000}
                  onChange={(e) => update('airbnbUrl', e.target.value || null)}
                  placeholder="https://airbnb.com/rooms/..."
                  type="url"
                  value={form.airbnbUrl ?? ''}
                />
              </div>

              {/* Slug Web */}
              <div className="service-field">
                <label htmlFor="prop-slug">{c.slug}</label>
                <div className="slug-input-wrapper">
                  <span className="slug-prefix">grupokuwago.com/</span>
                  <input
                    disabled={!!doc?.data.slugLocked}
                    id="prop-slug"
                    maxLength={60}
                    onChange={(e) => update('slug', e.target.value)}
                    type="text"
                    value={form.slug}
                  />
                </div>
                <small>{c.locked}</small>
              </div>
            </section>
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
                    <small>{c.noCoverHelp}</small>
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
