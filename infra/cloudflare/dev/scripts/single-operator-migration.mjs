import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {splitMigration} from './safe-d1/sql.mjs';
import {cellsQuery,normalizeSnapshot,snapshotFingerprint,canonicalSchema} from './safe-d1/snapshot.mjs';
import {schemaQuery,requireSafe,digest,migrations} from './safe-d1/policy.mjs';
export function frozenSixSources(){return migrations.map(m=>{const sql=readFileSync(new URL('../../../../packages/database/migrations/'+m.name,import.meta.url),'utf8');requireSafe(digest(sql)===m.sha256,'original_migration_changed');return sql;});}
export const policyMigrationName='0007_single_operator_approval.sql';
export const policyPrincipal='access:b329a52cf0fdf888743364ca9b3ff5a753aceb6fdd1d2937951e6c43c6e0dcfd';
export function localSnapshot(db){
 const schema=db.prepare(schemaQuery).all().filter(r=>!['_cf_KV','_cf_METADATA'].includes(r.name));
 const names=schema.filter(r=>r.type==='table').map(r=>r.name);if(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='sqlite_sequence'").get())names.push('sqlite_sequence');
 return normalizeSnapshot(schema,names.map(name=>{const columns=db.prepare(`PRAGMA table_info("${name}")`).all().map(c=>c.name);return {name,columns,rows:db.prepare(cellsQuery(name,columns)).all().map(r=>columns.map((_,i)=>r['c'+i]))};}));
}
export function migrationPlan({backupSql,baseline,sql,executionId,now=new Date().toISOString()}){
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON;BEGIN;PRAGMA defer_foreign_keys=ON;');db.exec(backupSql);db.exec('COMMIT');
  requireSafe(snapshotFingerprint(localSnapshot(db))===snapshotFingerprint(baseline),'backup_baseline_mismatch');
  const statements=[];
  for(const table of baseline.tables){
   const cols=table.columns.map((_,i)=>'c'+i).join(',');
   statements.push({sql:`INSERT INTO principals(id,issuer,subject,enabled) SELECT NULL,'urn:kuwago:guard','policy7',0 WHERE COALESCE(((SELECT json_group_array(json_array(${cols})) FROM (${cellsQuery(table.name,table.columns)}))=?),0)=0`,params:[JSON.stringify(table.rows)]});
  }
  const actual=splitMigration(sql).map(sql=>({sql,params:[]}));
  actual.push({sql:'INSERT INTO d1_migrations(name,applied_at) VALUES (?,?)',params:[policyMigrationName,now]},
   {sql:"INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,request_id,outcome,created_at) VALUES (?,?,'schema.single_operator_policy.v1','migration',?,?,'allowed',?)",params:['policy7:'+executionId,policyPrincipal,policyMigrationName,executionId,now]});
  db.exec('BEGIN');for(const item of actual)db.prepare(item.sql).run(...item.params);db.exec('COMMIT');
  requireSafe(db.prepare('PRAGMA quick_check').get().quick_check==='ok'&&!db.prepare('PRAGMA foreign_key_check').all().length,'projection_integrity_failed');
  const expected=localSnapshot(db);
  return {executionId,migrationSha256:digest(sql),batch:[...statements,...actual],expected,baselineFingerprint:snapshotFingerprint(baseline),expectedFingerprint:snapshotFingerprint(expected)};
 }finally{db.close();}
}
export async function runPolicyMigration({plan,transport,journal}){
 const result={status:'STOPPED',executionId:plan.executionId,intentionRecorded:false,requestInvoked:false,responseAccepted:false,verified:false};
 try{
  const one=await transport.snapshot();requireSafe(snapshotFingerprint(one.snapshot)===plan.baselineFingerprint,'logical_baseline_changed');
  const bookmark=await transport.bookmark();const two=await transport.snapshot();
  requireSafe(snapshotFingerprint(two.snapshot)===plan.baselineFingerprint&&bookmark===await transport.bookmark(),'concurrent_preflight_change');
  const schema=(await transport.schemaRows()).filter(r=>!['_cf_KV','_cf_METADATA'].includes(r.name));
  requireSafe(JSON.stringify(canonicalSchema(schema))===JSON.stringify(one.snapshot.schema),'logical_baseline_changed');
  plan.batch.unshift({sql:"INSERT INTO principals(id,issuer,subject,enabled) SELECT NULL,'urn:kuwago:guard','policy7-schema',0 WHERE COALESCE(((SELECT json_group_array(json_array(type,name,sql)) FROM (SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA') ORDER BY type,name))=?),0)=0",params:[JSON.stringify(schema.map(r=>[r.type,r.name,r.sql]))]});
  journal('intent',{batchSha256:digest(JSON.stringify(plan.batch)),baselineFingerprint:plan.baselineFingerprint,migrationSha256:plan.migrationSha256});result.intentionRecorded=true;
  requireSafe(bookmark===await transport.bookmark(),'concurrent_before_send');
  journal('invocation',{at:new Date().toISOString(),meaning:'about to invoke; not confirmation'});
  result.requestInvoked=true;
  try{await transport.apply(plan.batch);result.responseAccepted=true;}catch{result.ambiguousResponse=true;}
  // A failed response never permits replay. Independently reconcile by read only.
  const after=await transport.snapshot();requireSafe(snapshotFingerprint(after.snapshot)===plan.expectedFingerprint,'postflight_mismatch');
  const finalBookmark=await transport.bookmark();const confirm=await transport.snapshot();
  requireSafe(snapshotFingerprint(confirm.snapshot)===plan.expectedFingerprint&&finalBookmark===await transport.bookmark(),'concurrent_postflight_change');
  result.verified=true;result.postflightFingerprint=plan.expectedFingerprint;
  journal('closed',{...result,status:'PASS',closedAt:new Date().toISOString()});result.status='PASS';result.durablyClosed=true;
 }catch(error){result.error=['logical_baseline_changed','concurrent_preflight_change','concurrent_before_send','postflight_mismatch','concurrent_postflight_change'].includes(error.message)?error.message:'operation_stopped_details_omitted';}
 return result;
}
