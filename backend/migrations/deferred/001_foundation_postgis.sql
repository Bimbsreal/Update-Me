-- Update Me foundation schema
-- Location-first, report-centric, Nigeria nationwide expansion ready.
-- Requires PostgreSQL with PostGIS.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

CREATE TYPE report_source_type AS ENUM ('community', 'official', 'system');
CREATE TYPE report_status AS ENUM ('active', 'confirmed', 'disputed', 'expired', 'removed');
CREATE TYPE moderation_action_type AS ENUM (
  'flag',
  'hide',
  'restore',
  'warn_user',
  'suspend_user',
  'delete_content'
);
CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'push');
CREATE TYPE fuel_availability AS ENUM ('available', 'limited', 'unavailable', 'unknown');
CREATE TYPE traffic_severity AS ENUM ('clear', 'moderate', 'slow', 'heavy', 'blocked');

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  avatar_url TEXT,
  home_state_code CHAR(2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_moderator BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX idx_users_home_state ON users (home_state_code);

-- ---------------------------------------------------------------------------
-- Geographic hierarchy (nationwide Nigeria — not Lagos-hardcoded)
-- ---------------------------------------------------------------------------

CREATE TABLE states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code CHAR(2) NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  capital TEXT,
  geom geometry(MultiPolygon, 4326),
  centroid geography(Point, 4326),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lgas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID NOT NULL REFERENCES states (id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  geom geometry(MultiPolygon, 4326),
  centroid geography(Point, 4326),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state_id, name)
);

CREATE INDEX idx_lgas_state ON lgas (state_id);

CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id UUID NOT NULL REFERENCES lgas (id) ON DELETE CASCADE,
  state_id UUID NOT NULL REFERENCES states (id) ON DELETE CASCADE,
  slug TEXT,
  name TEXT NOT NULL,
  geom geometry(MultiPolygon, 4326),
  centroid geography(Point, 4326),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lga_id, name)
);

CREATE INDEX idx_areas_state ON areas (state_id);
CREATE INDEX idx_areas_lga ON areas (lga_id);

CREATE TABLE neighbourhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  geom geometry(MultiPolygon, 4326),
  centroid geography(Point, 4326),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (area_id, name)
);

CREATE INDEX idx_neighbourhoods_area ON neighbourhoods (area_id);

