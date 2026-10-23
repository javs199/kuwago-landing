import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// HTML is revalidated; changed assets must bypass older browser/CDN copies.
export function versionAssets(html, root = '.') {
  return html.replace(/\b(src|href)="(\/?assets\/(?:css|js)\/[^"?]+\.(?:css|js))(?:\?[^"#]*)?"/g, (attribute, name, path) => {
    // These PWA resources already require revalidation on every request.
    if (/\/pwa(?:-install(?:-state)?)?\.(?:js|css)$/.test(path)) return attribute;
    const content = readFileSync(join(root, path.replace(/^\//, '')));
    const version = createHash('sha256').update(content).digest('hex').slice(0, 12);
    return `${name}="${path}?v=${version}"`;
  });
}
