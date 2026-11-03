import {createMediaArchive,restoreMediaArchive,verifyMediaStorage} from './media-recovery.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {assertLocalConfig} from './local.mjs';
import {createLogicalBackup,restoreLogicalBackup,verifyRecovery,resumeRecoveredEmpty,quarantineLegacy} from '../.wrangler/build/recovery.js';
import {deliverCatalog} from '../.wrangler/build/resilience.js';
const root=fileURLToPath(new URL('../',import.meta.url));
assertLocalConfig(JSON.parse(readFileSync(resolve(root,'wrangler.local.json'),'utf8')));
const output=resolve(root,'.wrangler/recovery');mkdirSync(output,{recursive:true});
const args=process.argv.slice(2);const command=args.join(' ');
if(!['backup','restore --confirm-isolated','verify','resume-empty --confirm-empty','reconcile-restored --confirm-empty','quarantine-legacy --confirm-withdraw-all'].includes(command))throw new Error('Only fixed local recovery commands are allowed');
for(const name of Object.keys(process.env))if(/^(CLOUDFLARE_|CF_|WRANGLER_)/.test(name))delete process.env[name];
const marker=resolve(output,'last-restore.json');
let state=resolve(root,'.wrangler/state/development');
if(command==='restore --confirm-isolated')state=resolve(root,'.wrangler/state/recovery-'+crypto.randomUUID());
else if(['verify','resume-empty --confirm-empty','reconcile-restored --confirm-empty'].includes(command)){
  const value=JSON.parse(readFileSync(marker,'utf8'));
  if(typeof value.state!=='string'||!/^recovery-[a-f0-9-]{36}$/.test(value.state))throw new Error('Invalid local recovery marker');
  state=resolve(root,'.wrangler/state',value.state);
}
if(command==='restore --confirm-isolated'){
  // Let Wrangler create its own migration ledger on the NEW target. Never copy a
  // source ledger or manually mark migrations as applied to an existing database.
  const result=spawnSync(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'d1','migrations','apply','DB','--local','--persist-to',state,'--config','wrangler.local.json','--env','development'],
    {cwd:root,env:{...process.env,XDG_CONFIG_HOME:resolve(root,'.wrangler/isolated-config'),WRANGLER_SEND_METRICS:'false',CI:'true',WRANGLER_LOG_PATH:resolve(root,'.wrangler/logs')},stdio:'inherit'});
  if(result.error||result.status!==0)throw new Error('local_target_migration_failed');
}
const mf=new Miniflare(convertV4MiniflareOptions({name:'kuwago-local-recovery-operator',host:'127.0.0.1',cf:false,telemetry:{enabled:false},modules:true,
  script:'export default {fetch(){return new Response(null,{status:404})}}',compatibilityDate:'2026-07-30',d1Databases:{DB:'DB'},
  resourcePersistencePath:resolve(state,'v3'),r2Buckets:{PUBLICATION:'kuwago-publication-local-development',PRIVATE_MEDIA:'kuwago-media-development'}}));
try{
  const db=await mf.getD1Database('DB');const store=await mf.getR2Bucket('PUBLICATION');const privateStore=await mf.getR2Bucket('PRIVATE_MEDIA');
  if(command==='backup'){
    const backup=await createLogicalBackup(db,store);backup.mediaArchive=await createMediaArchive(backup,privateStore);const file='backup-'+crypto.randomUUID()+'.json';
    writeFileSync(resolve(output,file),JSON.stringify(backup),{flag:'wx'});writeFileSync(resolve(output,'last-backup.json'),JSON.stringify({file}));
    console.log(JSON.stringify({localBackup:'.wrangler/recovery/'+file,sha256:backup.sha256}));
  }else if(command==='restore --confirm-isolated'){
    const pointer=JSON.parse(readFileSync(resolve(output,'last-backup.json'),'utf8'));
    if(!/^backup-[a-f0-9-]{36}\.json$/.test(pointer.file))throw new Error('Invalid local backup marker');
    const backup=JSON.parse(readFileSync(resolve(output,pointer.file),'utf8'));const result=await restoreLogicalBackup(db,backup);const media=backup.mediaArchive?await restoreMediaArchive(db,privateStore,backup.mediaArchive,backup.sha256):{complete:false,reason:'legacy_archive_missing'};console.log(JSON.stringify({media}));
    writeFileSync(marker,JSON.stringify({state:state.slice(dirname(state).length+1)}));console.log(JSON.stringify({state,result}));
  }else if(command==='verify')console.log(JSON.stringify({...await verifyRecovery(db,store),media:await verifyMediaStorage(db,privateStore)}));
  else if(command==='reconcile-restored --confirm-empty'){
    const state=await verifyRecovery(db,store);if(state.publishedCount!==0||state.head.mode!=='ready')throw new Error('resumed_empty_target_required');
    if(!await deliverCatalog(db,store))throw new Error('local_reconciliation_pending');console.log(JSON.stringify({...await verifyRecovery(db,store),media:await verifyMediaStorage(db,privateStore)}));
  }
  else if(command==='resume-empty --confirm-empty'){await resumeRecoveredEmpty(db,true);console.log('Local recovered catalog enabled EMPTY; services remain withdrawn and require new approval.');}
  else{await quarantineLegacy(db,true);console.log('Local legacy content quarantined; publication remains paused.');}
}finally{await mf.dispose();}
