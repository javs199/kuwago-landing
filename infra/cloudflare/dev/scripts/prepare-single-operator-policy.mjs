import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import {frozenSixSources} from './single-operator-migration.mjs';
const db=new DatabaseSync(':memory:');
try{
 for(const sql of frozenSixSources())db.exec(sql);
 const table=db.prepare("SELECT sql FROM sqlite_schema WHERE name='media_assets'").get().sql;
 const triggers=db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND instr(sql,'media_assets')>0 ORDER BY name").all();
 const create=table.replace('CREATE TABLE media_assets','CREATE TABLE media_assets_next')
  .replace('reviewed_at TEXT, retired_at TEXT,',"reviewed_at TEXT, retired_at TEXT,\n  approval_mode TEXT NOT NULL DEFAULT 'independent' CHECK(approval_mode IN ('independent','super_admin_self')),")
  .replace('reviewed_by<>uploaded_by',"((reviewed_by<>uploaded_by AND approval_mode='independent') OR (reviewed_by=uploaded_by AND approval_mode='super_admin_self'))");
 const columns=db.prepare('PRAGMA table_info(media_assets)').all().map(c=>'"'+c.name+'"').join(',');
 const output=[
  '-- Kuwago DEV single-operator policy. Existing migrations remain immutable.',
  '-- Apply as one D1 batch, including ledger and migration audit. Never disable foreign_keys.',
  'PRAGMA defer_foreign_keys=ON;',
  ...triggers.map(t=>'DROP TRIGGER "'+t.name+'";'),
  create+';',`INSERT INTO media_assets_next (${columns}) SELECT ${columns} FROM media_assets;`,
  'DROP TABLE media_assets;','ALTER TABLE media_assets_next RENAME TO media_assets;',
  ...triggers.map(t=>t.sql+';'),
  "ALTER TABLE commercial_approvals ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'independent' CHECK(approval_mode IN ('independent','super_admin_self'));",
  'DROP TRIGGER approval_requires_reviewer;',
  `CREATE TRIGGER approval_requires_reviewer BEFORE INSERT ON commercial_approvals
WHEN NOT EXISTS (
 SELECT 1 FROM service_revisions r JOIN principals p ON p.id=NEW.approved_by
 JOIN administrator_roles ar ON ar.principal_id=p.id AND ar.role_id IN ('admin','super_admin')
 WHERE r.id=NEW.revision_id AND r.content_hash=NEW.content_hash AND r.sealed_at IS NOT NULL AND p.enabled=1
 AND ((r.created_by<>p.id AND NEW.approval_mode='independent') OR (r.created_by=p.id AND ar.role_id='super_admin' AND NEW.approval_mode='super_admin_self'))
) BEGIN SELECT RAISE(ABORT,'approval_requires_enabled_reviewer_or_explicit_super_admin_self'); END;`,
  `CREATE TRIGGER approval_mode_immutable BEFORE UPDATE OF approval_mode ON commercial_approvals
WHEN NEW.approval_mode<>OLD.approval_mode BEGIN SELECT RAISE(ABORT,'approval_immutable'); END;`,
  ...['INSERT','UPDATE'].map(op=>`CREATE TRIGGER media_approval_role_${op.toLowerCase()} BEFORE ${op} ON media_assets
WHEN NEW.usage_approval='approved' ${op==='UPDATE'?"AND (OLD.usage_approval<>'approved' OR NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.approval_mode<>OLD.approval_mode)":''}
AND NOT EXISTS (SELECT 1 FROM principals p JOIN administrator_roles ar ON ar.principal_id=p.id
 WHERE p.id=NEW.reviewed_by AND p.enabled=1 AND ar.role_id IN ('admin','super_admin')
 AND ((NEW.reviewed_by<>NEW.uploaded_by AND NEW.approval_mode='independent') OR (NEW.reviewed_by=NEW.uploaded_by AND ar.role_id='super_admin' AND NEW.approval_mode='super_admin_self')))
BEGIN SELECT RAISE(ABORT,'media_approval_requires_enabled_reviewer_or_explicit_super_admin_self'); END;`),
  `CREATE TRIGGER media_approval_identity_immutable BEFORE UPDATE ON media_assets
WHEN OLD.usage_approval='approved' AND (NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.approval_mode<>OLD.approval_mode)
BEGIN SELECT RAISE(ABORT,'media_approval_immutable'); END;`,
  `CREATE TABLE dev_image_transform_claim (
   id INTEGER PRIMARY KEY NOT NULL CHECK(id=1), media_id TEXT NOT NULL UNIQUE REFERENCES media_assets(id),
   input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64 AND input_sha256 NOT GLOB '*[^0-9a-f]*'),
   claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;`,
  // Rebuilding a referenced table can leave SQLite's deferred counter stale.
  // Validate every FK inside the same batch before ending deferral; never disable foreign_keys.
  "INSERT INTO principals(id,issuer,subject,enabled) SELECT NULL,'urn:kuwago:guard','policy7-fk',0 WHERE EXISTS(SELECT 1 FROM pragma_foreign_key_check);",
  'PRAGMA defer_foreign_keys=OFF;',
 ];
 writeFileSync(new URL('../next-stage/0007_single_operator_approval.sql',import.meta.url),output.join('\n')+'\n');
 console.log('Local SQL prepared; no remote operation.');
}finally{db.close();}
