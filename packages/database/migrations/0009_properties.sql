-- Propiedades: estado de trabajo separado del snapshot publico.
CREATE TABLE properties (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT UNIQUE NOT NULL CHECK(length(slug) BETWEEN 2 AND 60 AND slug NOT GLOB '*[^a-z0-9-]*'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  kind TEXT NOT NULL CHECK(kind IN ('rental','managed')),
  show_on_landing INTEGER NOT NULL DEFAULT 0 CHECK(show_on_landing IN (0,1)),
  sort_order INTEGER NOT NULL CHECK(sort_order >= 0),
  location TEXT CHECK(location IS NULL OR length(location) <= 120),
  max_guests INTEGER CHECK(max_guests IS NULL OR max_guests >= 0),
  bedrooms INTEGER CHECK(bedrooms IS NULL OR bedrooms >= 0),
  bathrooms REAL CHECK(bathrooms IS NULL OR (bathrooms >= 0 AND bathrooms * 2 = CAST(bathrooms * 2 AS INTEGER))),
  airbnb_url TEXT CHECK(airbnb_url IS NULL OR (length(airbnb_url) <= 2000 AND airbnb_url GLOB 'https://www.airbnb.*/rooms/[0-9]*')),
  owner_name TEXT CHECK(owner_name IS NULL OR length(owner_name) <= 250),
  owner_contact TEXT CHECK(owner_contact IS NULL OR length(owner_contact) <= 250),
  internal_notes TEXT CHECK(internal_notes IS NULL OR length(internal_notes) <= 10000),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by TEXT REFERENCES principals(id),
  published_at TEXT,
  published_by TEXT REFERENCES principals(id),
  slug_locked INTEGER NOT NULL DEFAULT 0 CHECK(slug_locked IN (0,1)),
  published_visibility INTEGER NOT NULL DEFAULT 0 CHECK(published_visibility IN (0,1)),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version > 0),
  published_json TEXT CHECK(published_json IS NULL OR (json_valid(published_json) AND json_type(published_json) = 'object')),
  CHECK(status != 'published' OR (published_json IS NOT NULL AND published_at IS NOT NULL AND slug_locked = 1))
) STRICT;
CREATE TABLE property_translations (
  property_id TEXT NOT NULL REFERENCES properties(id),
  locale TEXT NOT NULL CHECK(locale IN ('es','en')),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  tagline TEXT NOT NULL CHECK(length(tagline) <= 120),
  description TEXT NOT NULL CHECK(length(description) <= 2000),
  PRIMARY KEY(property_id,locale)
) STRICT;
CREATE TRIGGER property_slug_immutable BEFORE UPDATE OF slug,slug_locked ON properties
WHEN OLD.slug_locked = 1 AND (NEW.slug != OLD.slug OR NEW.slug_locked != 1)
BEGIN SELECT RAISE(ABORT,'property_slug_locked'); END;
INSERT INTO properties(id,slug,status,kind,show_on_landing,sort_order,slug_locked,published_visibility,published_at,published_json) VALUES ('02000000-0000-4000-8000-000000000001','carabao-villa','published','managed',1,0,1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'{"slug":"carabao-villa","kind":"managed","sortOrder":0,"location":null,"maxGuests":null,"bedrooms":null,"bathrooms":null,"airbnbUrl":null,"translations":{"es":{"name":"Carabao Villa","tagline":"Propiedad administrada","description":""},"en":{"name":"Carabao Villa","tagline":"Managed Property","description":""}}}');
INSERT INTO property_translations VALUES ('02000000-0000-4000-8000-000000000001','es','Carabao Villa','Propiedad administrada','');
INSERT INTO property_translations VALUES ('02000000-0000-4000-8000-000000000001','en','Carabao Villa','Managed Property','');
INSERT INTO properties(id,slug,status,kind,show_on_landing,sort_order,slug_locked,published_visibility,published_at,published_json) VALUES ('02000000-0000-4000-8000-000000000002','villa-maya','published','managed',1,1,1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'{"slug":"villa-maya","kind":"managed","sortOrder":1,"location":null,"maxGuests":null,"bedrooms":null,"bathrooms":null,"airbnbUrl":null,"translations":{"es":{"name":"Villa Maya","tagline":"Propiedad administrada","description":""},"en":{"name":"Villa Maya","tagline":"Managed Property","description":""}}}');
INSERT INTO property_translations VALUES ('02000000-0000-4000-8000-000000000002','es','Villa Maya','Propiedad administrada','');
INSERT INTO property_translations VALUES ('02000000-0000-4000-8000-000000000002','en','Villa Maya','Managed Property','');
INSERT INTO properties(id,slug,status,kind,show_on_landing,sort_order,slug_locked,published_visibility,published_at,published_json) VALUES ('02000000-0000-4000-8000-000000000003','casa-bella-mia','published','managed',1,2,1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'{"slug":"casa-bella-mia","kind":"managed","sortOrder":2,"location":null,"maxGuests":null,"bedrooms":null,"bathrooms":null,"airbnbUrl":null,"translations":{"es":{"name":"Casa Bella Mia","tagline":"Propiedad administrada","description":""},"en":{"name":"Casa Bella Mia","tagline":"Managed Property","description":""}}}');
INSERT INTO property_translations VALUES ('02000000-0000-4000-8000-000000000003','es','Casa Bella Mia','Propiedad administrada','');
INSERT INTO property_translations VALUES ('02000000-0000-4000-8000-000000000003','en','Casa Bella Mia','Managed Property','');
INSERT INTO properties(id,slug,status,kind,show_on_landing,sort_order,slug_locked,published_visibility,published_at,published_json) VALUES ('02000000-0000-4000-8000-000000000004','casa-heliconia','published','managed',1,3,1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'{"slug":"casa-heliconia","kind":"managed","sortOrder":3,"location":null,"maxGuests":null,"bedrooms":null,"bathrooms":null,"airbnbUrl":null,"translations":{"es":{"name":"Casa Heliconia","tagline":"Propiedad administrada","description":""},"en":{"name":"Casa Heliconia","tagline":"Managed Property","description":""}}}');
INSERT INTO property_translations VALUES ('02000000-0000-4000-8000-000000000004','es','Casa Heliconia','Propiedad administrada','');
INSERT INTO property_translations VALUES ('02000000-0000-4000-8000-000000000004','en','Casa Heliconia','Managed Property','');
INSERT INTO properties(id,slug,status,kind,show_on_landing,sort_order,slug_locked,published_visibility,published_at,published_json) VALUES ('02000000-0000-4000-8000-000000000005','casa-cielo','draft','managed',0,4,0,0,NULL,NULL);
INSERT INTO property_translations VALUES ('02000000-0000-4000-8000-000000000005','es','Casa Cielo','Propiedad administrada','');
INSERT INTO property_translations VALUES ('02000000-0000-4000-8000-000000000005','en','Casa Cielo','Managed Property','');
