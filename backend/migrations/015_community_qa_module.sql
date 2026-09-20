-- Community Questions & Answers Module
-- Utility-focused local Q&A — not a social network.
-- Standalone models with moderation/flag patterns aligned to the report engine.
-- Does not delete historical questions on expiry.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE community_question_category AS ENUM (
    'traffic',
    'fuel',
    'transport',
    'prices',
    'directions',
    'road_conditions',
    'local_services',
    'local_information',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE community_question_status AS ENUM (
    'open',
    'answered',
    'expired',
    'flagged',
    'under_review',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE community_answer_status AS ENUM (
    'active',
    'flagged',
    'under_review',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE community_moderation_state AS ENUM (
    'none',
    'flagged',
    'queued',
    'in_review',
    'cleared',
    'actioned'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE community_answer_feedback_type AS ENUM (
    'useful',
    'no_longer_accurate',
    'needs_correction'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE community_flag_reason AS ENUM (
    'spam',
    'misleading',
    'inappropriate',
    'inaccurate',
    'duplicate',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE community_history_type AS ENUM (
    'created',
    'updated',
    'answered',
    'status_changed',
    'feedback',
    'flagged',
    'expired',
    'linked_related',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Future duplicate / related-question grouping (no auto-merge, no silent delete)
CREATE TABLE IF NOT EXISTS community_question_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category community_question_category,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  title TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,
  category community_question_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status community_question_status NOT NULL DEFAULT 'open',
  moderation_state community_moderation_state NOT NULL DEFAULT 'none',
  expires_at TIMESTAMPTZ,
  answer_count INT NOT NULL DEFAULT 0 CHECK (answer_count >= 0),
  useful_response_count INT NOT NULL DEFAULT 0 CHECK (useful_response_count >= 0),
  flag_count INT NOT NULL DEFAULT 0 CHECK (flag_count >= 0),
  related_group_id UUID REFERENCES community_question_groups (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT questions_title_len CHECK (char_length(trim(title)) BETWEEN 5 AND 160),
  CONSTRAINT questions_description_len CHECK (
    description IS NULL OR char_length(trim(description)) BETWEEN 3 AND 4000
  )
);

CREATE INDEX IF NOT EXISTS idx_questions_location ON questions (location_id);
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions (category);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions (status);
CREATE INDEX IF NOT EXISTS idx_questions_created ON questions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_expires ON questions (expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_questions_group ON questions (related_group_id)
  WHERE related_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_questions_open_location
  ON questions (location_id, created_at DESC)
  WHERE status IN ('open', 'answered');

CREATE TABLE IF NOT EXISTS answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  content TEXT NOT NULL,
  location_id UUID REFERENCES locations (id) ON DELETE SET NULL,
  status community_answer_status NOT NULL DEFAULT 'active',
  moderation_state community_moderation_state NOT NULL DEFAULT 'none',
  useful_count INT NOT NULL DEFAULT 0 CHECK (useful_count >= 0),
  inaccurate_count INT NOT NULL DEFAULT 0 CHECK (inaccurate_count >= 0),
  needs_correction_count INT NOT NULL DEFAULT 0 CHECK (needs_correction_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT answers_content_len CHECK (char_length(trim(content)) BETWEEN 3 AND 4000)
);

CREATE INDEX IF NOT EXISTS idx_answers_question ON answers (question_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_answers_user ON answers (user_id);
CREATE INDEX IF NOT EXISTS idx_answers_status ON answers (status);

-- One feedback action per user per answer (quality, not popularity)
CREATE TABLE IF NOT EXISTS answer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID NOT NULL REFERENCES answers (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  feedback_type community_answer_feedback_type NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (answer_id, user_id),
  CONSTRAINT answer_feedback_note_len CHECK (
    note IS NULL OR char_length(trim(note)) BETWEEN 3 AND 500
  )
);

CREATE INDEX IF NOT EXISTS idx_answer_feedback_answer ON answer_feedback (answer_id);

CREATE TABLE IF NOT EXISTS question_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason community_flag_reason NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, user_id),
  CONSTRAINT question_flags_details_len CHECK (
    details IS NULL OR char_length(trim(details)) BETWEEN 3 AND 1000
  )
);

CREATE INDEX IF NOT EXISTS idx_question_flags_question ON question_flags (question_id);

CREATE TABLE IF NOT EXISTS question_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  answer_id UUID REFERENCES answers (id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  event_type community_history_type NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_history_question
  ON question_history (question_id, created_at DESC);
