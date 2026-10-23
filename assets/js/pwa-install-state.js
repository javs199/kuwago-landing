(() => {
  function manualRoute({ ua = '', platform = '', touchPoints = 0, os = '' }) {
    // Embedded browsers and unknown clients must not receive invented browser-menu instructions.
    if (/FBAN|FBAV|Instagram|MicroMessenger|; wv\)|\bGSA\/|Line\//i.test(ua)) return null;
    const ios = /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
    if (ios) {
      if (/Version\/[\d.]+.*Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return 'ios-safari';
      if (/CriOS|FxiOS|EdgiOS/.test(ua)) return 'ios-other';
      return null;
    }
    if (/Android/.test(ua) || os === 'Android') {
      if (/Firefox\//.test(ua)) return 'android-firefox';
      if (/Chrome\//.test(ua) && !/Edg[A/]|OPR|SamsungBrowser|UCBrowser|YaBrowser|Vivaldi|DuckDuckGo/.test(ua)) return 'android-chrome';
      return null;
    }
    const touchLinux = /Linux/.test(ua) && touchPoints > 1;
    if (/Edg\//.test(ua)) return touchLinux ? null : 'desktop-edge';
    if (/Chrome\//.test(ua) && !/OPR|Vivaldi|YaBrowser|DuckDuckGo|SamsungBrowser|Brave/.test(ua)) return touchLinux ? 'chrome-touch' : 'desktop-chrome';
    return null;
  }

  function startsVisit({ type = 'navigate', referrer = '', origin = '' } = {}) {
    if (type === 'reload' || type === 'back_forward') return false;
    if (!referrer) return true;
    try { return new URL(referrer).origin !== origin; } catch { return true; }
  }

  function create({ read = () => null, write = () => {}, standalone = false } = {}) {
    const state = { standalone, installed: false, prompt: null, busy: false, accepted: false, dismissed: false };
    const sync = () => {
      try {
        const saved = JSON.parse(read() || '{}');
        state.dismissed = saved.dismissed === true;
      } catch { /* Keep the in-memory choice if storage is blocked or unavailable. */ }
    };
    const save = () => { try { write(JSON.stringify({ dismissed: state.dismissed })); } catch {} };
    const hidden = () => state.standalone || state.installed;
    sync();
    return {
      state, sync, hidden,
      canBanner: route => !hidden() && !state.busy && !state.accepted && !state.dismissed && (!!state.prompt || !!route),
      canMenu: route => !hidden() && !state.busy && !state.accepted && (!!state.prompt || !!route),
      offer(event) { state.prompt = event; state.installed = false; state.accepted = false; },
      consume() { if (hidden() || state.busy || !state.prompt) return null; const event = state.prompt; state.prompt = null; state.busy = true; return event; },
      dismiss() { state.dismissed = true; save(); },
      result(outcome) { state.busy = false; state.accepted = outcome === 'accepted'; state.dismissed = true; save(); },
      failed() { state.busy = false; },
      installed() { state.installed = true; state.prompt = null; state.busy = false; state.dismissed = true; save(); },
      standalone(value) { state.standalone = value; },
    };
  }
  window.KuwagoInstallState = { create, manualRoute, startsVisit };
})();
