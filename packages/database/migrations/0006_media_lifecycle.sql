-- Additive only: original revisions and media identities remain intact.
CREATE TABLE media_processing (
  media_id TEXT PRIMARY KEY NOT NULL REFERENCES media_assets(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  validation_code TEXT NOT NULL DEFAULT 'decoder_unavailable',
  normalized_sha256 TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
) STRICT;
CREATE TABLE media_upload_limits (
  principal_id TEXT NOT NULL REFERENCES principals(id),
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 30),
  PRIMARY KEY(principal_id,window_start)
) STRICT;

CREATE TRIGGER media_not_attachable BEFORE INSERT ON revision_media
WHEN EXISTS(SELECT 1 FROM media_assets WHERE id=NEW.media_id AND state IN ('retired','rejected','deleted'))
BEGIN SELECT RAISE(ABORT,'media_not_attachable'); END;
CREATE TRIGGER media_published_immutable BEFORE UPDATE ON media_assets
WHEN EXISTS(SELECT 1 FROM revision_media rm JOIN services s ON s.published_revision_id=rm.revision_id WHERE rm.media_id=OLD.id AND s.status='published')
AND (NEW.state<>OLD.state OR NEW.sha256 IS NOT OLD.sha256 OR NEW.derivative_object_key IS NOT OLD.derivative_object_key OR NEW.usage_approval<>OLD.usage_approval)
BEGIN SELECT RAISE(ABORT,'published_media_immutable'); END;

CREATE TABLE media_read_limits (
 principal_id TEXT NOT NULL REFERENCES principals(id),
 window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 300),
 PRIMARY KEY(principal_id,window_start)
) STRICT;
