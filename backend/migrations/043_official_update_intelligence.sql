-- Official Updates Intelligence — update types, provenance, revisions, taxonomy expansion.
-- Non-destructive: ADD VALUE / ADD COLUMN / CREATE TABLE IF NOT EXISTS only.

-- ---------------------------------------------------------------------------
-- Verification: deprecated (alias of retired for admin UX; both supported)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE official_verification_status ADD VALUE IF NOT EXISTS 'deprecated';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Priority: critical (operational criteria; not sensational)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE official_update_priority ADD VALUE IF NOT EXISTS 'critical';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Categories (configurable via enum + config; not hard-coded in UI alone)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE official_update_category ADD VALUE IF NOT EXISTS 'education';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE official_update_category ADD VALUE IF NOT EXISTS 'health';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE official_update_category ADD VALUE IF NOT EXISTS 'agriculture';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE official_update_category ADD VALUE IF NOT EXISTS 'environment';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE official_update_category ADD VALUE IF NOT EXISTS 'regulation';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE official_update_category ADD VALUE IF NOT EXISTS 'consumer_information';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Update type (do not auto-label ordinary content as alert)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE official_update_type AS ENUM (
    'announcement',
    'advisory',
    'alert',
    'notice',
    'policy_regulatory',
    'service_update',
    'event',
    'closure',
    'warning',
    'public_information'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS update_type official_update_type NOT NULL DEFAULT 'public_information';

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS original_title TEXT;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS original_body TEXT;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS revises_update_id UUID
    REFERENCES official_updates (id) ON DELETE SET NULL;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'ready'
    CHECK (processing_status IN (
      'ingested',
      'pending_review',
      'ready',
      'published',
      'rejected',
      'flagged',
      'expired'
    ));

CREATE INDEX IF NOT EXISTS idx_official_updates_type
  ON official_updates (update_type, published_at DESC NULLS LAST)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_official_updates_revises
  ON official_updates (revises_update_id)
  WHERE revises_update_id IS NOT NULL;

-- Backfill provenance from existing rows (do not invent content)
UPDATE official_updates
SET original_title = title
WHERE original_title IS NULL;

UPDATE official_updates
SET original_body = COALESCE(body, summary)
WHERE original_body IS NULL AND (body IS NOT NULL OR summary IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Revision history (never erase originals)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS official_update_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES official_updates (id) ON DELETE CASCADE,
  revision_number INT NOT NULL DEFAULT 1 CHECK (revision_number >= 1),
  title TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  original_url TEXT,
  published_at TIMESTAMPTZ,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT official_rev_title_len CHECK (char_length(trim(title)) BETWEEN 3 AND 300),
  CONSTRAINT official_rev_reason_len CHECK (
    change_reason IS NULL OR char_length(trim(change_reason)) BETWEEN 2 AND 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_official_update_revision_num
  ON official_update_revisions (update_id, revision_number);

CREATE INDEX IF NOT EXISTS idx_official_update_revisions_update
  ON official_update_revisions (update_id, created_at DESC);

COMMENT ON COLUMN official_updates.update_type IS
  'Operational notice type. Ordinary notices default to public_information — never auto-escalate to alert.';
COMMENT ON COLUMN official_updates.original_title IS
  'Immutable source title captured at ingestion; Update Me summary must not replace this.';
COMMENT ON COLUMN official_updates.revises_update_id IS
  'Points to the prior version when an agency revises an announcement.';
COMMENT ON TABLE official_update_revisions IS
  'Historical snapshots of official updates; originals are retained.';
