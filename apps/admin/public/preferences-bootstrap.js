/* global document */
try {
  const theme = localStorage.getItem('kuwago-admin-theme');
  const language = localStorage.getItem('kuwago-admin-language');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
  if (language === 'en' || language === 'es') document.documentElement.lang = language;
} catch { /* Preferences remain usable in memory. */ }
