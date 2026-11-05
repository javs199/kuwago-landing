import { useSyncExternalStore } from 'react';

export type AdminRoute = { page: 'overview' } | { page: 'services'; mode: 'list' | 'new' } | { page: 'services'; mode: 'edit' | 'preview'; id: string } | { page: 'properties'; id: string | null } | { page: 'missing' };
export function parseRoute(hash: string): AdminRoute {
  if(hash==='#properties')return {page:'properties',id:null};
  const property=/^#properties\/([a-zA-Z0-9_-]+)$/.exec(hash);
  if(property?.[1])return {page:'properties',id:property[1]};
  if (hash === '' || hash === '#overview') return { page: 'overview' };
  if (hash === '#services') return { page: 'services', mode: 'list' };
  if (hash === '#services/new') return { page: 'services', mode: 'new' };
  const match = /^#services\/([a-zA-Z0-9_-]+)\/(edit|preview)$/.exec(hash);
  if (match?.[1] && (match[2] === 'edit' || match[2] === 'preview')) return { page: 'services', mode: match[2], id: match[1] };
  return { page: 'missing' };
}
function subscribe(callback: () => void) { window.addEventListener('hashchange', callback); return () => window.removeEventListener('hashchange', callback); }
export function useAdminRoute() { return parseRoute(useSyncExternalStore(subscribe, () => location.hash)); }

