-- Transport & Fare Information Module
-- Routes are corridors between locations; fare reports extend the Generic Report Engine.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE transport_mode AS ENUM (
    'bus',
    'brt',
    'danfo',
    'minibus',
    'keke',
    'okada',
    'taxi',
    'train',
    'ferry',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transport_fare_unit AS ENUM (
    'trip',
    'leg',
    'day_pass'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transport routes (origin → destination corridors)
CREATE TABLE IF NOT EXISTS transport_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  origin_location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  destination_location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  primary_mode transport_mode,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT transport_routes_name_len CHECK (
    name IS NULL OR char_length(trim(name)) BETWEEN 2 AND 160
  ),
  CONSTRAINT transport_routes_distinct_ends CHECK (
    origin_location_id <> destination_location_id
  )
);

-- One active corridor per origin/destination pair
CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_routes_origin_destination
  ON transport_routes (origin_location_id, destination_location_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_transport_routes_origin ON transport_routes (origin_location_id);
CREATE INDEX IF NOT EXISTS idx_transport_routes_destination ON transport_routes (destination_location_id);
CREATE INDEX IF NOT EXISTS idx_transport_routes_active ON transport_routes (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_transport_routes_mode ON transport_routes (primary_mode);

-- Optional ordered boarding/intermediate stops (simple first pass)
CREATE TABLE IF NOT EXISTS transport_route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  stop_order INTEGER NOT NULL CHECK (stop_order >= 1),
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT transport_route_stops_label_len CHECK (
    label IS NULL OR char_length(trim(label)) BETWEEN 2 AND 160
  ),
  CONSTRAINT transport_route_stops_has_place CHECK (
    location_id IS NOT NULL OR label IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_route_stops_order
  ON transport_route_stops (route_id, stop_order);

CREATE INDEX IF NOT EXISTS idx_transport_route_stops_route ON transport_route_stops (route_id);
CREATE INDEX IF NOT EXISTS idx_transport_route_stops_location ON transport_route_stops (location_id);

-- Fare-specific report details linked to Generic Report Engine
CREATE TABLE IF NOT EXISTS transport_fare_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL UNIQUE REFERENCES reports (id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES transport_routes (id) ON DELETE RESTRICT,

  transport_mode transport_mode NOT NULL,
  origin_location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  destination_location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,

  fare_amount NUMERIC(12, 2) NOT NULL
    CHECK (fare_amount > 0),
  fare_currency CHAR(3) NOT NULL DEFAULT 'NGN'
    CHECK (fare_currency ~ '^[A-Z]{3}$'),
  fare_unit transport_fare_unit NOT NULL DEFAULT 'trip',

  boarding_point_label TEXT,
  alighting_point_label TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT transport_fare_boarding_len CHECK (
    boarding_point_label IS NULL OR char_length(trim(boarding_point_label)) BETWEEN 2 AND 160
  ),
  CONSTRAINT transport_fare_alighting_len CHECK (
    alighting_point_label IS NULL OR char_length(trim(alighting_point_label)) BETWEEN 2 AND 160
  ),
  CONSTRAINT transport_fare_distinct_ends CHECK (
    origin_location_id <> destination_location_id
  )
);

CREATE INDEX IF NOT EXISTS idx_transport_fares_route ON transport_fare_reports (route_id);
CREATE INDEX IF NOT EXISTS idx_transport_fares_mode ON transport_fare_reports (transport_mode);
CREATE INDEX IF NOT EXISTS idx_transport_fares_origin ON transport_fare_reports (origin_location_id);
CREATE INDEX IF NOT EXISTS idx_transport_fares_destination ON transport_fare_reports (destination_location_id);
CREATE INDEX IF NOT EXISTS idx_transport_fares_created ON transport_fare_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transport_fares_route_mode
  ON transport_fare_reports (route_id, transport_mode, created_at DESC);

-- Duplicate fare prevention for the same user/route/mode is enforced in transportService.

-- Transport fares change during the day — policy already seeded at 360/120 in 005;
-- reaffirm so local installs stay consistent.
UPDATE category_freshness_policies p
SET default_ttl_minutes = 360,
    stale_after_minutes = 120,
    notes = 'Transport fares change through the day — policy used by generic report freshness engine.',
    updated_at = NOW()
FROM report_categories c
WHERE c.id = p.category_id
  AND c.code = 'transport';

-- Seed a few local-dev corridors from known area locations (if present)
INSERT INTO transport_routes (name, origin_location_id, destination_location_id, primary_mode)
SELECT
  v.name,
  o.id,
  d.id,
  v.mode::transport_mode
FROM (
  VALUES
    ('Lekki → Victoria Island', 'Lekki Phase 1', 'Victoria Island', 'bus'),
    ('Ajah → Lekki', 'Ajah', 'Lekki Phase 1', 'danfo')
) AS v(name, origin_area, dest_area, mode)
JOIN areas oa ON lower(oa.name) = lower(v.origin_area)
JOIN locations o ON o.area_id = oa.id AND o.type = 'area'
JOIN areas da ON lower(da.name) = lower(v.dest_area)
JOIN locations d ON d.area_id = da.id AND d.type = 'area'
WHERE o.id <> d.id
  AND NOT EXISTS (
    SELECT 1 FROM transport_routes tr
    WHERE tr.origin_location_id = o.id
      AND tr.destination_location_id = d.id
      AND tr.is_active = TRUE
  );

-- Fix bad seed row: Ikeja → Oshodi needs a distinct destination if Oshodi area exists
INSERT INTO transport_routes (name, origin_location_id, destination_location_id, primary_mode)
SELECT
  'Ikeja → Maryland',
  o.id,
  d.id,
  'bus'::transport_mode
FROM areas oa
JOIN locations o ON o.area_id = oa.id AND o.type = 'area'
JOIN areas da ON lower(da.name) = 'maryland'
JOIN locations d ON d.area_id = da.id AND d.type = 'area'
WHERE lower(oa.name) = 'ikeja gra'
  AND o.id <> d.id
  AND NOT EXISTS (
    SELECT 1 FROM transport_routes tr
    WHERE tr.origin_location_id = o.id
      AND tr.destination_location_id = d.id
      AND tr.is_active = TRUE
  );

-- Simple boarding labels for Lekki → VI if route exists
INSERT INTO transport_route_stops (route_id, stop_order, label)
SELECT tr.id, 1, 'Admiralty Way / Lekki Phase 1'
FROM transport_routes tr
JOIN locations o ON o.id = tr.origin_location_id
WHERE lower(o.name) = 'lekki phase 1'
  AND tr.name ILIKE 'Lekki → Victoria Island%'
  AND NOT EXISTS (
    SELECT 1 FROM transport_route_stops s WHERE s.route_id = tr.id AND s.stop_order = 1
  );

INSERT INTO transport_route_stops (route_id, stop_order, label)
SELECT tr.id, 2, 'Ahmadu Bello Way / VI'
FROM transport_routes tr
JOIN locations o ON o.id = tr.origin_location_id
WHERE lower(o.name) = 'lekki phase 1'
  AND tr.name ILIKE 'Lekki → Victoria Island%'
  AND NOT EXISTS (
    SELECT 1 FROM transport_route_stops s WHERE s.route_id = tr.id AND s.stop_order = 2
  );
