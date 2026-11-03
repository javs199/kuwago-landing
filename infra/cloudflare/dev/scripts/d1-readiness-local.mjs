// Phase 2C.3. Fixed, isolated local targets only; never uses remote D1 or real identities.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {assertLocalConfig} from './local.mjs';
import {createLogicalBackup,restoreLogicalBackup,verifyRecovery} from '../.wrangler/build/recovery.js';
import {createMediaArchive,restoreMediaArchive,verifyMediaStorage} from './media-recovery.mjs';
if(process.argv.length!==2)throw Error('No arguments or remote targets are supported');
const directory=fileURLToPath(new URL('../',import.meta.url));
assertLocalConfig(JSON.parse(readFileSync(resolve(directory,'wrangler.local.json'),'utf8')));
const migrations=resolve(directory,'../../../packages/database/migrations');
const manifest=JSON.parse(readFileSync(resolve(migrations,'../migrations.sha256.json'),'utf8'));
const expected=['0001_admin_catalog.sql','0002_integrity_guards.sql','0003_access_rbac.sql','0004_catalog_operations.sql','0005_publication_resilience.sql','0006_media_lifecycle.sql'];
assert.deepEqual(manifest.migrations.map(row=>row.file),expected);
assert.deepEqual(readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort(),expected);
for(const row of manifest.migrations)assert.equal(createHash('sha256').update(readFileSync(resolve(migrations,row.file))).digest('hex'),row.sha256);
// Keep the path short: native SQLite sidecar paths can fail near Windows path limits.
const parent=resolve(directory,'.wrangler/phase2c3');mkdirSync(parent,{recursive:true});
const output=resolve(parent,'run-'+randomUUID().replaceAll('-','').slice(0,12));mkdirSync(output);
const env={...process.env};for(const name of Object.keys(env))if(/^(CLOUDFLARE_|CF_|WRANGLER_)/.test(name))delete env[name];
Object.assign(env,{XDG_CONFIG_HOME:resolve(output,'isolated-config'),WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:resolve(output,'logs'),CI:'true'});
const cli=resolve(directory,'node_modules/wrangler/bin/wrangler.js');
let step=0;
function applyLocal(state){
  const result=spawnSync(process.execPath,[cli,'d1','migrations','apply','DB','--local','--persist-to',state,'--config','wrangler.local.json','--env','development'],{cwd:directory,env,encoding:'utf8',timeout:60000,maxBuffer:2097152});
  writeFileSync(resolve(output,'wrangler-step-'+(++step)+'.txt'),(result.stdout??'')+'\n'+(result.stderr??''));
  assert.equal(result.status,0,'local_migration_failed');assert.match(result.stdout,/local/);
  return result.stdout.includes('No migrations to apply');
}
function runtime(state){return new Miniflare(convertV4MiniflareOptions({name:'kuwago-d1-readiness-local-only',modules:true,script:'export default {fetch(){return new Response(null,{status:503})}}',compatibilityDate:'2026-07-30',cf:false,telemetry:{enabled:false},d1Databases:{DB:'DB'},resourcePersistencePath:resolve(state,'v3'),r2Buckets:{PRIVATE_MEDIA:'kuwago-media-development',PUBLICATION:'kuwago-publication-local-development'},outboundService:async()=>{throw Error('external_network_forbidden');}}));}
const sourceState=resolve(output,'source'),targetState=resolve(output,'restore');
assert.equal(applyLocal(sourceState),false);assert.equal(applyLocal(sourceState),true);
assert.equal(applyLocal(targetState),false);
const source=runtime(sourceState),target=runtime(targetState);
try{
  const db=await source.getD1Database('DB'),restored=await target.getD1Database('DB');
  const ledger=async db=>(await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(row=>row.name);
  assert.deepEqual(await ledger(db),expected);assert.deepEqual(await ledger(restored),expected);
  assert.equal((await db.prepare('PRAGMA quick_check').first()).quick_check,'ok');
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM principals').first()).n,0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM administrator_roles').first()).n,0);
  const store=await source.getR2Bucket('PUBLICATION'),media=await source.getR2Bucket('PRIVATE_MEDIA');
  const backup=await createLogicalBackup(db,store),archive=await createMediaArchive(backup,media);
  assert.ok(!backup.data.tables.some(row=>row.name==='d1_migrations'));
  // Persist only this empty, newly created local database backup, not any real state.
  writeFileSync(resolve(output,'empty-local-backup.json'),JSON.stringify({backup,archive}));
  const outcome=await restoreLogicalBackup(restored,backup);
  const restoredMedia=await target.getR2Bucket('PRIVATE_MEDIA');
  const mediaResult=await restoreMediaArchive(restored,restoredMedia,archive,backup.sha256);
  assert.equal(outcome.mode,'paused');assert.notEqual(outcome.epoch,backup.data.sourceEpoch);
  assert.deepEqual(await ledger(restored),expected);
  assert.equal((await restored.prepare('PRAGMA quick_check').first()).quick_check,'ok');
  const recovery=await verifyRecovery(restored,await target.getR2Bucket('PUBLICATION'));
  assert.equal(recovery.foreignKeyViolations,0);assert.equal(recovery.publishedCount,0);assert.equal(recovery.head.mode,'paused');
  assert.equal(mediaResult.complete,true);assert.equal((await verifyMediaStorage(db,media)).complete,true);
  assert.equal((await db.prepare('SELECT epoch FROM publication_control').first()).epoch,backup.data.sourceEpoch);
  const report={phase:'2C.3',localOnly:true,remoteOperations:0,checksumCount:6,freshMigrationCount:expected.length,secondApplyNoop:true,ledgerPreserved:true,quickCheck:'ok',foreignKeyViolations:0,principalsCreated:0,administratorsCreated:0,restore:{isolated:true,mode:outcome.mode,newEpoch:true,publishedCount:0,mediaComplete:true,sourceUnchanged:true},evidenceDirectory:output};
  writeFileSync(resolve(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await source.dispose();await target.dispose();}
