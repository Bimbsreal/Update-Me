'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/reports';
import { communityCategoryLabel } from '@/lib/community';

export function QuestionCard({ question, className }) {
  if (!question) return null;
  const locationLabel =
    question.location?.name ||
    [question.location?.area?.name, question.location?.lga?.name, question.location?.state?.name]
      .filter(Boolean)
      .join(', ');

  return (
    <article
      className={cn(
        'rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800">
          {question.categoryLabel || communityCategoryLabel(question.category)}
        </span>
        {question.expired || question.status === 'expired' ? (
          <span className="inline-flex items-center rounded-pill border border-surface-border bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-ink-muted">
            Expired
          </span>
        ) : null}
        {question.status === 'flagged' || question.status === 'under_review' ? (
          <span className="inline-flex items-center rounded-pill border border-surface-border bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-ink-muted">
            Under review
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 text-base font-bold text-ink break-words sm:text-lg">
        <Link href={`/community/questions/${question.id}`} className="hover:text-brand-700">
          {question.title}
        </Link>
      </h3>

      {locationLabel ? (
        <p className="mt-2 text-sm text-ink-muted break-words">{locationLabel}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
        <span>{formatRelativeTime(question.createdAt)}</span>
        <span>
          {question.usefulResponseCount || 0} useful response
          {(question.usefulResponseCount || 0) === 1 ? '' : 's'}
        </span>
        <span>
          {question.answerCount || 0} answer{(question.answerCount || 0) === 1 ? '' : 's'}
        </span>
        {question.freshness === 'current' && question.status === 'open' ? (
          <span className="font-semibold text-brand-700">Unanswered</span>
        ) : null}
      </div>
    </article>
  );
}
