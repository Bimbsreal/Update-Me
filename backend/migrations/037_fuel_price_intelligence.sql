-- Fuel Price Intelligence
-- Extends fuel_stations / fuel_reports / report engine.
-- Does NOT create a second price, moderation, or location system.

-- ---------------------------------------------------------------------------
-- Pricing context (retail pump ≠ ex-depot ≠ wholesale)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE fuel_pricing_context AS ENUM (
    'retail_pump',
    'ex_depot',
    'wholesale',
    'marketer_guidance',
    'official_publication',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Fuel products catalogue (controlled; codes align with fuel_product_type)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuel_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  abbreviation TEXT,
  description TEXT,
  default_unit TEXT NOT NULL DEFAULT 'litre'
    CHECK (default_unit IN ('litre', 'kg', 'cylinder')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fuel_products_code_len CHECK (char_length(trim(code)) BETWEEN 2 AND 20),
  CONSTRAINT fuel_products_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  CONSTRAINT fuel_products_abbr_len CHECK (
    abbreviation IS NULL OR char_length(trim(abbreviation)) BETWEEN 1 AND 20
  )
);

CREATE INDEX IF NOT EXISTS idx_fuel_products_active
  ON fuel_products (is_active, sort_order)
  WHERE is_active = TRUE;

INSERT INTO fuel_products (code, name, abbreviation, description, default_unit, sort_order)
VALUES
  ('pms', 'Petrol', 'PMS', 'Premium Motor Spirit (petrol)', 'litre', 10),
  ('ago', 'Diesel', 'AGO', 'Automotive Gas Oil (diesel)', 'litre', 20),
  ('dpk', 'Kerosene', 'DPK', 'Dual Purpose Kerosene', 'litre', 30),
  ('lpg', 'Cooking Gas', 'LPG', 'Liquefied Petroleum Gas', 'kg', 40)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    abbreviation = EXCLUDED.abbreviation,
    description = EXCLUDED.description,
    default_unit = EXCLUDED.default_unit,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Brands / marketers (controlled) + aliases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuel_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_independent BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fuel_brands_code_len CHECK (char_length(trim(code)) BETWEEN 2 AND 40),
  CONSTRAINT fuel_brands_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_fuel_brands_active ON fuel_brands (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fuel_brands_name ON fuel_brands (lower(name));

CREATE TABLE IF NOT EXISTS fuel_brand_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES fuel_brands (id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fuel_brand_aliases_alias_len CHECK (char_length(trim(alias)) BETWEEN 2 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_brand_aliases_norm
  ON fuel_brand_aliases (brand_id, normalized_alias);

CREATE INDEX IF NOT EXISTS idx_fuel_brand_aliases_normalized
  ON fuel_brand_aliases (normalized_alias);

CREATE OR REPLACE FUNCTION fuel_brand_aliases_normalize()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_alias := lower(trim(regexp_replace(COALESCE(NEW.alias, ''), '\s+', ' ', 'g')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fuel_brand_aliases_normalize ON fuel_brand_aliases;
CREATE TRIGGER trg_fuel_brand_aliases_normalize
  BEFORE INSERT OR UPDATE OF alias ON fuel_brand_aliases
  FOR EACH ROW
  EXECUTE FUNCTION fuel_brand_aliases_normalize();

INSERT INTO fuel_brands (code, name, is_independent, notes)
VALUES
  ('independent', 'Independent', TRUE, 'Stations not tied to a major marketer'),
  ('nnpc', 'NNPC Retail', FALSE, 'NNPC / NNPCL related retail stations'),
  ('totalenergies', 'TotalEnergies', FALSE, NULL),
  ('mrs', 'MRS', FALSE, NULL),
  ('ardova', 'Ardova', FALSE, NULL),
  ('conoil', 'Conoil', FALSE, NULL),
  ('oando', 'Oando', FALSE, NULL),
  ('mobil', 'Mobil', FALSE, NULL),
  ('eternaoil', 'Eterna', FALSE, NULL),
  ('rainoil', 'Rainoil', FALSE, NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO fuel_brand_aliases (brand_id, alias)
SELECT b.id, a.alias
FROM fuel_brands b
JOIN (
  VALUES
    ('nnpc', 'NNPC'),
    ('nnpc', 'NNPCL'),
    ('nnpc', 'NNPC Limited'),
    ('nnpc', 'NNPC Retail'),
    ('totalenergies', 'Total'),
    ('totalenergies', 'Total Energies'),
    ('ardova', 'Forte Oil'),
    ('independent', 'Independent station')
) AS a(code, alias) ON a.code = b.code
WHERE NOT EXISTS (
  SELECT 1 FROM fuel_brand_aliases x
  WHERE x.brand_id = b.id
    AND x.normalized_alias = lower(trim(a.alias))
);

ALTER TABLE fuel_stations
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES fuel_brands (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fuel_stations_brand_id
  ON fuel_stations (brand_id)
  WHERE brand_id IS NOT NULL;

-- Backfill brand_id from free-text brand via aliases / names
UPDATE fuel_stations fs
SET brand_id = matched.brand_id
FROM (
  SELECT fs2.id AS station_id, COALESCE(ba.brand_id, bb.id) AS brand_id
  FROM fuel_stations fs2
  LEFT JOIN fuel_brand_aliases ba
    ON ba.normalized_alias = lower(trim(regexp_replace(COALESCE(fs2.brand, ''), '\s+', ' ', 'g')))
  LEFT JOIN fuel_brands bb
    ON lower(bb.name) = lower(trim(fs2.brand))
    OR lower(bb.code) = lower(trim(fs2.brand))
  WHERE fs2.brand_id IS NULL
    AND fs2.brand IS NOT NULL
    AND trim(fs2.brand) <> ''
) matched
WHERE fs.id = matched.station_id
  AND matched.brand_id IS NOT NULL;

UPDATE fuel_stations
SET brand_id = (SELECT id FROM fuel_brands WHERE code = 'independent' LIMIT 1)
WHERE brand_id IS NULL
  AND (brand IS NULL OR lower(trim(brand)) IN ('independent', 'indie', 'private'));

-- ---------------------------------------------------------------------------
-- Price observation enrichment (history preserved; no current_price on station)
-- ---------------------------------------------------------------------------
ALTER TABLE fuel_reports
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES fuel_products (id) ON DELETE SET NULL;

ALTER TABLE fuel_reports
  ADD COLUMN IF NOT EXISTS pricing_context fuel_pricing_context NOT NULL DEFAULT 'retail_pump';

ALTER TABLE fuel_reports
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE fuel_reports
  ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fuel_reports_pricing_context
  ON fuel_reports (pricing_context);

CREATE INDEX IF NOT EXISTS idx_fuel_reports_product
  ON fuel_reports (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fuel_reports_effective
  ON fuel_reports (effective_at DESC NULLS LAST);

-- Backfill product_id from fuel_type
UPDATE fuel_reports fr
SET product_id = fp.id
FROM fuel_products fp
WHERE fr.product_id IS NULL
  AND fp.code = fr.fuel_type::text;

-- ---------------------------------------------------------------------------
-- Availability observations (separate from price; preserve history)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuel_availability_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES fuel_stations (id) ON DELETE CASCADE,
  product_id UUID REFERENCES fuel_products (id) ON DELETE SET NULL,
  fuel_type fuel_product_type,
  availability fuel_availability NOT NULL DEFAULT 'unknown',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_type TEXT NOT NULL DEFAULT 'community'
    CHECK (source_type IN ('community', 'official', 'admin', 'system')),
  report_id UUID REFERENCES reports (id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fuel_avail_obs_notes_len CHECK (
    notes IS NULL OR char_length(trim(notes)) BETWEEN 2 AND 500
  ),
  CONSTRAINT fuel_avail_obs_product_ref CHECK (
    product_id IS NOT NULL OR fuel_type IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_fuel_avail_obs_station_time
  ON fuel_availability_observations (station_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_avail_obs_product
  ON fuel_availability_observations (product_id, observed_at DESC)
  WHERE product_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Station merge audit (review workflow; no auto-delete)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuel_station_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_station_id UUID NOT NULL REFERENCES fuel_stations (id) ON DELETE RESTRICT,
  merged_station_id UUID NOT NULL REFERENCES fuel_stations (id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  reports_moved INT NOT NULL DEFAULT 0,
  aliases_moved INT NOT NULL DEFAULT 0,
  performed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fuel_station_merges_distinct CHECK (survivor_station_id <> merged_station_id),
  CONSTRAINT fuel_station_merges_reason_len CHECK (char_length(trim(reason)) BETWEEN 3 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_fuel_station_merges_survivor
  ON fuel_station_merges (survivor_station_id, created_at DESC);

COMMENT ON TABLE fuel_products IS
  'Controlled fuel product catalogue. Codes align with fuel_product_type enum.';

COMMENT ON TABLE fuel_brands IS
  'Controlled marketer/brand entities. Independent is a first-class brand.';

COMMENT ON COLUMN fuel_reports.pricing_context IS
  'retail_pump vs ex_depot/wholesale/official — never treat as interchangeable.';

COMMENT ON TABLE fuel_availability_observations IS
  'Historical availability observations. A price does not imply availability.';

COMMENT ON TABLE fuel_station_merges IS
  'Audit of admin station merges. Suspected duplicates are never auto-deleted.';
