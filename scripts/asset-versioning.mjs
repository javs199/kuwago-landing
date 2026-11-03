import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const moduleImports = /\b(?:from\s*|import\s*)(['"])(\.{1,2}\/[^'"?#]+\.js)(?:\?[^'"]*)?\1/g;
export function getAssetVersion(path, root = '.', ancestors = new Set()) {
  const absolute = resolve(root, path.replace(/^\//, ''));
  if (relative(resolve(root), absolute).startsWith('..')) throw new Error('Asset outside project');
  const content = readFileSync(absolute, 'utf8');
  const seen = new Set(ancestors); seen.add(absolute);
  const dependencies = absolute.endsWith('.js') ? [...content.matchAll(moduleImports)].map(([, , specifier]) => {
    const dependency = resolve(dirname(absolute), specifier);
    return seen.has(dependency) ? '' : getAssetVersion(relative(resolve(root), dependency), root, seen);
  }).join('') : '';
  return createHash('sha256').update(content + dependencies).digest('hex').slice(0,12);
}

export function versionModuleImports(content, sourcePath, root = '.') {
  return content.replace(moduleImports, (match, quote, specifier) => {
    const path = relative(resolve(root), resolve(root, dirname(sourcePath), specifier));
    return `${match.slice(0,match.indexOf(quote))}${quote}${specifier}?v=${getAssetVersion(path,root)}${quote}`;
  });
}

// HTML is revalidated; changed assets must bypass older browser/CDN copies.
export function versionAssets(html, root = '.') {
  return html.replace(/\b(src|href)="(\/?assets\/(?:css|js)\/[^"?]+\.(?:css|js))(?:\?[^"#]*)?"/g, (attribute, name, path) => {
    // These PWA resources already require revalidation on every request.
    if (/\/pwa(?:-install(?:-state)?)?\.(?:js|css)$/.test(path)) return attribute;
    const version = getAssetVersion(path, root);
    return `${name}="${path}?v=${version}"`;
  });
}
