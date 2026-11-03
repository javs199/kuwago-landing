import { Building2, CalendarDays, ClipboardList, ConciergeBell, FileText, KeyRound, Plus, Receipt, UserRoundPlus, ChevronLeft, ChevronRight, Clock3, Image } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TextKey } from './i18n';
import { usePreferences } from './preferences';
import { Card, IconButton, PageHeader, Panel, PendingButton, StatusBadge } from './components/ui';
import carabao from './assets/carabao.webp';

const actions: readonly { key: TextKey; icon: LucideIcon }[] = [
  { key: 'addProperty', icon: Building2 }, { key: 'ownerAccess', icon: UserRoundPlus },
  { key: 'guestAccess', icon: KeyRound }, { key: 'recordSale', icon: ConciergeBell },
  { key: 'addInvoice', icon: Receipt }, { key: 'addEvent', icon: CalendarDays },
];
const metrics: readonly TextKey[] = ['managed', 'owners', 'guests', 'pendingSales', 'pendingInvoices', 'upcoming'];

export function Dashboard() {
  const { t } = usePreferences();
  return <div id="overview" className="dashboard" aria-labelledby="overview-title">
    <PageHeader title={t('title')} description={t('subtitle')} />
    <section className="quick-actions" aria-labelledby="quick-title"><h2 id="quick-title">{t('quick')}</h2><div>{actions.map(({ key, icon }, index) => <PendingButton key={key} icon={icon} variant={index === 0 ? 'primary' : 'secondary'}>{t(key)}</PendingButton>)}</div></section>
    <section className="metrics-section" aria-label={t('noMetrics')}><div className="metrics-grid">{metrics.map(key => <Card key={key} className="metric-card"><span className="metric-number" aria-hidden="true">—</span><h2>{t(key)}</h2><span className="metric-note">{t('disconnected')}</span></Card>)}</div></section>
    <div className="dashboard-grid">
      <Panel className="property-panel" aria-labelledby="property-title"><div className="property-image"><img src={carabao} alt="Carabao Villa" width="1200" height="800" /><StatusBadge>{t('visualReference')}</StatusBadge></div>
        <div className="property-content"><div className="property-heading"><div><h2 id="property-title">Carabao Villa</h2><p className="muted">{t('location')}</p></div><Image size={22} aria-hidden="true" /></div>
          <dl className="property-details">{(['owner', 'currentStatus', 'authorized', 'metadata'] as const).map(key => <div key={key}><dt>{t(key)}</dt><dd>{t('disconnected')}</dd></div>)}</dl>
          <p className="reference-note">{t('propertyNote')}</p><div className="property-actions"><PendingButton variant="primary">{t('viewProperty')}</PendingButton><PendingButton>{t('editProperty')}</PendingButton><PendingButton variant="quiet">{t('allProperties')}</PendingButton></div>
        </div>
      </Panel>
      <Panel className="access-panel" aria-labelledby="access-title"><h2 id="access-title" className="panel-title"><KeyRound aria-hidden="true" />{t('access')}</h2>
        <div className="access-slot"><h3>{t('ownerAccess')}</h3><Card><KeyRound size={20} aria-hidden="true" /><span>{t('disconnected')}</span></Card></div>
        <div className="access-slot"><h3>{t('guestAccess')}</h3><Card><KeyRound size={20} aria-hidden="true" /><span>{t('disconnected')}</span></Card></div>
        <p className="muted">{t('accessNote')}</p><PendingButton variant="quiet">{t('allAccess')}</PendingButton>
      </Panel>
      <Panel className="calendar-panel" aria-labelledby="calendar-title"><h2 id="calendar-title" className="panel-title"><CalendarDays aria-hidden="true" />{t('calendar')}</h2><div className="calendar-columns"><div className="calendar-placeholder"><div className="calendar-toolbar"><IconButton icon={ChevronLeft} label={t('calendarNote')} disabled /><span>{t('disconnected')}</span><IconButton icon={ChevronRight} label={t('calendarNote')} disabled /></div><div className="calendar-empty"><CalendarDays size={40} strokeWidth={1.2} aria-hidden="true" /><p>{t('noEvents')}</p><small>{t('soon')}</small></div></div><div className="events-placeholder"><h3>{t('events')}</h3><Clock3 size={24} aria-hidden="true" /><p>{t('eventNote')}</p><StatusBadge>{t('soon')}</StatusBadge></div></div></Panel>
      <Panel className="invoices-panel" aria-labelledby="invoice-title"><h2 id="invoice-title" className="panel-title"><Receipt aria-hidden="true" />{t('invoiceAction')}</h2><div className="table-container"><table aria-label={t('invoices')}><thead><tr><th scope="col">{t('invoice')}</th><th scope="col">{t('amount')}</th><th scope="col">{t('status')}</th></tr></thead><tbody><tr><td colSpan={3}><Receipt size={28} aria-hidden="true" /><p>{t('noInvoices')}</p></td></tr></tbody></table></div><PendingButton>{t('allInvoices')}</PendingButton></Panel>
      <Panel className="sales-panel" aria-labelledby="sales-title"><h2 id="sales-title" className="panel-title"><ConciergeBell aria-hidden="true" />{t('sales')}</h2><div className="empty-panel"><ConciergeBell size={32} strokeWidth={1.2} aria-hidden="true" /><p>{t('salesNote')}</p></div><PendingButton variant="quiet">{t('manageServices')}</PendingButton></Panel>
      <Panel className="projects-panel" aria-labelledby="projects-title"><h2 id="projects-title" className="panel-title"><ClipboardList aria-hidden="true" />{t('projectsContracts')}</h2><div className="empty-panel"><FileText size={32} strokeWidth={1.2} aria-hidden="true" /><p>{t('projectNote')}</p></div><StatusBadge>{t('soon')}</StatusBadge></Panel>
    </div><p className="integration-note"><Plus size={16} aria-hidden="true" />{t('noAuth')}</p>
  </div>;
}
