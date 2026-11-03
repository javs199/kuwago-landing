import { build } from 'esbuild';
await build({
  entryPoints: { development:'src/development.ts', gateway:'src/gateway.ts', 'image-processor':'src/images/processor.ts', worker:'src/index.ts', security:'src/security.ts', public:'src/public.ts', barrier:'src/barrier.ts', reconciler:'src/reconciler.ts', recovery:'src/catalog/recovery.ts', resilience:'src/catalog/delivery.ts' },
  outdir:'.wrangler/build', bundle:true, format:'esm', platform:'browser',
  target:'es2022', sourcemap:false, minify:false,
});
console.log('Local Worker and security module built; no upload.');
