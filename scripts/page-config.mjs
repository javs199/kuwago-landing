import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// The published site is static HTML. Do not emit navigation to missing pages.
export function getConciergePage() {
  const context = { window: {} };
  runInNewContext(readFileSync('assets/js/config.js', 'utf8'), context, { timeout: 1000 });
  const page = context.window.KUWAGO_PAGES?.conciergeMarketplace;
  if (!page || page.enabled === false) return null;
  if (page.enabled !== true || page.path !== '/concierge-marketplace.html') {
    throw new Error('Invalid Concierge route configuration.');
  }
  const file = page.path.slice(1);
  if (!existsSync(file)) throw new Error('Concierge cannot be enabled: approved page is missing.');
  return file;
}
