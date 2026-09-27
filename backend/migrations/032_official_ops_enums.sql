-- Official ops hardening: review lifecycle, multi-area, manual entry, near-dupe aids.
-- Extends 009 + 021 — does not create a second source/update system.
-- NOTE: New enum values are added here but not referenced in this same transaction
-- (PostgreSQL forbids using newly added enum labels until commit).

-- ---------------------------------------------------------------------------
-- Lifecycle / entry origin enums (committed before use in later statements)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE official_update_status ADD VALUE IF NOT EXISTS 'pending_review';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN
    -- Older PG without IF NOT EXISTS
    BEGIN
      ALTER TYPE official_update_status ADD VALUE 'pending_review';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

DO $$ BEGIN
  ALTER TYPE official_update_status ADD VALUE IF NOT EXISTS 'rejected';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN
    BEGIN
      ALTER TYPE official_update_status ADD VALUE 'rejected';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

DO $$ BEGIN
  ALTER TYPE official_ingestion_method ADD VALUE IF NOT EXISTS 'manual_entry';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN
    BEGIN
      ALTER TYPE official_ingestion_method ADD VALUE 'manual_entry';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;
