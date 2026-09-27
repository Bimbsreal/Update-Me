-- Analytics, Monitoring & Operational Intelligence
-- Aggregates existing ops/search/DQ/notification data. No invasive profiling.
-- Product analytics are aggregate-only (no per-user behavioral profiles).

-- ---------------------------------------------------------------------------
-- Daily feature usage (anonymous path-group counters)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_usage_daily (
  day DATE NOT NULL,
  feature TEXT NOT NULL
    CHECK (char_length(trim(feature)) BETWEEN 2 AND 40),
  hit_count INT NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  unique_sessions INT NOT NULL DEFAULT 0 CHECK (unique_sessions >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, feature)
);

CREATE INDEX IF NOT EXISTS idx_feature_usage_daily_day
  ON feature_usage_daily (day DESC);

COMMENT ON TABLE feature_usage_daily IS
  'Aggregate feature hits from API path groups. No user IDs. Not a behavioral profile.';

-- ---------------------------------------------------------------------------
-- Application error groups (redacted, no payloads/secrets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_error_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE
    CHECK (char_length(trim(fingerprint)) BETWEEN 8 AND 120),
  error_type TEXT NOT NULL DEFAULT 'Error',
  message_sample TEXT NOT NULL
    CHECK (char_length(trim(message_sample)) BETWEEN 1 AND 400),
  endpoint TEXT,
  feature TEXT,
  status_code INT,
  occurrence_count INT NOT NULL DEFAULT 1 CHECK (occurrence_count >= 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_request_id TEXT,
  environment TEXT NOT NULL DEFAULT 'development',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_app_error_groups_last
  ON app_error_groups (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_groups_feature
  ON app_error_groups (feature, last_seen_at DESC);

COMMENT ON TABLE app_error_groups IS
  'Grouped application errors. Secrets redacted. No request bodies.';

-- ---------------------------------------------------------------------------
-- Operational alert cooldown / notification state
-- ---------------------------------------------------------------------------
ALTER TABLE operational_signals
  ADD COLUMN IF NOT EXISTS last_alerted_at TIMESTAMPTZ;

ALTER TABLE operational_signals
  ADD COLUMN IF NOT EXISTS alert_count INT NOT NULL DEFAULT 0;

ALTER TABLE operational_signals
  ADD COLUMN IF NOT EXISTS cooldown_minutes INT NOT NULL DEFAULT 30
    CHECK (cooldown_minutes BETWEEN 5 AND 1440);

COMMENT ON COLUMN operational_signals.last_alerted_at IS
  'When an outbound ops alert was last emitted for this signal (cooldown dedupe).';

-- ---------------------------------------------------------------------------
-- Lightweight user activity day markers (aggregate DAU only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_activity_daily (
  day DATE NOT NULL,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (day, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_daily_day
  ON user_activity_daily (day DESC);

COMMENT ON TABLE user_activity_daily IS
  'Presence-only markers for DAU/WAU/MAU. No paths, searches, or coordinates.';

-- Retention helper note: purge user_activity_daily > 90d, feature_usage > 180d,
-- app_error_groups inactive > 60d via ops retention job.
