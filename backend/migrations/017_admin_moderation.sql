-- Admin roles, permissions foundation, and audit log
-- Extends users.is_moderator for backward compatibility with official/FX admin gates.
-- Does not reset the database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE admin_role AS ENUM (
    'super_admin',
    'admin',
    'moderator',
    'data_manager'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_role admin_role;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_admin_role
  ON users (admin_role)
  WHERE admin_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_suspended
  ON users (suspended_at)
  WHERE suspended_at IS NOT NULL;

-- Keep is_moderator in sync for existing official/FX middleware
UPDATE users
SET is_moderator = TRUE
WHERE admin_role IS NOT NULL AND is_moderator = FALSE;

-- Promote existing moderators to admin role if they have no role yet
UPDATE users
SET admin_role = 'admin'
WHERE is_moderator = TRUE AND admin_role IS NULL;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  previous_state JSONB,
  new_state JSONB,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_audit_action_len CHECK (char_length(trim(action)) BETWEEN 2 AND 120),
  CONSTRAINT admin_audit_entity_type_len CHECK (char_length(trim(entity_type)) BETWEEN 2 AND 80),
  CONSTRAINT admin_audit_reason_len CHECK (
    reason IS NULL OR char_length(trim(reason)) BETWEEN 2 AND 1000
  )
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor
  ON admin_audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity
  ON admin_audit_log (entity_type, entity_id, created_at DESC);

COMMENT ON COLUMN users.admin_role IS
  'Staff role for /admin. NULL = ordinary user. Sets is_moderator when non-null.';
COMMENT ON TABLE admin_audit_log IS
  'Immutable administrative action history. Ordinary users cannot modify.';
