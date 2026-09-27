/**
 * Add escalated moderation state enum values only.
 * Must commit before indexes/constraints can reference the new label (Postgres rule).
 */

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'report_moderation_state' AND e.enumlabel = 'escalated'
  ) THEN
    ALTER TYPE report_moderation_state ADD VALUE 'escalated';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'community_moderation_state' AND e.enumlabel = 'escalated'
  ) THEN
    ALTER TYPE community_moderation_state ADD VALUE 'escalated';
  END IF;
END $$;
