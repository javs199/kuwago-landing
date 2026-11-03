import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dictionaries, type Language, type TextKey } from './i18n';
import {cloudflareDevelopment} from './deployment';

const devLabels = {
  es: {local:'Cloudflare DEV',noAuth:'Cloudflare Access protege este portal. La API verifica identidad y permisos en el servidor.',footer:'Grupo Kuwago · Admin DEV'},
  en: {local:'Cloudflare DEV',noAuth:'Cloudflare Access protects this portal. The API verifies identity and permissions on the server.',footer:'Grupo Kuwago · Admin DEV'},
};
function translation(language:Language,key:TextKey):string {
  if(cloudflareDevelopment&&(key==='local'||key==='noAuth'||key==='footer'))return devLabels[language][key];
  return dictionaries[language][key];
}

export type Theme = 'light' | 'dark';
type Preferences = {
  language: Language; theme: Theme; setLanguage: (language: Language) => void;
  toggleTheme: () => void; t: (key: TextKey) => string;
};
const Context = createContext<Preferences | null>(null);
function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Keep the in-memory preference. */ }
}
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => read('kuwago-admin-language') === 'en' ? 'en' : 'es');
  const [theme, setTheme] = useState<Theme>(() => read('kuwago-admin-theme') === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = `${dictionaries[language].app} · ${translation(language,'local')}`;
    save('kuwago-admin-language', language);
  }, [language]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save('kuwago-admin-theme', theme);
  }, [theme]);
  return <Context.Provider value={{ language, theme, setLanguage, toggleTheme: () => setTheme(value => value === 'light' ? 'dark' : 'light'), t: key => translation(language,key) }}>{children}</Context.Provider>;
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('PreferencesProvider is required');
  return value;
}
