-- Location reference-data hardening
-- Provenance, normalized names, import batches, integrity helpers.
-- Does not invent geographic entities.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS normalized_name TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS source_name TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS source_type TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS source_url TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS source_external_id TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS import_batch_id UUID;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Coordinate sanity (public place coords only — not private user GPS)
DO $$ BEGIN
  ALTER TABLE locations
    ADD CONSTRAINT locations_lat_range
    CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE locations
    ADD CONSTRAINT locations_lng_range
    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE locations
SET normalized_name = lower(trim(regexp_replace(name, '\s+', ' ', 'g')))
WHERE normalized_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_locations_normalized_name
  ON locations (normalized_name);

CREATE INDEX IF NOT EXISTS idx_locations_status_active
  ON locations (type, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_locations_import_batch
  ON locations (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_source_external
  ON locations (source_type, source_external_id)
  WHERE source_external_id IS NOT NULL;

-- Duplicate detection aid for hierarchical place types under the same parent
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_parent_type_normalized
  ON locations (parent_id, type, normalized_name)
  WHERE parent_id IS NOT NULL
    AND type IN ('lga', 'city', 'area')
    AND status IN ('active', 'draft')
    AND normalized_name IS NOT NULL;

-- Hierarchy activity indexes
CREATE INDEX IF NOT EXISTS idx_states_active ON states (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_lgas_state_active ON lgas (state_id) WHERE TRUE;
CREATE INDEX IF NOT EXISTS idx_areas_lga ON areas (lga_id);

-- Import / seed batch audit (reference data only — not community content)
CREATE TABLE IF NOT EXISTS reference_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'reference_dataset',
  source_url TEXT,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'failed', 'dry_run')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  imported_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reference_import_batches_dataset
  ON reference_import_batches (dataset_key, started_at DESC);

-- Keep normalized_name in sync
CREATE OR REPLACE FUNCTION locations_set_normalized_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_name := lower(trim(regexp_replace(COALESCE(NEW.name, ''), '\s+', ' ', 'g')));
  NEW.updated_at := NOW();
  IF NEW.status = 'inactive' AND (OLD.status IS DISTINCT FROM 'inactive') THEN
    NEW.deactivated_at := COALESCE(NEW.deactivated_at, NOW());
  END IF;
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    NEW.deactivated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_locations_normalized_name ON locations;
CREATE TRIGGER trg_locations_normalized_name
  BEFORE INSERT OR UPDATE OF name, status ON locations
  FOR EACH ROW
  EXECUTE FUNCTION locations_set_normalized_name();
