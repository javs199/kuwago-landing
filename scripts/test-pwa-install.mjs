import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function api() {
  const context = { window: {}, URL };
  runInNewContext(readFileSync('assets/js/pwa-install-state.js', 'utf8'), context);
  return context.window.KuwagoInstallState;
}
const API = api();
const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36';
const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0.0.0 Mobile Safari/537.36';
const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

test('routes cover Android phones/tablets, iOS/iPadOS and desktop Chrome/Edge', () => {
  for (const [input, expected] of [
    [{ ua: android }, 'android-chrome'],
    [{ ua: android.replace('Mobile ', '') }, 'android-chrome'],
    [{ ua: chrome, os: 'Android' }, 'android-chrome'],
    [{ ua: chrome.replace('Windows NT 10.0; Win64; x64', 'X11; Linux x86_64'), os: 'Linux', touchPoints: 5 }, 'chrome-touch'],
    [{ ua: safari }, 'ios-safari'],
    [{ ua: safari.replace('iPhone', 'iPad') }, 'ios-safari'],
    [{ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15', platform: 'MacIntel', touchPoints: 5 }, 'ios-safari'],
    [{ ua: safari.replace('Version/18.0', 'CriOS/141.0') }, 'ios-other'],
    [{ ua: chrome }, 'desktop-chrome'],
    [{ ua: `${chrome} Edg/141.0` }, 'desktop-edge'],
    [{ ua: 'Mozilla/5.0 (Android 15) Gecko/141.0 Firefox/141.0' }, 'android-firefox'],
  ]) assert.equal(API.manualRoute(input), expected);
});

test('unknown and embedded browsers receive no guessed manual instructions', () => {
  for (const ua of ['UnknownBrowser', `${android} Instagram 300`, android.replace('Android 15;', 'Android 15; wv)'), `${android} SamsungBrowser/20.0`, 'Mozilla/5.0 Firefox/141.0']) {
    assert.equal(API.manualRoute({ ua }), null, ua);
  }
});

test('Chrome shows its manual banner without waiting for the native prompt', () => {
  const model = API.create();
  assert.equal(model.canBanner('desktop-chrome'), true);
  assert.equal(model.canMenu('desktop-chrome'), true);
  model.offer({ prompt() {} });
  assert.equal(model.canBanner('desktop-chrome'), true);
});

test('dismissal lasts for this visit only; a fresh visit shows the banner again', () => {
  let saved;
  const options = { read: () => saved, write: value => { saved = value; } };
  API.create(options).dismiss();
  const model = API.create(options);
  assert.equal(model.canBanner('ios-safari'), false);
  assert.equal(model.canMenu('ios-safari'), true);
  model.offer({}); // A late browser event must not override Now not now.
  assert.equal(model.canBanner('ios-safari'), false);
  saved = null;
  assert.equal(API.create(options).canBanner('ios-safari'), true);
});

test('blocked storage keeps local dismissal and does not break the model', () => {
  const model = API.create({ read: () => { throw Error('blocked'); }, write: () => { throw Error('blocked'); } });
  model.dismiss(); model.sync();
  assert.equal(model.canBanner('ios-safari'), false);
});

test('accepted choice and manual instructions never certify installation', () => {
  let saved;
  const model = API.create({ write: value => { saved = value; } });
  model.dismiss(); assert.equal(model.state.installed, false);
  model.result('accepted'); assert.equal(model.state.installed, false);
  assert.deepEqual(JSON.parse(saved), { dismissed: true });
  assert.equal(model.canBanner('ios-safari'), false);
});

test('native rejection consumes the event once and snoozes the banner', () => {
  const model = API.create(); const event = {};
  model.offer(event); assert.equal(model.consume(), event); assert.equal(model.consume(), null);
  model.result('dismissed'); assert.equal(model.canBanner('ios-safari'), false);
});

test('standalone and appinstalled hide the current UI without permanent browser suppression', () => {
  let saved;
  const options = { read: () => saved, write: value => { saved = value; } };
  const model = API.create(options);
  model.standalone(true); assert.equal(model.canMenu('ios-safari'), false);
  model.standalone(false); model.installed();
  assert.equal(model.canMenu('ios-safari'), false);
  const sameVisit = API.create(options);
  assert.equal(sameVisit.canBanner('ios-safari'), false);
  assert.equal(sameVisit.canMenu('ios-safari'), true);
  saved = null;
  assert.equal(API.create(options).canBanner('ios-safari'), true);
});

test('direct/external arrivals start a visit; internal navigation and reloads preserve it', () => {
  const origin = 'https://grupokuwago.com';
  for (const input of [{}, { referrer: 'https://example.com/' }]) assert.equal(API.startsVisit({ origin, ...input }), true);
  for (const input of [{ type: 'reload' }, { type: 'back_forward' }, { referrer: `${origin}/index.html` }]) assert.equal(API.startsVisit({ origin, ...input }), false);
});

test('every supported phone/tablet/desktop route offers the banner without an event', () => {
  for (const ua of [chrome, `${chrome} Edg/141.0`, android, android.replace('Mobile ', ''), safari, safari.replace('iPhone', 'iPad')]) {
    const route = API.manualRoute({ ua });
    const model = API.create();
    assert.equal(model.canBanner(route), true, ua);
    model.dismiss(); assert.equal(model.canBanner(route), false);
    assert.equal(API.create().canBanner(route), true);
    assert.equal(API.create({ standalone: true }).canBanner(route), false);
  }
});

// A small DOM harness exercises actual controller event handlers without claiming a real OS install.
function controller({ ua = chrome, standalone = false, session = new Map(), navigation = 'navigate', referrer = '', observers = false } = {}) {
  const registry = new Map(), winEvents = new Map(), docEvents = new Map();
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.handlers = {}; this.hidden = false; this.open = false; this.dataset = {}; this.style = { setProperty() {} }; }
    set id(value) { this._id = value; registry.set(value, this); } get id() { return this._id; }
    setAttribute(key, value) { this[key] = value; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    getBoundingClientRect() { return { height: 100 }; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    contains(target) { return this === target || this.children.some(child => child.contains?.(target)); }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; } close() { this.open = false; }
  }
  const footer = new Element('nav'), mobileActions = new Element('div'), home = new Element('a');
  const document = { documentElement: { lang: 'en' }, body: new Element('body'), readyState: 'complete', activeElement: null, referrer,
    createElement: tag => new Element(tag), getElementById: id => registry.get(id),
    querySelectorAll: () => [],
    querySelector: selector => ({ 'footer nav': footer, '#mobile-header-actions': mobileActions, 'header a': home })[selector],
    addEventListener: (type, fn) => docEvents.set(type, fn),
  };
  const media = { matches: standalone, addEventListener: (type, fn) => { media.change = fn; } };
  const window = { location: { origin: 'https://grupokuwago.com' }, performance: { getEntriesByType: () => [{ type: navigation }] }, isSecureContext: true, KuwagoInstallState: API, matchMedia: () => media,
    addEventListener: (type, fn) => winEvents.set(type, fn),
    getComputedStyle: () => ({ bottom: '16px' }), setTimeout: fn => { window.delay = fn; },
  };
  const context = { window, document, navigator: { userAgent: ua, platform: '', maxTouchPoints: 0 }, sessionStorage: { getItem: key => session.get(key) || null, setItem: (key, value) => session.set(key, value), removeItem: key => session.delete(key) }, localStorage: { getItem() { throw Error('localStorage forbidden'); }, setItem() { throw Error('localStorage forbidden'); } } };
  runInNewContext(readFileSync('assets/js/i18n.js', 'utf8'), context);
  let onIntersection, onMutation;
  const protectedZone = new Element('div');
  let overlayVisible = false;
  if (observers) {
    context.IntersectionObserver = window.IntersectionObserver = class { constructor(fn) { onIntersection = fn; } observe() {} };
    context.MutationObserver = window.MutationObserver = class { constructor(fn) { onMutation = fn; } observe() {} };
    document.querySelectorAll = selector => selector.includes('#properties-grid') ? [protectedZone] : [];
    const originalQuery = document.querySelector;
    document.querySelector = selector => selector.startsWith('#mobile-menu:not') ? (overlayVisible ? {} : null) : originalQuery(selector);
  }
  runInNewContext(readFileSync('assets/js/pwa-install.js', 'utf8'), context);
  return { context, registry, winEvents, docEvents, footer, media,
    showProperties: visible => onIntersection([{ target: protectedZone, isIntersecting: visible }]),
    showOverlay: visible => { overlayVisible = visible; onMutation(); },
  };
}

test('controller preserves dismissal within a visit and reappears on a new direct arrival', () => {
  const session = new Map();
  const first = controller({ session });
  const banner = first.registry.get('pwa-install-banner');
  assert.equal(banner.hidden, false);
  banner.children[2].children[1].handlers.click();
  assert.equal(banner.hidden, true);
  assert.equal(controller({ session, navigation: 'reload' }).registry.get('pwa-install-banner').hidden, true);
  assert.equal(controller({ session, referrer: 'https://grupokuwago.com/' }).registry.get('pwa-install-banner').hidden, true);
  assert.equal(controller({ session }).registry.get('pwa-install-banner').hidden, false);
});

test('menu/modal/property visibility temporarily suppresses the banner without dismissing the visit', () => {
  const h = controller({ observers: true });
  const banner = h.registry.get('pwa-install-banner');
  assert.equal(banner.hidden, false);
  h.showProperties(true); assert.equal(banner.hidden, true);
  h.showProperties(false); assert.equal(banner.hidden, false);
  h.showOverlay(true); assert.equal(banner.hidden, true);
  h.showOverlay(false); assert.equal(banner.hidden, false);
});

test('controller never prompts automatically, ignores untrusted activation and prompts once on real click', async () => {
  const h = controller(); let calls = 0;
  const event = { isTrusted: true, preventDefault() {}, prompt: async () => { calls++; return { outcome: 'dismissed' }; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) };
  h.winEvents.get('beforeinstallprompt')(event);
  const banner = h.registry.get('pwa-install-banner'); const button = banner.children[2].children[0];
  assert.equal(banner.hidden, false); assert.equal(calls, 0);
  await button.handlers.click({ isTrusted: false }); assert.equal(calls, 0);
  await button.handlers.click({ isTrusted: true }); assert.equal(calls, 1); assert.equal(banner.hidden, true);
  // A later manual click opens instructions instead of reusing a consumed event.
  await h.footer.children[0].handlers.click({ isTrusted: true }); assert.equal(calls, 1); assert.equal(h.registry.get('pwa-install-guide').open, true);
});

test('controller renders iOS manual help in both languages and never marks a shortcut installed', async () => {
  const h = controller({ ua: safari });
  const banner = h.registry.get('pwa-install-banner');
  assert.equal(banner.hidden, false);
  await banner.children[2].children[0].handlers.click({ isTrusted: true });
  const dialog = h.registry.get('pwa-install-guide'); assert.equal(dialog.open, true);
  assert(dialog.children[1].children.some(node => node.textContent.includes('Safari')));
  h.docEvents.get('kuwago:language')({ detail: { lang: 'es' } });
  assert.equal(dialog.children[0].textContent, 'Instalar Kuwago');
  assert(dialog.children[3].textContent.includes('Cerrar'));
  let prevented = false;
  dialog.handlers.keydown({ key: 'Tab', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.context.document.activeElement, dialog.children[3]);
  assert.equal(h.footer.children[0].hidden, false);
});

test('appinstalled and display-mode changes hide UI; repeated initialization never duplicates banners', () => {
  const h = controller({ ua: safari });
  h.winEvents.get('appinstalled')({ isTrusted: false }); assert.equal(h.registry.get('pwa-install-banner').hidden, false);
  h.winEvents.get('appinstalled')({ isTrusted: true }); assert.equal(h.registry.get('pwa-install-banner').hidden, true); assert.equal(h.footer.children[0].hidden, true);
  runInNewContext(readFileSync('assets/js/pwa-install.js', 'utf8'), h.context);
  assert.equal(h.context.document.body.children.length, 2);
  const standalone = controller({ ua: safari, standalone: true });
  assert.equal(standalone.registry.get('pwa-install-banner').hidden, true);
});

test('failed native prompt produces help, never success or a second prompt', async () => {
  const h = controller(); let calls = 0;
  h.winEvents.get('beforeinstallprompt')({ isTrusted: true, preventDefault() {}, prompt: async () => { calls++; throw Error('blocked'); } });
  await h.footer.children[0].handlers.click({ isTrusted: true });
  const dialog = h.registry.get('pwa-install-guide'); assert.equal(dialog.open, true);
  assert(dialog.children[2].textContent.includes('No installation was confirmed'));
  assert.equal(calls, 1);
});
