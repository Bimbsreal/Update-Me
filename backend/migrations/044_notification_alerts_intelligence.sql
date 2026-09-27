-- Notifications & Personal Alerts Intelligence
-- Extends 016. Non-destructive. ONE centralized notification system.
-- Push/email channels reserved; Web Push works only when VAPID is configured.

-- ---------------------------------------------------------------------------
-- Categories & priorities
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE notification_category ADD VALUE IF NOT EXISTS 'fx';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_category ADD VALUE IF NOT EXISTS 'system';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_priority ADD VALUE IF NOT EXISTS 'low';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_priority ADD VALUE IF NOT EXISTS 'critical';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Notification delivery / lifecycle columns
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'delivered'
    CHECK (status IN (
      'generated',
      'queued',
      'sent',
      'delivered',
      'failed',
      'read',
      'expired',
      'suppressed',
      'archived'
    ));

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS template_key TEXT;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE notifications
SET delivered_at = COALESCE(delivered_at, created_at)
WHERE delivered_at IS NULL AND status = 'delivered';

CREATE INDEX IF NOT EXISTS idx_notifications_status
  ON notifications (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Preference extensions (channels, frequency, quiet hours, timezone)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE notification_frequency AS ENUM (
    'immediate',
    'digest',
    'daily_summary',
    'off'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS frequency notification_frequency NOT NULL DEFAULT 'immediate';

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS channels TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[];

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_start_minute INT
    CHECK (quiet_start_minute IS NULL OR (quiet_start_minute >= 0 AND quiet_start_minute < 1440));

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_end_minute INT
    CHECK (quiet_end_minute IS NULL OR (quiet_end_minute >= 0 AND quiet_end_minute < 1440));

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Lagos';

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS critical_overrides_quiet BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN user_notification_preferences.channels IS
  'Allowed delivery channels for this category. Secrets never stored here.';
COMMENT ON COLUMN user_notification_preferences.quiet_start_minute IS
  'Minutes from local midnight. Quiet hours use user timezone.';

-- ---------------------------------------------------------------------------
-- Global alert rule defaults (admin-managed; does not overwrite user prefs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  category notification_category NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority notification_priority NOT NULL DEFAULT 'normal',
  cooldown_minutes INT NOT NULL DEFAULT 30 CHECK (cooldown_minutes BETWEEN 0 AND 10080),
  ttl_hours INT NOT NULL DEFAULT 24 CHECK (ttl_hours BETWEEN 1 AND 720),
  min_severity TEXT,
  eligible_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_key TEXT,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alert_rule_code_len CHECK (char_length(trim(code)) BETWEEN 2 AND 64),
  CONSTRAINT alert_rule_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_category
  ON notification_alert_rules (category, enabled);

-- ---------------------------------------------------------------------------
-- User personal alert subscriptions (price / FX / traffic / official)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_alert_kind AS ENUM (
    'traffic_area',
    'traffic_road',
    'fuel_price',
    'commodity_price',
    'fx_rate',
    'official_category',
    'official_source'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind user_alert_kind NOT NULL,
  category notification_category NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  location_id UUID REFERENCES locations (id) ON DELETE CASCADE,
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  road_name TEXT,
  source_id TEXT,
  official_category TEXT,
  commodity_code TEXT,
  commodity_variant TEXT,
  fuel_type TEXT,
  fx_base TEXT,
  fx_quote TEXT,
  threshold_value NUMERIC(18, 6),
  threshold_direction TEXT
    CHECK (threshold_direction IS NULL OR threshold_direction IN ('above', 'below', 'crosses', 'any_change')),
  frequency notification_frequency NOT NULL DEFAULT 'immediate',
  cooldown_minutes INT NOT NULL DEFAULT 30 CHECK (cooldown_minutes BETWEEN 0 AND 10080),
  last_triggered_at TIMESTAMPTZ,
  last_trigger_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_alert_road_len CHECK (
    road_name IS NULL OR char_length(trim(road_name)) BETWEEN 2 AND 120
  )
);

CREATE INDEX IF NOT EXISTS idx_user_alerts_user
  ON user_alert_subscriptions (user_id, enabled);

CREATE INDEX IF NOT EXISTS idx_user_alerts_kind
  ON user_alert_subscriptions (kind, enabled);

CREATE INDEX IF NOT EXISTS idx_user_alerts_location
  ON user_alert_subscriptions (location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_alerts_fx
  ON user_alert_subscriptions (fx_base, fx_quote)
  WHERE kind = 'fx_rate';

CREATE INDEX IF NOT EXISTS idx_user_alerts_commodity
  ON user_alert_subscriptions (commodity_code, commodity_variant)
  WHERE kind = 'commodity_price';

-- ---------------------------------------------------------------------------
-- Cooldown / suppression ledger (per user + event fingerprint)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_cooldowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  category notification_category NOT NULL,
  last_priority notification_priority NOT NULL DEFAULT 'normal',
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  suppress_until TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_notif_cooldowns_until
  ON notification_cooldowns (suppress_until);

-- ---------------------------------------------------------------------------
-- Delivery attempts (history for troubleshooting; no provider secrets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications (id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'suppressed', 'expired_sub')),
  attempt INT NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  error_code TEXT,
  error_message TEXT,
  provider_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_error_len CHECK (
    error_message IS NULL OR char_length(trim(error_message)) <= 500
  )
);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_user
  ON notification_deliveries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_notification
  ON notification_deliveries (notification_id);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_status
  ON notification_deliveries (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Web Push subscriptions (device-specific; endpoint unique)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  device_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (endpoint),
  CONSTRAINT push_endpoint_len CHECK (char_length(trim(endpoint)) BETWEEN 8 AND 2048),
  CONSTRAINT push_key_len CHECK (
    char_length(trim(p256dh)) BETWEEN 8 AND 255
    AND char_length(trim(auth)) BETWEEN 8 AND 255
  )
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON push_subscriptions (user_id, is_active);

COMMENT ON TABLE notification_alert_rules IS
  'Admin-managed default alert behaviour. Does not silently overwrite user preferences.';
COMMENT ON TABLE user_alert_subscriptions IS
  'User-defined monitoring rules (thresholds, locations, agencies). Private.';
COMMENT ON TABLE push_subscriptions IS
  'Device-specific Web Push endpoints. Keys are not secrets for others; never log them.';
COMMENT ON TABLE notification_deliveries IS
  'Delivery attempt history. Never store provider credentials.';
