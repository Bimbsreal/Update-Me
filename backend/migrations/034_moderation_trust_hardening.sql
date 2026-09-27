-- Moderation & Trust hardening
-- Extends Generic Report Engine + Moderation Center. No parallel moderation system.

-- ---------------------------------------------------------------------------
-- Event grouping (link duplicates without destroying provenance)
-- ---------------------------------------------------------------------------
ALTER TABLE report_event_groups
  ADD COLUMN IF NOT EXISTS canonical_report_id UUID REFERENCES reports (id) ON DELETE SET NULL;

ALTER TABLE report_event_groups
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'archived'));

CREATE INDEX IF NOT EXISTS idx_report_event_groups_canonical
  ON report_event_groups (canonical_report_id)
  WHERE canonical_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_event_groups_status
  ON report_event_groups (status, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Priority / urgent moderation (admins only — users cannot self-label emergency)
-- ---------------------------------------------------------------------------
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS moderation_priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (moderation_priority IN ('normal', 'priority', 'urgent'));

CREATE INDEX IF NOT EXISTS idx_reports_moderation_priority
  ON reports (moderation_priority, updated_at DESC)
  WHERE moderation_priority <> 'normal';

-- ---------------------------------------------------------------------------
-- Official cross-reference (distinct records; provenance link only)
-- ---------------------------------------------------------------------------
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS related_official_update_id UUID
    REFERENCES official_updates (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reports_related_official
  ON reports (related_official_update_id)
  WHERE related_official_update_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Report-only sanction (login/read OK; create/confirm/flag blocked)
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reporting_disabled_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reporting_disabled_reason TEXT;

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_reporting_disabled_reason_len CHECK (
      reporting_disabled_reason IS NULL
      OR char_length(trim(reporting_disabled_reason)) BETWEEN 3 AND 500
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_reporting_disabled
  ON users (reporting_disabled_at)
  WHERE reporting_disabled_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Question flag lifecycle parity with report_flags
-- ---------------------------------------------------------------------------
ALTER TABLE question_flags
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned'));

ALTER TABLE question_flags
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_question_flags_open
  ON question_flags (status)
  WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- Appeals / review requests (architecture ready; optional public exposure later)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS moderation_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL
    CHECK (target_type IN ('report', 'question', 'answer')),
  target_id UUID NOT NULL,
  requester_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  original_decision TEXT,
  appeal_reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'upheld', 'overturned', 'withdrawn')),
  reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT moderation_appeals_reason_len CHECK (
    char_length(trim(appeal_reason)) BETWEEN 5 AND 1000
  ),
  CONSTRAINT moderation_appeals_notes_len CHECK (
    review_notes IS NULL OR char_length(trim(review_notes)) BETWEEN 2 AND 1000
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_moderation_appeals_open
  ON moderation_appeals (target_type, target_id, requester_id)
  WHERE status IN ('pending', 'under_review');

CREATE INDEX IF NOT EXISTS idx_moderation_appeals_status
  ON moderation_appeals (status, created_at DESC);

COMMENT ON TABLE moderation_appeals IS
  'User requests to review a prior moderation decision. Does not expose internal process publicly.';

COMMENT ON COLUMN reports.moderation_priority IS
  'Admin/moderator priority for queue ordering. Users cannot set this on submit.';

COMMENT ON COLUMN reports.related_official_update_id IS
  'Optional link to a related official update. Records remain distinct (community ≠ official).';

COMMENT ON COLUMN users.reporting_disabled_at IS
  'When set, user cannot create/confirm/flag community reports; account login may remain allowed.';