CREATE TABLE roads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  lga_id UUID REFERENCES lgas (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  road_type TEXT,
  geom geometry(MultiLineString, 4326),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_roads_area ON roads (area_id);
CREATE INDEX idx_roads_geom ON roads USING GIST (geom);

CREATE TABLE landmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  lga_id UUID REFERENCES lgas (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  neighbourhood_id UUID REFERENCES neighbourhoods (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  landmark_type TEXT,
  location geography(Point, 4326) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_landmarks_location ON landmarks USING GIST (location);
CREATE INDEX idx_landmarks_area ON landmarks (area_id);

-- Canonical location references used by reports and saved places
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  lga_id UUID REFERENCES lgas (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  neighbourhood_id UUID REFERENCES neighbourhoods (id) ON DELETE SET NULL,
  road_id UUID REFERENCES roads (id) ON DELETE SET NULL,
  landmark_id UUID REFERENCES landmarks (id) ON DELETE SET NULL,
  label TEXT,
  place_name TEXT,
  geom geography(Point, 4326) NOT NULL,
  geohash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_geom ON locations USING GIST (geom);
CREATE INDEX idx_locations_area ON locations (area_id);
CREATE INDEX idx_locations_state ON locations (state_id);

-- ---------------------------------------------------------------------------
-- Official sources (distinguishable from community)
-- ---------------------------------------------------------------------------

CREATE TABLE official_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
  source_type TEXT NOT NULL,
  website_url TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE official_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  official_source_id UUID NOT NULL REFERENCES official_sources (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  external_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_official_updates_source ON official_updates (official_source_id);
CREATE INDEX idx_official_updates_expires ON official_updates (expires_at);

-- ---------------------------------------------------------------------------
-- Core reports (what / where / when / source / status + freshness)
-- ---------------------------------------------------------------------------

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  reported_by UUID REFERENCES users (id) ON DELETE SET NULL,
  source_type report_source_type NOT NULL DEFAULT 'community',
  official_source_id UUID REFERENCES official_sources (id) ON DELETE SET NULL,
  status report_status NOT NULL DEFAULT 'active',
  severity TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  confirmation_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reports_official_source_consistency CHECK (
    (source_type = 'official' AND official_source_id IS NOT NULL)
    OR (source_type <> 'official' AND official_source_id IS NULL)
  )
);

CREATE INDEX idx_reports_category ON reports (category);
CREATE INDEX idx_reports_status ON reports (status);
CREATE INDEX idx_reports_location ON reports (location_id);
CREATE INDEX idx_reports_area ON reports (area_id);
CREATE INDEX idx_reports_observed ON reports (observed_at DESC);
CREATE INDEX idx_reports_expires ON reports (expires_at);
CREATE INDEX idx_reports_active_fresh ON reports (category, status, expires_at)
  WHERE status IN ('active', 'confirmed');

CREATE TABLE report_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_confirming BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, user_id)
);

CREATE INDEX idx_report_confirmations_report ON report_confirmations (report_id);

CREATE TABLE report_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  update_type TEXT NOT NULL,
  body TEXT,
  previous_status report_status,
  new_status report_status,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_updates_report ON report_updates (report_id);

-- ---------------------------------------------------------------------------
-- Domain-specific report extensions
-- ---------------------------------------------------------------------------

CREATE TABLE traffic_reports (
  report_id UUID PRIMARY KEY REFERENCES reports (id) ON DELETE CASCADE,
  severity traffic_severity NOT NULL DEFAULT 'moderate',
  road_id UUID REFERENCES roads (id) ON DELETE SET NULL,
  delay_minutes INTEGER,
  direction TEXT,
  cause TEXT,
  lane_status TEXT
);

CREATE TABLE fuel_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT,
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fuel_stations_location ON fuel_stations (location_id);
CREATE INDEX idx_fuel_stations_area ON fuel_stations (area_id);

CREATE TABLE fuel_reports (
  report_id UUID PRIMARY KEY REFERENCES reports (id) ON DELETE CASCADE,
  fuel_station_id UUID REFERENCES fuel_stations (id) ON DELETE SET NULL,
  fuel_type TEXT NOT NULL DEFAULT 'petrol',
  price_per_litre NUMERIC(12, 2),
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  availability fuel_availability NOT NULL DEFAULT 'unknown',
  queue_length TEXT
);

CREATE TABLE transport_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  origin_label TEXT,
  destination_label TEXT,
  origin_location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  destination_location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  geom geometry(MultiLineString, 4326),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transport_routes_state ON transport_routes (state_id);

CREATE TABLE transport_fare_reports (
  report_id UUID PRIMARY KEY REFERENCES reports (id) ON DELETE CASCADE,
  transport_route_id UUID REFERENCES transport_routes (id) ON DELETE SET NULL,
  mode TEXT,
  fare_amount NUMERIC(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  vehicle_type TEXT,
  peak_period BOOLEAN
);

CREATE TABLE commodities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE commodity_price_reports (
  report_id UUID PRIMARY KEY REFERENCES reports (id) ON DELETE CASCADE,
  commodity_id UUID NOT NULL REFERENCES commodities (id) ON DELETE RESTRICT,
  price_amount NUMERIC(14, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  unit TEXT,
  market_name TEXT,
  quantity NUMERIC(14, 3)
);

-- ---------------------------------------------------------------------------
-- Local knowledge Q&A (utility, not social feed)
-- ---------------------------------------------------------------------------

CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_area ON questions (area_id);

CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_answers_question ON answers (question_id);

-- ---------------------------------------------------------------------------
-- User preferences & notifications
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  channel notification_channel NOT NULL DEFAULT 'in_app',
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  related_report_id UUID REFERENCES reports (id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, is_read);

CREATE TABLE saved_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES areas (id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, area_id)
);

CREATE TABLE saved_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  transport_route_id UUID REFERENCES transport_routes (id) ON DELETE CASCADE,
  label TEXT,
  origin_location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  destination_location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saved_routes_user ON saved_routes (user_id);

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------

CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action_type moderation_action_type NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moderation_actions_target ON moderation_actions (target_type, target_id);

-- ---------------------------------------------------------------------------
-- Freshness helper: mark expired active reports (callable by jobs later)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION expire_stale_reports()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE reports
  SET status = 'expired',
      updated_at = NOW()
  WHERE status IN ('active', 'confirmed')
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
