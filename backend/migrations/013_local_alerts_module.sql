-- Local Safety & Road Alerts Module
-- Extends Generic Report Engine (reports) — does not create a second reporting system.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE alert_category AS ENUM (
    'road_incident',
    'flooding',
    'fire',
    'accident',
    'security_incident',
    'road_blockage',
    'dangerous_road_condition',
    'public_safety_advisory',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM (
    'informational',
    'caution',
    'urgent',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS local_alert_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL UNIQUE REFERENCES reports (id) ON DELETE CASCADE,

  alert_category alert_category NOT NULL DEFAULT 'other',
  severity alert_severity NOT NULL DEFAULT 'caution',

  road_id UUID REFERENCES roads (id) ON DELETE SET NULL,
  road_name TEXT,
  affected_area TEXT,
  cause TEXT,
  landmark_label TEXT,

  -- Optional soft link to a related traffic report (no automatic traffic claims)
  related_traffic_report_id UUID REFERENCES traffic_reports (id) ON DELETE SET NULL,

  -- Optional association for duplicate/same-incident grouping (foundation)
  event_group_id UUID REFERENCES report_event_groups (id) ON DELETE SET NULL,

  requires_review BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT local_alerts_road_name_len CHECK (
    road_name IS NULL OR char_length(trim(road_name)) BETWEEN 2 AND 160
  ),
  CONSTRAINT local_alerts_affected_area_len CHECK (
    affected_area IS NULL OR char_length(trim(affected_area)) BETWEEN 2 AND 240
  ),
  CONSTRAINT local_alerts_cause_len CHECK (
    cause IS NULL OR char_length(trim(cause)) BETWEEN 2 AND 160
  ),
  CONSTRAINT local_alerts_landmark_len CHECK (
    landmark_label IS NULL OR char_length(trim(landmark_label)) BETWEEN 2 AND 160
  )
);

CREATE INDEX IF NOT EXISTS idx_local_alerts_category ON local_alert_reports (alert_category);
CREATE INDEX IF NOT EXISTS idx_local_alerts_severity ON local_alert_reports (severity);
CREATE INDEX IF NOT EXISTS idx_local_alerts_road_id ON local_alert_reports (road_id);
CREATE INDEX IF NOT EXISTS idx_local_alerts_road_name ON local_alert_reports (lower(road_name));
CREATE INDEX IF NOT EXISTS idx_local_alerts_related_traffic ON local_alert_reports (related_traffic_report_id);
CREATE INDEX IF NOT EXISTS idx_local_alerts_event_group ON local_alert_reports (event_group_id);
CREATE INDEX IF NOT EXISTS idx_local_alerts_created ON local_alert_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_alerts_requires_review
  ON local_alert_reports (requires_review)
  WHERE requires_review = TRUE;

-- Safety information becomes obsolete quickly
UPDATE category_freshness_policies p
SET default_ttl_minutes = 360,
    stale_after_minutes = 90,
    notes = 'Local safety alerts change quickly — shorter freshness than commodity prices. Stronger moderation hooks apply.',
    updated_at = NOW()
FROM report_categories c
WHERE c.id = p.category_id
  AND c.code = 'local_alerts';

UPDATE report_categories
SET description = 'Local safety and road alerts that people may need to know quickly',
    updated_at = NOW()
WHERE code = 'local_alerts';
