'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ShareControls } from '@/components/share/ShareControls';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { ApiError, trafficApi } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function TrafficEventDetailClient({ id: idProp } = {}) {
  const params = useParams();
  const id = idProp || params?.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    trafficApi
      .event(id)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(err instanceof ApiError ? err.message : 'Unable to load traffic event.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <p className="text-sm text-ink-muted">Loading traffic event…</p>;
  if (error || !data?.event) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-status-urgent">{error || 'Event not found.'}</p>
        <Button as={Link} href="/traffic" variant="secondary">
          Back to Traffic
        </Button>
      </div>
    );
  }

  const { event, relatedReports = [], asOf, note } = data;
  const severityLabel = event.severityBand?.label || event.impactSeverity?.label || 'Unknown';

  return (
    <div className="space-y-6">
      <Button as={Link} href="/traffic" variant="secondary" size="sm">
        ← Traffic around you
      </Button>

      <div className="rounded-card border border-surface-border bg-white p-5 shadow-card sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Traffic event
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink break-words sm:text-3xl">
          {event.title}
        </h1>
        <ShareControls className="mt-3" title={event.title} text={event.roadName || ''} />

        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className={cn(
              'rounded-pill border px-2.5 py-1 text-xs font-bold',
              'border-surface-border bg-surface-muted text-ink'
            )}
            aria-label={`Severity: ${severityLabel}`}
          >
            {severityLabel}
          </span>
          <span className="rounded-pill border border-surface-border px-2.5 py-1 text-xs font-semibold capitalize">
            {String(event.eventType || '').replace(/_/g, ' ')}
          </span>
          <span className="rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
            {event.sourceLabel || 'Community Report'}
          </span>
          {event.confidence ? (
            <span className="rounded-pill border border-surface-border px-2.5 py-1 text-xs capitalize text-ink-muted">
              Confidence: {event.confidence}
            </span>
          ) : null}
        </div>

        <p className="mt-4 text-sm font-semibold text-ink">
          {event.roadName || event.locationName || 'Location unknown'}
        </p>
        {event.segmentName ? (
          <p className="mt-1 text-xs text-ink-muted">Segment: {event.segmentName}</p>
        ) : null}
        {event.directionLabel ? (
          <p className="mt-1 text-sm text-ink-muted">{event.directionLabel}</p>
        ) : null}
        {event.description ? (
          <p className="mt-3 text-sm text-ink-muted whitespace-pre-wrap">{event.description}</p>
        ) : null}

        <p className="mt-4 text-xs text-ink-soft">
          {event.observedLabel || 'Observation time unknown'}
          {event.status ? ` · Status: ${event.status}` : ''}
          {event.mayBeOutdated ? ' · May be outdated' : ''}
        </p>
        {asOf ? (
          <p className="mt-1 text-[11px] text-ink-soft">
            Snapshot as of {new Date(asOf).toLocaleTimeString()}. {note || ''}
          </p>
        ) : null}
        {event.diversionNotes ? (
          <p className="mt-3 text-sm text-ink-muted">
            Official diversion note: {event.diversionNotes}
          </p>
        ) : null}
      </div>

      <p className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        Please use Update Me only when safely stopped or through a passenger — do not interact while
        driving.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Related reports</h2>
        {!relatedReports.length ? (
          <p className="text-sm text-ink-muted">No linked public reports for this event yet.</p>
        ) : (
          <ul className="space-y-2">
            {relatedReports.map((r) => (
              <li
                key={r.reportId}
                className="rounded-card border border-surface-border bg-white p-3 text-sm shadow-card"
              >
                <p className="font-semibold text-ink">{r.title}</p>
                <p className="mt-1 text-xs text-ink-muted capitalize">
                  {r.sourceType || 'community'}
                  {r.severity ? ` · ${r.severity}` : ''}
                  {r.lastConfirmedAt
                    ? ` · Confirmed ${new Date(r.lastConfirmedAt).toLocaleString()}`
                    : r.createdAt
                      ? ` · ${new Date(r.createdAt).toLocaleString()}`
                      : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
