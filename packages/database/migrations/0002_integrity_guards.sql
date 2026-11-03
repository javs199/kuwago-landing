-- No publication operation is implemented. These are additional database invariants.
CREATE TRIGGER revision_cannot_start_sealed BEFORE INSERT ON service_revisions
WHEN NEW.sealed_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'create_revision_unsealed'); END;
CREATE TRIGGER sealed_revision_update BEFORE UPDATE ON service_revisions
WHEN OLD.sealed_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER sealed_revision_delete BEFORE DELETE ON service_revisions
WHEN OLD.sealed_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER revision_owner_immutable BEFORE UPDATE OF id,service_id,number,created_by ON service_revisions
BEGIN SELECT RAISE(ABORT,'revision_identity_immutable'); END;
CREATE TRIGGER option_identity_immutable BEFORE UPDATE ON option_identities
BEGIN SELECT RAISE(ABORT,'option_identity_immutable'); END;

CREATE TRIGGER approval_requires_reviewer BEFORE INSERT ON commercial_approvals
WHEN NOT EXISTS (
 SELECT 1 FROM service_revisions r JOIN principals p ON p.id=NEW.approved_by
 JOIN principal_roles pr ON pr.principal_id=p.id AND pr.role_id='publisher'
 WHERE r.id=NEW.revision_id AND r.content_hash=NEW.content_hash AND r.sealed_at IS NOT NULL
 AND r.created_by<>p.id AND p.enabled=1
) BEGIN SELECT RAISE(ABORT,'approval_requires_enabled_independent_publisher'); END;
CREATE TRIGGER approval_update_limited BEFORE UPDATE ON commercial_approvals
WHEN NEW.id<>OLD.id OR NEW.revision_id<>OLD.revision_id OR NEW.content_hash<>OLD.content_hash
 OR NEW.approved_by<>OLD.approved_by OR NEW.approved_at<>OLD.approved_at OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
BEGIN SELECT RAISE(ABORT,'approval_only_revocable_once'); END;
CREATE TRIGGER approval_no_delete BEFORE DELETE ON commercial_approvals
BEGIN SELECT RAISE(ABORT,'approval_history_preserved'); END;

CREATE TRIGGER publication_guard_insert BEFORE INSERT ON services WHEN NEW.status='published'
BEGIN SELECT RAISE(ABORT,'create_as_draft'); END;
CREATE TRIGGER publication_guard_update BEFORE UPDATE OF status,published_revision_id,provenance ON services
WHEN NEW.status='published' AND (
 NEW.provenance<>'verified' OR NOT EXISTS (
  SELECT 1 FROM service_revisions r JOIN categories c ON c.id=r.category_id AND c.active=1
  JOIN commercial_approvals a ON a.revision_id=r.id AND a.content_hash=r.content_hash AND a.revoked_at IS NULL
  WHERE r.id=NEW.published_revision_id AND r.service_id=NEW.id AND r.sealed_at IS NOT NULL AND trim(r.slug)<>''
 ) OR EXISTS (
  SELECT 1 FROM services other JOIN service_revisions r ON r.id=other.published_revision_id
  WHERE other.status='published' AND other.id<>NEW.id AND r.slug=(SELECT slug FROM service_revisions WHERE id=NEW.published_revision_id)
 )
) BEGIN SELECT RAISE(ABORT,'publication_requires_approved_sealed_revision_unique_slug'); END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
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
CREATE TRIGGER service_translations_sealed_insert BEFORE INSERT ON service_translations
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=NEW.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER service_translations_sealed_delete BEFORE DELETE ON service_translations
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=OLD.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER service_translations_sealed_update BEFORE UPDATE ON service_translations
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id IN (OLD.revision_id,NEW.revision_id) AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER service_options_sealed_insert BEFORE INSERT ON service_options
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=NEW.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER service_options_sealed_delete BEFORE DELETE ON service_options
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=OLD.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER service_options_sealed_update BEFORE UPDATE ON service_options
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id IN (OLD.revision_id,NEW.revision_id) AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER option_translations_sealed_insert BEFORE INSERT ON option_translations
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=NEW.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER option_translations_sealed_delete BEFORE DELETE ON option_translations
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=OLD.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER option_translations_sealed_update BEFORE UPDATE ON option_translations
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id IN (OLD.revision_id,NEW.revision_id) AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER option_prices_sealed_insert BEFORE INSERT ON option_prices
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=NEW.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER option_prices_sealed_delete BEFORE DELETE ON option_prices
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=OLD.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER option_prices_sealed_update BEFORE UPDATE ON option_prices
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id IN (OLD.revision_id,NEW.revision_id) AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER revision_media_sealed_insert BEFORE INSERT ON revision_media
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=NEW.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER revision_media_sealed_delete BEFORE DELETE ON revision_media
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=OLD.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER revision_media_sealed_update BEFORE UPDATE ON revision_media
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id IN (OLD.revision_id,NEW.revision_id) AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER revision_media_translations_sealed_insert BEFORE INSERT ON revision_media_translations
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=NEW.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER revision_media_translations_sealed_delete BEFORE DELETE ON revision_media_translations
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=OLD.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER revision_media_translations_sealed_update BEFORE UPDATE ON revision_media_translations
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id IN (OLD.revision_id,NEW.revision_id) AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
