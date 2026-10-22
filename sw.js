/* Kuwago PWA v1: network only, no Cache Storage, no offline copies or private data. */
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Only public HTML navigation. Leave assets, APIs, POSTs and future private routes alone.
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      url.origin !== self.location.origin || url.search ||
      !['/', '/index.html', '/concierge-marketplace.html'].includes(url.pathname)) return;

  // Failure remains a normal network error; never substitute old HTML or a fake successful response.
  event.respondWith(fetch(request, { cache: 'no-store' }));
});
