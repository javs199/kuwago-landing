import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export const target=Object.freeze({account:'7a8bcd7992a3de359d2aff87df2fb693',id:'c5cfbe44-4fd0-4c2a-83c1-b833935534ba',name:'kuwago-admin-db-development'});
export const schemaQuery="SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name";
// This release cannot perform any remote operation. Enabling it requires another reviewed authorization.
export const remoteExecutionEnabled=false;
export const versions=Object.freeze({wrangler:'4.152.0',node:'26.1.0'});
export const migrations=Object.freeze([
 ['0001_admin_catalog.sql','33bd2451b568acf1c316fcc5355bca1e1cd87deacace72d3819233a00e670abd'],
 ['0002_integrity_guards.sql','47abe773445a464a7a25b412a11d35799aa1a704e14d6b7846885dff35d41ed4'],
 ['0003_access_rbac.sql','19ba25557c88f509927cd1fea912da3d3d4a815b56733e310be51dd155719336'],
 ['0004_catalog_operations.sql','dfa41753ca3e91628077ceec2557ec8d77a02ef59062439e8adaf7780a19550b'],
 ['0005_publication_resilience.sql','464b69f3df0a5e85ff960a95aa937c718a69578aaf1235b877e6130381354d3a'],
 ['0006_media_lifecycle.sql','ed8fcd76c51fc8050c5b5bd676e4eb98323b62e81fc312e99589bcdb9314ac4c'],
].map(([name,sha256],i)=>Object.freeze({name,sha256,requires:i})));
export const schemaHashes=Object.freeze([
 '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
 '9faeb21e6b3c899dbe1e3fc2c70f5b25552e9f0169162a679f163ee5855aa26d',
 'f680fc373652e4e9399146f6bbaeeac05c91741c684270ebb591086c17ccb9ac',
 '7b8fd74fa51a798fced27ea83491e8b9c18dc324539efcb7daf217914630f8f6',
 '05b62a741ad2a8b84caac31dbd9977cb19840e7d588dfb2c3e92ce7a1e25e26f',
 'b4577ac2a29239b221f608a4085d077568273457fd740b58dc64dec43b9bac37',
 '5d90c49079b6f849e9499a00c26d78ad2e26374bf09296ab78b2806982c4e31c',
]);
export const ledgerSql='CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const seedHashes=Object.freeze({legacy:'e43f39da3774bf967040d09961eda7d7c95b2af0d2a0b61bb3b6f9a4cb0eef48',canonical:'bb67fcc20c9a8f34d06de0b0bf9ae6bc6a37bc5e6724fc1725aec70240830d85'});
export function requireSafe(condition,code){if(!condition)throw Error(code);}
export const normalizeSql=sql=>sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\s+/g,part=>/^\s/.test(part)?'':part);
export const schemaDigest=rows=>digest(JSON.stringify(rows.map(row=>({type:row.type,name:row.name,sql:normalizeSql(row.sql)}))));
export function assertIdentity(metadata){requireSafe(metadata?.uuid===target.id&&metadata?.name===target.name&&metadata?.version==='production','target_or_storage_version_mismatch');}
export function assertEnvironment(env){
 for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED'])requireSafe(!env[key],'node_environment_override_forbidden');
 for(const key of Object.keys(env))if(/^(CLOUDFLARE_|CF_|WRANGLER_)/i.test(key)){
   if(key==='CLOUDFLARE_API_TOKEN')continue;
   requireSafe(key==='CLOUDFLARE_ACCOUNT_ID'&&env[key]===target.account||key==='KUWAGO_D1_DATABASE_ID'&&env[key]===target.id,'environment_override_forbidden');
 }
 if(env.KUWAGO_D1_DATABASE_ID!==undefined)requireSafe(env.KUWAGO_D1_DATABASE_ID===target.id,'environment_override_forbidden');
}
export function approvedSources(){
 const dir=resolve(root,'../../../packages/database/migrations');
 requireSafe(readdirSync(dir).filter(name=>name.endsWith('.sql')).sort().join('|')===migrations.map(m=>m.name).join('|'),'migration_list_mismatch');
 const manifest=JSON.parse(readFileSync(resolve(dir,'../migrations.sha256.json'),'utf8'));
 verifyManifest(manifest);
 const files=migrations.map(m=>{const file=resolve(dir,m.name);requireSafe(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink(),'migration_symlink_forbidden');return {name:m.name,sql:readFileSync(file,'utf8')};});
 verifySourceSet(files);return files.map(f=>f.sql);
}
export function verifySourceSet(files){requireSafe(Array.isArray(files)&&files.length===6&&files.every((f,i)=>f.name===migrations[i].name&&typeof f.sql==='string'&&digest(f.sql)===migrations[i].sha256),'migration_hash_or_order_mismatch');}
export function verifyManifest(manifest){requireSafe(manifest?.algorithm==='SHA-256'&&JSON.stringify(manifest.migrations)===JSON.stringify(migrations.map(m=>({file:m.name,sha256:m.sha256}))),'manifest_mismatch');}
export function assertRuntime(){requireSafe(process.versions.node===versions.node,'node_version_mismatch');requireSafe(JSON.parse(readFileSync(resolve(root,'node_modules/wrangler/package.json'),'utf8')).version===versions.wrangler,'wrangler_version_mismatch');}
