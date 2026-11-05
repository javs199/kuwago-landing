import { useEffect, useState } from 'react';
import {
  Archive,
  Bath,
  Bed,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Home,
  ImageIcon,
  Info,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { adminApi, ApiError, type PropertyDocument } from '../../api/admin-client';
import { useSession } from '../../api/session';
import { Button } from '../../components/ui';
import { usePreferences } from '../../preferences';
import { ErrorNotice, LocalTestIdentity } from '../services/api-support';
import { PropertyEditor } from './PropertyEditor';
import { usePropertyCopy } from './copy';
import { getPropertyCover } from './covers';
import './properties.css';

export function PropertiesModule({ id }: { id: string | null }) {
  const session = useSession();
  const c = usePropertyCopy();

  return (
    <div className="properties-module">
      <LocalTestIdentity />
      <ErrorNotice error={session.error} />
      {session.loading && <p role="status">{c.loading}</p>}
      {!session.identity && <Button onClick={session.refresh}>{c.retry}</Button>}
      {session.identity &&
        (id ? (
          <PropertyEditor key={session.generation + ':' + id} id={id === 'new' ? null : id} />
        ) : (
          <PropertiesList key={session.generation} />
        ))}
    </div>
  );
}

type FilterCategory = 'all' | 'published' | 'draft' | 'archived';

function PropertiesList() {
  const c = usePropertyCopy();
  const { language } = usePreferences();
  const session = useSession();
  const [items, setItems] = useState<PropertyDocument[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);

  const [filter, setFilter] = useState<FilterCategory>('all');
  const [search, setSearch] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const { reject, identity } = session;

  useEffect(() => {
    const abort = new AbortController();
    adminApi
      .properties('', abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setItems(result.items);
          setCursor(result.nextCursor);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) {
          const e = reason instanceof ApiError ? reason : new ApiError(0, 'network');
          setError(e);
          reject(e);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [revision, reject]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.property-menu-container')) {
        setActiveMenuId(null);
      }
    }
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  async function more() {
    setBusy(true);
    try {
      const r = await adminApi.properties(cursor ?? '');
      setItems((old) => [...old, ...r.items]);
      setCursor(r.nextCursor);
      setError(null);
    } catch (e) {
      const reason = e instanceof ApiError ? e : new ApiError(0, 'network');
      setError(reason);
      reject(reason);
    } finally {
      setBusy(false);
    }
  }

  async function handleTransition(doc: PropertyDocument, action: 'unpublish' | 'archive') {
    if (!confirm(c.confirm)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await adminApi.publishProperty(doc.data.id, action, doc.version);
      setItems((old) => old.map((item) => (item.data.id === updated.data.id ? updated : item)));
      setActiveMenuId(null);
    } catch (e) {
      const reason = e instanceof ApiError ? e : new ApiError(0, 'network');
      setError(reason);
      reject(reason);
    } finally {
      setBusy(false);
    }
  }

  const allCount = items.length;
  const publishedCount = items.filter((i) => i.data.status === 'published').length;
  const draftCount = items.filter((i) => i.data.status === 'draft').length;
  const archivedCount = items.filter((i) => i.data.status === 'archived').length;

  const filteredItems = items
    .filter((item) => {
      if (filter === 'published') return item.data.status === 'published';
      if (filter === 'draft') return item.data.status === 'draft';
      if (filter === 'archived') return item.data.status === 'archived';
      return true;
    })
    .filter((item) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      const nameCurrent = item.data.translations[language]?.name.toLowerCase() || '';
      const nameEs = item.data.translations.es?.name.toLowerCase() || '';
      const nameEn = item.data.translations.en?.name.toLowerCase() || '';
      const slug = item.data.slug.toLowerCase();
      const loc = (item.data.location ?? '').toLowerCase();
      return nameCurrent.includes(q) || nameEs.includes(q) || nameEn.includes(q) || slug.includes(q) || loc.includes(q);
    })
    .sort((a, b) => a.data.sortOrder - b.data.sortOrder);

  const canWrite = identity?.permissions.includes('drafts:write');
  const canUnpublish = identity?.permissions.includes('services:unpublish');
  const canArchive = identity?.permissions.includes('services:archive');

  return (
    <>
      <div className="properties-header">
        <div className="properties-header-info">
          <span className="properties-eyebrow">
            <Home size={14} aria-hidden="true" />
            {c.portfolioSubtitle}
          </span>
          <h1>{c.title}</h1>
          <p className="properties-subtitle">{c.descriptionList}</p>
        </div>
        <div className="properties-header-actions">
          {canWrite && (
            <a className="button button-primary" href="#properties/new">
              <Plus size={18} aria-hidden="true" />
              <span>{c.new}</span>
            </a>
          )}
        </div>
      </div>

      <div className="properties-toolbar">
        <div aria-label={c.filterGroupLabel} className="properties-filter-chips" role="group">
          <button
            aria-pressed={filter === 'all'}
            className="filter-chip"
            onClick={() => setFilter('all')}
            type="button"
          >
            <span>{c.filterAll}</span>
            <span className="filter-chip-count">{allCount}</span>
          </button>
          <button
            aria-pressed={filter === 'published'}
            className="filter-chip"
            onClick={() => setFilter('published')}
            type="button"
          >
            <span>{c.filterPublished}</span>
            <span className="filter-chip-count">{publishedCount}</span>
          </button>
          <button
            aria-pressed={filter === 'draft'}
            className="filter-chip"
            onClick={() => setFilter('draft')}
            type="button"
          >
            <span>{c.filterDraft}</span>
            <span className="filter-chip-count">{draftCount}</span>
          </button>
          <button
            aria-pressed={filter === 'archived'}
            className="filter-chip"
            onClick={() => setFilter('archived')}
            type="button"
          >
            <span>{c.filterArchived}</span>
            <span className="filter-chip-count">{archivedCount}</span>
          </button>
        </div>

        <div className="properties-search-box">
          <Search className="properties-search-icon" aria-hidden="true" />
          <input
            aria-label={c.searchPlaceholder}
            className="properties-search-input"
            onChange={(e) => setSearch(e.target.value)}
            placeholder={c.searchPlaceholder}
            type="text"
            value={search}
          />
          {search && (
            <button
              aria-label={c.clearSearch}
              className="properties-search-clear"
              onClick={() => setSearch('')}
              type="button"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="properties-order-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={18} aria-hidden="true" />
          <span>{c.orderNotice}</span>
        </div>
        <Button disabled={busy} onClick={() => { setBusy(true); setRevision((v) => v + 1); }}>
          {c.refresh}
        </Button>
      </div>

      <ErrorNotice error={error} />
      {busy && <p role="status">{c.loading}</p>}

      {!busy && !error && filteredItems.length === 0 && (
        <div className="properties-empty-state">
          <Home size={40} aria-hidden="true" />
          <h3>{c.emptyFilterTitle}</h3>
          <p>{c.emptyFilterDesc}</p>
          {(search || filter !== 'all') && (
            <Button
              onClick={() => {
                setSearch('');
                setFilter('all');
              }}
            >
              {c.viewAll}
            </Button>
          )}
        </div>
      )}

      {filteredItems.length > 0 && (
        <div className="properties-grid">
          {filteredItems.map((doc) => {
            const p = doc.data;
            const cover = getPropertyCover(p.slug);
            const statusClass =
              p.status === 'published'
                ? 'badge-status-published'
                : p.status === 'draft'
                ? 'badge-status-draft'
                : 'badge-status-archived';
            const statusText =
              p.status === 'published' ? c.published : p.status === 'draft' ? c.draft : c.archived;
            const isVisibleOnSite = p.status === 'published' && p.showOnLanding;
            const visibilityBaseText = isVisibleOnSite ? c.visible : c.hidden;
            const visibilityText =
              p.status === 'published' && p.hasUnpublishedChanges
                ? `${visibilityBaseText} (${c.accordingToDraft})`
                : visibilityBaseText;
            const isMenuOpen = activeMenuId === p.id;

            return (
              <article key={p.id} className="property-card">
                <div className="property-card-frame">
                  {cover ? (
                    <img
                      alt={p.translations[language]?.name || p.slug}
                      className="property-card-image"
                      src={cover}
                    />
                  ) : (
                    <div className="property-card-placeholder">
                      <ImageIcon size={32} aria-hidden="true" />
                      <span>{c.noCover}</span>
                    </div>
                  )}
                  <div className="property-card-scrim" />

                  <div className="badge-order">
                    <span>#{p.sortOrder}</span>
                  </div>

                  <div className="property-card-top-right">
                    <span className="badge-visibility">
                      {isVisibleOnSite ? (
                        <Eye size={13} aria-hidden="true" />
                      ) : (
                        <EyeOff size={13} aria-hidden="true" />
                      )}
                      <span>{visibilityText}</span>
                    </span>
                    <span className={`badge-status ${statusClass}`}>
                      <span className="badge-dot" />
                      <span>{statusText}</span>
                    </span>
                  </div>

                  <div className="property-card-bottom-badges">
                    <span className="badge-kind">
                      {p.kind === 'rental' ? c.rental : c.managed}
                    </span>
                    {p.hasUnpublishedChanges && (
                      <span className="badge-changes">
                        <Check size={12} style={{ marginRight: 4 }} aria-hidden="true" />
                        {c.changes}
                      </span>
                    )}
                  </div>
                </div>

                <div className="property-card-body">
                  <div className="property-card-title-group">
                    <h2 className="property-card-title">
                      {p.translations[language]?.name || p.translations.es?.name || p.slug}
                    </h2>
                    {p.location && (
                      <div className="property-card-location">
                        <MapPin size={14} aria-hidden="true" />
                        <span>{p.location}</span>
                      </div>
                    )}
                  </div>

                  {(p.maxGuests != null || p.bedrooms != null || p.bathrooms != null) && (
                    <div className="property-card-metrics">
                      {p.maxGuests != null && (
                        <div className="metric-item">
                          <Users size={14} aria-hidden="true" />
                          <span>
                            {p.maxGuests} {c.guestsShort}
                          </span>
                        </div>
                      )}
                      {p.bedrooms != null && (
                        <div className="metric-item">
                          <Bed size={14} aria-hidden="true" />
                          <span>
                            {p.bedrooms} {c.bedsShort}
                          </span>
                        </div>
                      )}
                      {p.bathrooms != null && (
                        <div className="metric-item">
                          <Bath size={14} aria-hidden="true" />
                          <span>
                            {p.bathrooms} {c.bathsShort}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="property-card-footer">
                    <a className="button button-secondary" href={`#properties/${p.id}`}>
                      <Pencil size={15} aria-hidden="true" />
                      <span>{c.edit}</span>
                    </a>

                    <div className="property-menu-container">
                      <button
                        aria-expanded={isMenuOpen}
                        aria-label={`${c.moreOptions} ${p.translations[language]?.name || p.slug}`}
                        className="icon-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : p.id);
                        }}
                        type="button"
                      >
                        <MoreVertical size={18} aria-hidden="true" />
                      </button>

                      {isMenuOpen && (
                        <div className="property-menu-dropdown" role="menu">
                          <a
                            className="property-menu-item"
                            href={`https://grupokuwago.com/#${p.slug}`}
                            rel="noopener noreferrer"
                            role="menuitem"
                            target="_blank"
                          >
                            <ExternalLink size={15} aria-hidden="true" />
                            <span>{c.viewOnSite}</span>
                          </a>

                          {p.status === 'published' && canUnpublish && (
                            <button
                              className="property-menu-item"
                              disabled={busy}
                              onClick={() => void handleTransition(doc, 'unpublish')}
                              role="menuitem"
                              type="button"
                            >
                              <EyeOff size={15} aria-hidden="true" />
                              <span>{c.unpublish}</span>
                            </button>
                          )}

                          {p.status !== 'archived' && canArchive && (
                            <button
                              className="property-menu-item text-danger"
                              disabled={busy}
                              onClick={() => void handleTransition(doc, 'archive')}
                              role="menuitem"
                              type="button"
                            >
                              <Archive size={15} aria-hidden="true" />
                              <span>{c.archive}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {canWrite && (
            <a className="integrate-property-card" href="#properties/new">
              <div className="integrate-card-icon">
                <Home size={26} aria-hidden="true" />
              </div>
              <div>
                <h3>{c.integrateNew}</h3>
                <p>{c.integrateNewDesc}</p>
              </div>
              <span className="button button-primary">{c.new}</span>
            </a>
          )}
        </div>
      )}

      {cursor && (
        <Button disabled={busy} onClick={() => void more()}>
          {c.more}
        </Button>
      )}
    </>
  );
}
