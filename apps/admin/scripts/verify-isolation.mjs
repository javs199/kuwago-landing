import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, extname } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const landing = join(root, 'dist');
const admin = fileURLToPath(new URL('../dist', import.meta.url));
assert.notEqual(admin, landing);
for (const file of ['index.html', 'concierge-marketplace.html', 'manifest.webmanifest', 'sw.js']) {
  assert(existsSync(join(landing, file)), `Build the landing first: missing ${file}`);
}
assert(existsSync(join(admin, 'index.html')), 'Build the admin first');
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = relative(landing, path).replaceAll('\\', '/');
    assert(!/(^|\/)(apps|node_modules|\.env[^/]*|\.dev\.vars[^/]*)(\/|$)/.test(name), `Private artifact in landing: ${name}`);
    if (entry.isDirectory()) inspect(path);
    else if (['.html', '.js', '.css'].includes(extname(path))) {
      const content = readFileSync(path, 'utf8');
      assert(!/Kuwago Admin|kuwago-admin-theme|\/src\/main\.tsx|@vite\/client/.test(content), `Admin content in landing: ${name}`);
    }
  }
}
inspect(landing);
const publicContracts = join(landing,'assets/js/contracts');
assert.deepEqual(readdirSync(publicContracts).sort(),['models.js','public.js','validation-core.js']);
for (const file of readdirSync(publicContracts)) {
  assert(!/internalNotes|workingRevisionId|commercialApproval|PRIVATE TEST NOTE/.test(readFileSync(join(publicContracts,file),'utf8')), `Administrative contract in public runtime: ${file}`);
}
const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
assert.equal((config.match(/host: '127\.0\.0\.1'/g) || []).length, 2, 'Development and preview must bind to loopback');
console.log('Isolation passed: separate outputs; no admin/private files in landing; local servers bind to 127.0.0.1.');
