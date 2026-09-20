-- Traffic Information Module
-- Extends Generic Report Engine (reports) — does not create a second reporting system.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE traffic_severity AS ENUM (
    'clear',
    'light',
    'moderate',
    'heavy',
    'standstill',
    'blocked',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE traffic_cause AS ENUM (
    'accident',
    'roadworks',
    'flooding',
    'vehicle_breakdown',
    'security_incident',
    'event',
    'construction',
    'lane_closure',
    'unknown',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS traffic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL UNIQUE REFERENCES reports (id) ON DELETE CASCADE,

  severity traffic_severity NOT NULL DEFAULT 'unknown',
  cause traffic_cause,

  road_id UUID REFERENCES roads (id) ON DELETE SET NULL,
  road_name TEXT,

  direction_label TEXT,
  from_location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  toward_location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  from_label TEXT,
  toward_label TEXT,
  affected_section TEXT,
  estimated_delay_minutes INT
    CHECK (estimated_delay_minutes IS NULL OR estimated_delay_minutes BETWEEN 0 AND 720),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT traffic_reports_road_context CHECK (
    road_name IS NULL OR char_length(trim(road_name)) BETWEEN 2 AND 160
  ),
  CONSTRAINT traffic_reports_direction_len CHECK (
    direction_label IS NULL OR char_length(trim(direction_label)) BETWEEN 2 AND 160
  ),
  CONSTRAINT traffic_reports_section_len CHECK (
    affected_section IS NULL OR char_length(trim(affected_section)) BETWEEN 2 AND 240
  )
);

CREATE INDEX IF NOT EXISTS idx_traffic_reports_severity ON traffic_reports (severity);
CREATE INDEX IF NOT EXISTS idx_traffic_reports_cause ON traffic_reports (cause);
CREATE INDEX IF NOT EXISTS idx_traffic_reports_road_id ON traffic_reports (road_id);
CREATE INDEX IF NOT EXISTS idx_traffic_reports_road_name ON traffic_reports (lower(road_name));
CREATE INDEX IF NOT EXISTS idx_traffic_reports_from_loc ON traffic_reports (from_location_id);
CREATE INDEX IF NOT EXISTS idx_traffic_reports_toward_loc ON traffic_reports (toward_location_id);
CREATE INDEX IF NOT EXISTS idx_traffic_reports_created ON traffic_reports (created_at DESC);

-- Ensure traffic category freshness stays relatively short (policy-driven, not UI-hardcoded)
UPDATE category_freshness_policies p
SET default_ttl_minutes = 180,
    stale_after_minutes = 60,
    notes = 'Traffic changes quickly — policy used by generic report freshness engine.',
    updated_at = NOW()
FROM report_categories c
WHERE c.id = p.category_id
  AND c.code = 'traffic';
