-- Foreign Exchange (FX) Engine
-- Dedicated subsystem — NOT part of the Generic Community Report Engine.
-- Pipeline: Source → Fetch → Validate → Normalize → Store → Display

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE fx_rate_type AS ENUM (
    'official_reference',
    'market_indicative'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fx_sync_status AS ENUM (
    'success',
    'partial',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Registered FX data sources (official and external). Credentials stay in env, not here.
CREATE TABLE IF NOT EXISTS fx_sources (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  rate_type fx_rate_type NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  website_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fx_sources_display_name_len CHECK (char_length(trim(display_name)) BETWEEN 2 AND 120),
  CONSTRAINT fx_sources_provider_key_len CHECK (char_length(trim(provider_key)) BETWEEN 2 AND 64)
);

CREATE INDEX IF NOT EXISTS idx_fx_sources_provider ON fx_sources (provider_key);
CREATE INDEX IF NOT EXISTS idx_fx_sources_active ON fx_sources (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fx_sources_rate_type ON fx_sources (rate_type);

-- Historical + current FX observations (append-oriented; upserts guarded by unique keys)
CREATE TABLE IF NOT EXISTS fx_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL REFERENCES fx_sources (id) ON DELETE RESTRICT,
  base_currency CHAR(3) NOT NULL,
  quote_currency CHAR(3) NOT NULL,
  rate NUMERIC(18, 6) NOT NULL CHECK (rate > 0),
  rate_type fx_rate_type NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_date DATE NOT NULL,
  raw_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fx_observations_currency_codes CHECK (
    base_currency ~ '^[A-Z]{3}$' AND quote_currency ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT fx_observations_pair_distinct CHECK (base_currency <> quote_currency)
);

-- Prevent duplicate daily observations for the same source/pair/type/date
CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_obs_source_pair_type_date
  ON fx_observations (source_id, base_currency, quote_currency, rate_type, effective_date);

-- Prevent identical re-ingest of the same observation instant
CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_obs_source_pair_type_observed
  ON fx_observations (source_id, base_currency, quote_currency, rate_type, observed_at);

CREATE INDEX IF NOT EXISTS idx_fx_obs_pair ON fx_observations (base_currency, quote_currency);
CREATE INDEX IF NOT EXISTS idx_fx_obs_pair_date ON fx_observations (base_currency, quote_currency, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_fx_obs_source ON fx_observations (source_id);
CREATE INDEX IF NOT EXISTS idx_fx_obs_observed ON fx_observations (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fx_obs_fetched ON fx_observations (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_fx_obs_rate_type ON fx_observations (rate_type);
CREATE INDEX IF NOT EXISTS idx_fx_obs_latest_lookup
  ON fx_observations (base_currency, quote_currency, rate_type, observed_at DESC);

-- Synchronization run log (admin foundation)
CREATE TABLE IF NOT EXISTS fx_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT NOT NULL,
  source_id TEXT REFERENCES fx_sources (id) ON DELETE SET NULL,
  status fx_sync_status NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  observations_upserted INT NOT NULL DEFAULT 0 CHECK (observations_upserted >= 0),
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fx_sync_runs_started ON fx_sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fx_sync_runs_provider ON fx_sync_runs (provider_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fx_sync_runs_status ON fx_sync_runs (status, started_at DESC);

-- Per-provider sync state summary (last success / failures)
CREATE TABLE IF NOT EXISTS fx_sync_state (
  provider_key TEXT PRIMARY KEY,
  source_id TEXT REFERENCES fx_sources (id) ON DELETE SET NULL,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_status fx_sync_status,
  consecutive_failures INT NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed known sources (CBN reserved for verified official feeds only)
INSERT INTO fx_sources (id, display_name, provider_key, rate_type, is_active, website_url, notes)
VALUES
  (
    'open_er_api',
    'External market data provider',
    'open_er_api',
    'market_indicative',
    TRUE,
    'https://www.exchangerate-api.com/docs/free',
    'Indicative market rates via Open Exchange Rate API (and dated CDN snapshots for history). Not a CBN official rate.'
  ),
  (
    'frankfurter',
    'External market data (Frankfurter / ECB reference)',
    'frankfurter',
    'market_indicative',
    FALSE,
    'https://www.frankfurter.app/',
    'Optional ECB-derived provider. Disabled by default because NGN coverage is unreliable.'
  ),
  (
    'cbn',
    'Central Bank of Nigeria (CBN)',
    'cbn',
    'official_reference',
    FALSE,
    'https://www.cbn.gov.ng/',
    'Placeholder for a verified CBN official/reference feed. Disabled until a trusted fetch path is configured.'
  )
ON CONFLICT (id) DO NOTHING;
