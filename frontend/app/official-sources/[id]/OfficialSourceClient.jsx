'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { ApiError, officialApi } from '@/lib/api';
import { jurisdictionLabel } from '@/lib/official';

export default function OfficialSourceClient({ id: idProp }) {
  const params = useParams();
  const id = idProp || params?.id;
  const [source, setSource] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [asOf, setAsOf] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    officialApi
      .source(id)
      .then((data) => {
        setSource(data.source);
        setUpdates(data.updates || []);
        setAsOf(data.asOf || null);
        setError('');
      })
      .catch((err) => {
        setSource(null);
        setUpdates([]);
        setError(err instanceof ApiError ? err.message : 'Unable to load this official source.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const name = source?.shortName || source?.organizationName || 'Agency';

  return (
    <div className="mx-auto max-w-2xl">
      {loading ? <p className="text-sm text-ink-muted">Loading…</p> : null}
      {error ? <p className="text-sm text-status-urgent">{error}</p> : null}

      {source ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-status-official">
            Verified official source
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink break-words">
            Updates from {name}
          </h1>
          <p className="mt-2 text-sm text-ink-muted break-words">
            {source.organizationName}
            {source.jurisdictionLevel
              ? ` · ${jurisdictionLabel(source.jurisdictionLevel)}`
              : ''}
            {source.stateName ? ` · ${source.stateName}` : ''}
          </p>

          {source.sourceUnavailable ? (
            <div
              className="mt-4 rounded-control border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="status"
            >
              {source.unavailableNote ||
                'Source currently unavailable — previously published updates are retained.'}
            </div>
          ) : null}

          {source.officialWebsite ? (
            <a
              href={source.officialWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-status-official hover:underline"
            >
              Agency website →
            </a>
          ) : null}

          {asOf ? (
            <p className="mt-3 text-[11px] text-ink-soft">
              Snapshot as of {new Date(asOf).toLocaleTimeString()}. Cached copies must not appear
              newly published.
            </p>
          ) : null}

          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-bold text-ink">Latest updates</h2>
            {updates.length === 0 ? (
              <p className="text-sm text-ink-muted">No published updates from this source yet.</p>
            ) : null}
            {updates.map((item) => (
              <OfficialUpdateCard key={item.id} update={item} />
            ))}
          </div>

          <p className="mt-8 text-sm text-ink-soft">
            <Link href="/official-updates" className="font-semibold text-brand-700 hover:underline">
              Back to all official updates
            </Link>
          </p>
        </>
      ) : null}
    </div>
  );
}
