-- Kuwago DEV single-operator policy. Existing migrations remain immutable.
-- Apply as one D1 batch, including ledger and migration audit. Never disable foreign_keys.
PRAGMA defer_foreign_keys=ON;
DROP TRIGGER "media_not_attachable";
DROP TRIGGER "media_published_immutable";
DROP TRIGGER "media_state_transition";
DROP TRIGGER "media_verified_bytes_immutable";
CREATE TABLE media_assets_next (
  id TEXT PRIMARY KEY NOT NULL,
  private_object_key TEXT NOT NULL UNIQUE CHECK(private_object_key GLOB 'development/quarantine/*' AND instr(private_object_key,'..')=0 AND instr(private_object_key,':')=0),
  derivative_object_key TEXT UNIQUE CHECK(derivative_object_key GLOB 'development/derived/*' AND instr(derivative_object_key,'..')=0 AND instr(derivative_object_key,':')=0),
  state TEXT NOT NULL DEFAULT 'quarantine' CHECK(state IN ('quarantine','validated','approved','rejected','retired','deleted')),
  provenance TEXT NOT NULL CHECK(provenance IN ('demo','stitch_reference','verified')),
  usage_approval TEXT NOT NULL DEFAULT 'pending' CHECK(usage_approval IN ('pending','approved')),
  sha256 TEXT CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  mime_type TEXT CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size INTEGER CHECK(byte_size BETWEEN 1 AND 2097152),
  width INTEGER CHECK(width BETWEEN 1 AND 4096), height INTEGER CHECK(height BETWEEN 1 AND 4096),
  uploaded_by TEXT NOT NULL REFERENCES principals(id), reviewed_by TEXT REFERENCES principals(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT, retired_at TEXT,
  approval_mode TEXT NOT NULL DEFAULT 'independent' CHECK(approval_mode IN ('independent','super_admin_self')),
  CHECK(width IS NULL OR height IS NULL OR width*height<=8000000),
  CHECK(state NOT IN ('validated','approved') OR
    (sha256 IS NOT NULL AND mime_type IS NOT NULL AND byte_size IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND derivative_object_key IS NOT NULL)),
  CHECK(usage_approval <> 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND ((reviewed_by<>uploaded_by AND approval_mode='independent') OR (reviewed_by=uploaded_by AND approval_mode='super_admin_self')) AND provenance='verified')),
  CHECK(state<>'approved' OR usage_approval='approved')
) STRICT;
INSERT INTO media_assets_next ("id","private_object_key","derivative_object_key","state","provenance","usage_approval","sha256","mime_type","byte_size","width","height","uploaded_by","reviewed_by","created_at","reviewed_at","retired_at") SELECT "id","private_object_key","derivative_object_key","state","provenance","usage_approval","sha256","mime_type","byte_size","width","height","uploaded_by","reviewed_by","created_at","reviewed_at","retired_at" FROM media_assets;
DROP TABLE media_assets;
ALTER TABLE media_assets_next RENAME TO media_assets;
CREATE TRIGGER media_not_attachable BEFORE INSERT ON revision_media
WHEN EXISTS(SELECT 1 FROM media_assets WHERE id=NEW.media_id AND state IN ('retired','rejected','deleted'))
BEGIN SELECT RAISE(ABORT,'media_not_attachable'); END;
CREATE TRIGGER media_published_immutable BEFORE UPDATE ON media_assets
WHEN EXISTS(SELECT 1 FROM revision_media rm JOIN services s ON s.published_revision_id=rm.revision_id WHERE rm.media_id=OLD.id AND s.status='published')
AND (NEW.state<>OLD.state OR NEW.sha256 IS NOT OLD.sha256 OR NEW.derivative_object_key IS NOT OLD.derivative_object_key OR NEW.usage_approval<>OLD.usage_approval)
BEGIN SELECT RAISE(ABORT,'published_media_immutable'); END;
CREATE TRIGGER media_state_transition BEFORE UPDATE OF state ON media_assets
WHEN NEW.state<>OLD.state AND NOT (
 (OLD.state='quarantine' AND NEW.state IN ('validated','rejected')) OR
 (OLD.state='validated' AND NEW.state IN ('approved','rejected')) OR
 (OLD.state='approved' AND NEW.state='retired') OR
 (OLD.state IN ('rejected','retired') AND NEW.state='deleted')
) BEGIN SELECT RAISE(ABORT,'invalid_media_transition'); END;
CREATE TRIGGER media_verified_bytes_immutable BEFORE UPDATE ON media_assets
WHEN OLD.state<>'quarantine' AND (
 NEW.private_object_key IS NOT OLD.private_object_key OR NEW.derivative_object_key IS NOT OLD.derivative_object_key
 OR NEW.sha256 IS NOT OLD.sha256 OR NEW.mime_type IS NOT OLD.mime_type OR NEW.byte_size IS NOT OLD.byte_size
 OR NEW.width IS NOT OLD.width OR NEW.height IS NOT OLD.height OR NEW.uploaded_by IS NOT OLD.uploaded_by
) BEGIN SELECT RAISE(ABORT,'validated_media_bytes_immutable'); END;
ALTER TABLE commercial_approvals ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'independent' CHECK(approval_mode IN ('independent','super_admin_self'));
DROP TRIGGER approval_requires_reviewer;
CREATE TRIGGER approval_requires_reviewer BEFORE INSERT ON commercial_approvals
WHEN NOT EXISTS (
 SELECT 1 FROM service_revisions r JOIN principals p ON p.id=NEW.approved_by
 JOIN administrator_roles ar ON ar.principal_id=p.id AND ar.role_id IN ('admin','super_admin')
 WHERE r.id=NEW.revision_id AND r.content_hash=NEW.content_hash AND r.sealed_at IS NOT NULL AND p.enabled=1
 AND ((r.created_by<>p.id AND NEW.approval_mode='independent') OR (r.created_by=p.id AND ar.role_id='super_admin' AND NEW.approval_mode='super_admin_self'))
) BEGIN SELECT RAISE(ABORT,'approval_requires_enabled_reviewer_or_explicit_super_admin_self'); END;
CREATE TRIGGER approval_mode_immutable BEFORE UPDATE OF approval_mode ON commercial_approvals
WHEN NEW.approval_mode<>OLD.approval_mode BEGIN SELECT RAISE(ABORT,'approval_immutable'); END;
CREATE TRIGGER media_approval_role_insert BEFORE INSERT ON media_assets
WHEN NEW.usage_approval='approved' 
AND NOT EXISTS (SELECT 1 FROM principals p JOIN administrator_roles ar ON ar.principal_id=p.id
 WHERE p.id=NEW.reviewed_by AND p.enabled=1 AND ar.role_id IN ('admin','super_admin')
 AND ((NEW.reviewed_by<>NEW.uploaded_by AND NEW.approval_mode='independent') OR (NEW.reviewed_by=NEW.uploaded_by AND ar.role_id='super_admin' AND NEW.approval_mode='super_admin_self')))
