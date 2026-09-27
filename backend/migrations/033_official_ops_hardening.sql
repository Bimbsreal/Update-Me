-- Official ops hardening (columns, areas, indexes) — runs after 032 enum commit.
-- Extends 009 + 021 — does not create a second source/update system.

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS entry_origin TEXT NOT NULL DEFAULT 'ingested'
    CHECK (entry_origin IN ('ingested', 'admin_manual'));

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS title_normalized TEXT;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE official_updates
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

UPDATE official_updates
SET received_at = retrieved_at
WHERE received_at IS NULL;

ALTER TABLE official_updates
  ALTER COLUMN received_at SET DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE official_updates
    ADD CONSTRAINT official_updates_review_notes_len CHECK (
      review_notes IS NULL OR char_length(trim(review_notes)) BETWEEN 2 AND 1000
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Status/retrieved index (safe; does not hard-code new enum labels in predicates)
CREATE INDEX IF NOT EXISTS idx_official_updates_status_retrieved
  ON official_updates (status, retrieved_at DESC);

CREATE INDEX IF NOT EXISTS idx_official_updates_title_norm
  ON official_updates (source_id, title_normalized)
  WHERE title_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_official_updates_entry_origin
  ON official_updates (entry_origin, status);

UPDATE official_updates
SET title_normalized = lower(regexp_replace(trim(title), '\s+', ' ', 'g'))
WHERE title_normalized IS NULL;

CREATE TABLE IF NOT EXISTS official_update_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES official_updates (id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations (id) ON DELETE CASCADE,
  state_id UUID REFERENCES states (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'affected'
    CHECK (role IN ('primary', 'affected', 'route', 'region')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT official_update_areas_geo_present CHECK (
    location_id IS NOT NULL OR state_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_official_update_areas_loc
  ON official_update_areas (update_id, location_id)
  WHERE location_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_official_update_areas_state
  ON official_update_areas (update_id, state_id)
  WHERE state_id IS NOT NULL AND location_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_official_update_areas_location
  ON official_update_areas (location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_official_update_areas_state
  ON official_update_areas (state_id)
  WHERE state_id IS NOT NULL;

INSERT INTO official_update_areas (update_id, location_id, state_id, role)
SELECT id, location_id, CASE WHEN location_id IS NULL THEN state_id ELSE NULL END, 'primary'
FROM official_updates
WHERE location_id IS NOT NULL OR state_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON TABLE official_update_areas IS
  'Additional affected geographic references for an official update. Primary location may also live on official_updates.location_id.';

COMMENT ON COLUMN official_updates.entry_origin IS
  'ingested = machine sync; admin_manual = staff-entered official-source information (not freeform news).';

COMMENT ON COLUMN official_updates.received_at IS
  'When Update Me received/imported the update (distinct from source published_at).';
