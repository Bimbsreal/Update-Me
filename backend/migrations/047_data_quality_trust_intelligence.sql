-- Data Quality, Trust & Verification Intelligence
-- Extends 019. Centralized quality events + configurable validation rules.
-- No opaque trust scores. No auto-merge. No deletion of disputed data.

-- ---------------------------------------------------------------------------
-- Quality events (cross-domain ledger)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE quality_event_type AS ENUM (
    'anomaly_detected',
    'duplicate_detected',
    'conflict_detected',
    'stale',
    'expired',
    'correction_submitted',
    'verification_completed',
    'source_failure',
    'validation_failed',
    'review_opened',
    'review_resolved',
    'merge_completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quality_event_severity AS ENUM (
    'info',
    'low',
    'medium',
    'high',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quality_event_status AS ENUM (
    'open',
    'acknowledged',
    'resolved',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS quality_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type quality_event_type NOT NULL,
  severity quality_event_severity NOT NULL DEFAULT 'medium',
  status quality_event_status NOT NULL DEFAULT 'open',
  domain TEXT NOT NULL
    CHECK (char_length(trim(domain)) BETWEEN 2 AND 40),
  entity_type TEXT NOT NULL
    CHECK (char_length(trim(entity_type)) BETWEEN 2 AND 64),
  entity_id UUID,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  title TEXT NOT NULL
    CHECK (char_length(trim(title)) BETWEEN 3 AND 200),
  explanation TEXT NOT NULL
    CHECK (char_length(trim(explanation)) BETWEEN 3 AND 1000),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT NOT NULL DEFAULT 50
    CHECK (priority BETWEEN 1 AND 100),
  resolved_by UUID REFERENCES users (id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_events_open
  ON quality_events (status, priority DESC, created_at DESC)
  WHERE status IN ('open', 'acknowledged');

CREATE INDEX IF NOT EXISTS idx_quality_events_domain
  ON quality_events (domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quality_events_entity
  ON quality_events (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quality_events_type_day
  ON quality_events (event_type, created_at DESC);

COMMENT ON TABLE quality_events IS
  'Cross-domain quality ledger. Explainable events — not a trust score.';

-- ---------------------------------------------------------------------------
-- Configurable validation rules (not hard-coded only in controllers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quality_validation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE
    CHECK (char_length(trim(code)) BETWEEN 2 AND 64),
  domain TEXT NOT NULL
    CHECK (char_length(trim(domain)) BETWEEN 2 AND 40),
  name TEXT NOT NULL
    CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  severity quality_event_severity NOT NULL DEFAULT 'medium',
  rule_kind TEXT NOT NULL
    CHECK (rule_kind IN (
      'range',
      'required',
      'enum',
      'coordinate',
      'freshness',
      'duplicate',
      'custom'
    )),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_quality_rules_domain
  ON quality_validation_rules (domain, enabled);

INSERT INTO quality_validation_rules (code, domain, name, description, severity, rule_kind, config)
VALUES
  ('price_positive', 'prices', 'Price must be positive',
   'Commodity/fuel price amount must be greater than zero.', 'high', 'range',
   '{"field":"price","min":0.01,"exclusiveMin":true}'::jsonb),
  ('fuel_price_positive', 'fuel', 'Fuel price must be positive',
   'Fuel observation amount must be greater than zero.', 'high', 'range',
   '{"field":"price","min":0.01,"exclusiveMin":true}'::jsonb),
  ('fuel_price_plausible_ngn', 'fuel', 'Fuel price plausible band (NGN)',
   'Flag PMS prices outside a broad plausible NGN band for review — not auto-reject.', 'medium', 'range',
   '{"field":"price","min":100,"max":5000,"currency":"NGN","action":"flag"}'::jsonb),
  ('coordinate_valid', 'locations', 'Valid coordinates',
   'Latitude/longitude must be within Nigeria-ish operational bounds when present.', 'high', 'coordinate',
   '{"latMin":2,"latMax":15,"lngMin":2,"lngMax":15}'::jsonb),
  ('fx_pair_supported', 'fx', 'Supported FX pair',
   'Base/quote must be a known pair.', 'high', 'enum',
   '{"pairs":["USD/NGN","GBP/NGN","EUR/NGN"]}'::jsonb),
  ('fx_rate_positive', 'fx', 'FX rate positive',
   'Exchange rate must be greater than zero.', 'critical', 'range',
   '{"field":"rate","min":0.0001,"exclusiveMin":true}'::jsonb),
  ('traffic_type_required', 'traffic', 'Traffic event type required',
   'Traffic incidents require a valid event/severity type.', 'high', 'required',
   '{"fields":["severity","eventType"]}'::jsonb),
  ('official_source_verified', 'official', 'Verified official source',
   'Published updates should come from an approved/verified source.', 'critical', 'required',
   '{"fields":["sourceId","verificationStatus"]}'::jsonb),
  ('observation_time_not_future', 'all', 'Observation time not in the future',
   'Observed/published timestamps must not be far in the future.', 'high', 'custom',
   '{"maxFutureMinutes":15}'::jsonb),
  ('unit_required_for_price', 'prices', 'Unit required for price',
   'Price observations must include a unit context.', 'high', 'required',
   '{"fields":["unit","quantity"]}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Domain quality snapshot helper (live counts; not a separate index)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW quality_domain_snapshot AS
SELECT 'traffic'::text AS domain,
       COUNT(*) FILTER (WHERE r.status IN ('submitted','active','confirmed') AND (r.expires_at IS NULL OR r.expires_at > NOW()))::bigint AS current_count,
       COUNT(*) FILTER (WHERE r.status = 'stale')::bigint AS stale_count,
       COUNT(*) FILTER (WHERE r.status = 'expired')::bigint AS expired_count,
       COUNT(*) FILTER (WHERE r.moderation_state IN ('flagged','queued','in_review','escalated'))::bigint AS pending_count,
       COUNT(*) FILTER (WHERE r.status = 'flagged')::bigint AS flagged_count
FROM reports r
JOIN report_categories c ON c.id = r.category_id
WHERE c.code = 'traffic'
UNION ALL
SELECT 'fuel',
       COUNT(*) FILTER (WHERE r.status IN ('submitted','active','confirmed') AND (r.expires_at IS NULL OR r.expires_at > NOW())),
       COUNT(*) FILTER (WHERE r.status = 'stale'),
       COUNT(*) FILTER (WHERE r.status = 'expired'),
       COUNT(*) FILTER (WHERE r.moderation_state IN ('flagged','queued','in_review','escalated')),
       COUNT(*) FILTER (WHERE r.status = 'flagged')
FROM reports r
JOIN report_categories c ON c.id = r.category_id
WHERE c.code = 'fuel'
UNION ALL
SELECT 'prices',
       COUNT(*) FILTER (WHERE r.status IN ('submitted','active','confirmed') AND (r.expires_at IS NULL OR r.expires_at > NOW())),
       COUNT(*) FILTER (WHERE r.status = 'stale'),
       COUNT(*) FILTER (WHERE r.status = 'expired'),
       COUNT(*) FILTER (WHERE r.moderation_state IN ('flagged','queued','in_review','escalated')),
       COUNT(*) FILTER (WHERE r.status = 'flagged')
FROM reports r
JOIN report_categories c ON c.id = r.category_id
WHERE c.code = 'prices';

COMMENT ON VIEW quality_domain_snapshot IS
  'Live domain freshness/moderation counts for Admin → Data Quality.';