BEGIN SELECT RAISE(ABORT,'media_approval_requires_enabled_reviewer_or_explicit_super_admin_self'); END;
CREATE TRIGGER media_approval_role_update BEFORE UPDATE ON media_assets
WHEN NEW.usage_approval='approved' AND (OLD.usage_approval<>'approved' OR NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.approval_mode<>OLD.approval_mode)
AND NOT EXISTS (SELECT 1 FROM principals p JOIN administrator_roles ar ON ar.principal_id=p.id
 WHERE p.id=NEW.reviewed_by AND p.enabled=1 AND ar.role_id IN ('admin','super_admin')
 AND ((NEW.reviewed_by<>NEW.uploaded_by AND NEW.approval_mode='independent') OR (NEW.reviewed_by=NEW.uploaded_by AND ar.role_id='super_admin' AND NEW.approval_mode='super_admin_self')))
BEGIN SELECT RAISE(ABORT,'media_approval_requires_enabled_reviewer_or_explicit_super_admin_self'); END;
CREATE TRIGGER media_approval_identity_immutable BEFORE UPDATE ON media_assets
WHEN OLD.usage_approval='approved' AND (NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.approval_mode<>OLD.approval_mode)
BEGIN SELECT RAISE(ABORT,'media_approval_immutable'); END;
CREATE TABLE dev_image_transform_claim (
   id INTEGER PRIMARY KEY NOT NULL CHECK(id=1), media_id TEXT NOT NULL UNIQUE REFERENCES media_assets(id),
   input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64 AND input_sha256 NOT GLOB '*[^0-9a-f]*'),
   claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;
INSERT INTO principals(id,issuer,subject,enabled) SELECT NULL,'urn:kuwago:guard','policy7-fk',0 WHERE EXISTS(SELECT 1 FROM pragma_foreign_key_check);
PRAGMA defer_foreign_keys=OFF;
