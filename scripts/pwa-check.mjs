import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function checkPwa(root = '.') {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
    for (const [key, value] of Object.entries({ id: '/', name: 'Grupo Kuwago', short_name: 'Kuwago', start_url: '/', scope: '/', display: 'standalone', theme_color: '#3B0C5B', background_color: '#3B0C5B' })) {
      require(manifest[key] === value, `PWA manifest: unexpected ${key}.`);
    }
    require(manifest.prefer_related_applications === false, 'PWA must not redirect installation to an app store.');
    for (const [size, purpose] of [[192, 'any'], [512, 'any'], [512, 'maskable']]) {
      const icon = manifest.icons?.find(icon => icon.sizes === `${size}x${size}` && icon.purpose === purpose);
      require(!!icon, `PWA icon missing: ${size}px ${purpose}.`);
      if (!icon) continue;
      require(/^\/assets\/images\/pwa\/[\w-]+\.png$/.test(icon.src), 'PWA icons must use local public paths.');
      require(icon.type === 'image/png', 'PWA icons must declare image/png.');
      verifyPng(join(root, icon.src.slice(1)), size);
    }
    verifyPng(join(root, 'assets/images/pwa/apple-touch-icon.png'), 180);
    const pages = ['index.html', ...(existsSync(join(root, 'concierge-marketplace.html')) ? ['concierge-marketplace.html'] : [])];
    for (const page of pages) {
      const html = readFileSync(join(root, page), 'utf8');
      for (const required of ['rel="manifest" href="/manifest.webmanifest"', 'name="theme-color" content="#3B0C5B"', 'rel="apple-touch-icon" sizes="180x180" href="/assets/images/pwa/apple-touch-icon.png"', 'name="apple-mobile-web-app-capable" content="yes"', 'defer src="/assets/js/pwa.js"']) {
        require(html.includes(required), `${page}: PWA metadata missing: ${required}`);
      }
    }
    for (const file of ['sw.js', 'assets/js/pwa.js']) require(existsSync(join(root, file)), `Missing PWA file: ${file}`);
  } catch (error) { errors.push(`PWA validation: ${error.message}`); }
  return errors;
}

function verifyPng(file, size) {
  const buffer = readFileSync(file);
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || buffer.readUInt32BE(16) !== size || buffer.readUInt32BE(20) !== size) {
    throw new Error(`Invalid ${size}px PNG: ${file}`);
  }
}
