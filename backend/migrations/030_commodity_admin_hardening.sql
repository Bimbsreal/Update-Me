-- Commodity admin hardening: category/description on catalogue; market aliases.
-- Extends 012_commodity_prices_module — does not create a parallel price system.

ALTER TABLE commodities
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

DO $$ BEGIN
  ALTER TABLE commodities
    ADD CONSTRAINT commodities_category_len CHECK (
      category IS NULL OR char_length(trim(category)) BETWEEN 2 AND 40
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE commodities
    ADD CONSTRAINT commodities_description_len CHECK (
      description IS NULL OR char_length(trim(description)) BETWEEN 2 AND 500
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_commodities_category
  ON commodities (category)
  WHERE category IS NOT NULL;

-- Lightweight market aliases (not a business directory)
CREATE TABLE IF NOT EXISTS price_place_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES price_places (id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT price_place_aliases_alias_len CHECK (
    char_length(trim(alias)) BETWEEN 2 AND 160
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_price_place_aliases_lower
  ON price_place_aliases (place_id, lower(trim(alias)));

CREATE INDEX IF NOT EXISTS idx_price_place_aliases_place
  ON price_place_aliases (place_id);

-- Seed categories for existing catalogue (admin-editable thereafter)
UPDATE commodities SET category = v.category, updated_at = NOW()
FROM (
  VALUES
    ('rice', 'grains'),
    ('beans', 'legumes'),
    ('garri', 'grains'),
    ('yam', 'tubers'),
    ('vegetable_oil', 'cooking_ingredients'),
    ('eggs', 'proteins'),
    ('tomato', 'cooking_ingredients'),
    ('onion', 'cooking_ingredients'),
    ('chicken', 'proteins'),
    ('beef', 'proteins'),
    ('water', 'household_essentials')
) AS v(code, category)
WHERE commodities.code = v.code
  AND commodities.category IS NULL;
