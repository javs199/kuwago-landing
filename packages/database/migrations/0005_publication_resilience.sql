-- Forward-only: approved migrations 0001-0004 are unchanged.
CREATE TABLE publication_control (
 id INTEGER PRIMARY KEY CHECK(id=1),
 epoch TEXT NOT NULL CHECK(length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*'),
 mode TEXT NOT NULL CHECK(mode IN ('ready','paused')),
 generation INTEGER CHECK(generation BETWEEN 0 AND 9007199254740991),
 payload_hash TEXT CHECK(length(payload_hash)=64 AND payload_hash NOT GLOB '*[^0-9a-f]*'),
 CHECK((generation IS NULL AND payload_hash IS NULL) OR (generation IS NOT NULL AND payload_hash IS NOT NULL))
) STRICT;
INSERT INTO publication_control(id,epoch,mode)
 SELECT 1,lower(hex(randomblob(16))),CASE WHEN EXISTS(SELECT 1 FROM publication_outbox)
 OR EXISTS(SELECT 1 FROM services WHERE status='published') THEN 'paused' ELSE 'ready' END;
ALTER TABLE publication_outbox ADD COLUMN epoch TEXT;
ALTER TABLE publication_outbox ADD COLUMN payload_hash TEXT;
ALTER TABLE publication_outbox ADD COLUMN delivery_state TEXT NOT NULL DEFAULT 'pending'
 CHECK(delivery_state IN ('pending','delivered','superseded','escalated','quarantined'));
ALTER TABLE publication_outbox ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count>=0);
ALTER TABLE publication_outbox ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0 CHECK(next_attempt_at>=0);
ALTER TABLE publication_outbox ADD COLUMN lease_token TEXT;
ALTER TABLE publication_outbox ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0 CHECK(lease_until>=0);
UPDATE publication_outbox SET delivery_state='quarantined',last_error_code='legacy_requires_review';
CREATE INDEX outbox_retry ON publication_outbox(epoch,delivery_state,next_attempt_at,lease_until);
CREATE TABLE publication_alerts (
 id TEXT PRIMARY KEY NOT NULL, epoch TEXT NOT NULL, generation INTEGER NOT NULL,
 code TEXT NOT NULL CHECK(code IN ('withdrawal_overdue','retry_exhausted','delivery_error','recovery_required')),
 first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, occurrences INTEGER NOT NULL DEFAULT 1,
 UNIQUE(epoch,generation,code)
) STRICT;
CREATE TABLE publication_recovery_events (
 id TEXT PRIMARY KEY NOT NULL, source_epoch TEXT NOT NULL, target_epoch TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('restore_quarantined','legacy_quarantined','resume_empty')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
