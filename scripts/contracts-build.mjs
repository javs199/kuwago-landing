import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = join(root,'packages/contracts/node_modules/typescript/bin/tsc');
if (!existsSync(compiler)) throw new Error('Run npm --prefix packages/contracts ci before building contracts.');
const result = spawnSync(process.execPath,[compiler,'-p',join(root,'packages/contracts/tsconfig.json')],{stdio:'inherit'});
if (result.status !== 0) process.exit(result.status || 1);
const output = join(root,'assets/js/contracts');
mkdirSync(output,{recursive:true});
// Explicit public runtime allowlist; never copy admin.js, index.js or private data.
for (const name of ['public.js','models.js','validation-core.js']) copyFileSync(join(root,'packages/contracts/dist',name),join(output,name));
console.log('Contracts built; public runtime prepared.');
