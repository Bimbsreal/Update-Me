/**
 * Indexes and official-content check for escalated moderation state.
 * Depends on 025_moderation_escalation.sql having committed.
 */

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_official_not_community_spoof;
ALTER TABLE reports ADD CONSTRAINT reports_official_not_community_spoof CHECK (
  source_type <> 'official'
  OR moderation_state IN (
    'none', 'cleared', 'actioned', 'queued', 'in_review', 'flagged', 'escalated'
  )
);

CREATE INDEX IF NOT EXISTS idx_reports_moderation_state_updated
  ON reports (moderation_state, updated_at DESC)
  WHERE moderation_state IN ('flagged', 'queued', 'in_review', 'escalated');

CREATE INDEX IF NOT EXISTS idx_questions_moderation_state_updated
  ON questions (moderation_state, updated_at DESC)
  WHERE moderation_state IN ('flagged', 'queued', 'in_review', 'escalated');

CREATE INDEX IF NOT EXISTS idx_answers_moderation_state_updated
  ON answers (moderation_state, updated_at DESC)
  WHERE moderation_state IN ('flagged', 'queued', 'in_review', 'escalated');

CREATE INDEX IF NOT EXISTS idx_admin_audit_moderation_created
  ON admin_audit_log (created_at DESC)
  WHERE action LIKE 'moderation.%';
