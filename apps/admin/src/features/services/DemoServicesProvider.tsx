import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { demoServices } from './demo-data';
import { type DemoService } from './model';
type DemoState = {
  records: DemoService[]; drafts: Record<string, DemoService>; message: boolean;
  change: (service: DemoService) => void; apply: (service: DemoService) => string;
  discard: (id: string) => void; trackUrl: (url: string) => void;
};
const Context = createContext<DemoState | null>(null);
export function DemoServicesProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState(demoServices);
  const [drafts, setDrafts] = useState<Record<string, DemoService>>({});
  const [message, setMessage] = useState(false);
  const urls = useRef(new Set<string>());
  useEffect(() => { const current = urls.current; return () => current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const discard = (id: string) => setDrafts(current => { const next = { ...current }; delete next[id]; return next; });
  return <Context.Provider value={{ records, drafts, message,
    change: service => { setDrafts(current => ({ ...current, [service.id]: service })); setMessage(false); },
    apply: service => {
      const applied = { ...service, id: service.id === 'demo-new' ? `demo-${crypto.randomUUID()}` : service.id, modifiedAt: new Date().toISOString() };
      setRecords(current => current.some(row => row.id === applied.id) ? current.map(row => row.id === applied.id ? applied : row) : [applied, ...current]);
      discard(service.id); setMessage(true); return applied.id;
    }, discard, trackUrl: url => urls.current.add(url),
  }}>{children}</Context.Provider>;
}
export function useDemoServices() { const context = useContext(Context); if (!context) throw new Error('DemoServicesProvider required'); return context; }
