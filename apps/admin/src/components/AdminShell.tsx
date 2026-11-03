import { useEffect, useRef, type ReactNode } from 'react';
import { Bell, LockKeyhole, Menu, Search, ShieldCheck, UserRound, X, LogOut } from 'lucide-react';
import purple from '../assets/kuwago-purple.svg';
import gold from '../assets/kuwago-gold.svg';
import { navigation } from '../navigation';
import { usePreferences } from '../preferences';
import { IconButton, StatusBadge } from './ui';
import { LanguageSwitcher, ThemeToggle } from './preferences-controls';
import { useAdminRoute } from '../routing';
import {useOptionalSession} from '../api/session';
import {cloudflareDevelopment,developmentNotice,signOutToPublicSite} from '../deployment';

function Brand() {
  const { theme, t } = usePreferences();
  return <a href="#overview" className="admin-brand"><img src={theme === 'dark' ? gold : purple} width="28" height="50" alt="Grupo Kuwago" /><span><strong>{t('app')}</strong><small>{t('portal')}</small></span></a>;
}
function NavigationList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = usePreferences();
  const route = useAdminRoute();
  return <ul className="nav-list">{navigation.map(({ key, icon: Icon, available }) => <li key={key}>
    {available ? <a href={`#${key}`} aria-current={route.page === key ? 'page' : undefined} onClick={onNavigate}><Icon size={21} aria-hidden="true" /><span>{t(key)}</span></a> : <button type="button" disabled><Icon size={21} aria-hidden="true" /><span>{t(key)}</span><small>{t('soon')}</small></button>}
  </li>)}</ul>;
}
export function DesktopSidebar() {
  const { t } = usePreferences();
  const session=useOptionalSession();
  return <aside className="desktop-sidebar"><Brand /><nav aria-label={t('mainNav')}><NavigationList /></nav>
    <div className="sidebar-footer"><div className="local-profile"><span className="profile-symbol"><UserRound size={22} aria-hidden="true" /></span><div><strong>{t('local')}</strong><span>{session?.identity?session.identity.role:t('noSession')}</span></div></div>
      <button type="button" disabled><ShieldCheck size={18} aria-hidden="true" />{t('security')}<small>{t('soon')}</small></button>
      <button type="button" disabled={!cloudflareDevelopment||!session?.identity} title={session?.identity?undefined:t('noSession')} onClick={()=>void signOutToPublicSite()}><LogOut size={18} aria-hidden="true" />{t('signOut')}</button>
    </div>
  </aside>;
}
export function AdminHeader() {
  const { t } = usePreferences();
  return <header className="admin-header"><div className="mobile-brand"><Brand /></div>
    <div className="header-search"><Search size={18} aria-hidden="true" /><input type="search" disabled aria-label={t('searchLabel')} placeholder={t('search')} /><small>{t('soon')}</small></div>
    <div className="header-controls"><LanguageSwitcher /><ThemeToggle /><IconButton icon={Bell} label={t('notifications')} disabled /><span className="mobile-account"><IconButton icon={UserRound} label={t('account')} disabled /></span></div>
  </header>;
}
export function MobileNavigation() {
  const { t } = usePreferences();
  const route = useAdminRoute();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (media.matches && dialog.current?.open) dialog.current.close(); };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);
  return <><nav className="mobile-navigation" aria-label={t('mobileNav')}>
    {navigation.filter(item => ['overview', 'services', 'properties', 'access'].includes(item.key)).map(({ key, icon: Icon, available }) => available ? <a key={key} href={`#${key}`} aria-current={route.page === key ? 'page' : undefined}><Icon size={21} aria-hidden="true" /><span>{t(key)}</span></a> : <button key={key} type="button" disabled title={`${t(key)} · ${t('soon')}`}><Icon size={21} aria-hidden="true" /><span>{t(key)}</span><small>{t('soon')}</small></button>)}
    <button type="button" ref={trigger} aria-haspopup="dialog" aria-controls="admin-mobile-menu" onClick={() => dialog.current?.showModal()}><Menu size={21} aria-hidden="true" /><span>{t('more')}</span></button>
  </nav>
  <dialog id="admin-mobile-menu" className="mobile-menu-dialog" ref={dialog} aria-labelledby="menu-title" onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClose={() => {
    if (window.matchMedia('(min-width: 1024px)').matches) document.getElementById('main-content')?.focus();
    else trigger.current?.focus();
  }}>
    <div className="dialog-heading"><h2 id="menu-title">{t('menuTitle')}</h2><IconButton icon={X} label={t('close')} onClick={() => dialog.current?.close()} /></div>
    <NavigationList onNavigate={() => dialog.current?.close()} />
    <div className="dialog-preferences"><h3>{t('preferences')}</h3><div><LanguageSwitcher /><ThemeToggle /></div></div><p className="muted text-sm">{t('noAuth')}</p>
  </dialog></>;
}
export function AdminShell({ children }: { children: ReactNode }) {
  const { t,language } = usePreferences();const session=useOptionalSession();
  return <><a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>{t('skip')}</a><DesktopSidebar /><div className="admin-workspace"><AdminHeader />
    <main id="main-content" tabIndex={-1}><div className="local-notice" role="note"><LockKeyhole size={16} aria-hidden="true" /><StatusBadge tone="accent">{cloudflareDevelopment?'CLOUDFLARE DEV':t('local')}</StatusBadge><p>{cloudflareDevelopment?developmentNotice[language]:session?(language==='es'?'Servicios conectados a la API local. Los demás módulos siguen sin datos operativos.':'Services use the local API. Other modules still have no operational data.'):t('localNote')}</p></div>{children}<footer className="admin-footer">{t('footer')}</footer></main>
  </div><MobileNavigation /></>;
}


