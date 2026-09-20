-- Geographic hierarchy expansion for Update Me (Nigeria nationwide)
-- PostGIS-ready: lat/lng stored now; geography column added when PostGIS is available.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso2 CHAR(2) NOT NULL UNIQUE,
  iso3 CHAR(3),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE states
  ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES countries (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS cities_towns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID NOT NULL REFERENCES states (id) ON DELETE CASCADE,
  lga_id UUID REFERENCES lgas (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cities_towns_state ON cities_towns (state_id);
CREATE INDEX IF NOT EXISTS idx_cities_towns_lga ON cities_towns (lga_id);

-- Expand areas for optional city link + search helpers
ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES cities_towns (id) ON DELETE SET NULL;

ALTER TABLE lgas
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS roads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  lga_id UUID REFERENCES lgas (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  road_type TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roads_area ON roads (area_id);
CREATE INDEX IF NOT EXISTS idx_roads_state ON roads (state_id);
CREATE INDEX IF NOT EXISTS idx_roads_name ON roads (lower(name));

CREATE TABLE IF NOT EXISTS landmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  lga_id UUID REFERENCES lgas (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  landmark_type TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landmarks_area ON landmarks (area_id);
CREATE INDEX IF NOT EXISTS idx_landmarks_state ON landmarks (state_id);
CREATE INDEX IF NOT EXISTS idx_landmarks_name ON landmarks (lower(name));

DO $$ BEGIN
  CREATE TYPE location_type AS ENUM (
    'country',
    'state',
    'lga',
    'city',
    'area',
    'road',
    'landmark',
    'place'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE location_status AS ENUM ('active', 'inactive', 'draft');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  type location_type NOT NULL,
  status location_status NOT NULL DEFAULT 'active',
  parent_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  country_id UUID REFERENCES countries (id) ON DELETE SET NULL,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  lga_id UUID REFERENCES lgas (id) ON DELETE SET NULL,
  city_id UUID REFERENCES cities_towns (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  road_id UUID REFERENCES roads (id) ON DELETE SET NULL,
  landmark_id UUID REFERENCES landmarks (id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  search_document TEXT,
  search_vector tsvector,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_type_area
  ON locations (type, area_id) WHERE area_id IS NOT NULL AND type = 'area';
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_type_lga
  ON locations (type, lga_id) WHERE lga_id IS NOT NULL AND type = 'lga';
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_type_state
  ON locations (type, state_id) WHERE state_id IS NOT NULL AND type = 'state';
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_type_country
  ON locations (type, country_id) WHERE country_id IS NOT NULL AND type = 'country';

CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations (parent_id);
CREATE INDEX IF NOT EXISTS idx_locations_state ON locations (state_id);
CREATE INDEX IF NOT EXISTS idx_locations_lga ON locations (lga_id);
CREATE INDEX IF NOT EXISTS idx_locations_area ON locations (area_id);
CREATE INDEX IF NOT EXISTS idx_locations_type_status ON locations (type, status);
CREATE INDEX IF NOT EXISTS idx_locations_name_lower ON locations (lower(name));
CREATE INDEX IF NOT EXISTS idx_locations_search_vector ON locations USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_locations_lat_lng ON locations (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Private optional user coordinates (never exposed publicly)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS private_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS private_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS current_location_id UUID REFERENCES locations (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_current_location ON users (current_location_id);

CREATE OR REPLACE FUNCTION locations_refresh_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_document := concat_ws(
    ' ',
    NEW.name,
    NEW.address,
    NEW.type::text,
    COALESCE(NEW.metadata->>'state', ''),
    COALESCE(NEW.metadata->>'lga', ''),
    COALESCE(NEW.metadata->>'area', '')
  );
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.search_document, ''));
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_locations_search_vector ON locations;
CREATE TRIGGER trg_locations_search_vector
BEFORE INSERT OR UPDATE ON locations
FOR EACH ROW EXECUTE FUNCTION locations_refresh_search_vector();
