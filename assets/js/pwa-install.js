(() => {
  if (window.kuwagoInstallUI || !window.isSecureContext) return;
  window.kuwagoInstallUI = true;
  const API = window.KuwagoInstallState;
  if (!API) return;
  const KEY = 'kuwago-pwa-install-visit-v1';
  // Internal navigation/reloads share this visit. Direct or external arrivals start a new one.
  const navigation = window.performance?.getEntriesByType?.('navigation')?.[0];
  if (API.startsVisit({ type: navigation?.type, referrer: document.referrer, origin: window.location?.origin })) {
    try { sessionStorage.removeItem(KEY); } catch {}
  }
  const media = window.matchMedia('(display-mode: standalone)');
  const standalone = () => media.matches || navigator.standalone === true;
  const model = API.create({ standalone: standalone(), read: () => sessionStorage.getItem(KEY), write: value => sessionStorage.setItem(KEY, value) });
  const route = API.manualRoute({ ua: navigator.userAgent, platform: navigator.platform, touchPoints: navigator.maxTouchPoints, os: navigator.userAgentData?.platform });
  let banner, dialog, bannerTitle, bannerDescription, installButton, laterButton, guideTitle, guideSteps, guideNote, guideClose;
  const protectedZones = new Set();
  let lastInstallTrigger = null;
  let language = document.documentElement.lang;
  const menuButtons = [];
  const t = key => (window.i18n?.[language === 'es' ? 'es' : 'en'] || {})[`pwa.install.${key}`] || key;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  function reserveSpace() {
    document.body.style.setProperty('--pwa-install-space', banner && !banner.hidden ? `${banner.getBoundingClientRect().height + (parseFloat(window.getComputedStyle(banner).bottom) || 16) + 16}px` : '0px');
  }
  function update() {
    if (!banner) return;
    const focusedBanner = banner.contains(document.activeElement);
    bannerTitle.textContent = t('title');
    bannerDescription.textContent = t(model.state.prompt ? 'description' : 'manual_description');
    installButton.textContent = t('install'); laterButton.textContent = t('later');
    installButton.disabled = model.state.busy;
    menuButtons.forEach(button => { button.textContent = t('menu'); button.hidden = !model.canMenu(route); });
    const overlayOpen = !!document.querySelector('#mobile-menu:not([hidden]), #property-gallery-modal:not(.hidden), #lightbox-modal:not(.hidden), dialog[open]');
    banner.hidden = !model.canBanner(route) || protectedZones.size > 0 || overlayOpen;
    if (focusedBanner && banner.hidden) {
      const target = menuButtons.find(button => !button.hidden && button.getClientRects().length) || document.querySelector('header a');
      target?.focus({ preventScroll: true });
    }
    if (model.hidden() && dialog.open) dialog.close();
    if (dialog.open) renderGuide(dialog.dataset.route);
    reserveSpace();
  }
  function renderGuide(kind) {
    guideTitle.textContent = t('guide_title');
    guideClose.textContent = t('close');
    guideNote.textContent = `${dialog.dataset.error === 'true' ? `${t('prompt_error')} ` : ''}${t('guide_note')}`;
    guideSteps.replaceChildren();
    const steps = {
      'ios-safari': ['ios_share', 'ios_add', 'ios_open'],
      'ios-other': ['ios_safari', 'ios_share', 'ios_add', 'ios_open'],
      'android-chrome': ['android_menu', 'android_install', 'open_icon'],
      'desktop-chrome': ['chrome_menu', 'chrome_install', 'desktop_open'],
      'chrome-touch': ['chrome_menu', 'chrome_any_install', 'open_icon'],
      'desktop-edge': ['edge_menu', 'edge_install', 'desktop_open'],
      'android-firefox': ['firefox_menu', 'firefox_add', 'firefox_limit'],
    }[kind] || ['unavailable'];
    steps.forEach(key => guideSteps.append(node('li', '', t(key))));
  }
  function openGuide(error = false) {
    if (model.hidden() || !dialog) return;
    dialog.dataset.route = route || '';
    dialog.dataset.error = String(error);
    renderGuide(route);
    // Reading instructions is never treated as installation.
    model.dismiss(); update();
    dialog.showModal();
  }
  async function install(event) {
    // Native prompts are only invoked synchronously from a real button activation.
    if (!event.isTrusted || model.hidden() || model.state.busy) return;
    lastInstallTrigger = event.currentTarget || document.activeElement;
    const deferred = model.consume();
    if (!deferred) { openGuide(); return; }
    update();
    try {
      const userChoice = deferred.userChoice ? Promise.resolve(deferred.userChoice).catch(() => null) : null;
      const result = await deferred.prompt();
      const choice = await (userChoice || Promise.resolve(result));
      model.result(choice?.outcome);
    } catch {
      model.failed(); openGuide(true);
    }
    update();
  }
  // Attach early; rendering can wait for DOMContentLoaded but the event must not be lost.
  window.addEventListener('beforeinstallprompt', event => {
    if (!event.isTrusted || typeof event.prompt !== 'function') return;
    event.preventDefault();
    model.offer(event); update();
  });
  window.addEventListener('appinstalled', event => { if (!event.isTrusted) return; model.installed(); if (dialog?.open) dialog.close(); update(); });
  media.addEventListener('change', () => { model.standalone(standalone()); update(); });
  window.addEventListener('pageshow', () => { model.standalone(standalone()); model.sync(); update(); });
  document.addEventListener('kuwago:language', event => { language = event.detail.lang; update(); });

  function init() {
    if (document.getElementById('pwa-install-banner')) return;
    language = document.documentElement.lang;
    banner = node('aside', 'pwa-install-banner'); banner.id = 'pwa-install-banner'; banner.hidden = true;
    banner.setAttribute('aria-labelledby', 'pwa-install-title');
    banner.setAttribute('aria-describedby', 'pwa-install-description');
    const brand = node('span', 'pwa-install-brand'); brand.setAttribute('aria-hidden', 'true');
    for (const [theme, file] of [['light', 'kuwago-isotipo-morado.svg'], ['dark', 'kuwago-isotipo-dorado-plano.svg']]) {
      const image = node('img', `pwa-install-logo-${theme}`); image.src = `/assets/images/brand/${file}`; image.alt = ''; image.width = 30; image.height = 54; brand.append(image);
    }
    const copy = node('div', 'pwa-install-copy');
    bannerTitle = node('p', 'pwa-install-title'); bannerTitle.id = 'pwa-install-title';
    bannerDescription = node('p', 'pwa-install-description'); bannerDescription.id = 'pwa-install-description'; copy.append(bannerTitle, bannerDescription);
    const actions = node('div', 'pwa-install-actions');
    installButton = node('button', 'pwa-install-primary'); installButton.type = 'button'; installButton.addEventListener('click', install);
    installButton.setAttribute('aria-haspopup', 'dialog');
    laterButton = node('button', 'pwa-install-later'); laterButton.type = 'button'; laterButton.addEventListener('click', () => { model.dismiss(); update(); });
    actions.append(installButton, laterButton); banner.append(brand, copy, actions);
    dialog = node('dialog', 'pwa-install-dialog'); dialog.id = 'pwa-install-guide'; dialog.setAttribute('aria-labelledby', 'pwa-install-guide-title'); dialog.setAttribute('aria-describedby', 'pwa-install-guide-note');
    guideTitle = node('h2'); guideTitle.id = 'pwa-install-guide-title'; guideSteps = node('ol'); guideNote = node('p'); guideNote.id = 'pwa-install-guide-note';
    guideClose = node('button', 'pwa-install-primary'); guideClose.type = 'button'; guideClose.addEventListener('click', () => dialog.close());
    // This guide has one interactive element. Keep Tab/Shift+Tab on its close button.
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Tab') { event.preventDefault(); guideClose.focus(); }
    });
    dialog.addEventListener('close', () => {
      const mobileToggle = document.getElementById('mobile-menu-button');
      const target = (!model.hidden() && lastInstallTrigger?.getClientRects().length ? lastInstallTrigger : null) ||
        (mobileToggle?.getClientRects().length ? mobileToggle : null) ||
        menuButtons.find(button => !button.hidden && button.getClientRects().length) || document.querySelector('header a');
      target?.focus({ preventScroll: true });
    });
    dialog.append(guideTitle, guideSteps, guideNote, guideClose); document.body.append(banner, dialog);
    for (const [parent, className] of [[document.querySelector('#mobile-header-actions'), 'pwa-install-menu'], [document.querySelector('footer nav'), 'pwa-install-footer']]) {
      if (!parent) continue;
      const button = node('button', className); button.type = 'button'; button.hidden = true; button.addEventListener('click', event => {
        const menu = document.getElementById('mobile-menu');
        if (menu?.contains(button) && !menu.hidden) document.getElementById('mobile-menu-button')?.click();
        return install(event);
      });
      button.setAttribute('aria-haspopup', 'dialog');
      parent.append(button); menuButtons.push(button);
    }
    if ('ResizeObserver' in window) new ResizeObserver(reserveSpace).observe(banner);
    else window.addEventListener('resize', reserveSpace);
    // Temporarily yield to property/service actions without dismissing the visit's offer.
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) protectedZones.add(entry.target); else protectedZones.delete(entry.target); });
        update();
      });
      document.querySelectorAll('#properties-grid, #contact, #mp-cards, #mp-cart, #mp-search button[type="submit"]').forEach(zone => observer.observe(zone));
    }
    if ('MutationObserver' in window) {
      const observer = new MutationObserver(update);
      document.querySelectorAll('#mobile-menu, #property-gallery-modal, #lightbox-modal, dialog').forEach(overlay => {
        observer.observe(overlay, { attributes: true, attributeFilter: ['hidden', 'class', 'open'] });
      });
    }
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
