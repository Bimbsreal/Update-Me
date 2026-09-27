'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PublicInfoChrome } from '@/components/layout/PublicInfoChrome';
import { OfficialBadge } from '@/components/official/OfficialUpdateCard';
import { ShareControls } from '@/components/share/ShareControls';
import { Button } from '@/components/ui/Button';
import { ApiError, officialApi } from '@/lib/api';
import {
  affectedLocationLabel,
  formatOfficialTime,
  freshnessParts,
  jurisdictionLabel,
  priorityLabel,
} from '@/lib/official';

export default function OfficialDetailClient({ id: idProp }) {
  const params = useParams();
  const id = idProp || params?.id;
  const [update, setUpdate] = useState(null);
  const [asOf, setAsOf] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    officialApi
      .get(id)
      .then((data) => {
        setUpdate(data.update);
        setAsOf(data.asOf || null);
        setNote(data.note || '');
        setError('');
      })
      .catch((err) => {
        setUpdate(null);
        setAsOf(null);
        setError(err instanceof ApiError ? err.message : 'Unable to load official update.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const location = affectedLocationLabel(update);
  const freshness = freshnessParts(update);
  const importance = priorityLabel(update?.priority, update?.priorityLabel);
  const sourceHref = update?.source?.id ? `/official-sources/${update.source.id}` : null;

  return (
    <PublicInfoChrome backHref="/official-updates" backLabel="All official updates">
      <div className="mx-auto max-w-2xl">
        {loading ? <p className="text-sm text-ink-muted">Loading…</p> : null}
        {error ? <p className="text-sm text-status-urgent">{error}</p> : null}

        {update ? (
          <article className="rounded-card border border-status-official/20 bg-white p-5 shadow-card sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <OfficialBadge />
                {sourceHref ? (
                  <Link
                    href={sourceHref}
                    className="text-xs font-semibold text-status-official break-words hover:underline"
                  >
                    {update.attribution}
                  </Link>
                ) : (
                  <span className="text-xs font-semibold text-status-official break-words">
                    {update.attribution}
                  </span>
                )}
                {importance && update.priority !== 'normal' ? (
                  <span className="rounded-pill bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                    {importance}
                  </span>
                ) : null}
                {update.isExpired ? (
                  <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase text-ink-muted">
                    Expired
                  </span>
                ) : (
                  <span className="rounded-pill bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-900">
                    Active
                  </span>
                )}
              </div>
              <ShareControls title={update.title} text={update.summary || update.title} />
            </div>

            <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink break-words sm:text-3xl">
              {update.title}
            </h1>

            <dl className="mt-4 grid gap-2 text-sm text-ink-muted sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Who</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {update.source?.organizationName || update.attribution}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">When</dt>
                <dd className="mt-0.5">
                  Published {formatOfficialTime(update.publishedAt || update.retrievedAt) || '—'}
                  {update.updatedAt &&
                  update.publishedAt &&
                  new Date(update.updatedAt) - new Date(update.publishedAt) > 60_000
                    ? ` · Updated ${formatOfficialTime(update.updatedAt)}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">About</dt>
                <dd className="mt-0.5">
                  {[update.categoryLabel, update.updateTypeLabel].filter(Boolean).join(' · ') ||
                    'Public information'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Where</dt>
                <dd className="mt-0.5 break-words">
                  {location ||
                    (update.jurisdictionLevel
                      ? jurisdictionLabel(update.jurisdictionLevel)
                      : 'Not specified')}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap gap-2" aria-label="Freshness">
              {freshness.map((part) => (
                <span
                  key={part.label}
                  className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-muted"
                >
                  {part.label}
                </span>
              ))}
            </div>

            {asOf ? (
              <p className="mt-3 text-[11px] text-ink-soft">
                Snapshot as of {new Date(asOf).toLocaleTimeString()}. {note}
              </p>
            ) : null}

            {update.summary ? (
              <div className="mt-6">
                <h2 className="text-sm font-bold text-ink">Update Me summary</h2>
                <p className="mt-2 text-base leading-relaxed text-ink break-words">{update.summary}</p>
              </div>
            ) : null}

            {(update.originalTitle || update.originalBody || update.body) &&
            (update.originalTitle !== update.title ||
              update.originalBody ||
              update.body) ? (
              <div className="mt-6 rounded-control border border-surface-border bg-surface-muted/50 p-4">
                <h2 className="text-sm font-bold text-ink">Original source text</h2>
                {update.originalTitle && update.originalTitle !== update.title ? (
                  <p className="mt-2 text-sm font-semibold text-ink break-words">
                    {update.originalTitle}
                  </p>
                ) : null}
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted break-words">
                  {update.originalBody || update.body}
                </div>
              </div>
            ) : update.body ? (
              <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted break-words">
                {update.body}
              </div>
            ) : null}

            <div className="mt-8 rounded-control border border-surface-border bg-surface-muted/70 p-4 text-sm text-ink-muted">
              Update Me republishes practical notices from verified official sources. Update Me did
              not author this statement.
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {update.originalUrl ? (
                <a
                  href={update.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-semibold text-status-official hover:underline"
                >
                  View original source →
                </a>
              ) : null}
              {update.relatedTrafficEventId ? (
                <Link
                  href={`/traffic/events/${update.relatedTrafficEventId}`}
                  className="inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline"
                >
                  Related traffic event →
                </Link>
              ) : null}
              {sourceHref ? (
                <Link
                  href={sourceHref}
                  className="inline-flex min-h-11 items-center font-semibold text-ink-muted hover:text-ink hover:underline"
                >
                  More from this agency
                </Link>
              ) : null}
              <Button as={Link} href="/explore?category=official&freshness=all" variant="ghost" size="sm">
                Explore official
              </Button>
            </div>
          </article>
        ) : null}
      </div>
    </PublicInfoChrome>
  );
}
