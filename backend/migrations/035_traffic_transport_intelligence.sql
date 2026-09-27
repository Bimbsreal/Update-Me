-- Traffic & Transport Intelligence
-- Extends existing traffic_reports / transport_* / roads / report engine.
-- Does NOT create a second moderation, location, or report system.

-- ---------------------------------------------------------------------------
-- Controlled enums (additive; keep existing traffic_severity / traffic_cause)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE traffic_event_type AS ENUM (
    'congestion',
    'accident',
    'road_closure',
    'obstruction',
    'construction',
    'flooding',
    'vehicle_breakdown',
    'checkpoint',
    'security_incident',
    'road_damage',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE traffic_event_status AS ENUM (
    'active',
    'improving',
    'resolved',
    'expired',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE traffic_direction AS ENUM (
    'inbound',
    'outbound',
    'northbound',
    'southbound',
    'eastbound',
    'westbound',
    'both',
    'unspecified'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fare_period AS ENUM (
    'any',
    'peak',
    'off_peak',
    'weekday',
    'weekend',
    'night',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Road aliases (Nigerian naming variations; roads table already exists)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS road_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  road_id UUID NOT NULL REFERENCES roads (id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT road_aliases_alias_len CHECK (char_length(trim(alias)) BETWEEN 2 AND 160)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_road_aliases_road_norm
  ON road_aliases (road_id, normalized_alias);

CREATE INDEX IF NOT EXISTS idx_road_aliases_normalized
  ON road_aliases (normalized_alias);

CREATE OR REPLACE FUNCTION road_aliases_normalize()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_alias := lower(trim(regexp_replace(COALESCE(NEW.alias, ''), '\s+', ' ', 'g')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_road_aliases_normalize ON road_aliases;
CREATE TRIGGER trg_road_aliases_normalize
  BEFORE INSERT OR UPDATE OF alias ON road_aliases
  FOR EACH ROW
  EXECUTE FUNCTION road_aliases_normalize();

-- ---------------------------------------------------------------------------
-- Road segments (incremental; not a full national segment inventory)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS road_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  road_id UUID NOT NULL REFERENCES roads (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  from_label TEXT,
  to_label TEXT,
  from_location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  to_location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  lga_id UUID REFERENCES lgas (id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT road_segments_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 160),
  CONSTRAINT road_segments_from_len CHECK (
    from_label IS NULL OR char_length(trim(from_label)) BETWEEN 2 AND 120
  ),
  CONSTRAINT road_segments_to_len CHECK (
    to_label IS NULL OR char_length(trim(to_label)) BETWEEN 2 AND 120
  )
);

CREATE INDEX IF NOT EXISTS idx_road_segments_road
  ON road_segments (road_id, sort_order)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_road_segments_name
  ON road_segments (lower(name));

-- ---------------------------------------------------------------------------
-- Traffic events (underlying situation; reports remain provenance)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS traffic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type traffic_event_type NOT NULL DEFAULT 'congestion',
  severity traffic_severity NOT NULL DEFAULT 'unknown',
  status traffic_event_status NOT NULL DEFAULT 'active',
  title TEXT NOT NULL,
  description TEXT,
  road_id UUID REFERENCES roads (id) ON DELETE SET NULL,
  road_segment_id UUID REFERENCES road_segments (id) ON DELETE SET NULL,
  road_name TEXT,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  lga_id UUID REFERENCES lgas (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  direction traffic_direction NOT NULL DEFAULT 'unspecified',
  direction_label TEXT,
  latitude DOUBLE PRECISION
    CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  longitude DOUBLE PRECISION
    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  started_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ,
  estimated_resolution_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  source_classification TEXT NOT NULL DEFAULT 'community'
    CHECK (source_classification IN ('community', 'official', 'admin', 'mixed')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'community_confirmed', 'officially_sourced', 'admin_verified')),
  related_official_update_id UUID REFERENCES official_updates (id) ON DELETE SET NULL,
  event_group_id UUID REFERENCES report_event_groups (id) ON DELETE SET NULL,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT traffic_events_title_len CHECK (char_length(trim(title)) BETWEEN 3 AND 240),
  CONSTRAINT traffic_events_desc_len CHECK (
    description IS NULL OR char_length(trim(description)) BETWEEN 2 AND 4000
  ),
  CONSTRAINT traffic_events_road_name_len CHECK (
    road_name IS NULL OR char_length(trim(road_name)) BETWEEN 2 AND 160
  ),
  CONSTRAINT traffic_events_direction_label_len CHECK (
    direction_label IS NULL OR char_length(trim(direction_label)) BETWEEN 2 AND 160
  ),
  CONSTRAINT traffic_events_coords_pair CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_traffic_events_status_updated
  ON traffic_events (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_traffic_events_severity_active
  ON traffic_events (severity, status)
  WHERE status IN ('active', 'improving');

CREATE INDEX IF NOT EXISTS idx_traffic_events_type_status
  ON traffic_events (event_type, status);

CREATE INDEX IF NOT EXISTS idx_traffic_events_location
  ON traffic_events (location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_traffic_events_road
  ON traffic_events (road_id)
  WHERE road_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_traffic_events_segment
  ON traffic_events (road_segment_id)
  WHERE road_segment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_traffic_events_state_lga
  ON traffic_events (state_id, lga_id);

CREATE INDEX IF NOT EXISTS idx_traffic_events_observed
  ON traffic_events (observed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_traffic_events_lat_lng
  ON traffic_events (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Link community/official reports to an underlying event (preserve provenance)
CREATE TABLE IF NOT EXISTS traffic_event_reports (
  event_id UUID NOT NULL REFERENCES traffic_events (id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_by UUID REFERENCES users (id) ON DELETE SET NULL,
  link_reason TEXT,
  PRIMARY KEY (event_id, report_id),
  CONSTRAINT traffic_event_reports_reason_len CHECK (
    link_reason IS NULL OR char_length(trim(link_reason)) BETWEEN 2 AND 500
  )
);

CREATE INDEX IF NOT EXISTS idx_traffic_event_reports_report
  ON traffic_event_reports (report_id);

-- Optional soft link from traffic_reports → event
ALTER TABLE traffic_reports
  ADD COLUMN IF NOT EXISTS traffic_event_id UUID REFERENCES traffic_events (id) ON DELETE SET NULL;

ALTER TABLE traffic_reports
  ADD COLUMN IF NOT EXISTS road_segment_id UUID REFERENCES road_segments (id) ON DELETE SET NULL;

ALTER TABLE traffic_reports
  ADD COLUMN IF NOT EXISTS direction_code traffic_direction;

CREATE INDEX IF NOT EXISTS idx_traffic_reports_event
  ON traffic_reports (traffic_event_id)
  WHERE traffic_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_traffic_reports_segment
  ON traffic_reports (road_segment_id)
  WHERE road_segment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Shared transport stops (directory); route stops can reference them
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transport_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  lga_id UUID REFERENCES lgas (id) ON DELETE SET NULL,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION
    CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  longitude DOUBLE PRECISION
    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transport_stops_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 160),
  CONSTRAINT transport_stops_coords_pair CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_transport_stops_name ON transport_stops (lower(name));
CREATE INDEX IF NOT EXISTS idx_transport_stops_active ON transport_stops (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_transport_stops_location ON transport_stops (location_id) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transport_stops_state_lga ON transport_stops (state_id, lga_id);

CREATE TABLE IF NOT EXISTS transport_stop_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id UUID NOT NULL REFERENCES transport_stops (id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT transport_stop_aliases_alias_len CHECK (char_length(trim(alias)) BETWEEN 2 AND 160)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_stop_aliases_norm
  ON transport_stop_aliases (stop_id, normalized_alias);

CREATE INDEX IF NOT EXISTS idx_transport_stop_aliases_normalized
  ON transport_stop_aliases (normalized_alias);

CREATE OR REPLACE FUNCTION transport_stop_aliases_normalize()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_alias := lower(trim(regexp_replace(COALESCE(NEW.alias, ''), '\s+', ' ', 'g')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transport_stop_aliases_normalize ON transport_stop_aliases;
CREATE TRIGGER trg_transport_stop_aliases_normalize
  BEFORE INSERT OR UPDATE OF alias ON transport_stop_aliases
  FOR EACH ROW
  EXECUTE FUNCTION transport_stop_aliases_normalize();

ALTER TABLE transport_route_stops
  ADD COLUMN IF NOT EXISTS stop_id UUID REFERENCES transport_stops (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transport_route_stops_stop
  ON transport_route_stops (stop_id)
  WHERE stop_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Fare observation conditions (not a permanent current_fare on routes)
-- ---------------------------------------------------------------------------
ALTER TABLE transport_fare_reports
  ADD COLUMN IF NOT EXISTS fare_period fare_period NOT NULL DEFAULT 'any';

ALTER TABLE transport_fare_reports
  ADD COLUMN IF NOT EXISTS condition_notes TEXT;

DO $$ BEGIN
  ALTER TABLE transport_fare_reports
    ADD CONSTRAINT transport_fare_condition_notes_len CHECK (
      condition_notes IS NULL OR char_length(trim(condition_notes)) BETWEEN 2 AND 500
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_transport_fares_period
  ON transport_fare_reports (fare_period);

COMMENT ON TABLE traffic_events IS
  'Underlying traffic situation. Individual community/official reports link via traffic_event_reports and remain provenance.';

COMMENT ON TABLE road_segments IS
  'Optional localization of a road (e.g. Chevron → Jakande). Grow incrementally; not a full national inventory.';

COMMENT ON TABLE transport_stops IS
  'Shared bus-stop / boarding-point directory. Route stops may reference these; aliases support local names.';

COMMENT ON COLUMN transport_fare_reports.fare_period IS
  'Optional condition band (peak/off-peak/weekday/weekend). Aggregates must not pretend to be a single observation.';
