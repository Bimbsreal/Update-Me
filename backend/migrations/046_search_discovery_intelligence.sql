-- Search & Discovery Intelligence
-- Extends 020. PostgreSQL-first (pg_trgm + FTS). No Elasticsearch.
-- Analytics are anonymized: no user_id on query metrics.

-- ---------------------------------------------------------------------------
-- Anonymized / aggregated search analytics (no user linkage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_query_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day DATE NOT NULL DEFAULT (CURRENT_DATE AT TIME ZONE 'Africa/Lagos'),
  normalized_query TEXT NOT NULL,
  category TEXT,
  result_count INT NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  zero_result BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms INT CHECK (latency_ms IS NULL OR latency_ms >= 0),
  had_location BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'full'
    CHECK (mode IN ('full', 'suggest')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_query_metrics_q_len CHECK (char_length(normalized_query) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_search_query_metrics_day
  ON search_query_metrics (day DESC, zero_result);

CREATE INDEX IF NOT EXISTS idx_search_query_metrics_norm
  ON search_query_metrics (normalized_query, day DESC);

CREATE INDEX IF NOT EXISTS idx_search_query_metrics_zero
  ON search_query_metrics (day DESC)
  WHERE zero_result = TRUE;

COMMENT ON TABLE search_query_metrics IS
  'Anonymized search analytics. No user_id. Used for zero-result intelligence and volume.';

-- ---------------------------------------------------------------------------
-- Domain alias seeds (controlled; admin-managed thereafter)
-- ---------------------------------------------------------------------------
INSERT INTO search_aliases (alias, canonical, category) VALUES
  ('usd', 'USD/NGN', 'fx'),
  ('usd ngn', 'USD/NGN', 'fx'),
  ('dollar', 'USD/NGN', 'fx'),
  ('dollar today', 'USD/NGN', 'fx'),
  ('gbp', 'GBP/NGN', 'fx'),
  ('gbp ngn', 'GBP/NGN', 'fx'),
  ('pound', 'GBP/NGN', 'fx'),
  ('eur', 'EUR/NGN', 'fx'),
  ('eur ngn', 'EUR/NGN', 'fx'),
  ('euro', 'EUR/NGN', 'fx'),
  ('forex', 'USD/NGN', 'fx'),
  ('exchange rate', 'USD/NGN', 'fx'),
  ('3rd mainland', 'third mainland bridge', 'places'),
  ('third mainland', 'third mainland bridge', 'places'),
  ('nnpcl', 'NNPC', 'official'),
  ('nnpc', 'NNPC', 'official'),
  ('lastma', 'LASTMA', 'official'),
  ('frsc', 'FRSC', 'official'),
  ('mudu', 'mudu', 'prices'),
  ('petrol price', 'petrol', 'fuel'),
  ('fuel near me', 'fuel', 'fuel'),
  ('ikorodu rood', 'ikorodu road', 'traffic'),
  ('lekki epe expressway', 'lekki-epe expressway', 'traffic'),
  ('l e expressway', 'lekki-epe expressway', 'traffic')
ON CONFLICT (alias) DO NOTHING;

-- Admin audit-friendly columns on search_aliases
ALTER TABLE search_aliases
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE search_aliases
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE search_aliases
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ---------------------------------------------------------------------------
-- Index health snapshot helper view (live Postgres, not a separate index)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW search_index_health AS
SELECT 'locations' AS entity, COUNT(*)::bigint AS indexed_count
  FROM locations WHERE status = 'active'
UNION ALL
SELECT 'fuel_stations', COUNT(*)::bigint FROM fuel_stations WHERE is_active = TRUE
UNION ALL
SELECT 'commodities', COUNT(*)::bigint FROM commodities WHERE is_active = TRUE
UNION ALL
SELECT 'transport_routes', COUNT(*)::bigint FROM transport_routes WHERE is_active = TRUE
UNION ALL
SELECT 'official_updates', COUNT(*)::bigint FROM official_updates WHERE status = 'published'
UNION ALL
SELECT 'search_aliases', COUNT(*)::bigint FROM search_aliases
UNION ALL
SELECT 'location_aliases', COUNT(*)::bigint FROM location_aliases
UNION ALL
SELECT 'fuel_station_aliases', COUNT(*)::bigint FROM fuel_station_aliases
UNION ALL
SELECT 'road_aliases', COUNT(*)::bigint FROM road_aliases;

COMMENT ON VIEW search_index_health IS
  'Live entity counts for Admin → Search. Architecture uses PostgreSQL queries, not a separate search index.';

-- Purge old anonymized metrics (keep 90 days) — run opportunistically from service
-- Recent searches older than 30 days cleaned from user_recent_searches in service.
