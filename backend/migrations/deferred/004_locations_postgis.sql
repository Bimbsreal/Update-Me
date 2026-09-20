-- Optional PostGIS enablement for locations.
-- Run only after PostGIS binaries are installed into PostgreSQL.
-- Example:
--   CREATE EXTENSION postgis;
-- Then apply this migration.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    CREATE EXTENSION IF NOT EXISTS postgis;
  ELSE
    RAISE NOTICE 'PostGIS extension is not available on this PostgreSQL install.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    ALTER TABLE locations
      ADD COLUMN IF NOT EXISTS geom geography(Point, 4326);

    UPDATE locations
    SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND geom IS NULL;

    CREATE INDEX IF NOT EXISTS idx_locations_geom
      ON locations USING GIST (geom);
  END IF;
END $$;
