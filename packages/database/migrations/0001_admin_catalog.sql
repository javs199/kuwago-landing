-- Forward-only initial schema. No people, credentials, commercial services or prices seeded.
-- D1 enforces foreign keys; circular service/revision references are deferred to commit.
CREATE TABLE principals (
  id TEXT PRIMARY KEY NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(issuer, subject)
) STRICT;
CREATE TABLE roles (id TEXT PRIMARY KEY NOT NULL CHECK(id IN ('viewer','editor','publisher','securityAdmin'))) STRICT;
CREATE TABLE permissions (id TEXT PRIMARY KEY NOT NULL) STRICT;
CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id), permission_id TEXT NOT NULL REFERENCES permissions(id),
  PRIMARY KEY(role_id, permission_id)
) STRICT;
CREATE TABLE principal_roles (
  principal_id TEXT NOT NULL REFERENCES principals(id), role_id TEXT NOT NULL REFERENCES roles(id),
  granted_by TEXT NOT NULL REFERENCES principals(id),
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(principal_id, role_id), CHECK(principal_id <> granted_by)
) STRICT;
INSERT INTO roles(id) VALUES ('viewer'),('editor'),('publisher'),('securityAdmin');
INSERT INTO permissions(id) VALUES ('services:read'),('drafts:write'),('media:upload'),('commercial:approve'),('services:publish'),('services:archive'),('members:manage');
INSERT INTO role_permissions(role_id,permission_id) VALUES
 ('viewer','services:read'),('editor','services:read'),('editor','drafts:write'),('editor','media:upload'),
 ('publisher','services:read'),('publisher','commercial:approve'),('publisher','services:publish'),('publisher','services:archive'),
 ('securityAdmin','members:manage');

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL UNIQUE CHECK(length(slug) BETWEEN 1 AND 80),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1)
) STRICT;
CREATE TABLE category_translations (
  category_id TEXT NOT NULL REFERENCES categories(id), locale TEXT NOT NULL CHECK(locale IN ('es','en')),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100), PRIMARY KEY(category_id, locale)
) STRICT;
CREATE TABLE services (
  id TEXT PRIMARY KEY NOT NULL,
  provenance TEXT NOT NULL CHECK(provenance IN ('demo','stitch_reference','verified')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  working_revision_id TEXT NOT NULL, published_revision_id TEXT,
  internal_notes TEXT NOT NULL DEFAULT '' CHECK(length(internal_notes) <= 10000),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version BETWEEN 1 AND 9007199254740991),
  modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(status <> 'published' OR published_revision_id IS NOT NULL),
  CHECK(status <> 'draft' OR published_revision_id IS NULL),
  FOREIGN KEY(working_revision_id,id) REFERENCES service_revisions(id,service_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(published_revision_id,id) REFERENCES service_revisions(id,service_id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE service_revisions (
  id TEXT PRIMARY KEY NOT NULL, service_id TEXT NOT NULL REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED,
  number INTEGER NOT NULL CHECK(number BETWEEN 1 AND 9007199254740991),
  slug TEXT NOT NULL DEFAULT '' CHECK(length(slug) <= 80),
  category_id TEXT REFERENCES categories(id),
  content_hash TEXT, sealed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES principals(id),
  UNIQUE(service_id,number), UNIQUE(id,service_id), UNIQUE(id,content_hash),
  CHECK((content_hash IS NULL AND sealed_at IS NULL) OR
    (content_hash IS NOT NULL AND length(content_hash)=64 AND content_hash NOT GLOB '*[^0-9a-f]*' AND sealed_at IS NOT NULL))
) STRICT;
CREATE TABLE service_translations (
  revision_id TEXT NOT NULL REFERENCES service_revisions(id), locale TEXT NOT NULL CHECK(locale IN ('es','en')),
  title TEXT NOT NULL DEFAULT '' CHECK(length(title)<=100),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=2000), PRIMARY KEY(revision_id,locale)
) STRICT;
-- Option identities belong to the service; revision rows preserve identity while content changes.
CREATE TABLE option_identities (
  id TEXT PRIMARY KEY NOT NULL, service_id TEXT NOT NULL REFERENCES services(id), UNIQUE(id,service_id)
) STRICT;
CREATE TABLE service_options (
  revision_id TEXT NOT NULL, service_id TEXT NOT NULL, option_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK(sort_order BETWEEN 0 AND 99),
  duration_minutes INTEGER CHECK(duration_minutes BETWEEN 1 AND 1440),
  experience_type TEXT CHECK(experience_type IN ('private','shared')),
  venue TEXT CHECK(venue IN ('in_property','off_property')),
  PRIMARY KEY(revision_id,option_id), UNIQUE(revision_id,sort_order),
  FOREIGN KEY(revision_id,service_id) REFERENCES service_revisions(id,service_id),
  FOREIGN KEY(option_id,service_id) REFERENCES option_identities(id,service_id)
) STRICT;
CREATE TABLE option_translations (
  revision_id TEXT NOT NULL, option_id TEXT NOT NULL, locale TEXT NOT NULL CHECK(locale IN ('es','en')),
  name TEXT NOT NULL DEFAULT '' CHECK(length(name)<=100), PRIMARY KEY(revision_id,option_id,locale),
  FOREIGN KEY(revision_id,option_id) REFERENCES service_options(revision_id,option_id)
) STRICT;
-- Missing price row means incomplete draft; quote is explicit and must never carry an amount.
CREATE TABLE option_prices (
  revision_id TEXT NOT NULL, option_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('fixed','from','quote')),
  amount_minor INTEGER, currency TEXT CHECK(currency IN ('USD','CRC','EUR')),
  unit TEXT NOT NULL CHECK(unit IN ('person','group','service','dinner')),
  PRIMARY KEY(revision_id,option_id),
  FOREIGN KEY(revision_id,option_id) REFERENCES service_options(revision_id,option_id),
  CHECK((kind='quote' AND amount_minor IS NULL) OR
    (kind IN ('fixed','from') AND amount_minor IS NOT NULL AND amount_minor BETWEEN 0 AND 9007199254740991 AND currency IS NOT NULL))
) STRICT;

CREATE TABLE media_assets (
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
  CHECK(width IS NULL OR height IS NULL OR width*height<=8000000),
  CHECK(state NOT IN ('validated','approved') OR
    (sha256 IS NOT NULL AND mime_type IS NOT NULL AND byte_size IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND derivative_object_key IS NOT NULL)),
  CHECK(usage_approval <> 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by<>uploaded_by AND provenance='verified')),
  CHECK(state<>'approved' OR usage_approval='approved')
) STRICT;
CREATE TABLE revision_media (
  revision_id TEXT NOT NULL REFERENCES service_revisions(id), media_id TEXT NOT NULL REFERENCES media_assets(id),
  sort_order INTEGER NOT NULL CHECK(sort_order BETWEEN 0 AND 7),
  PRIMARY KEY(revision_id,media_id), UNIQUE(revision_id,sort_order)
) STRICT;
-- sort_order=0 is the main image; alt text belongs to the revision, not a mutable public URL.
CREATE TABLE revision_media_translations (
  revision_id TEXT NOT NULL, media_id TEXT NOT NULL, locale TEXT NOT NULL CHECK(locale IN ('es','en')),
  alt_text TEXT NOT NULL DEFAULT '' CHECK(length(alt_text)<=250), PRIMARY KEY(revision_id,media_id,locale),
  FOREIGN KEY(revision_id,media_id) REFERENCES revision_media(revision_id,media_id)
) STRICT;
CREATE TABLE commercial_approvals (
  id TEXT PRIMARY KEY NOT NULL, revision_id TEXT NOT NULL, content_hash TEXT NOT NULL,
  approved_by TEXT NOT NULL REFERENCES principals(id),
  approved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  FOREIGN KEY(revision_id,content_hash) REFERENCES service_revisions(id,content_hash)
) STRICT;
CREATE UNIQUE INDEX one_active_approval ON commercial_approvals(revision_id,content_hash) WHERE revoked_at IS NULL;
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL REFERENCES principals(id),
  action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  revision_id TEXT REFERENCES service_revisions(id), request_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('allowed','denied','failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE publication_commands (
  id TEXT PRIMARY KEY NOT NULL, service_id TEXT NOT NULL REFERENCES services(id),
  actor_id TEXT NOT NULL REFERENCES principals(id), idempotency_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('publish','archive')),
  expected_version INTEGER NOT NULL CHECK(expected_version BETWEEN 1 AND 9007199254740991),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','visible','failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(actor_id,idempotency_key)
) STRICT;
CREATE TABLE publication_outbox (
  generation INTEGER PRIMARY KEY NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
  command_id TEXT NOT NULL UNIQUE REFERENCES publication_commands(id),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  delivered_at TEXT, last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX services_status ON services(status,modified_at);
CREATE INDEX revisions_service ON service_revisions(service_id,number);
CREATE INDEX revisions_category ON service_revisions(category_id);
CREATE INDEX media_state ON media_assets(state,created_at);
CREATE INDEX audit_actor_time ON audit_events(actor_id,created_at);
CREATE INDEX outbox_delivery ON publication_outbox(delivered_at,generation);
