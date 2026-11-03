-- Canonical RBAC for 2B.3. Legacy roles are preserved for history, never inherited.
-- No principals or assignments are created. Existing memberships require explicit review.
CREATE TABLE admin_role_definitions (
 id TEXT PRIMARY KEY NOT NULL CHECK(id IN ('super_admin','admin','editor'))
) STRICT;
CREATE TABLE admin_role_permissions (
 role_id TEXT NOT NULL REFERENCES admin_role_definitions(id),
 permission TEXT NOT NULL CHECK(permission IN (
  'admin:read','drafts:write','translations:write','media:prepare','media:read-private',
  'services:publish','services:unpublish','services:archive','audit:read','admins:manage'
 )), PRIMARY KEY(role_id,permission)
) STRICT;
CREATE TABLE administrator_roles (
 principal_id TEXT PRIMARY KEY NOT NULL REFERENCES principals(id),
 role_id TEXT NOT NULL REFERENCES admin_role_definitions(id),
 granted_by TEXT NOT NULL REFERENCES principals(id),
 granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK(principal_id<>granted_by)
) STRICT;
INSERT INTO admin_role_definitions(id) VALUES ('editor'),('admin'),('super_admin');
INSERT INTO admin_role_permissions(role_id,permission) VALUES
 ('editor','admin:read'),('editor','drafts:write'),('editor','translations:write'),('editor','media:prepare'),('editor','media:read-private'),
 ('admin','admin:read'),('admin','drafts:write'),('admin','translations:write'),('admin','media:prepare'),('admin','media:read-private'),
 ('admin','services:publish'),('admin','services:unpublish'),('admin','services:archive'),('admin','audit:read'),
 ('super_admin','admin:read'),('super_admin','drafts:write'),('super_admin','translations:write'),('super_admin','media:prepare'),('super_admin','media:read-private'),
 ('super_admin','services:publish'),('super_admin','services:unpublish'),('super_admin','services:archive'),('super_admin','audit:read'),('super_admin','admins:manage');
DROP TRIGGER approval_requires_reviewer;
CREATE TRIGGER approval_requires_reviewer BEFORE INSERT ON commercial_approvals
WHEN NOT EXISTS (
 SELECT 1 FROM service_revisions r JOIN principals p ON p.id=NEW.approved_by
 JOIN administrator_roles ar ON ar.principal_id=p.id AND ar.role_id IN ('admin','super_admin')
 WHERE r.id=NEW.revision_id AND r.content_hash=NEW.content_hash AND r.sealed_at IS NOT NULL
 AND r.created_by<>p.id AND p.enabled=1
) BEGIN SELECT RAISE(ABORT,'approval_requires_enabled_independent_administrator'); END;
