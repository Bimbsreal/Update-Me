import { cn } from '@/lib/cn';

const SOURCE_STYLES = {
  community: 'bg-brand-50 text-brand-800 border-brand-100',
  official: 'bg-status-official/10 text-status-official border-status-official/25',
  aggregated: 'bg-surface-muted text-ink-muted border-surface-border',
};

const STATUS_STYLES = {
  submitted: 'bg-brand-50 text-brand-700 border-brand-100',
  active: 'bg-status-normal/10 text-status-normal border-status-normal/20',
  confirmed: 'bg-status-normal/10 text-status-normal border-status-normal/20',
  stale: 'bg-status-caution/10 text-status-caution border-status-caution/25',
  expired: 'bg-status-expired/10 text-status-expired border-status-expired/20',
  flagged: 'bg-status-attention/10 text-status-attention border-status-attention/25',
  under_review: 'bg-status-attention/10 text-status-attention border-status-attention/25',
  removed: 'bg-status-expired/10 text-status-expired border-status-expired/20',
};

export function ReportTrustLabel({ label, sourceType, className }) {
  const isCommunity =
    label === 'Community Report' ||
    label === 'Community Report — Unverified' ||
    label === 'Community Local Knowledge' ||
    label === 'Community Confirmed' ||
    sourceType === 'community';
  const isReview = label === 'Under Review' || label === 'Flagged';
  const isOfficial =
    label === 'Official' || label === 'Official Advisory' || sourceType === 'official';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-2.5 py-1 text-[11px] font-semibold tracking-wide',
        isOfficial
          ? SOURCE_STYLES.official
          : isCommunity
            ? SOURCE_STYLES.community
            : label === 'Stale' || label === 'Expired'
              ? STATUS_STYLES.stale
              : isReview
                ? STATUS_STYLES.flagged
                : 'bg-surface-muted text-ink-muted border-surface-border',
        // Never let community look official
        sourceType === 'community' && label === 'Official' ? 'hidden' : null,
        className
      )}
    >
      {label}
    </span>
  );
}

export function ReportStatusBadge({ status, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-2.5 py-1 text-[11px] font-semibold capitalize',
        STATUS_STYLES[status] || STATUS_STYLES.active,
        className
      )}
    >
      {String(status || '').replace(/_/g, ' ')}
    </span>
  );
}

export { SOURCE_STYLES, STATUS_STYLES };
