-- Commodity price data model alignment (7A)
-- Reuses commodities / commodity_variants / price_places / commodity_price_reports + reports.
-- Does NOT add a mutable current_price or a second observation store.

-- ---------------------------------------------------------------------------
-- B. Commodity categories (controlled catalogue)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commodity_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT commodity_categories_code_len CHECK (char_length(trim(code)) BETWEEN 2 AND 40),
  CONSTRAINT commodity_categories_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  CONSTRAINT commodity_categories_slug_len CHECK (char_length(trim(slug)) BETWEEN 2 AND 80),
  CONSTRAINT commodity_categories_description_len CHECK (
    description IS NULL OR char_length(trim(description)) BETWEEN 2 AND 500
  )
);

CREATE INDEX IF NOT EXISTS idx_commodity_categories_active
  ON commodity_categories (is_active, sort_order, name);

INSERT INTO commodity_categories (code, name, slug, description, sort_order)
VALUES
  ('grains', 'Grains', 'grains', 'Rice, garri, maize and related staples.', 10),
  ('legumes', 'Legumes', 'legumes', 'Beans and similar pulses.', 20),
  ('tubers', 'Tubers', 'tubers', 'Yam and other tubers.', 30),
  ('cooking_ingredients', 'Cooking ingredients', 'cooking-ingredients', 'Oils, tomatoes, onions and cooking staples.', 40),
  ('proteins', 'Proteins', 'proteins', 'Eggs, chicken, beef and similar.', 50),
  ('household_essentials', 'Household essentials', 'household-essentials', 'Everyday household goods such as water.', 60),
  ('other', 'Other', 'other', 'Approved everyday commodities outside the main groups.', 90)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

ALTER TABLE commodities
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES commodity_categories (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commodities_category_id
  ON commodities (category_id)
  WHERE category_id IS NOT NULL;

-- Backfill category_id from legacy text category column (030)
UPDATE commodities c
SET category_id = cc.id,
    updated_at = NOW()
FROM commodity_categories cc
WHERE c.category_id IS NULL
  AND c.category IS NOT NULL
  AND cc.code = c.category;

-- ---------------------------------------------------------------------------
-- C. Controlled price units (do not mix units in comparisons)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'other'
    CHECK (unit_type IN ('mass', 'volume', 'count', 'package', 'measure', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT price_units_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 24),
  CONSTRAINT price_units_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  CONSTRAINT price_units_symbol_len CHECK (char_length(trim(symbol)) BETWEEN 1 AND 24)
);

CREATE INDEX IF NOT EXISTS idx_price_units_active ON price_units (is_active, name);

INSERT INTO price_units (code, name, symbol, unit_type)
VALUES
  ('kg', 'Kilogram', 'kg', 'mass'),
  ('litre', 'Litre', 'L', 'volume'),
  ('bag', 'Bag', 'bag', 'package'),
  ('tuber', 'Tuber', 'tuber', 'count'),
  ('basket', 'Basket', 'basket', 'package'),
  ('piece', 'Piece', 'piece', 'count'),
  ('egg', 'Egg', 'egg', 'count'),
  ('crate', 'Crate', 'crate', 'package'),
  ('bird', 'Whole bird', 'bird', 'count'),
  ('sachet', 'Sachet', 'sachet', 'package'),
  ('measure', 'Market measure', 'measure', 'measure'),
  ('unit', 'Unit', 'unit', 'other')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    symbol = EXCLUDED.symbol,
    unit_type = EXCLUDED.unit_type,
    updated_at = NOW();

ALTER TABLE commodity_variants
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES price_units (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_commodity_variants_unit
  ON commodity_variants (unit_id)
  WHERE unit_id IS NOT NULL;

-- Backfill unit_id from existing unit_code
UPDATE commodity_variants cv
SET unit_id = pu.id,
    updated_at = NOW()
FROM price_units pu
WHERE cv.unit_id IS NULL
  AND lower(trim(cv.unit_code)) = lower(pu.code);

-- Map any unknown unit_code to generic 'unit'
UPDATE commodity_variants cv
SET unit_id = (SELECT id FROM price_units WHERE code = 'unit' LIMIT 1),
    updated_at = NOW()
WHERE cv.unit_id IS NULL;

-- ---------------------------------------------------------------------------
-- E. Observation extras (source reference); amount already NUMERIC(14,2)
-- ---------------------------------------------------------------------------
ALTER TABLE commodity_price_reports
  ADD COLUMN IF NOT EXISTS source_reference TEXT;

DO $$ BEGIN
  ALTER TABLE commodity_price_reports
    ADD CONSTRAINT commodity_price_source_reference_len CHECK (
      source_reference IS NULL OR char_length(trim(source_reference)) BETWEEN 2 AND 240
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- W. Indexes for localized / filtered observation queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cpr_commodity_place
  ON commodity_price_reports (commodity_id, place_id)
  WHERE place_id IS NOT NULL;

-- idx_cpr_commodity_variant already covers (commodity_id, variant_id, created_at DESC) from 012

-- Support joins to reports for observed_at / location / source filters
CREATE INDEX IF NOT EXISTS idx_reports_location_occurred
  ON reports (location_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_source_moderation_status
  ON reports (source_type, moderation_state, status);

COMMENT ON TABLE commodity_price_reports IS
  'One price OBSERVATION at a point in time. Linked to reports for source/moderation/freshness. Never a mutable current_price on commodities.';

COMMENT ON COLUMN reports.occurred_at IS
  'observed_at for commodity prices — when the price was seen, not necessarily when submitted.';

COMMENT ON COLUMN reports.created_at IS
  'submitted_at for commodity prices — when the observation entered the system.';
