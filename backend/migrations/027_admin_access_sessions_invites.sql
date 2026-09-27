/**
 * Admin access: sessions, invitations, last-login tracking.
 * Extends existing users / admin_role / audit — does not replace RBAC.
 */

-- Last login (distinct from last_seen_at activity pings)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_admin_role_active
  ON users (admin_role)
  WHERE admin_role IS NOT NULL AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_users_staff_created
  ON users (created_at DESC)
  WHERE admin_role IS NOT NULL;

-- Server-side sessions (JWT carries sid; tokens never stored)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  CONSTRAINT user_sessions_ua_len CHECK (
    user_agent IS NULL OR char_length(user_agent) <= 500
  ),
  CONSTRAINT user_sessions_ip_len CHECK (
    ip_address IS NULL OR char_length(ip_address) <= 120
  )
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON user_sessions (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
  ON user_sessions (expires_at)
  WHERE revoked_at IS NULL;

-- Admin invitations (token stored hashed; raw token shown once / emailed externally)
CREATE TABLE IF NOT EXISTS admin_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role admin_role NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES users (id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_invitations_email_len CHECK (char_length(trim(email)) BETWEEN 5 AND 254),
  CONSTRAINT admin_invitations_role_not_null CHECK (role IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_admin_invitations_email
  ON admin_invitations (lower(email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_invitations_pending
  ON admin_invitations (expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
