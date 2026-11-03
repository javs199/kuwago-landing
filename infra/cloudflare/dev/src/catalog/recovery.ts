import type { CatalogDatabase,PublicationStore } from './types.js';
import { publicationHead,sha256,snapshotKey } from './head.js';
import { rows } from './repository.js';
import { manifestKey,parseSnapshot } from './snapshot.js';
type BackupTable={name:string;columns:string[];rows:Record<string,unknown>[]};
type BackupData={format:1;sourceEpoch:string;schemaHash:string;tables:BackupTable[];materializedSnapshot:string|null};
export type LogicalBackup={data:BackupData;sha256:string};
const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
async function metadata(db:CatalogDatabase){
  // Wrangler's migration ledger is deployment metadata, not application data to restore.
  const schema=await rows(db,"SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_*' AND name<>'d1_migrations' ORDER BY type,name");
  const tables=[];
  for(const item of schema.filter(s=>s.type==='table')){
    const columns=(await rows(db,`PRAGMA table_info(${quote(item.name as string)})`)).map(c=>c.name as string);
    tables.push({name:item.name as string,columns});
  }
  // Equivalent SQLite CREATE text may differ after ALTER vs rebuild. Ignore only
  // whitespace outside quoted literals/identifiers; never execute SQL from the backup.
  const identity=schema.map(row=>({...row,sql:(row.sql as string).replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\s+/g,part=>/^\s/.test(part)?'':part)}));
  return {schema,tables,schemaHash:await sha256(JSON.stringify(identity))};
}
export async function createLogicalBackup(db:CatalogDatabase,store?:PublicationStore):Promise<LogicalBackup>{
  const meta=await metadata(db);
  // All application tables in ONE transactional batch. Includes private history; never expose through HTTP.
  const result=await db.batch(meta.tables.map(t=>db.prepare(`SELECT ${t.columns.map(quote).join(',')} FROM ${quote(t.name)}`)));
  const tables=meta.tables.map((table,index)=>({...table,rows:result[index]!.results}));
  const control=tables.find(t=>t.name==='publication_control')!.rows[0]!;
  let materializedSnapshot:string|null=null;
  try{
    const object=await store?.get(manifestKey);const text=object?await object.text():null;
    if(text&&await sha256(text)===control.payload_hash){const value=parseSnapshot(text);if(value.epoch===control.epoch&&value.generation===control.generation)materializedSnapshot=text;}
  }catch{ /* A DB backup is still usable in quarantine without a matching materialization. */ }
  const data:BackupData={format:1,sourceEpoch:control.epoch as string,schemaHash:meta.schemaHash,tables,materializedSnapshot};
  return {data,sha256:await sha256(JSON.stringify(data))};
}
export async function restoreLogicalBackup(db:CatalogDatabase,backup:LogicalBackup):Promise<{epoch:string;mode:'paused'}>{
  const meta=await metadata(db);const target=await publicationHead(db);
  if(backup.data?.format!==1||JSON.stringify(backup).length>20_000_000||await sha256(JSON.stringify(backup.data))!==backup.sha256||backup.data.schemaHash!==meta.schemaHash)throw new Error('backup_integrity_or_schema_mismatch');
  if(target.epoch===backup.data.sourceEpoch||(await rows(db,'SELECT id FROM principals LIMIT 1')).length||(await rows(db,'SELECT id FROM services LIMIT 1')).length||(await rows(db,'SELECT generation FROM publication_outbox LIMIT 1')).length)throw new Error('isolated_empty_destination_required');
  if(backup.data.tables.length!==meta.tables.length)throw new Error('backup_table_mismatch');
  const dataTables=new Map(backup.data.tables.map(t=>[t.name,t]));
  if(dataTables.size!==meta.tables.length)throw new Error('backup_table_mismatch');
  for(const expected of meta.tables){
    const actual=dataTables.get(expected.name);
    if(!actual||JSON.stringify(actual.columns)!==JSON.stringify(expected.columns)||!Array.isArray(actual.rows)||actual.rows.some(row=>Object.keys(row).sort().join('|')!==[...expected.columns].sort().join('|')||Object.values(row).some(v=>v!==null&&!['number','string'].includes(typeof v))))throw new Error('backup_row_mismatch');
  }
  const sourceControl=dataTables.get('publication_control')!.rows[0];
  if(sourceControl?.epoch!==backup.data.sourceEpoch)throw new Error('backup_lineage_mismatch');
  const epoch=crypto.randomUUID().replaceAll('-','');
  const triggers=meta.schema.filter(s=>s.type==='trigger');
  const statements=[db.prepare('PRAGMA defer_foreign_keys=ON'),
    db.prepare(`INSERT INTO mutation_guards VALUES (?,1,CASE WHEN EXISTS(SELECT 1 FROM publication_control WHERE epoch=?)
      AND NOT EXISTS(SELECT 1 FROM principals) AND NOT EXISTS(SELECT 1 FROM services) AND NOT EXISTS(SELECT 1 FROM publication_outbox) THEN 1 ELSE 0 END)`).bind(crypto.randomUUID(),target.epoch),
    ...triggers.map(t=>db.prepare(`DROP TRIGGER ${quote(t.name as string)}`)),
    ...meta.tables.map(t=>db.prepare(`DELETE FROM ${quote(t.name)}`))];
  for(const table of backup.data.tables)for(const row of table.rows)statements.push(db.prepare(`INSERT INTO ${quote(table.name)} (${table.columns.map(quote).join(',')}) VALUES (${table.columns.map(()=>'?').join(',')})`).bind(...table.columns.map(c=>row[c])));
  statements.push(
    db.prepare("UPDATE publication_control SET epoch=?,mode='paused',generation=NULL,payload_hash=NULL WHERE id=1").bind(epoch),
    db.prepare("UPDATE services SET status='draft',published_revision_id=NULL,row_version=row_version+1 WHERE status='published'"),
    db.prepare("UPDATE commercial_approvals SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE revoked_at IS NULL"),
    db.prepare("UPDATE publication_outbox SET delivery_state='quarantined',last_error_code='restore_requires_review',lease_token=NULL,lease_until=0"),
    db.prepare('UPDATE catalog_state SET version=version+1 WHERE id=1'),
    db.prepare("INSERT INTO publication_recovery_events(id,source_epoch,target_epoch,action) VALUES (?,?,?,'restore_quarantined')").bind(crypto.randomUUID(),backup.data.sourceEpoch,epoch),
    ...triggers.map(t=>db.prepare(t.sql as string)),
  );
  await db.batch(statements);
  if((await rows(db,'PRAGMA foreign_key_check')).length)throw new Error('restored_references_invalid');
  return {epoch,mode:'paused'};
}
// Local operator capability only, deliberately NOT exported by the administrative HTTP router.
export async function quarantineLegacy(db:CatalogDatabase,confirm:true):Promise<void>{
  if(confirm!==true)throw new Error('explicit_confirmation_required');
  const head=await publicationHead(db);if(head.mode!=='paused')throw new Error('paused_destination_required');
  const epoch=crypto.randomUUID().replaceAll('-','');
  await db.batch([
    db.prepare("UPDATE services SET status='draft',published_revision_id=NULL,row_version=row_version+1 WHERE status='published'"),
    db.prepare("UPDATE commercial_approvals SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE revoked_at IS NULL"),
    db.prepare("UPDATE publication_outbox SET delivery_state='quarantined',lease_token=NULL,lease_until=0,last_error_code='legacy_requires_review'"),
    db.prepare("UPDATE publication_control SET epoch=?,generation=NULL,payload_hash=NULL WHERE id=1 AND mode='paused'").bind(epoch),
    db.prepare('UPDATE catalog_state SET version=version+1 WHERE id=1'),
    db.prepare("INSERT INTO publication_recovery_events(id,source_epoch,target_epoch,action) VALUES (?,?,?,'legacy_quarantined')").bind(crypto.randomUUID(),head.epoch,epoch),
  ]);
}
export async function resumeRecoveredEmpty(db:CatalogDatabase,confirm:true):Promise<void>{
  if(confirm!==true)throw new Error('explicit_confirmation_required');
  const head=await publicationHead(db);if(head.mode!=='paused'||head.generation!==null)throw new Error('quarantined_destination_required');
  const operation=crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO mutation_guards VALUES (?,1,CASE WHEN EXISTS(SELECT 1 FROM publication_control WHERE mode='paused' AND epoch=? AND generation IS NULL)
      AND NOT EXISTS(SELECT 1 FROM services WHERE status='published') THEN 1 ELSE 0 END)`).bind(operation,head.epoch),
    db.prepare("UPDATE publication_control SET mode='ready' WHERE id=1"),
    db.prepare('UPDATE catalog_state SET version=version+1 WHERE id=1'),
    db.prepare("INSERT INTO publication_recovery_events(id,source_epoch,target_epoch,action) VALUES (?,?,?,'resume_empty')").bind(crypto.randomUUID(),head.epoch,head.epoch),
    db.prepare('DELETE FROM mutation_guards WHERE operation_id=?').bind(operation),
  ]);
}
export async function verifyRecovery(db:CatalogDatabase,store?:PublicationStore){
  const head=await publicationHead(db);const violations=await rows(db,'PRAGMA foreign_key_check');
  const published=await rows(db,"SELECT id FROM services WHERE status='published'");
  let materializationMatches=false;
  if(store&&head.payloadHash){const object=await store.get(snapshotKey(head)),current=await store.get(manifestKey);
    if(object&&current)materializationMatches=await sha256(await object.text())===head.payloadHash&&await sha256(await current.text())===head.payloadHash;}
  return {head,foreignKeyViolations:violations.length,publishedCount:published.length,materializationMatches};
}
