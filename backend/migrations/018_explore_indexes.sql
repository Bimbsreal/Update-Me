-- Explore performance helpers (Haversine / lat-lng based; PostGIS remains deferred)
-- Does not reset the database. Additive indexes only.

CREATE INDEX IF NOT EXISTS idx_reports_public_geo_active
  ON reports (created_at DESC)
  WHERE visibility = 'public'
    AND status IN ('submitted', 'active', 'confirmed', 'stale')
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_category_status_created
  ON reports (category_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_stations_location_active
  ON fuel_stations (location_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_questions_location_status_created
  ON questions (location_id, status, created_at DESC)
  WHERE status IN ('open', 'answered');

CREATE INDEX IF NOT EXISTS idx_official_updates_published_loc
  ON official_updates (location_id, published_at DESC NULLS LAST)
  WHERE status = 'published';

COMMENT ON INDEX idx_reports_public_geo_active IS
  'Supports Explore nearby queries over public reports with coordinates.';
