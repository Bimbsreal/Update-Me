-- Notifications + Saved Areas + Saved Routes
-- In-app personalization layer. No push/SMS/email yet.
-- Does not reset existing data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'push', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_category AS ENUM (
    'traffic',
    'road_alerts',
    'fuel',
    'transport',
    'prices',
    'official',
    'community'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_priority AS ENUM ('normal', 'important', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE saved_place_kind AS ENUM ('home', 'work', 'school', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE saved_route_mode AS ENUM (
    'driving',
    'public_transport',
    'walking',
    'any'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Global category toggles (default: quiet — only traffic + road alerts on)
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category notification_category NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_user
  ON user_notification_preferences (user_id);

CREATE TABLE IF NOT EXISTS saved_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  place_kind saved_place_kind NOT NULL DEFAULT 'other',
  custom_name TEXT,
  notify_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, location_id),
  CONSTRAINT saved_areas_name_len CHECK (
    custom_name IS NULL OR char_length(trim(custom_name)) BETWEEN 1 AND 80
  )
);

CREATE INDEX IF NOT EXISTS idx_saved_areas_user ON saved_areas (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_areas_location ON saved_areas (location_id);

CREATE TABLE IF NOT EXISTS saved_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  origin_location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  destination_location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  custom_name TEXT,
  travel_mode saved_route_mode NOT NULL DEFAULT 'any',
  transport_route_id UUID REFERENCES transport_routes (id) ON DELETE SET NULL,
  notify_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saved_routes_distinct_ends CHECK (
    origin_location_id <> destination_location_id
  ),
  CONSTRAINT saved_routes_name_len CHECK (
    custom_name IS NULL OR char_length(trim(custom_name)) BETWEEN 1 AND 80
  ),
  UNIQUE (user_id, origin_location_id, destination_location_id, travel_mode)
);

CREATE INDEX IF NOT EXISTS idx_saved_routes_user ON saved_routes (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_routes_origin ON saved_routes (origin_location_id);
CREATE INDEX IF NOT EXISTS idx_saved_routes_destination ON saved_routes (destination_location_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  channel notification_channel NOT NULL DEFAULT 'in_app',
  category notification_category NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  priority notification_priority NOT NULL DEFAULT 'normal',
  related_entity_type TEXT,
  related_entity_id UUID,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  link_path TEXT,
  dedupe_key TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_title_len CHECK (char_length(trim(title)) BETWEEN 3 AND 200),
  CONSTRAINT notifications_message_len CHECK (
    message IS NULL OR char_length(trim(message)) BETWEEN 1 AND 2000
  ),
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_expires
  ON notifications (expires_at)
  WHERE expires_at IS NOT NULL;
