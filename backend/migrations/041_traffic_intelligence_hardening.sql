-- Traffic Intelligence & Road Conditions hardening (columns / policies / indexes)
-- Requires 040_traffic_intelligence_enums.sql committed first.
-- Additive only; historical events are preserved (expire ≠ delete).

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS confidence traffic_confidence NOT NULL DEFAULT 'medium';

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS expected_end_at TIMESTAMPTZ;

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS freshness_state TEXT NOT NULL DEFAULT 'fresh'
    CHECK (freshness_state IN ('fresh', 'aging', 'stale', 'expired', 'historical'));

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS merged_into_event_id UUID REFERENCES traffic_events (id) ON DELETE SET NULL;

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS split_from_event_id UUID REFERENCES traffic_events (id) ON DELETE SET NULL;

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS duplicate_of_event_id UUID REFERENCES traffic_events (id) ON DELETE SET NULL;

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS flagged_duplicate BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS passability traffic_passability NOT NULL DEFAULT 'unknown';

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS flood_depth_cm INT
    CHECK (flood_depth_cm IS NULL OR (flood_depth_cm >= 0 AND flood_depth_cm <= 500));

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS diversion_notes TEXT;

ALTER TABLE traffic_events
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE traffic_events
    ADD CONSTRAINT traffic_events_diversion_notes_len CHECK (
      diversion_notes IS NULL OR char_length(trim(diversion_notes)) BETWEEN 2 AND 1000
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE traffic_events
SET published_at = COALESCE(published_at, created_at)
WHERE published_at IS NULL;

UPDATE traffic_events
SET expected_end_at = COALESCE(expected_end_at, estimated_resolution_at)
WHERE expected_end_at IS NULL AND estimated_resolution_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_traffic_events_confidence_active
  ON traffic_events (confidence, status)
  WHERE status IN ('reported', 'investigating', 'confirmed', 'active', 'improving');

CREATE INDEX IF NOT EXISTS idx_traffic_events_freshness
  ON traffic_events (freshness_state, status);

CREATE INDEX IF NOT EXISTS idx_traffic_events_expires
  ON traffic_events (expires_at)
  WHERE expires_at IS NOT NULL AND status IN ('reported', 'investigating', 'confirmed', 'active', 'improving');

CREATE INDEX IF NOT EXISTS idx_traffic_events_merged_into
  ON traffic_events (merged_into_event_id)
  WHERE merged_into_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_traffic_events_flagged_dup
  ON traffic_events (flagged_duplicate)
  WHERE flagged_duplicate = TRUE;

CREATE INDEX IF NOT EXISTS idx_traffic_events_active_observed
  ON traffic_events (observed_at DESC NULLS LAST)
  WHERE status IN ('reported', 'investigating', 'confirmed', 'active', 'improving')
    AND merged_into_event_id IS NULL;

CREATE TABLE IF NOT EXISTS traffic_event_freshness_policies (
  event_type traffic_event_type PRIMARY KEY,
  fresh_minutes INT NOT NULL,
  stale_minutes INT NOT NULL,
  expire_minutes INT NOT NULL,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT traffic_freshness_order CHECK (
    fresh_minutes > 0
    AND stale_minutes >= fresh_minutes
    AND expire_minutes >= stale_minutes
  )
);

INSERT INTO traffic_event_freshness_policies (event_type, fresh_minutes, stale_minutes, expire_minutes, notes)
VALUES
  ('congestion', 20, 45, 90, 'Congestion changes quickly.'),
  ('accident', 30, 90, 180, 'Incidents linger but must not stay active indefinitely.'),
  ('vehicle_breakdown', 25, 60, 120, NULL),
  ('obstruction', 30, 90, 240, NULL),
  ('fallen_object', 30, 90, 180, NULL),
  ('fire', 20, 60, 180, NULL),
  ('flooding', 45, 180, 720, 'Flooding can persist; still expire without confirmation.'),
  ('road_damage', 120, 720, 2880, NULL),
  ('road_closure', 180, 720, 4320, 'Prefer expected_end_at when set.'),
  ('partial_closure', 120, 480, 2880, NULL),
  ('lane_restriction', 90, 360, 1440, NULL),
  ('diversion', 120, 480, 2880, 'Only official diversion notes should be shown.'),
  ('construction', 240, 1440, 10080, NULL),
  ('checkpoint', 60, 240, 720, 'Movement-relevant only; no targeting content.'),
  ('security_incident', 45, 180, 720, 'Public movement/safety only.'),
  ('bus_disruption', 45, 180, 480, NULL),
  ('route_disruption', 60, 240, 720, NULL),
  ('transport_delay', 30, 90, 240, NULL),
  ('other', 45, 120, 360, NULL)
ON CONFLICT (event_type) DO NOTHING;

ALTER TABLE traffic_reports
  ADD COLUMN IF NOT EXISTS passability traffic_passability;

ALTER TABLE traffic_reports
  ADD COLUMN IF NOT EXISTS flood_depth_cm INT
    CHECK (flood_depth_cm IS NULL OR (flood_depth_cm >= 0 AND flood_depth_cm <= 500));

ALTER TABLE traffic_reports
  ADD COLUMN IF NOT EXISTS image_storage_key TEXT;

ALTER TABLE traffic_reports
  ADD COLUMN IF NOT EXISTS image_content_type TEXT;

ALTER TABLE traffic_reports
  ADD COLUMN IF NOT EXISTS image_byte_size INT
    CHECK (image_byte_size IS NULL OR (image_byte_size > 0 AND image_byte_size <= 5242880));

COMMENT ON COLUMN traffic_events.confidence IS
  'Operational confidence band (low/medium/high) — not mathematical certainty.';
COMMENT ON COLUMN traffic_events.merged_into_event_id IS
  'When set, this event was merged into another; row retained for provenance/history.';
COMMENT ON COLUMN traffic_events.diversion_notes IS
  'Official diversion text only — never invent diversion routes.';
COMMENT ON TABLE traffic_event_freshness_policies IS
  'Per-event-type freshness windows. Closures with expected_end_at override expire_minutes.';
