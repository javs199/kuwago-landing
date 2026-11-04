-- Kuwago spec 017: percent discount per service revision, with optional Costa Rica calendar dates.
-- Forward-only. 0001-0007 remain immutable. A sealed (approved/published) revision cannot change its discount.
CREATE TABLE revision_discounts (
  revision_id TEXT PRIMARY KEY NOT NULL REFERENCES service_revisions(id),
  percent INTEGER NOT NULL CHECK(percent BETWEEN 1 AND 90),
  starts_on TEXT CHECK(starts_on IS NULL OR (length(starts_on)=10 AND starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date(starts_on)=starts_on)),
  ends_on TEXT CHECK(ends_on IS NULL OR (length(ends_on)=10 AND ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date(ends_on)=ends_on)),
  CHECK(starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
) STRICT;
CREATE TRIGGER revision_discounts_sealed_insert BEFORE INSERT ON revision_discounts
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=NEW.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER revision_discounts_sealed_delete BEFORE DELETE ON revision_discounts
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id=OLD.revision_id AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
CREATE TRIGGER revision_discounts_sealed_update BEFORE UPDATE ON revision_discounts
WHEN EXISTS(SELECT 1 FROM service_revisions WHERE id IN (OLD.revision_id,NEW.revision_id) AND sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'sealed_revision_immutable'); END;
