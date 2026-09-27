-- Commodity Price Intelligence
-- Extends commodities / commodity_price_reports / price_places.
-- Does NOT create a second price engine or touch fuel_* tables.

-- ---------------------------------------------------------------------------
-- Pricing context (retail ≠ wholesale ≠ market ≠ supermarket)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE commodity_pricing_context AS ENUM (
    'retail',
    'wholesale',
    'market',
    'supermarket',
    'local_seller',
    'official_publication',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE commodity_price_reports
  ADD COLUMN IF NOT EXISTS pricing_context commodity_pricing_context NOT NULL DEFAULT 'retail';

ALTER TABLE commodity_price_reports
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE commodity_price_reports
  ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cpr_pricing_context
  ON commodity_price_reports (pricing_context);

CREATE INDEX IF NOT EXISTS idx_cpr_effective
  ON commodity_price_reports (effective_at DESC NULLS LAST);

COMMENT ON COLUMN commodity_price_reports.pricing_context IS
  'Supply-chain / retail context — do not compare wholesale with retail as equivalent.';
COMMENT ON COLUMN commodity_price_reports.published_at IS
  'Source publication time when known (distinct from observed_at / effective_at).';
COMMENT ON COLUMN commodity_price_reports.effective_at IS
  'When the price becomes/became effective, if published separately from observation.';

-- ---------------------------------------------------------------------------
-- Expand place types for roadside / wholesale outlets
-- ---------------------------------------------------------------------------
ALTER TABLE price_places DROP CONSTRAINT IF EXISTS price_places_place_type_check;
ALTER TABLE price_places
  ADD CONSTRAINT price_places_place_type_check
  CHECK (place_type IN (
    'market',
    'supermarket',
    'shop',
    'trading_area',
    'neighbourhood',
    'roadside',
    'wholesale_outlet',
    'other'
  ));

-- ---------------------------------------------------------------------------
-- Market alias normalization (prevents "Balogun" vs "Balogun Market" drift)
-- ---------------------------------------------------------------------------
ALTER TABLE price_place_aliases
  ADD COLUMN IF NOT EXISTS normalized_alias TEXT;

UPDATE price_place_aliases
SET normalized_alias = lower(trim(regexp_replace(COALESCE(alias, ''), '\s+', ' ', 'g')))
WHERE normalized_alias IS NULL OR trim(normalized_alias) = '';

ALTER TABLE price_place_aliases
  ALTER COLUMN normalized_alias SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_price_place_aliases_norm
  ON price_place_aliases (place_id, normalized_alias);

CREATE INDEX IF NOT EXISTS idx_price_place_aliases_normalized
  ON price_place_aliases (normalized_alias);

CREATE OR REPLACE FUNCTION price_place_aliases_normalize()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_alias := lower(trim(regexp_replace(COALESCE(NEW.alias, ''), '\s+', ' ', 'g')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_price_place_aliases_normalize ON price_place_aliases;
CREATE TRIGGER trg_price_place_aliases_normalize
  BEFORE INSERT OR UPDATE OF alias ON price_place_aliases
  FOR EACH ROW EXECUTE FUNCTION price_place_aliases_normalize();

-- ---------------------------------------------------------------------------
-- Market merge audit (review workflow; no auto-delete)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_place_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_place_id UUID NOT NULL REFERENCES price_places (id) ON DELETE CASCADE,
  merged_place_id UUID NOT NULL REFERENCES price_places (id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  reports_moved INT NOT NULL DEFAULT 0,
  aliases_moved INT NOT NULL DEFAULT 0,
  merged_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT price_place_merges_distinct CHECK (survivor_place_id <> merged_place_id),
  CONSTRAINT price_place_merges_reason_len CHECK (char_length(trim(reason)) BETWEEN 3 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_price_place_merges_survivor
  ON price_place_merges (survivor_place_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Seed staple categories/commodities if missing (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO commodity_categories (code, name, slug, sort_order)
VALUES
  ('grains', 'Grains', 'grains', 10),
  ('legumes', 'Legumes', 'legumes', 20),
  ('tubers', 'Tubers', 'tubers', 30),
  ('staples', 'Staples', 'staples', 35),
  ('cooking_ingredients', 'Cooking ingredients', 'cooking-ingredients', 40),
  ('proteins', 'Proteins', 'proteins', 50),
  ('household_essentials', 'Household essentials', 'household-essentials', 60),
  ('other', 'Other', 'other', 90)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    sort_order = EXCLUDED.sort_order;

INSERT INTO price_units (code, name, symbol, unit_type)
VALUES
  ('kg', 'Kilogram', 'kg', 'mass'),
  ('g', 'Gram', 'g', 'mass'),
  ('litre', 'Litre', 'L', 'volume'),
  ('ml', 'Millilitre', 'ml', 'volume'),
  ('bag', 'Bag', 'bag', 'package'),
  ('basket', 'Basket', 'basket', 'package'),
  ('tuber', 'Tuber', 'tuber', 'count'),
  ('bunch', 'Bunch', 'bunch', 'count'),
  ('pack', 'Pack', 'pack', 'package'),
  ('carton', 'Carton', 'carton', 'package'),
  ('bottle', 'Bottle', 'bottle', 'package'),
  ('unit', 'Unit', 'unit', 'count')
ON CONFLICT (code) DO NOTHING;
