-- Generic Report Engine foundation
-- Category-agnostic reports with confirmations, flags, history, and duplicate grouping.
-- Does NOT implement category-specific business logic.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Controlled taxonomy (extensible without rewriting the report engine)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_freshness_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL UNIQUE REFERENCES report_categories (id) ON DELETE CASCADE,
  default_ttl_minutes INT NOT NULL DEFAULT 1440
    CHECK (default_ttl_minutes > 0),
  stale_after_minutes INT NOT NULL DEFAULT 360
    CHECK (stale_after_minutes > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE report_source_type AS ENUM ('community', 'official', 'aggregated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM (
    'submitted',
    'active',
    'confirmed',
    'stale',
    'expired',
    'flagged',
    'under_review',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_visibility AS ENUM ('public', 'area', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_moderation_state AS ENUM (
    'none',
    'flagged',
    'queued',
    'in_review',
    'cleared',
    'actioned'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE confirmation_type AS ENUM (
    'still_accurate',
    'no_longer_accurate',
    'needs_correction'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE flag_reason AS ENUM (
    'inaccurate',
    'duplicate',
    'inappropriate',
    'misleading',
    'spam',
    'unsafe',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_history_type AS ENUM (
    'created',
    'updated',
    'status_changed',
    'confirmed',
    'corrected',
    'flagged',
    'moderated',
    'expired',
    'linked_duplicate',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Duplicate / event grouping foundation (no auto-merge)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_event_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES report_categories (id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  title TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_event_groups_category
  ON report_event_groups (category_id);
CREATE INDEX IF NOT EXISTS idx_report_event_groups_location
  ON report_event_groups (location_id);

-- ---------------------------------------------------------------------------
-- Core reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES report_categories (id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  event_group_id UUID REFERENCES report_event_groups (id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT NOT NULL,

  source_type report_source_type NOT NULL DEFAULT 'community',
  status report_status NOT NULL DEFAULT 'submitted',
  visibility report_visibility NOT NULL DEFAULT 'public',
  moderation_state report_moderation_state NOT NULL DEFAULT 'none',

  -- Optional approximate public coordinates (never copy private user coords automatically)
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_confirmed_at TIMESTAMPTZ,
  confirmed_accurate_count INT NOT NULL DEFAULT 0 CHECK (confirmed_accurate_count >= 0),
  confirmed_inaccurate_count INT NOT NULL DEFAULT 0 CHECK (confirmed_inaccurate_count >= 0),
  flag_count INT NOT NULL DEFAULT 0 CHECK (flag_count >= 0),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reports_title_len CHECK (char_length(trim(title)) BETWEEN 3 AND 120),
  CONSTRAINT reports_description_len CHECK (char_length(trim(description)) BETWEEN 5 AND 4000),
  CONSTRAINT reports_coords_pair CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL
        AND latitude BETWEEN -90 AND 90
        AND longitude BETWEEN -180 AND 180)
  ),
  -- Community users cannot create official/aggregated rows via app path;
  -- DB still allows official for future trusted writers.
  CONSTRAINT reports_official_not_community_spoof CHECK (
    source_type <> 'official' OR moderation_state IN ('none', 'cleared', 'actioned', 'queued', 'in_review', 'flagged')
  )
);

CREATE INDEX IF NOT EXISTS idx_reports_location ON reports (location_id);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports (category_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_source_type ON reports (source_type);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_expires_at ON reports (expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_event_group ON reports (event_group_id);
CREATE INDEX IF NOT EXISTS idx_reports_lat_lng ON reports (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_list
  ON reports (status, category_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Confirmations (verification, not social likes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  confirmation_type confirmation_type NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_confirmations_report
  ON report_confirmations (report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_confirmations_user
  ON report_confirmations (user_id);

-- ---------------------------------------------------------------------------
-- Flags → moderation hooks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason flag_reason NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (report_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_flags_report ON report_flags (report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_flags_open ON report_flags (status)
  WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- Auditable history (ordinary users cannot delete)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  event_type report_history_type NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_history_report
  ON report_history (report_id, created_at DESC);

-- Explicit deny path for future: no public DELETE endpoint; retain rows forever.

-- ---------------------------------------------------------------------------
-- Seed categories + default freshness policies (rules are placeholders)
-- ---------------------------------------------------------------------------
INSERT INTO report_categories (code, name, description, sort_order) VALUES
  ('traffic', 'Traffic', 'Road congestion and traffic conditions', 10),
  ('fuel', 'Fuel', 'Fuel availability and pricing signals', 20),
  ('transport', 'Transport', 'Public and shared transport updates', 30),
  ('prices', 'Prices', 'Everyday commodity and market prices', 40),
  ('road_conditions', 'Road Conditions', 'Road surface and passability updates', 50),
  ('local_alerts', 'Local Alerts', 'Local utility alerts and notices', 60),
  ('directions', 'Directions', 'Route and directions-related tips', 70),
  ('other', 'Other', 'Other approved utility information', 80)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

INSERT INTO category_freshness_policies (category_id, default_ttl_minutes, stale_after_minutes, notes)
SELECT c.id,
  CASE c.code
    WHEN 'traffic' THEN 180
    WHEN 'fuel' THEN 720
    WHEN 'transport' THEN 360
    WHEN 'prices' THEN 1440
    WHEN 'road_conditions' THEN 720
    WHEN 'local_alerts' THEN 480
    WHEN 'directions' THEN 1440
    ELSE 1440
  END,
  CASE c.code
    WHEN 'traffic' THEN 60
    WHEN 'fuel' THEN 240
    WHEN 'transport' THEN 120
    WHEN 'prices' THEN 720
    WHEN 'road_conditions' THEN 240
    WHEN 'local_alerts' THEN 120
    WHEN 'directions' THEN 720
    ELSE 360
  END,
  'Default policy placeholders — category business logic not implemented yet.'
FROM report_categories c
ON CONFLICT (category_id) DO UPDATE
SET default_ttl_minutes = EXCLUDED.default_ttl_minutes,
    stale_after_minutes = EXCLUDED.stale_after_minutes,
    notes = EXCLUDED.notes,
    updated_at = NOW();
