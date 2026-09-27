-- Operational observability: job runs + lightweight API metrics.
-- No secrets; retention-friendly indexes.

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'schedule'
    CHECK (trigger IN ('schedule', 'startup', 'manual', 'retention', 'test')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'partial', 'failed', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name_started
  ON job_runs (job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_runs_status_started
  ON job_runs (status, started_at DESC)
  WHERE status IN ('failed', 'partial');

CREATE INDEX IF NOT EXISTS idx_job_runs_started
  ON job_runs (started_at DESC);

-- Hourly request aggregates (no PII, no bodies)
CREATE TABLE IF NOT EXISTS api_metrics_hourly (
  bucket_start TIMESTAMPTZ NOT NULL,
  method TEXT NOT NULL DEFAULT '*',
  path_group TEXT NOT NULL DEFAULT '*',
  request_count INTEGER NOT NULL DEFAULT 0,
  error_4xx INTEGER NOT NULL DEFAULT 0,
  error_5xx INTEGER NOT NULL DEFAULT 0,
  slow_count INTEGER NOT NULL DEFAULT 0,
  total_duration_ms BIGINT NOT NULL DEFAULT 0,
  max_duration_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_start, method, path_group)
);

CREATE INDEX IF NOT EXISTS idx_api_metrics_hourly_bucket
  ON api_metrics_hourly (bucket_start DESC);

-- Operational alert signals (computed snapshots for admin; not push notifications)
CREATE TABLE IF NOT EXISTS operational_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  component TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_operational_signals_active
  ON operational_signals (active, severity, last_seen_at DESC)
  WHERE active = TRUE;
