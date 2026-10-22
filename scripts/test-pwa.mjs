import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { checkPwa } from './pwa-check.mjs';

test('manifest, both page heads and PNG dimensions are valid', () => assert.deepEqual(checkPwa(), []));

function worker(network = async () => ({ status: 200 })) {
  const listeners = {}, calls = [];
  runInNewContext(readFileSync('sw.js', 'utf8'), {
    URL,
    self: { location: { origin: 'https://grupokuwago.com' }, addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    fetch: (...args) => { calls.push(args); return network(...args); },
    // Intentionally no caches, localStorage, IndexedDB or notifications available.
  });
  return { listeners, calls };
}

test('public navigation goes to the network without cached responses', async () => {
  const { listeners, calls } = worker();
  for (const path of ['/', '/index.html', '/concierge-marketplace.html']) {
    let response;
    listeners.fetch({ request: { url: `https://grupokuwago.com${path}`, method: 'GET', mode: 'navigate' }, respondWith: promise => { response = promise; } });
    assert.equal((await response).status, 200);
  }
  assert.equal(calls.length, 3);
  assert(calls.every(([, options]) => options.cache === 'no-store'));
});

test('private routes, API calls, queries, POSTs and external requests are not intercepted', () => {
  const { listeners, calls } = worker();
  for (const [url, method, mode] of [
    ['https://grupokuwago.com/account', 'GET', 'navigate'],
    ['https://grupokuwago.com/api/bookings', 'GET', 'cors'],
    ['https://grupokuwago.com/?token=private', 'GET', 'navigate'],
    ['https://grupokuwago.com/', 'POST', 'navigate'],
    ['https://grupokuwago.com/assets/js/main.js', 'GET', 'no-cors'],
    ['https://example.com/', 'GET', 'navigate'],
  ]) listeners.fetch({ request: { url, method, mode }, respondWith: () => assert.fail('Unexpected interception') });
  assert.equal(calls.length, 0);
});

test('network failure does not return stale HTML or a fake success', async () => {
  const { listeners } = worker(async () => { throw Error('offline'); });
  let response;
  listeners.fetch({ request: { url: 'https://grupokuwago.com/', method: 'GET', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  await assert.rejects(response, /offline/);
});

test('worker activates without caching, deleting other caches or reloading pages', async () => {
  const { listeners } = worker();
  for (const event of ['install', 'activate']) {
    let completion;
    listeners[event]({ waitUntil: promise => { completion = promise; } });
    await completion;
  }
  assert.deepEqual(Object.keys(listeners).sort(), ['activate', 'fetch', 'install']);
});

async function registration({ secure = true, supported = true, fail = false } = {}) {
  const dataset = {}, calls = [];
  const serviceWorker = { register: async (...args) => { calls.push(args); if (fail) throw Error('blocked'); }, ready: Promise.resolve({}) };
  runInNewContext(readFileSync('assets/js/pwa.js', 'utf8'), {
    window: { isSecureContext: secure }, navigator: supported ? { serviceWorker } : {},
    document: { documentElement: { dataset }, readyState: 'complete' }, console: { warn: () => {} },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { dataset, calls };
}

test('secure registration uses root scope and bypasses HTTP cache for worker updates', async () => {
  const { dataset, calls } = await registration();
  assert.equal(dataset.pwaWorker, 'ready');
  assert.equal(calls[0][0], '/sw.js');
  assert.equal(calls[0][1].scope, '/');
  assert.equal(calls[0][1].updateViaCache, 'none');
});

test('unsupported or insecure browsers keep working without registration', async () => {
  for (const config of [{ secure: false }, { supported: false }]) {
    const result = await registration(config);
    assert.equal(result.calls.length, 0); assert.equal(result.dataset.pwaWorker, 'unsupported');
  }
});

test('registration failure is contained and does not break the website', async () => {
  assert.equal((await registration({ fail: true })).dataset.pwaWorker, 'error');
});
