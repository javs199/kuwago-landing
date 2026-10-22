import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// Build-time tool only. Pass the folder containing an existing sharp package if not installed locally.
const modulePath = process.argv[2];
const sharp = modulePath
  ? createRequire(resolve(modulePath, '__kuwago.cjs'))('sharp')
  : (await import('sharp')).default;
const source = readFileSync('assets/images/brand/kuwago-favicon.svg', 'utf8');
const inner = source.replace(/^.*?<svg\b[^>]*>/s, '').replace(/<\/svg>\s*$/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#3B0C5B"/><g transform="translate(9 9) scale(.71875)">${inner}</g></svg>`;
mkdirSync('assets/images/pwa', { recursive: true });
for (const [name, size, svg] of [
  ['icon-192.png', 192, source],
  ['icon-512.png', 512, source],
  ['icon-maskable-512.png', 512, maskable],
  ['apple-touch-icon.png', 180, source],
]) {
  await sharp(Buffer.from(svg), { density: 576 }).resize(size, size).flatten({ background: '#3B0C5B' }).png().toFile(`assets/images/pwa/${name}`);
  console.log(`${name}: ${size}×${size}`);
}
