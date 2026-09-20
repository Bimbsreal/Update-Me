-- Data Quality, Freshness & Trust Engine
-- Extends category_freshness_policies with transparent freshness bands.
-- Adds cached corroboration_count on reports (independent reporters only).
-- Does NOT invent a truth score. Does NOT weaken official vs community.

-- ---------------------------------------------------------------------------
-- Policy bands: fresh → recent → aging → stale (status) → expired (status/TTL)
-- Existing default_ttl_minutes and stale_after_minutes are preserved.
-- ---------------------------------------------------------------------------
ALTER TABLE category_freshness_policies
  ADD COLUMN IF NOT EXISTS fresh_within_minutes INT,
  ADD COLUMN IF NOT EXISTS recent_within_minutes INT,
  ADD COLUMN IF NOT EXISTS corroboration_window_minutes INT;

-- Backfill bands from existing stale_after / ttl (category-aware defaults).
UPDATE category_freshness_policies p
SET
  fresh_within_minutes = COALESCE(
    p.fresh_within_minutes,
    GREATEST(5, LEAST(p.stale_after_minutes / 4, p.stale_after_minutes - 1))
  ),
  recent_within_minutes = COALESCE(
    p.recent_within_minutes,
    GREATEST(
      GREATEST(5, LEAST(p.stale_after_minutes / 4, p.stale_after_minutes - 1)) + 1,
      LEAST(p.stale_after_minutes / 2, p.stale_after_minutes - 1)
    )
  ),
  corroboration_window_minutes = COALESCE(
    p.corroboration_window_minutes,
    GREATEST(p.stale_after_minutes, LEAST(p.default_ttl_minutes, p.stale_after_minutes * 2))
  ),
  updated_at = NOW()
WHERE p.fresh_within_minutes IS NULL
   OR p.recent_within_minutes IS NULL
   OR p.corroboration_window_minutes IS NULL;

-- Category-specific overrides (preserve module TTLs; only set band widths).
UPDATE category_freshness_policies p
SET
  fresh_within_minutes = v.fresh_m,
  recent_within_minutes = v.recent_m,
  corroboration_window_minutes = v.corr_m,
  notes = COALESCE(v.notes, p.notes),
  updated_at = NOW()
FROM (
  SELECT c.id AS category_id, v.fresh_m, v.recent_m, v.corr_m, v.notes
  FROM report_categories c
  JOIN (
    VALUES
      ('traffic',      15,  30,  90,  'Traffic: short freshness bands; corroboration ~1.5h.'),
      ('fuel',         30,  60, 240,  'Fuel: same-day usefulness; corroboration 4h.'),
      ('transport',    30,  60, 240,  'Transport fares: moderate freshness.'),
      ('prices',       180, 360, 1440, 'Commodity prices: longer freshness window.'),
      ('local_alerts', 20,  45, 180,  'Safety alerts: shorter freshness.'),
      ('directions',   360, 1440, 2880, 'Local knowledge: longer usefulness.'),
      ('road_conditions', 60, 120, 480, 'Road conditions: medium freshness.'),
      ('other',        60, 180, 720,  'Generic category default bands.')
  ) AS v(code, fresh_m, recent_m, corr_m, notes) ON v.code = c.code
) v
WHERE p.category_id = v.category_id;

ALTER TABLE category_freshness_policies
  ALTER COLUMN fresh_within_minutes SET DEFAULT 60,
  ALTER COLUMN recent_within_minutes SET DEFAULT 180,
  ALTER COLUMN corroboration_window_minutes SET DEFAULT 360;

-- Ensure NOT NULL after backfill
UPDATE category_freshness_policies
SET fresh_within_minutes = 60
WHERE fresh_within_minutes IS NULL;
UPDATE category_freshness_policies
SET recent_within_minutes = 180
WHERE recent_within_minutes IS NULL;
UPDATE category_freshness_policies
SET corroboration_window_minutes = 360
WHERE corroboration_window_minutes IS NULL;

ALTER TABLE category_freshness_policies
  ALTER COLUMN fresh_within_minutes SET NOT NULL,
  ALTER COLUMN recent_within_minutes SET NOT NULL,
  ALTER COLUMN corroboration_window_minutes SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE category_freshness_policies
    ADD CONSTRAINT category_freshness_policies_bands_check
    CHECK (
      fresh_within_minutes > 0
      AND recent_within_minutes > 0
      AND corroboration_window_minutes > 0
      AND fresh_within_minutes <= recent_within_minutes
      AND recent_within_minutes <= stale_after_minutes
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Report quality cache (corroboration = independent reporters, not truth)
-- ---------------------------------------------------------------------------
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS corroboration_count INT NOT NULL DEFAULT 1
    CHECK (corroboration_count >= 0),
  ADD COLUMN IF NOT EXISTS quality_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reports_quality_status_expires
  ON reports (status, expires_at)
  WHERE status IN ('submitted', 'active', 'confirmed', 'stale');

CREATE INDEX IF NOT EXISTS idx_reports_corroboration_lookup
  ON reports (category_id, location_id, status, occurred_at DESC)
  WHERE status IN ('submitted', 'active', 'confirmed', 'stale')
    AND visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_reports_quality_updated
  ON reports (quality_updated_at)
  WHERE quality_updated_at IS NOT NULL;

COMMENT ON COLUMN reports.corroboration_count IS
  'Count of independent reporters (distinct user_id) describing a related situation. Not a truth score.';
COMMENT ON COLUMN reports.quality_updated_at IS
  'When freshness/corroboration metadata was last recalculated by the quality engine.';
COMMENT ON COLUMN category_freshness_policies.fresh_within_minutes IS
  'Age below this → freshness state fresh.';
COMMENT ON COLUMN category_freshness_policies.recent_within_minutes IS
  'Age below this → recent; between recent and stale_after → aging.';
COMMENT ON COLUMN category_freshness_policies.corroboration_window_minutes IS
  'Time window for counting related independent reports.';
