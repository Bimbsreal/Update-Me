-- Official Government & Agency Updates — intelligence hardening
-- Extends 009/021/032/033. Does NOT create a second source/update system.

-- ---------------------------------------------------------------------------
-- Organizations (separate from individual feed/API sources)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS official_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT,
  agency_type official_agency_type NOT NULL DEFAULT 'other',
  jurisdiction_level official_jurisdiction_level NOT NULL DEFAULT 'national',
  state_id UUID REFERENCES states (id) ON DELETE SET NULL,
  official_website TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT official_org_code_len CHECK (char_length(trim(code)) BETWEEN 2 AND 64),
  CONSTRAINT official_org_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 200)
);

CREATE INDEX IF NOT EXISTS idx_official_orgs_active
  ON official_organizations (is_active, name);

-- ---------------------------------------------------------------------------
-- Link sources → organizations
-- ---------------------------------------------------------------------------
ALTER TABLE official_sources
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES official_organizations (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_official_sources_organization
  ON official_sources (organization_id)
  WHERE organization_id IS NOT NULL;

-- Backfill organizations from distinct source org names
INSERT INTO official_organizations (code, name, short_name, agency_type, jurisdiction_level, state_id, official_website)
SELECT DISTINCT ON (lower(trim(s.organization_name)))
  lower(regexp_replace(trim(COALESCE(s.short_name, s.organization_name)), '[^a-zA-Z0-9]+', '_', 'g')),
  trim(s.organization_name),
  s.short_name,
  s.agency_type,
  s.jurisdiction_level,
  s.state_id,
  s.official_website
FROM official_sources s
WHERE trim(s.organization_name) <> ''
ORDER BY lower(trim(s.organization_name)), s.created_at ASC
ON CONFLICT (code) DO NOTHING;

UPDATE official_sources s
SET organization_id = o.id
FROM official_organizations o
WHERE s.organization_id IS NULL
  AND lower(trim(o.name)) = lower(trim(s.organization_name));

-- ---------------------------------------------------------------------------
-- Verification statuses: suspended / retired
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE official_verification_status ADD VALUE IF NOT EXISTS 'suspended';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE official_verification_status ADD VALUE IF NOT EXISTS 'retired';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Ingestion: webhook + publication (manual is already present as manual_entry)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE official_ingestion_method ADD VALUE IF NOT EXISTS 'webhook';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE official_ingestion_method ADD VALUE IF NOT EXISTS 'official_publication';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Update priority + lifecycle timestamps + scope + traffic link
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE official_update_priority AS ENUM ('normal', 'important', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE official_scope_assessment AS ENUM (
    'in_scope',
    'needs_review',
    'out_of_scope'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS priority official_update_priority NOT NULL DEFAULT 'normal';

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS scope_assessment official_scope_assessment NOT NULL DEFAULT 'in_scope';

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS related_traffic_event_id UUID
    REFERENCES traffic_events (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_official_updates_priority
  ON official_updates (priority, published_at DESC NULLS LAST)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_official_updates_expires
  ON official_updates (expires_at)
  WHERE expires_at IS NOT NULL AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_official_updates_scope
  ON official_updates (scope_assessment, status);

CREATE INDEX IF NOT EXISTS idx_official_updates_traffic_event
  ON official_updates (related_traffic_event_id)
  WHERE related_traffic_event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Cross-source correlation (preserve provenance; no auto-merge)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS official_update_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES official_updates (id) ON DELETE CASCADE,
  related_update_id UUID NOT NULL REFERENCES official_updates (id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'related'
    CHECK (relation_type IN ('related', 'same_event', 'conflict', 'follow_up')),
  notes TEXT,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT official_corr_distinct CHECK (update_id <> related_update_id),
  CONSTRAINT official_corr_notes_len CHECK (
    notes IS NULL OR char_length(trim(notes)) BETWEEN 2 AND 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_official_corr_pair
  ON official_update_correlations (
    LEAST(update_id, related_update_id),
    GREATEST(update_id, related_update_id),
    relation_type
  );

CREATE INDEX IF NOT EXISTS idx_official_corr_update
  ON official_update_correlations (update_id);

COMMENT ON TABLE official_organizations IS
  'Government/agency organizations — distinct from individual feed/API sources.';
COMMENT ON COLUMN official_updates.priority IS
  'Admin-set operational importance. Users cannot set this.';
COMMENT ON COLUMN official_updates.scope_assessment IS
  'Update Me relevance: operational/public-service vs out-of-scope (e.g. political campaigning).';
COMMENT ON COLUMN official_updates.effective_at IS
  'When the notice becomes/became effective (distinct from published_at).';
COMMENT ON COLUMN official_updates.expires_at IS
  'When the notice ceases to be current; archived by scheduler when past.';
COMMENT ON TABLE official_update_correlations IS
  'Cross-source related notices — provenance preserved; no automatic winner.';
