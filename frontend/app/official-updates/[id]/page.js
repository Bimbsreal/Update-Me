'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { OfficialBadge } from '@/components/official/OfficialUpdateCard';
import { ApiError, officialApi } from '@/lib/api';
import { formatOfficialTime, jurisdictionLabel } from '@/lib/official';

export default function OfficialUpdateDetailPage() {
  const params = useParams();
  const id = params?.id;
  const [update, setUpdate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    officialApi
      .get(id)
      .then((data) => {
        setUpdate(data.update);
        setError('');
      })
      .catch((err) => {
        setUpdate(null);
        setError(err instanceof ApiError ? err.message : 'Unable to load official update.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="section-y">
      <Container>
        <div className="mx-auto max-w-2xl">
          <Button as={Link} href="/official-updates" variant="secondary" size="sm">
            ← All official updates
          </Button>

          {loading ? <p className="mt-8 text-sm text-ink-muted">Loading…</p> : null}
          {error ? <p className="mt-8 text-sm text-status-urgent">{error}</p> : null}

          {update ? (
            <article className="mt-8 rounded-card border border-status-official/20 bg-white p-5 shadow-card sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <OfficialBadge />
                <span className="text-xs font-semibold text-status-official break-words">
                  {update.attribution}
                </span>
              </div>

              <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink break-words sm:text-3xl">
                {update.title}
              </h1>

              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
                {update.categoryLabel ? <span>{update.categoryLabel}</span> : null}
                {update.jurisdictionLevel ? (
                  <span>{jurisdictionLabel(update.jurisdictionLevel)}</span>
                ) : null}
                {update.stateName ? <span>{update.stateName}</span> : null}
                {update.locationName ? (
                  <span className="break-words">{update.locationName}</span>
                ) : null}
                <span>
                  Published {formatOfficialTime(update.publishedAt || update.retrievedAt) || '—'}
                </span>
                {update.retrievedAt ? (
                  <span>Retrieved {formatOfficialTime(update.retrievedAt)}</span>
                ) : null}
              </div>

              {update.summary ? (
                <p className="mt-6 text-base leading-relaxed text-ink break-words">{update.summary}</p>
              ) : null}

              {update.body ? (
                <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted break-words">
                  {update.body}
                </div>
              ) : null}

              <div className="mt-8 rounded-control border border-surface-border bg-surface-muted/70 p-4 text-sm text-ink-muted">
                Update Me republishes practical notices from verified official sources. Update Me is
                not the originating government agency.
              </div>

              {update.originalUrl ? (
                <a
                  href={update.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex min-h-11 items-center font-semibold text-status-official hover:underline"
                >
                  View official source →
                </a>
              ) : null}
            </article>
          ) : null}
        </div>
      </Container>
    </div>
  );
}
