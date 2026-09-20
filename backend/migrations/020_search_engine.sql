-- Global Search Engine: trigram matching + private recent searches + controlled aliases

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for typo-tolerant name search (limited to high-value columns)
CREATE INDEX IF NOT EXISTS idx_locations_name_trgm
  ON locations USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_fuel_stations_name_trgm
  ON fuel_stations USING gin (lower(name) gin_trgm_ops)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_transport_routes_name_trgm
  ON transport_routes USING gin (lower(COALESCE(name, '')) gin_trgm_ops)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_commodities_name_trgm
  ON commodities USING gin (lower(name) gin_trgm_ops)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_reports_title_trgm
  ON reports USING gin (lower(title) gin_trgm_ops)
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_official_updates_title_trgm
  ON official_updates USING gin (lower(title) gin_trgm_ops);

-- Controlled domain aliases (not a free synonym engine)
CREATE TABLE IF NOT EXISTS search_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT NOT NULL,
  canonical TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_aliases_alias_unique UNIQUE (alias)
);

CREATE INDEX IF NOT EXISTS idx_search_aliases_alias_trgm
  ON search_aliases USING gin (lower(alias) gin_trgm_ops);

INSERT INTO search_aliases (alias, canonical, category) VALUES
  ('pms', 'petrol', 'fuel'),
  ('ago', 'diesel', 'fuel'),
  ('l-e expressway', 'lekki-epe expressway', 'traffic'),
  ('le expressway', 'lekki-epe expressway', 'traffic'),
  ('lekki epe', 'lekki-epe expressway', 'traffic'),
  ('computer village', 'computer village', 'places'),
  ('near me', 'near me', NULL)
ON CONFLICT (alias) DO NOTHING;

-- Private recent searches (authenticated users only; short retention)
CREATE TABLE IF NOT EXISTS user_recent_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_recent_searches_query_len CHECK (char_length(query) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_user_recent_searches_user_created
  ON user_recent_searches (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_recent_searches_user_norm
  ON user_recent_searches (user_id, normalized_query);
