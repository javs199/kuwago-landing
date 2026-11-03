import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const directory = fileURLToPath(new URL('../', import.meta.url));
export function assertLocalConfig(config) {
  if (config.name !== 'kuwago-admin-api-local-only' || config.account_id || Object.keys(config.env).join() !== 'development') throw new Error('Only isolated local DEV is permitted');
  const dev = config.env.development;
  if (dev.name !== 'kuwago-admin-api-local-only-development' || dev.workers_dev !== false || dev.preview_urls !== false || dev.routes.length || config.dev.ip !== '127.0.0.1') throw new Error('Ingress must remain disabled');
  if (config.workers_dev !== false || config.preview_urls !== false || config.routes.length || config.assets || config.services || dev.services) throw new Error('Unexpected ingress or service binding');
  if (dev.vars.EXECUTION_MODE !== 'local-only' || dev.vars.MUTATIONS_ENABLED !== 'true') throw new Error('Invalid local execution mode');
  if (dev.d1_databases.length !== 1 || dev.d1_databases[0].binding !== 'DB' || dev.d1_databases[0].database_name !== 'kuwago-admin-db-development' || dev.d1_databases[0].database_id) throw new Error('Real database IDs are forbidden in local config');
  if (dev.r2_buckets.length !== 2 || dev.r2_buckets[0].binding !== 'PRIVATE_MEDIA' || dev.r2_buckets[0].bucket_name !== 'kuwago-media-development' || dev.r2_buckets[1].binding !== 'PUBLICATION' || dev.r2_buckets[1].bucket_name !== 'kuwago-publication-local-development') throw new Error('Unexpected media binding');
  for (const binding of [...dev.d1_databases, ...dev.r2_buckets]) if (binding.remote !== false) throw new Error('Remote bindings forbidden');
}
export function assertGatewayConfig(gateway){
  const allowed=['$schema','name','main','compatibility_date','workers_dev','preview_urls','routes','send_metrics','observability','dev','assets','env'];
  const gatewayEnv=gateway.env?.development;
  if(Object.keys(gateway).some(k=>!allowed.includes(k))||!gatewayEnv||Object.keys(gatewayEnv).some(k=>!['name','workers_dev','preview_urls','routes','vars','services'].includes(k)))throw new Error('Unexpected gateway configuration or binding');
  if(gateway.name!=='kuwago-admin-gateway-local-only'||gateway.main!=='src/gateway.ts'||Object.keys(gateway.env).join()!=='development'||gateway.dev.ip!=='127.0.0.1'||gateway.workers_dev!==false||gateway.preview_urls!==false||gateway.routes.length||gatewayEnv.name!=='kuwago-admin-gateway-local-only-development'||gatewayEnv.workers_dev!==false||gatewayEnv.preview_urls!==false||gatewayEnv.routes.length||gatewayEnv.services?.length!==1||gatewayEnv.services[0].binding!=='ADMIN_API'||gatewayEnv.services[0].service!=='kuwago-admin-api-local-only-development'||gatewayEnv.services[0].remote!==false||gateway.assets.directory!=='../../../apps/admin/dist'||gateway.assets.binding!=='ASSETS'||gateway.assets.run_worker_first!==true||gateway.assets.html_handling!=='none'||gateway.assets.not_found_handling!=='none')throw new Error('Gateway must use only isolated Admin assets and the local private API');
  if(JSON.stringify(gatewayEnv.vars)!==JSON.stringify({APP_ENV:'development',ACCESS_ISSUER:'',ACCESS_AUD:'',ADMIN_ORIGIN:''}))throw new Error('Default gateway config must remain unconfigured and fail closed');
}
export function localCommand(action) {
  const common = ['--config', 'wrangler.local.json', '--env', 'development'];
  const state = ['--persist-to', '.wrangler/state/development'];
  if (action === 'migrate') return ['d1', 'migrations', 'apply', 'DB', '--local', ...state, ...common];
  if (action === 'migrate-verify') return ['d1','migrations','apply','DB','--local','--persist-to','.wrangler/state/verification-phase2b4',...common];
  if (action === 'list') return ['d1', 'migrations', 'list', 'DB', '--local', ...state, ...common];
  if (action === 'validate') return ['deploy', '--dry-run', '--outdir', '.wrangler/dry-run', ...common];
  if (action === 'validate-gateway') return ['deploy','--dry-run','--outdir','.wrangler/dry-run-gateway','--config','wrangler.gateway.local.json','--env','development'];
  if (action === 'dev') return ['dev', '--local', ...state, ...common];
  if (action === 'dev-public') return ['dev','--local',...state,'--config','wrangler.public.local.json','--env','development'];
  if (action === 'validate-public') return ['deploy','--dry-run','--outdir','.wrangler/dry-run-public','--config','wrangler.public.local.json','--env','development'];
  if (action === 'dev-stack') return ['dev','--local','--test-scheduled',...state,...common,'--config','wrangler.public.local.json','--config','wrangler.barrier.local.json','--config','wrangler.reconciler.local.json'];
  if (action === 'dev-reconciler') return ['dev','--local','--test-scheduled',...state,'--config','wrangler.reconciler.local.json','--env','development'];
  if (action === 'validate-barrier') return ['deploy','--dry-run','--outdir','.wrangler/dry-run-barrier','--config','wrangler.barrier.local.json','--env','development'];
  if (action === 'validate-reconciler') return ['deploy','--dry-run','--outdir','.wrangler/dry-run-reconciler','--config','wrangler.reconciler.local.json','--env','development'];
  throw new Error('Unsupported action; no remote command is exposed');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Extra arguments are forbidden');
  assertLocalConfig(JSON.parse(readFileSync(resolve(directory, 'wrangler.local.json'), 'utf8')));
  const gateway=JSON.parse(readFileSync(resolve(directory,'wrangler.gateway.local.json'),'utf8'));
  assertGatewayConfig(gateway);
  const pub=JSON.parse(readFileSync(resolve(directory,'wrangler.public.local.json'),'utf8'));
  const pubEnv=pub.env.development;
  if(pub.name!=='kuwago-catalog-local-only'||pub.account_id||Object.keys(pub.env).join()!=='development'||pub.dev.ip!=='127.0.0.1'||pub.workers_dev!==false||pub.preview_urls!==false||pub.routes.length||pub.d1_databases||pub.services||pubEnv.d1_databases||pubEnv.services?.length!==1||pubEnv.services[0].binding!=='CATALOG_BARRIER'||pubEnv.services[0].service!=='kuwago-catalog-barrier-local-only-development'||pubEnv.services[0].remote!==false||pubEnv.workers_dev!==false||pubEnv.preview_urls!==false||pubEnv.routes.length||pubEnv.r2_buckets.length!==1||pubEnv.r2_buckets[0].binding!=='PUBLICATION'||pubEnv.r2_buckets[0].remote!==false||pubEnv.r2_buckets[0].bucket_name!=='kuwago-publication-local-development')throw new Error('Public API requires only local PUBLICATION and the narrow barrier');
  for(const kind of ['barrier','reconciler']){
    const config=JSON.parse(readFileSync(resolve(directory,`wrangler.${kind}.local.json`),'utf8'));const dev=config.env.development;
    if(config.account_id||Object.keys(config.env).join()!=='development'||config.dev.ip!=='127.0.0.1'||config.workers_dev!==false||config.preview_urls!==false||config.routes.length||config.services||dev.services||dev.workers_dev!==false||dev.preview_urls!==false||dev.routes.length||dev.d1_databases.length!==1||dev.d1_databases[0].binding!=='DB'||dev.d1_databases[0].remote!==false||dev.d1_databases[0].database_id)throw new Error('Auxiliary Workers must remain isolated local DEV');
    if(kind==='barrier'&&dev.r2_buckets)throw new Error('Barrier cannot access R2');
    if(kind==='reconciler'&&(dev.r2_buckets?.length!==2||dev.r2_buckets[0].binding!=='PUBLICATION'||dev.r2_buckets[0].remote!==false||dev.r2_buckets[1].binding!=='PRIVATE_MEDIA'||dev.r2_buckets[1].remote!==false||dev.r2_buckets[1].bucket_name!=='kuwago-media-development'))throw new Error('Reconciler requires isolated local publication and private media bindings');
  }
  const command = localCommand(process.argv[2]);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(CLOUDFLARE_|CF_|WRANGLER_)/.test(key)) delete env[key];
  // Separate from the user's OAuth directory; no login/refresh is needed for local work.
  const configHome = resolve(directory, '.wrangler/isolated-config');
  mkdirSync(configHome, { recursive: true });
  Object.assign(env, { XDG_CONFIG_HOME: configHome, WRANGLER_SEND_METRICS: 'false', CI: 'true', WRANGLER_LOG_PATH: resolve(directory, '.wrangler/logs') });
  const result = spawnSync(process.execPath, [resolve(directory, 'node_modules/wrangler/bin/wrangler.js'), ...command], { cwd: directory, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
