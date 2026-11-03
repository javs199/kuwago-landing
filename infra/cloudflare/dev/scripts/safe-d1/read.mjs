import {assertIdentity,digest,ledgerSql,migrations,normalizeSql,requireSafe,schemaDigest,schemaHashes,seedHashes,schemaQuery} from './policy.mjs';
import {captureDatabase} from './snapshot.mjs';
export {schemaQuery};
export const schemaGuardQuery="SELECT json_group_array(json_array(type,name,sql)) AS value FROM (SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations','kuwago_migration_guard') ORDER BY type,name)";
const receipts=new WeakSet();
export function seedQuery(stage){
 const groups=[['roles',['id']],['permissions',['id']],['role_permissions',['role_id','permission_id']],...(stage>=3?[['admin_role_definitions',['id']],['admin_role_permissions',['role_id','permission']]]:[])];
 return 'SELECT json_array('+groups.map(([table,columns])=>`json((SELECT json_group_array(json_array(${columns.join(',')})) FROM (SELECT ${columns.join(',')} FROM ${table} ORDER BY ${columns.join(',')})))`).join(',')+') AS value';
}
const emptyTables=['principals','principal_roles','categories','services','service_revisions','media_assets','commercial_approvals','audit_events','publication_commands','publication_outbox','administrator_roles','mutation_guards','publication_alerts','publication_recovery_events','media_processing','media_upload_limits','media_read_limits'];
export function stageEmptyTables(stage){return emptyTables.filter(table=>!['administrator_roles','mutation_guards','publication_alerts','publication_recovery_events','media_processing','media_upload_limits','media_read_limits'].includes(table)||stage>=({administrator_roles:3,mutation_guards:4,publication_alerts:5,publication_recovery_events:5,media_processing:6,media_upload_limits:6,media_read_limits:6})[table]);}
export const allowedReadSql=Object.freeze([schemaQuery,'SELECT id,name,applied_at FROM d1_migrations ORDER BY id','PRAGMA quick_check','PRAGMA foreign_key_check',...emptyTables.map(t=>`SELECT COUNT(*) AS n FROM ${t}`),'SELECT epoch,mode,generation,payload_hash FROM publication_control WHERE id=1',seedQuery(1),seedQuery(3)]);
export const isReadReceipt=receipt=>receipts.has(receipt);
export function createReader(transport){
 async function inspect(stage){
  requireSafe(Number.isInteger(stage)&&stage>=0&&stage<=6,'stage_invalid');
  const metadata=await transport.metadata();assertIdentity(metadata);
  const rows=await transport.select(schemaQuery);requireSafe(Array.isArray(rows)&&rows.every(r=>['table','index','trigger','view'].includes(r.type)&&typeof r.name==='string'&&typeof r.sql==='string'),'schema_response_invalid');
  const ledger=rows.find(r=>r.name==='d1_migrations');
  requireSafe(stage===0?!ledger:ledger?.type==='table'&&normalizeSql(ledger.sql)===normalizeSql(ledgerSql),'ledger_schema_mismatch');
  const internal=rows.filter(r=>['_cf_KV','_cf_METADATA'].includes(r.name));requireSafe(internal.length<=2&&internal.every(r=>r.type==='table'&&(r.name!=='_cf_METADATA'||normalizeSql(r.sql)===normalizeSql('CREATE TABLE _cf_METADATA (key INTEGER PRIMARY KEY, value BLOB)'))),'internal_schema_mismatch');
  const schema=rows.filter(r=>!['_cf_KV','_cf_METADATA','d1_migrations'].includes(r.name));requireSafe(schemaDigest(schema)===schemaHashes[stage],'schema_mismatch');
  const history=ledger?await transport.select('SELECT id,name,applied_at FROM d1_migrations ORDER BY id'):[];
  requireSafe(Array.isArray(history)&&history.length===stage&&history.every((row,i)=>row.id===i+1&&row.name===migrations[i].name&&typeof row.applied_at==='string'),'history_mismatch');
  const quick=await transport.select('PRAGMA quick_check'),fk=await transport.select('PRAGMA foreign_key_check');
  requireSafe(quick.length===1&&quick[0].quick_check==='ok'&&fk.length===0,'integrity_failed');
  let seedState=null,controlEpoch=null;
  if(stage>0){
   for(const table of stageEmptyTables(stage)){
    const result=await transport.select(`SELECT COUNT(*) AS n FROM ${table}`);requireSafe(result.length===1&&result[0].n===0,'nonempty_installation');
   }
   const seeds=await transport.select(seedQuery(stage));requireSafe(seeds.length===1&&typeof seeds[0].value==='string'&&digest(seeds[0].value)===seedHashes[stage>=3?'canonical':'legacy'],'seed_data_mismatch');seedState=seeds[0].value;
  }
  if(stage>=5){const control=await transport.select('SELECT epoch,mode,generation,payload_hash FROM publication_control WHERE id=1');requireSafe(control.length===1&&/^[a-f0-9]{32}$/.test(control[0].epoch)&&control[0].mode==='ready'&&control[0].generation===null&&control[0].payload_hash===null,'publication_control_invalid');controlEpoch=control[0].epoch;}
  const receipt=Object.freeze({stage,schemaHash:schemaDigest(schema),guardSchema:JSON.stringify(schema.map(r=>[r.type,r.name,r.sql])),history:JSON.stringify(history.map(r=>[r.id,r.name])),seedState,controlEpoch,observedAt:Date.now()});receipts.add(receipt);return receipt;
 }
 return Object.freeze({inspect,bookmark:()=>transport.bookmark(),snapshot:()=>captureDatabase(transport),fullExport:bookmark=>transport.fullExport(bookmark)});
}
