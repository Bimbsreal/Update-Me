-- Directions & Local Navigation Information Module
-- Reuses transport corridors + Generic Report Engine (category: directions).
-- Does not invent turn-by-turn routes or travel times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE direction_travel_mode AS ENUM (
    'driving',
    'public_transport',
    'walking'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Community local-knowledge reports (extension of Generic Report Engine)
CREATE TABLE IF NOT EXISTS direction_local_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL UNIQUE REFERENCES reports (id) ON DELETE CASCADE,

  origin_location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  destination_location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  travel_mode direction_travel_mode,

  -- Optional soft links (never duplicate transport/traffic records)
  transport_route_id UUID REFERENCES transport_routes (id) ON DELETE SET NULL,

  major_roads TEXT,
  landmarks TEXT,
  boarding_hint TEXT,
  instruction_summary TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT direction_lk_distinct_ends CHECK (
    origin_location_id <> destination_location_id
  ),
  CONSTRAINT direction_lk_instruction_len CHECK (
    char_length(trim(instruction_summary)) BETWEEN 3 AND 4000
  ),
  CONSTRAINT direction_lk_roads_len CHECK (
    major_roads IS NULL OR char_length(trim(major_roads)) BETWEEN 2 AND 400
  ),
  CONSTRAINT direction_lk_landmarks_len CHECK (
    landmarks IS NULL OR char_length(trim(landmarks)) BETWEEN 2 AND 400
  ),
  CONSTRAINT direction_lk_boarding_len CHECK (
    boarding_hint IS NULL OR char_length(trim(boarding_hint)) BETWEEN 2 AND 240
  )
);

CREATE INDEX IF NOT EXISTS idx_direction_lk_origin ON direction_local_knowledge (origin_location_id);
CREATE INDEX IF NOT EXISTS idx_direction_lk_destination ON direction_local_knowledge (destination_location_id);
CREATE INDEX IF NOT EXISTS idx_direction_lk_pair
  ON direction_local_knowledge (origin_location_id, destination_location_id);
CREATE INDEX IF NOT EXISTS idx_direction_lk_mode ON direction_local_knowledge (travel_mode);
CREATE INDEX IF NOT EXISTS idx_direction_lk_transport ON direction_local_knowledge (transport_route_id);
CREATE INDEX IF NOT EXISTS idx_direction_lk_created ON direction_local_knowledge (created_at DESC);

-- Freshness: local knowledge stays useful longer than traffic/alerts
UPDATE category_freshness_policies p
SET default_ttl_minutes = 10080,
    stale_after_minutes = 2880,
    notes = 'Community local directions/knowledge — slower TTL than traffic; still freshness-aware.',
    updated_at = NOW()
FROM report_categories c
WHERE c.id = p.category_id
  AND c.code = 'directions';

UPDATE report_categories
SET description = 'Local directions and route knowledge tips',
    updated_at = NOW()
WHERE code = 'directions';
