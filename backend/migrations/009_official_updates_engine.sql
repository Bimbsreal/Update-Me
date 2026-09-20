-- Government Official Updates Engine
-- Separate information layer from community reports (Generic Report Engine).
-- Pipeline: Approved Source → Fetch → Validate → Normalize → Deduplicate → Store → Display

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE official_agency_type AS ENUM (
    'federal',
    'state',
    'local',
    'parastatal',
    'regulator',
    'emergency',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE official_ingestion_method AS ENUM (
    'api',
    'rss',
    'atom',
    'structured_feed',
    'web_publication',
    'fixture'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE official_source_status AS ENUM (
    'draft',
    'approved',
    'active',
    'disabled',
    'suspended'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE official_verification_status AS ENUM (
    'unverified',
    'pending',
    'verified',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE official_update_status AS ENUM (
    'published',
    'archived',
    'withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE official_update_category AS ENUM (
    'road_traffic',
    'fuel_petroleum',
    'financial_economic',
    'public_safety',
    'transport',
    'public_services',
    'weather_emergency',
    'infrastructure',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE official_jurisdiction_level AS ENUM (
    'national',
    'state',
    'lga',
    'city',
    'area',
    'location_specific'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE official_sync_status AS ENUM (
    'success',
    'partial',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Explicitly approved official sources only (never auto-discovered)
CREATE TABLE IF NOT EXISTS official_sources (
  id TEXT PRIMARY KEY,
  organization_name TEXT NOT NULL,
  short_name TEXT,
  agency_type official_agency_type NOT NULL DEFAULT 'other',
  jurisdiction_level official_jurisdiction_level NOT NULL DEFAULT 'national',
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  official_website TEXT,
  feed_url TEXT,
  ingestion_method official_ingestion_method NOT NULL,
  provider_key TEXT NOT NULL,
  status official_source_status NOT NULL DEFAULT 'draft',
  verification_status official_verification_status NOT NULL DEFAULT 'unverified',
  sync_interval_minutes INT NOT NULL DEFAULT 360
    CHECK (sync_interval_minutes BETWEEN 5 AND 10080),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  consecutive_failures INT NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error_message TEXT,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT official_sources_org_name_len CHECK (char_length(trim(organization_name)) BETWEEN 2 AND 200),
  CONSTRAINT official_sources_provider_key_len CHECK (char_length(trim(provider_key)) BETWEEN 2 AND 64),
  CONSTRAINT official_sources_active_must_be_verified CHECK (
    status NOT IN ('active', 'approved')
    OR verification_status = 'verified'
  )
);

CREATE INDEX IF NOT EXISTS idx_official_sources_status ON official_sources (status);
CREATE INDEX IF NOT EXISTS idx_official_sources_verification ON official_sources (verification_status);
CREATE INDEX IF NOT EXISTS idx_official_sources_provider ON official_sources (provider_key);
CREATE INDEX IF NOT EXISTS idx_official_sources_method ON official_sources (ingestion_method);
CREATE INDEX IF NOT EXISTS idx_official_sources_state ON official_sources (state_id);
CREATE INDEX IF NOT EXISTS idx_official_sources_sync_due
  ON official_sources (status, last_attempt_at, sync_interval_minutes);

-- Official updates (not community reports)
CREATE TABLE IF NOT EXISTS official_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL REFERENCES official_sources (id) ON DELETE RESTRICT,
  external_id TEXT,
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  original_url TEXT,
  category official_update_category NOT NULL DEFAULT 'other',
  jurisdiction_level official_jurisdiction_level NOT NULL DEFAULT 'national',
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  status official_update_status NOT NULL DEFAULT 'published',
  image_url TEXT,
  published_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT official_updates_title_len CHECK (char_length(trim(title)) BETWEEN 3 AND 300),
  CONSTRAINT official_updates_summary_len CHECK (
    summary IS NULL OR char_length(trim(summary)) BETWEEN 1 AND 2000
  ),
  CONSTRAINT official_updates_body_len CHECK (
    body IS NULL OR char_length(body) <= 20000
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_official_updates_source_dedupe
  ON official_updates (source_id, dedupe_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_official_updates_source_external
  ON official_updates (source_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_official_updates_published ON official_updates (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_official_updates_retrieved ON official_updates (retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_official_updates_category ON official_updates (category);
CREATE INDEX IF NOT EXISTS idx_official_updates_source ON official_updates (source_id);
CREATE INDEX IF NOT EXISTS idx_official_updates_status ON official_updates (status);
CREATE INDEX IF NOT EXISTS idx_official_updates_jurisdiction ON official_updates (jurisdiction_level);
CREATE INDEX IF NOT EXISTS idx_official_updates_state ON official_updates (state_id);
CREATE INDEX IF NOT EXISTS idx_official_updates_location ON official_updates (location_id);
CREATE INDEX IF NOT EXISTS idx_official_updates_list
  ON official_updates (status, published_at DESC NULLS LAST, retrieved_at DESC);

-- Synchronization run log
CREATE TABLE IF NOT EXISTS official_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL REFERENCES official_sources (id) ON DELETE CASCADE,
  status official_sync_status NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  retrieved_count INT NOT NULL DEFAULT 0 CHECK (retrieved_count >= 0),
  added_count INT NOT NULL DEFAULT 0 CHECK (added_count >= 0),
  updated_count INT NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  skipped_count INT NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_official_sync_runs_source ON official_sync_runs (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_official_sync_runs_status ON official_sync_runs (status, started_at DESC);

-- Seed only explicitly approved local-dev fixture sources (not live scrapers)
INSERT INTO official_sources (
  id, organization_name, short_name, agency_type, jurisdiction_level,
  official_website, feed_url, ingestion_method, provider_key,
  status, verification_status, sync_interval_minutes, config, notes, verified_at
) VALUES
(
  'fixture_frsc',
  'Federal Road Safety Corps',
  'FRSC',
  'federal',
  'national',
  'https://frsc.gov.ng/',
  'fixture://frsc',
  'fixture',
  'fixture',
  'active',
  'verified',
  180,
  '{"fixtureKey":"frsc"}'::jsonb,
  'Local development fixture source for road/traffic advisories. Not a live scrape.',
  NOW()
),
(
  'fixture_nmdpra',
  'Nigeria Midstream and Downstream Petroleum Regulatory Authority',
  'NMDPRA',
  'regulator',
  'national',
  'https://www.nmdpra.gov.ng/',
  'fixture://nmdpra',
  'fixture',
  'fixture',
  'active',
  'verified',
  360,
  '{"fixtureKey":"nmdpra"}'::jsonb,
  'Local development fixture source for fuel/petroleum notices. Not a live scrape.',
  NOW()
),
(
  'fixture_lastma',
  'Lagos State Traffic Management Authority',
  'LASTMA',
  'state',
  'state',
  'https://lastma.lagosstate.gov.ng/',
  'fixture://lastma',
  'fixture',
  'fixture',
  'active',
  'verified',
  120,
  '{"fixtureKey":"lastma","stateCode":"LA"}'::jsonb,
  'Local development fixture source for Lagos traffic advisories. Not a live scrape.',
  NOW()
)
ON CONFLICT (id) DO NOTHING;
