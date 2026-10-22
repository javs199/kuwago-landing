(() => {
  const urls = window.KUWAGO_SOCIALS || {};
  document.querySelectorAll('footer [data-social]').forEach(item => {
    const name = item.dataset.social;
    const url = urls[name];
    // Missing or invalid destinations retain the accessible, non-interactive span.
    try { if (!url || new URL(url).protocol !== 'https:') return; }
    catch { return; }
    const placeholder = item.querySelector('.footer-social-control');
    const link = document.createElement('a');
    link.className = 'footer-social-control footer-social-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.dataset.i18nAria = 'footer.' + name;
    const brand = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' }[name];
    link.setAttribute('aria-label', brand + ' (opens in a new tab)');
    link.append(...placeholder.childNodes);
    placeholder.replaceWith(link);
    item.querySelector('.footer-social-status').hidden = true;
  });
})();
