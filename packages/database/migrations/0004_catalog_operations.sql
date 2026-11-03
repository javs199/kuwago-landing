-- Global optimistic serialization protects projection/readiness across categories, media and services.
CREATE TABLE catalog_state (
 id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL CHECK(version BETWEEN 0 AND 9007199254740991)
) STRICT;
INSERT INTO catalog_state(id,version) SELECT 1,COALESCE(MAX(generation),0) FROM publication_outbox;
-- A zero-row CAS is not a SQL error. This named CHECK aborts the WHOLE batch on stale preconditions.
CREATE TABLE mutation_guards (
 operation_id TEXT PRIMARY KEY NOT NULL,
 permission_ok INTEGER NOT NULL CONSTRAINT kuwago_mutation_permission CHECK(permission_ok=1),
 valid INTEGER NOT NULL CONSTRAINT kuwago_mutation_precondition CHECK(valid=1)
) STRICT;
-- Expand the existing command action constraint to represent unpublish truthfully.
-- Preserve both sides child-first; dropping a referenced parent can fail in D1 even with deferred FKs.
-- The backup is transactional migration scratch only, removed before commit, never an application model.
CREATE TABLE publication_outbox_v4_backup AS SELECT * FROM publication_outbox;
DROP TABLE publication_outbox;
CREATE TABLE publication_commands_v4 (
 id TEXT PRIMARY KEY NOT NULL, service_id TEXT NOT NULL REFERENCES services(id),
 actor_id TEXT NOT NULL REFERENCES principals(id), idempotency_key TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('publish','unpublish','archive')),
 expected_version INTEGER NOT NULL CHECK(expected_version BETWEEN 1 AND 9007199254740991),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','visible','failed')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(actor_id,idempotency_key)
) STRICT;
INSERT INTO publication_commands_v4 SELECT * FROM publication_commands;
DROP TABLE publication_commands;
ALTER TABLE publication_commands_v4 RENAME TO publication_commands;
CREATE TABLE publication_outbox (
 generation INTEGER PRIMARY KEY NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
 command_id TEXT NOT NULL UNIQUE REFERENCES publication_commands(id),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 delivered_at TEXT, last_error_code TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 catalog_json TEXT CHECK(catalog_json IS NULL OR json_valid(catalog_json))
) STRICT;
INSERT INTO publication_outbox(generation,command_id,attempts,delivered_at,last_error_code,created_at)
 SELECT generation,command_id,attempts,delivered_at,last_error_code,created_at FROM publication_outbox_v4_backup;
DROP TABLE publication_outbox_v4_backup;
CREATE INDEX outbox_delivery ON publication_outbox(delivered_at,generation);
ALTER TABLE commercial_approvals ADD COLUMN category_version INTEGER CHECK(category_version>=1);
