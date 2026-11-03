import {approvedSources,digest,ledgerSql,migrations,requireSafe} from './policy.mjs';
import {isReadReceipt,schemaGuardQuery,stageEmptyTables,seedQuery} from './read.mjs';
import {verifyBackup} from './backup.mjs';
import {splitMigration} from './sql.mjs';
import {cellsQuery} from './snapshot.mjs';
const consumed=new WeakSet();
const approvedBatches=new WeakSet();
const batchStages=new WeakMap();
const fullSnapshotBatches=new WeakSet();
const completionReadbacks=new WeakMap();
export const approvedCompletionReadbacks=batch=>completionReadbacks.get(batch);
export const hasFullSnapshotGuard=batch=>fullSnapshotBatches.has(batch);
export const isApprovedBatch=batch=>approvedBatches.has(batch);
export const approvedBatchStage=batch=>batchStages.get(batch);
// No exported generic SQL writer: only the next approved migration can produce a batch.
export function createStageWriter(transport){
 return Object.freeze({async apply(state,backup,{snapshot,captureCompletionOutput=false,beforeSubmit}={}){
  requireSafe(isReadReceipt(state)&&state.stage>=0&&state.stage<6&&!consumed.has(state),'stage_reuse_or_invalid');
  verifyBackup(backup,state);const age=Date.now()-state.observedAt;requireSafe(age>=0&&age<30000,'preflight_stale');
  const sources=approvedSources(),stage=state.stage,migration=migrations[stage];
  requireSafe(digest(sources[stage])===migration.sha256&&migration.requires===stage,'migration_dependency_mismatch');
  const batch=[{sql:'CREATE TABLE kuwago_migration_guard(ok INTEGER NOT NULL CHECK(ok=1)) STRICT',params:[]}];
  if(stage===0)batch.push({sql:ledgerSql,params:[]});
  const historyQuery='SELECT json_group_array(json_array(id,name)) FROM (SELECT id,name FROM d1_migrations ORDER BY id)';
  const emptyGuard=stage>0?stageEmptyTables(stage).map(t=>` AND (SELECT COUNT(*) FROM ${t})=0`).join(''):'';
  const seedGuard=stage>0?` AND (${seedQuery(stage)})=?`:'',controlGuard=stage>=5?" AND (SELECT COUNT(*) FROM publication_control)=1 AND EXISTS(SELECT 1 FROM publication_control WHERE id=1 AND epoch=? AND mode='ready' AND generation IS NULL AND payload_hash IS NULL)":'';
  batch.push({sql:`INSERT INTO kuwago_migration_guard(ok) SELECT CASE WHEN (${schemaGuardQuery})=? AND (${historyQuery})=?${emptyGuard}${seedGuard}${controlGuard} THEN 1 ELSE 0 END`,params:[state.guardSchema,state.history,...(stage>0?[state.seedState]:[]),...(stage>=5?[state.controlEpoch]:[])]});
  if(snapshot){
   requireSafe(snapshot.stage===stage&&snapshot.snapshot.tables.length>0,'content_guard_invalid');
   for(const table of snapshot.snapshot.tables){
    const query=cellsQuery(table.name,table.columns),columns=table.columns.map((_,i)=>'c'+i).join(',');
    batch.push({sql:`INSERT INTO kuwago_migration_guard(ok) SELECT CASE WHEN (SELECT json_group_array(json_array(${columns})) FROM (${query}))=? THEN 1 ELSE 0 END`,params:[JSON.stringify(table.rows)]});
   }
  }
  for(const sql of splitMigration(sources[stage]))batch.push({sql,params:[]});
  batch.push({sql:'INSERT INTO d1_migrations(name) VALUES (?)',params:[migration.name]});
  let readbacks;
  if(captureCompletionOutput){
   requireSafe(stage===4||stage===5,'completion_output_scope_invalid');readbacks={historyIndex:batch.length,controlIndex:batch.length+1};
   batch.push({sql:'SELECT id,name,applied_at FROM d1_migrations ORDER BY id',params:[]},{sql:'SELECT id,epoch,mode,generation,payload_hash FROM publication_control WHERE id=1',params:[]});
  }
  batch.push({sql:'DROP TABLE kuwago_migration_guard',params:[]});
  for(const item of batch){Object.freeze(item.params);Object.freeze(item);}Object.freeze(batch);approvedBatches.add(batch);batchStages.set(batch,stage);if(snapshot)fullSnapshotBatches.add(batch);
  if(readbacks)completionReadbacks.set(batch,Object.freeze(readbacks));
  if(beforeSubmit)await beforeSubmit(Object.freeze({stage:stage+1,migrationSha256:migration.sha256,batchSha256:digest(JSON.stringify(batch))}));
  requireSafe(Date.now()-state.observedAt>=0&&Date.now()-state.observedAt<30000,'preflight_stale');
  consumed.add(state); // A thrown/ambiguous response consumes the capability; never retry it.
  await transport.applyBatch(batch);return migration.name;
 }});
}
