-- Traffic Intelligence — enum expansions only.
-- Must commit before 041 uses new status/type values (PG unsafe-new-enum-value rule).

DO $$ BEGIN
  ALTER TYPE traffic_event_type ADD VALUE IF NOT EXISTS 'lane_restriction';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE traffic_event_type ADD VALUE IF NOT EXISTS 'diversion';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE traffic_event_type ADD VALUE IF NOT EXISTS 'partial_closure';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE traffic_event_type ADD VALUE IF NOT EXISTS 'fallen_object';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE traffic_event_type ADD VALUE IF NOT EXISTS 'fire';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE traffic_event_type ADD VALUE IF NOT EXISTS 'bus_disruption';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE traffic_event_type ADD VALUE IF NOT EXISTS 'route_disruption';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE traffic_event_type ADD VALUE IF NOT EXISTS 'transport_delay';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE traffic_event_status ADD VALUE IF NOT EXISTS 'reported';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE traffic_event_status ADD VALUE IF NOT EXISTS 'investigating';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE traffic_event_status ADD VALUE IF NOT EXISTS 'confirmed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE traffic_event_status ADD VALUE IF NOT EXISTS 'rejected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE traffic_confidence AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE traffic_passability AS ENUM (
    'unknown',
    'passable',
    'passable_with_care',
    'impassable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
