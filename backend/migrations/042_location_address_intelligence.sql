-- Location & Address Intelligence
-- Extends existing locations hierarchy — no duplicate state/LGA trees.
-- Additive only. Does not invent coordinates or fabricate addresses.

-- ---------------------------------------------------------------------------
-- Verification + confidence (locations remain the canonical identity)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE location_verification_status AS ENUM (
    'unverified',
    'pending',
    'verified',
    'deprecated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE location_confidence AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Controlled place kinds for type=place|landmark (not hard-coded in UI)
DO $$ BEGIN
  CREATE TYPE location_place_kind AS ENUM (
    'landmark',
    'road',
    'junction',
    'bus_stop',
    'market',
    'fuel_station',
    'government_facility',
    'hospital',
    'school',
    'estate',
    'transport_hub',
    'public_place',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS verification_status location_verification_status
    NOT NULL DEFAULT 'unverified';

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS confidence location_confidence NOT NULL DEFAULT 'medium';

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS place_kind location_place_kind;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS house_number TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS street_name TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS postal_code TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS address_original TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS address_normalized TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS merged_into_location_id UUID
    REFERENCES locations (id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE locations
    ADD CONSTRAINT locations_house_number_len CHECK (
      house_number IS NULL OR char_length(trim(house_number)) BETWEEN 1 AND 40
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE locations
    ADD CONSTRAINT locations_street_name_len CHECK (
      street_name IS NULL OR char_length(trim(street_name)) BETWEEN 2 AND 160
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE locations
    ADD CONSTRAINT locations_postal_code_len CHECK (
      postal_code IS NULL OR char_length(trim(postal_code)) BETWEEN 2 AND 20
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE locations
    ADD CONSTRAINT locations_address_original_len CHECK (
      address_original IS NULL OR char_length(trim(address_original)) BETWEEN 2 AND 500
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: previously verified_at set → verified
UPDATE locations
SET verification_status = 'verified'::location_verification_status
WHERE verified_at IS NOT NULL
  AND verification_status = 'unverified'::location_verification_status;

UPDATE locations
SET verification_status = 'deprecated'::location_verification_status
WHERE status = 'inactive'
  AND verification_status <> 'deprecated'::location_verification_status;

CREATE INDEX IF NOT EXISTS idx_locations_verification
  ON locations (verification_status)
  WHERE merged_into_location_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_locations_place_kind
  ON locations (place_kind)
  WHERE place_kind IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_address_normalized
  ON locations (address_normalized)
  WHERE address_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_merged_into
  ON locations (merged_into_location_id)
  WHERE merged_into_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_street_name
  ON locations (lower(street_name))
  WHERE street_name IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Unresolved location / ambiguous search queue (admin triage)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE location_resolve_status AS ENUM (
    'open',
    'mapped',
    'aliased',
    'rejected',
    'ignored'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS location_resolve_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  query_context TEXT,
  latitude DOUBLE PRECISION
    CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  longitude DOUBLE PRECISION
    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  status location_resolve_status NOT NULL DEFAULT 'open',
  hit_count INT NOT NULL DEFAULT 1,
  resolved_location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT location_resolve_query_len CHECK (
    char_length(trim(raw_query)) BETWEEN 2 AND 240
  ),
  CONSTRAINT location_resolve_coords_pair CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  ),
  CONSTRAINT location_resolve_notes_len CHECK (
    resolution_notes IS NULL OR char_length(trim(resolution_notes)) BETWEEN 2 AND 1000
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_location_resolve_open_norm
  ON location_resolve_queue (normalized_query)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_location_resolve_status
  ON location_resolve_queue (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_location_resolve_hits
  ON location_resolve_queue (hit_count DESC)
  WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- Location conflicts (preserve disagreement — do not silently pick a winner)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS location_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  value_a TEXT NOT NULL,
  value_b TEXT NOT NULL,
  source_a TEXT,
  source_b TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT location_conflicts_field_len CHECK (
    char_length(trim(field_name)) BETWEEN 2 AND 80
  )
);

CREATE INDEX IF NOT EXISTS idx_location_conflicts_open
  ON location_conflicts (status, created_at DESC)
  WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- Geocode cache + request log (provider abstraction; no secrets stored)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geocode_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  request_kind TEXT NOT NULL
    CHECK (request_kind IN ('forward', 'reverse')),
  query_normalized TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched_location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  confidence location_confidence,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT geocode_cache_provider_len CHECK (
    char_length(trim(provider)) BETWEEN 2 AND 40
  ),
  CONSTRAINT geocode_cache_query_len CHECK (
    char_length(trim(query_normalized)) BETWEEN 1 AND 320
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_geocode_cache_provider_kind_query
  ON geocode_cache (provider, request_kind, query_normalized);

CREATE INDEX IF NOT EXISTS idx_geocode_cache_expires
  ON geocode_cache (expires_at);

CREATE TABLE IF NOT EXISTS geocode_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  request_kind TEXT NOT NULL
    CHECK (request_kind IN ('forward', 'reverse')),
  success BOOLEAN NOT NULL,
  latency_ms INT,
  error_code TEXT,
  cached BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geocode_request_log_created
  ON geocode_request_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_geocode_request_log_provider
  ON geocode_request_log (provider, created_at DESC);

-- Anonymized search metrics (no personal history)
CREATE TABLE IF NOT EXISTS location_search_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_query TEXT NOT NULL,
  result_count INT NOT NULL DEFAULT 0,
  was_ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
  was_unresolved BOOLEAN NOT NULL DEFAULT FALSE,
  hit_count INT NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT location_search_metrics_query_len CHECK (
    char_length(trim(normalized_query)) BETWEEN 1 AND 240
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_location_search_metrics_norm
  ON location_search_metrics (normalized_query);

COMMENT ON TABLE location_resolve_queue IS
  'Vague or unmatched place queries for admin triage — never auto-converted into places.';
COMMENT ON TABLE geocode_cache IS
  'Cached geocoder responses. Provider secrets never stored here.';
COMMENT ON COLUMN locations.address_original IS
  'Preserves user-entered wording; address_normalized is for matching only.';
COMMENT ON COLUMN locations.merged_into_location_id IS
  'Soft merge target; row retained for provenance. Never auto-merge uncertain matches.';
