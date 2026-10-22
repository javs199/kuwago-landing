(() => {
  const root = document.documentElement;
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    root.dataset.pwaWorker = 'unsupported';
    return;
  }

  const register = async () => {
    root.dataset.pwaWorker = 'registering';
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      // Nonvisual diagnostic for local checks and DevTools; no install prompt or user information.
      root.dataset.pwaWorker = 'ready';
    } catch {
      root.dataset.pwaWorker = 'error';
      console.warn('Kuwago: service worker registration failed. Normal website navigation remains available.');
    }
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
})();
