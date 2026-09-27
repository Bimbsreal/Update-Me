/**
 * Location aliases for search (do not change authoritative names).
 */

CREATE TABLE IF NOT EXISTS location_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT location_aliases_alias_len CHECK (char_length(trim(alias)) BETWEEN 2 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_location_aliases_loc_norm
  ON location_aliases (location_id, normalized_alias);

CREATE INDEX IF NOT EXISTS idx_location_aliases_normalized
  ON location_aliases (normalized_alias);

CREATE OR REPLACE FUNCTION location_aliases_normalize()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_alias := lower(trim(regexp_replace(COALESCE(NEW.alias, ''), '\s+', ' ', 'g')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_location_aliases_normalize ON location_aliases;
CREATE TRIGGER trg_location_aliases_normalize
  BEFORE INSERT OR UPDATE OF alias ON location_aliases
  FOR EACH ROW
  EXECUTE FUNCTION location_aliases_normalize();

CREATE INDEX IF NOT EXISTS idx_locations_parent_type_name
  ON locations (parent_id, type, name)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_type_status_name
  ON locations (type, status, name);
