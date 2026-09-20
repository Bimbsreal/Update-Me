-- Fuel Information Module
-- Extends Generic Report Engine — stations are places; reports describe current conditions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE fuel_product_type AS ENUM (
    'pms',
    'ago',
    'lpg'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fuel_availability AS ENUM (
    'available',
    'limited',
    'unavailable',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fuel_queue_condition AS ENUM (
    'none',
    'short',
    'moderate',
    'long',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fuel stations (places/businesses) — separate from reports
CREATE TABLE IF NOT EXISTS fuel_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT,
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  landmark_label TEXT,
  road_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fuel_stations_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 160),
  CONSTRAINT fuel_stations_brand_len CHECK (
    brand IS NULL OR char_length(trim(brand)) BETWEEN 1 AND 80
  ),
  CONSTRAINT fuel_stations_address_len CHECK (
    address IS NULL OR char_length(trim(address)) BETWEEN 2 AND 240
  ),
  CONSTRAINT fuel_stations_landmark_len CHECK (
    landmark_label IS NULL OR char_length(trim(landmark_label)) BETWEEN 2 AND 160
  ),
  CONSTRAINT fuel_stations_road_len CHECK (
    road_name IS NULL OR char_length(trim(road_name)) BETWEEN 2 AND 160
  ),
  CONSTRAINT fuel_stations_coords_pair CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  ),
  CONSTRAINT fuel_stations_lat_range CHECK (
    latitude IS NULL OR latitude BETWEEN -90 AND 90
  ),
  CONSTRAINT fuel_stations_lng_range CHECK (
    longitude IS NULL OR longitude BETWEEN -180 AND 180
  )
);

-- Prevent accidental duplicate stations in the same location
CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_stations_name_location
  ON fuel_stations (location_id, lower(trim(name)))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_fuel_stations_location ON fuel_stations (location_id);
CREATE INDEX IF NOT EXISTS idx_fuel_stations_active ON fuel_stations (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fuel_stations_brand ON fuel_stations (lower(brand));
CREATE INDEX IF NOT EXISTS idx_fuel_stations_name ON fuel_stations (lower(name));
CREATE INDEX IF NOT EXISTS idx_fuel_stations_lat_lng
  ON fuel_stations (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Fuel-specific report details linked to Generic Report Engine
CREATE TABLE IF NOT EXISTS fuel_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL UNIQUE REFERENCES reports (id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES fuel_stations (id) ON DELETE RESTRICT,

  fuel_type fuel_product_type NOT NULL,
  availability fuel_availability NOT NULL DEFAULT 'unknown',
  price_amount NUMERIC(12, 2)
    CHECK (price_amount IS NULL OR price_amount > 0),
  price_currency CHAR(3) NOT NULL DEFAULT 'NGN'
    CHECK (price_currency ~ '^[A-Z]{3}$'),
  price_unit TEXT NOT NULL DEFAULT 'litre'
    CHECK (price_unit IN ('litre', 'kg', 'cylinder')),
  queue_condition fuel_queue_condition DEFAULT 'unknown',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fuel_reports_price_required_when_available CHECK (
    availability IN ('unavailable', 'unknown')
    OR price_amount IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_fuel_reports_station ON fuel_reports (station_id);
CREATE INDEX IF NOT EXISTS idx_fuel_reports_type ON fuel_reports (fuel_type);
CREATE INDEX IF NOT EXISTS idx_fuel_reports_availability ON fuel_reports (availability);
CREATE INDEX IF NOT EXISTS idx_fuel_reports_created ON fuel_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_reports_station_type ON fuel_reports (station_id, fuel_type, created_at DESC);

-- Fuel changes frequently — tighten policy used by generic freshness engine
UPDATE category_freshness_policies p
SET default_ttl_minutes = 360,
    stale_after_minutes = 120,
    notes = 'Fuel availability and prices change quickly — policy used by generic report freshness engine.',
    updated_at = NOW()
FROM report_categories c
WHERE c.id = p.category_id
  AND c.code = 'fuel';

-- Seed a small set of local-dev stations from known area locations (if present)
INSERT INTO fuel_stations (name, brand, location_id, latitude, longitude, address, landmark_label, road_name)
SELECT
  v.name,
  v.brand,
  loc.id,
  COALESCE(loc.latitude, a.centroid_lat),
  COALESCE(loc.longitude, a.centroid_lng),
  v.address,
  v.landmark_label,
  v.road_name
FROM (
  VALUES
    ('Admiralty Way Filling Station', 'NNPC', 'Lekki Phase 1', 'Near Admiralty Way', 'Admiralty Way', 'Admiralty Way, Lekki Phase 1'),
    ('Chevron Drive Station', 'TotalEnergies', 'Lekki Phase 1', 'Chevron Drive area', 'Chevron Drive', 'Chevron Drive, Lekki'),
    ('Ajah Roundabout Station', 'MRS', 'Ajah', 'Near Ajah roundabout', 'Addo Road', 'Ajah, Lagos')
) AS v(name, brand, area_name, landmark_label, road_name, address)
JOIN areas a ON lower(a.name) = lower(v.area_name)
JOIN locations loc ON loc.area_id = a.id AND loc.type = 'area'
WHERE NOT EXISTS (
  SELECT 1 FROM fuel_stations fs
  WHERE fs.location_id = loc.id AND lower(trim(fs.name)) = lower(trim(v.name))
);
