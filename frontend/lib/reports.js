export function formatRelativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function statusTone(status, sourceType) {
  if (sourceType === 'official') return 'official';
  switch (status) {
    case 'confirmed':
    case 'active':
    case 'submitted':
      return 'normal';
    case 'stale':
      return 'caution';
    case 'flagged':
    case 'under_review':
      return 'attention';
    case 'expired':
    case 'removed':
      return 'expired';
    default:
      return 'normal';
  }
}

export function statusLabel(status) {
  const map = {
    submitted: 'Submitted',
    active: 'Active',
    confirmed: 'Confirmed',
    stale: 'Stale',
    expired: 'Expired',
    flagged: 'Flagged',
    under_review: 'Under review',
    removed: 'Removed',
  };
  return map[status] || status;
}
