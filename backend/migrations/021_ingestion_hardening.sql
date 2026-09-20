-- Production Data Ingestion hardening
-- Extends Official Updates Engine — no second source system.

DO $$ BEGIN
  CREATE TYPE official_source_health AS ENUM (
    'healthy',
    'warning',
    'failing',
    'disabled',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE official_sources
  ADD COLUMN IF NOT EXISTS health_status official_source_health NOT NULL DEFAULT 'unknown';

ALTER TABLE official_sources
  ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_official_updates_content_hash
  ON official_updates (source_id, content_hash)
  WHERE content_hash IS NOT NULL;

ALTER TABLE official_sync_runs
  ADD COLUMN IF NOT EXISTS rejected_count INT NOT NULL DEFAULT 0
    CHECK (rejected_count >= 0);

ALTER TABLE official_sync_runs
  ADD COLUMN IF NOT EXISTS trigger_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_official_sync_runs_started
  ON official_sync_runs (started_at DESC);

-- Backfill health from existing counters
UPDATE official_sources SET
  health_status = CASE
    WHEN status IN ('disabled', 'suspended', 'draft') THEN 'disabled'::official_source_health
    WHEN consecutive_failures = 0 AND last_success_at IS NOT NULL THEN 'healthy'::official_source_health
    WHEN consecutive_failures BETWEEN 1 AND 2 THEN 'warning'::official_source_health
    WHEN consecutive_failures >= 3 THEN 'failing'::official_source_health
    ELSE 'unknown'::official_source_health
  END
WHERE health_status = 'unknown';
