import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { versionAssets } from './asset-versioning.mjs';

test('changed CSS and JS bypass stale caches while unchanged URLs stay stable', () => {
  const root = mkdtempSync(join(tmpdir(), 'kuwago-assets-'));
  try {
    mkdirSync(join(root, 'assets/css'), { recursive: true });
    mkdirSync(join(root, 'assets/js'), { recursive: true });
    writeFileSync(join(root, 'assets/css/styles.css'), '.brand-symbol{width:27px}');
    writeFileSync(join(root, 'assets/js/main.js'), 'const mobile = true;');
    const html = '<link href="assets/css/styles.css"><script src="/assets/js/main.js?v=old"></script>';
    const initial = versionAssets(html, root);
    assert.match(initial, /styles\.css\?v=[a-f0-9]{12}/);
    assert.match(initial, /main\.js\?v=[a-f0-9]{12}/);
    assert.equal(versionAssets(initial, root), initial);
    writeFileSync(join(root, 'assets/css/styles.css'), '.brand-symbol{width:23px}');
    writeFileSync(join(root, 'assets/js/main.js'), 'const mobile = false;');
    const updated = versionAssets(html, root);
    assert.notEqual(updated.match(/styles[^\"]+/)[0], initial.match(/styles[^\"]+/)[0]);
    assert.notEqual(updated.match(/main[^\"]+/)[0], initial.match(/main[^\"]+/)[0]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('PWA registration, installer, external resources and images keep their URLs', () => {
  const html = '<script src="/assets/js/pwa.js"></script><script src="/assets/js/pwa-install.js"></script><link href="/assets/css/pwa-install.css"><link href="https://example.com/style.css"><img src="assets/images/logo.svg">';
  assert.equal(versionAssets(html), html);
});
