import { useEffect } from 'react';
import { AdminShell } from './components/AdminShell';
import { Panel } from './components/ui';
import { Dashboard } from './Dashboard';
import { PreferencesProvider, usePreferences } from './preferences';
import { useAdminRoute } from './routing';
import { DemoServicesProvider } from './features/services/DemoServicesProvider';
import { ServicesModule } from './features/services/ServicesModule';
import {ApiServicesModule} from './features/services/ApiServicesModule';
import {AdminSessionProvider} from './api/session';
import './features/services/services.css';
import { PropertiesModule } from './features/properties/PropertiesModule';

function AdminContent({source}:{source:'api'|'demo'}) {
  const route = useAdminRoute();
  const { language, t } = usePreferences();
  const routeKey = JSON.stringify(route);
  useEffect(() => {
    document.getElementById('main-content')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [routeKey]);
  return <AdminShell>{route.page==='properties'?<PropertiesModule id={route.id}/>:route.page === 'services' ? source==='demo'&&(import.meta.env.DEV||import.meta.env.MODE==='test')?<ServicesModule route={route} />:<ApiServicesModule route={route}/> : route.page === 'missing' ? <Panel><h1>{language === 'es' ? 'Página no disponible' : 'Page unavailable'}</h1><a className="button button-quiet" href="#overview">{t('overview')}</a></Panel> : <Dashboard />}</AdminShell>;
}

export default function App({source='api'}:{source?:'api'|'demo'}={}) {
  const demo=source==='demo'&&(import.meta.env.DEV||import.meta.env.MODE==='test');
  return <PreferencesProvider>{!demo?<AdminSessionProvider><AdminContent source="api"/></AdminSessionProvider>:<DemoServicesProvider><AdminContent source="demo"/></DemoServicesProvider>}</PreferencesProvider>;
}
