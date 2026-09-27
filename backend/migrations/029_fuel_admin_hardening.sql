/**
 * Fuel admin hardening: station lifecycle + aliases for search.
 * Does not alter historical fuel_reports / reports.
 */

DO $$ BEGIN
  CREATE TYPE fuel_station_lifecycle AS ENUM (
    'active',
    'temporarily_inactive',
    'permanently_inactive',
    'pending_verification'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE fuel_stations
  ADD COLUMN IF NOT EXISTS lifecycle_status fuel_station_lifecycle;

UPDATE fuel_stations
SET lifecycle_status = CASE
  WHEN is_active = TRUE THEN 'active'::fuel_station_lifecycle
  ELSE 'temporarily_inactive'::fuel_station_lifecycle
END
WHERE lifecycle_status IS NULL;

ALTER TABLE fuel_stations
  ALTER COLUMN lifecycle_status SET DEFAULT 'active'::fuel_station_lifecycle;

ALTER TABLE fuel_stations
  ALTER COLUMN lifecycle_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fuel_stations_lifecycle
  ON fuel_stations (lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_fuel_stations_location_lifecycle
  ON fuel_stations (location_id, lifecycle_status);

CREATE TABLE IF NOT EXISTS fuel_station_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES fuel_stations (id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fuel_station_aliases_alias_len CHECK (char_length(trim(alias)) BETWEEN 2 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_station_aliases_station_norm
  ON fuel_station_aliases (station_id, normalized_alias);

CREATE INDEX IF NOT EXISTS idx_fuel_station_aliases_normalized
  ON fuel_station_aliases (normalized_alias);

CREATE OR REPLACE FUNCTION fuel_station_aliases_normalize()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_alias := lower(trim(regexp_replace(COALESCE(NEW.alias, ''), '\s+', ' ', 'g')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fuel_station_aliases_normalize ON fuel_station_aliases;
CREATE TRIGGER trg_fuel_station_aliases_normalize
  BEFORE INSERT OR UPDATE OF alias ON fuel_station_aliases
  FOR EACH ROW
  EXECUTE FUNCTION fuel_station_aliases_normalize();

-- Keep is_active aligned with lifecycle for public list filters.
CREATE OR REPLACE FUNCTION fuel_stations_sync_is_active()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lifecycle_status IS NOT NULL THEN
    NEW.is_active := (NEW.lifecycle_status IN ('active', 'pending_verification'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fuel_stations_sync_is_active ON fuel_stations;
CREATE TRIGGER trg_fuel_stations_sync_is_active
  BEFORE INSERT OR UPDATE OF lifecycle_status ON fuel_stations
  FOR EACH ROW
  EXECUTE FUNCTION fuel_stations_sync_is_active();

CREATE INDEX IF NOT EXISTS idx_fuel_reports_station_type_created
  ON fuel_reports (station_id, fuel_type, created_at DESC);
