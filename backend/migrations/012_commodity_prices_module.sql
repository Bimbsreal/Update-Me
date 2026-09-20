-- Commodity Prices Module
-- Catalogue + variants are reference data; price reports extend the Generic Report Engine.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Controlled commodity catalogue (extendable without UI hardcoding)
CREATE TABLE IF NOT EXISTS commodities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT commodities_code_len CHECK (char_length(trim(code)) BETWEEN 2 AND 40),
  CONSTRAINT commodities_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  CONSTRAINT commodities_slug_len CHECK (char_length(trim(slug)) BETWEEN 2 AND 80)
);

CREATE INDEX IF NOT EXISTS idx_commodities_active_sort
  ON commodities (is_active, sort_order, name);

-- Unit / variant per commodity (prices are not comparable across variants)
CREATE TABLE IF NOT EXISTS commodity_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commodity_id UUID NOT NULL REFERENCES commodities (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  quantity NUMERIC(12, 3),
  unit_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT commodity_variants_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT commodity_variants_label_len CHECK (char_length(trim(label)) BETWEEN 1 AND 80),
  CONSTRAINT commodity_variants_unit_len CHECK (char_length(trim(unit_code)) BETWEEN 1 AND 24),
  CONSTRAINT commodity_variants_display_len CHECK (char_length(trim(display_name)) BETWEEN 1 AND 120),
  CONSTRAINT commodity_variants_qty_positive CHECK (quantity IS NULL OR quantity > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commodity_variants_code
  ON commodity_variants (commodity_id, lower(code))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_commodity_variants_commodity
  ON commodity_variants (commodity_id, sort_order);

-- Lightweight place of observation (not a business directory)
CREATE TABLE IF NOT EXISTS price_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  place_type TEXT NOT NULL DEFAULT 'market'
    CHECK (place_type IN ('market', 'supermarket', 'shop', 'trading_area', 'neighbourhood', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT price_places_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 160)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_price_places_name_location
  ON price_places (location_id, lower(trim(name)))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_price_places_location ON price_places (location_id);

-- Commodity price reports linked to Generic Report Engine
CREATE TABLE IF NOT EXISTS commodity_price_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL UNIQUE REFERENCES reports (id) ON DELETE CASCADE,
  commodity_id UUID NOT NULL REFERENCES commodities (id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES commodity_variants (id) ON DELETE RESTRICT,
  place_id UUID REFERENCES price_places (id) ON DELETE SET NULL,
  place_label TEXT,

  price_amount NUMERIC(14, 2) NOT NULL
    CHECK (price_amount > 0),
  price_currency CHAR(3) NOT NULL DEFAULT 'NGN'
    CHECK (price_currency ~ '^[A-Z]{3}$'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT commodity_price_place_label_len CHECK (
    place_label IS NULL OR char_length(trim(place_label)) BETWEEN 2 AND 160
  )
);

CREATE INDEX IF NOT EXISTS idx_cpr_commodity ON commodity_price_reports (commodity_id);
CREATE INDEX IF NOT EXISTS idx_cpr_variant ON commodity_price_reports (variant_id);
CREATE INDEX IF NOT EXISTS idx_cpr_place ON commodity_price_reports (place_id);
CREATE INDEX IF NOT EXISTS idx_cpr_created ON commodity_price_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpr_commodity_variant
  ON commodity_price_reports (commodity_id, variant_id, created_at DESC);

-- Prices move slower than fuel/traffic; keep daily TTL from 005, note policy
UPDATE category_freshness_policies p
SET default_ttl_minutes = 1440,
    stale_after_minutes = 720,
    notes = 'Commodity prices change through the day/week — policy used by generic report freshness engine.',
    updated_at = NOW()
FROM report_categories c
WHERE c.id = p.category_id
  AND c.code = 'prices';

-- Seed initial everyday commodities
INSERT INTO commodities (code, name, slug, sort_order)
VALUES
  ('rice', 'Rice', 'rice', 10),
  ('beans', 'Beans', 'beans', 20),
  ('garri', 'Garri', 'garri', 30),
  ('yam', 'Yam', 'yam', 40),
  ('vegetable_oil', 'Vegetable Oil', 'vegetable-oil', 50),
  ('eggs', 'Eggs', 'eggs', 60),
  ('tomato', 'Tomato', 'tomato', 70),
  ('onion', 'Onion', 'onion', 80),
  ('chicken', 'Chicken', 'chicken', 90),
  ('beef', 'Beef', 'beef', 100),
  ('water', 'Water', 'water', 110)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- Seed variants
INSERT INTO commodity_variants (commodity_id, code, label, quantity, unit_code, display_name, sort_order)
SELECT c.id, v.code, v.label, v.quantity, v.unit_code, v.display_name, v.sort_order
FROM (
  VALUES
    ('rice', '1kg', '1 kg', 1, 'kg', '1 kg', 10),
    ('rice', '5kg', '5 kg', 5, 'kg', '5 kg', 20),
    ('rice', '25kg', '25 kg', 25, 'kg', '25 kg', 30),
    ('beans', '1kg', '1 kg', 1, 'kg', '1 kg', 10),
    ('beans', '5kg', '5 kg', 5, 'kg', '5 kg', 20),
    ('garri', '1kg', '1 kg', 1, 'kg', '1 kg', 10),
    ('garri', 'paint', 'Paint measure', 1, 'measure', 'Paint measure', 20),
    ('yam', 'tuber', '1 tuber', 1, 'tuber', '1 tuber', 10),
    ('yam', '3tubers', '3 tubers', 3, 'tuber', '3 tubers', 20),
    ('vegetable_oil', '1l', '1 litre', 1, 'litre', '1 litre', 10),
    ('vegetable_oil', '5l', '5 litres', 5, 'litre', '5 litres', 20),
    ('eggs', '1egg', '1 egg', 1, 'egg', '1 egg', 10),
    ('eggs', 'crate', 'Crate', 30, 'crate', 'Crate', 20),
    ('tomato', '1kg', '1 kg', 1, 'kg', '1 kg', 10),
    ('tomato', 'basket', 'Basket', 1, 'basket', 'Basket', 20),
    ('onion', '1kg', '1 kg', 1, 'kg', '1 kg', 10),
    ('onion', 'basket', 'Basket', 1, 'basket', 'Basket', 20),
    ('chicken', '1kg', '1 kg', 1, 'kg', '1 kg', 10),
    ('chicken', 'whole', 'Whole chicken', 1, 'bird', 'Whole chicken', 20),
    ('beef', '1kg', '1 kg', 1, 'kg', '1 kg', 10),
    ('water', 'sachet', 'Sachet', 1, 'sachet', 'Sachet', 10),
    ('water', '1.5l', '1.5 litre bottle', 1.5, 'litre', '1.5 litre bottle', 20)
) AS v(commodity_code, code, label, quantity, unit_code, display_name, sort_order)
JOIN commodities c ON c.code = v.commodity_code
WHERE NOT EXISTS (
  SELECT 1 FROM commodity_variants cv
  WHERE cv.commodity_id = c.id AND lower(cv.code) = lower(v.code) AND cv.is_active = TRUE
);
