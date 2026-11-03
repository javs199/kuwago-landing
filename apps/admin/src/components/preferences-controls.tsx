import { Moon, Sun } from 'lucide-react';
import { usePreferences } from '../preferences';
import { IconButton } from './ui';

export function ThemeToggle() {
  const { theme, toggleTheme, t } = usePreferences();
  return <IconButton icon={theme === 'light' ? Moon : Sun} label={t(theme === 'light' ? 'dark' : 'light')} onClick={toggleTheme} />;
}
export function LanguageSwitcher() {
  const { language, setLanguage, t } = usePreferences();
  return <div className="language-switcher" role="group" aria-label={t('language')}>
    {(['en', 'es'] as const).map(value => <button type="button" key={value} lang={value} aria-label={value === 'en' ? 'English' : 'Español'} aria-pressed={language === value} onClick={() => setLanguage(value)}>{value.toUpperCase()}</button>)}
  </div>;
}
