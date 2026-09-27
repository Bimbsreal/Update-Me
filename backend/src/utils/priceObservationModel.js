/**
 * Shared commodity price observation semantics (7A).
 * Maps Generic Report Engine fields to explicit observation concepts:
 * source ≠ verification ≠ moderation ≠ freshness.
 */

export function mapSourceType(sourceType) {
  if (sourceType === 'official') return 'official';
  if (sourceType === 'aggregated') return 'market_reference';
  return 'community';
}

export function sourceTypeLabel(sourceType) {
  const mapped = mapSourceType(sourceType);
  if (mapped === 'official') return 'Official / reference';
  if (mapped === 'market_reference') return 'Market / institutional reference';
  if (mapped === 'admin_entry') return 'Admin entry';
  return 'Community report';
}

/**
 * Verification is separate from source and from freshness.
 * Derived from report status + confirmations — not a second truth store.
 */
export function mapVerificationStatus(row) {
  const status = row.status || row.report_status;
  const moderation = row.moderation_state || row.moderationState;
  const confirmed = Number(row.confirmed_accurate_count || row.confirmedAccurateCount || 0);

  if (status === 'removed' && (moderation === 'actioned' || moderation === 'rejected')) {
    return 'rejected';
  }
  if (
    status === 'flagged' ||
    status === 'under_review' ||
    ['flagged', 'queued', 'in_review', 'escalated'].includes(moderation)
  ) {
    return 'needs_review';
  }
  if (status === 'confirmed' || confirmed > 0) {
    return 'verified';
  }
  return 'unverified';
}

export function verificationLabel(code) {
  const map = {
    verified: 'Verified',
    unverified: 'Unverified',
    rejected: 'Rejected',
    needs_review: 'Needs review',
  };
  return map[code] || code;
}

/**
 * Moderation uses existing Moderation Center states.
 */
export function mapModerationStatus(moderationState, reportStatus) {
  if (reportStatus === 'removed') return 'rejected';
  if (!moderationState || moderationState === 'none' || moderationState === 'cleared') {
    if (reportStatus === 'active' || reportStatus === 'confirmed' || reportStatus === 'submitted') {
      return 'approved';
    }
  }
  if (moderationState === 'actioned') return 'rejected';
  if (['flagged', 'escalated'].includes(moderationState)) return 'flagged';
  if (['queued', 'in_review'].includes(moderationState) || reportStatus === 'under_review') {
    return 'pending';
  }
  if (reportStatus === 'flagged') return 'flagged';
  return moderationState || 'pending';
}

export function freshnessFromObservation(row, now = new Date(), staleAfterMinutes = 720) {
  const status = row.status;
  const expiresAt = row.expires_at || row.expiresAt;
  if (status === 'expired' || (expiresAt && new Date(expiresAt) <= now)) return 'expired';
  if (status === 'stale') return 'stale';
  const observedAt = row.occurred_at || row.observedAt || row.last_confirmed_at || row.created_at;
  if (!observedAt) return 'fresh';
  const ageMs = now - new Date(observedAt);
  const staleMs = (staleAfterMinutes || 720) * 60 * 1000;
  if (ageMs >= staleMs) return 'stale';
  if (ageMs >= staleMs / 2) return 'aging';
  return 'fresh';
}

/**
 * Canonical public/admin observation shape (project naming conventions).
 * Does not expose private reporter details beyond optional display name for admin.
 */
export function buildObservationApiFields(row, { includeReporter = false } = {}) {
  const sourceType = mapSourceType(row.source_type);
  const verification = mapVerificationStatus(row);
  const moderation = mapModerationStatus(row.moderation_state, row.status);
  const freshness = freshnessFromObservation(row, new Date(), row.stale_after_minutes || 720);
  const observedAt = row.occurred_at || null;
  const submittedAt = row.created_at || null;

  const base = {
    source: {
      type: sourceType,
      typeLabel: sourceTypeLabel(row.source_type),
      reference: row.source_reference || null,
    },
    verification,
    verificationLabel: verificationLabel(verification),
    moderation,
    freshness,
    observedAt,
    submittedAt,
  };

  if (includeReporter) {
    base.reporter = {
      id: row.user_id || null,
      displayName: row.author_display_name || null,
    };
  }

  return base;
}
