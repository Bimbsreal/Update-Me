'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LocationBreadcrumbs } from '@/components/location/LocationBreadcrumbs';
import { MapFoundation } from '@/components/location/MapFoundation';
import { ReportTrustLabel } from '@/components/reports/ReportTrustLabel';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { ApiError, trafficApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  causeLabel,
  formatTrafficAge,
  severityClass,
  severityMeta,
} from '@/lib/traffic';

export default function TrafficDetailPage() {
  const params = useParams();
  const id = params?.id;
  const [traffic, setTraffic] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const [detail, hist] = await Promise.all([
        trafficApi.get(id),
        trafficApi.history(id),
      ]);
      setTraffic(detail.traffic);
      setHistory(hist.events || []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load traffic report.');
      setTraffic(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading traffic report…</p>;
  }

  if (error || !traffic) {
    return (
      <div className="space-y-3">
        <FormError message={error || 'Traffic report not found.'} />
        <Button as={Link} href="/traffic" variant="secondary">
          Back to Traffic
        </Button>
      </div>
    );
  }

  const severity = severityMeta(traffic.severity);
  const crumbs = [
    { name: 'Traffic', href: '/traffic' },
    { name: traffic.location?.name || 'Report' },
  ];

  return (
    <div className="space-y-6">
      <LocationBreadcrumbs items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span
            className={cn(
              'inline-flex rounded-pill border px-2.5 py-1 text-xs font-bold',
              severityClass(traffic.severity)
            )}
          >
            {severity.label}
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink break-words sm:text-3xl">
            {severity.label} traffic
          </h1>
          <p className="mt-2 text-sm font-semibold text-ink break-words">
            {traffic.road?.name || traffic.location?.name}
          </p>
          {traffic.direction?.label ? (
            <p className="mt-1 text-sm text-ink-muted break-words">{traffic.direction.label}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(traffic.report?.trustLabels || []).map((label) => (
            <ReportTrustLabel
              key={label}
              label={label}
              sourceType={traffic.report?.sourceType}
            />
          ))}
        </div>
      </div>

      <FormError message={actionError} />

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-control border border-surface-border p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Location</dt>
          <dd className="mt-1 text-sm font-medium text-ink break-words">
            {[traffic.location?.name, traffic.location?.subtitle].filter(Boolean).join(' · ')}
          </dd>
        </div>
        <div className="rounded-control border border-surface-border p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cause</dt>
          <dd className="mt-1 text-sm font-medium text-ink">
            {causeLabel(traffic.cause) || 'Not specified'}
          </dd>
        </div>
        <div className="rounded-control border border-surface-border p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Affected section
          </dt>
          <dd className="mt-1 text-sm font-medium text-ink break-words">
            {traffic.affectedSection || 'Not specified'}
          </dd>
        </div>
        <div className="rounded-control border border-surface-border p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Estimated delay
          </dt>
          <dd className="mt-1 text-sm font-medium text-ink">
            {traffic.estimatedDelayMinutes != null
              ? `About ${traffic.estimatedDelayMinutes} minutes`
              : 'Not specified'}
          </dd>
        </div>
        <div className="rounded-control border border-surface-border p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Reported</dt>
          <dd className="mt-1 text-sm font-medium text-ink">
            {formatTrafficAge(traffic.report?.occurredAt || traffic.report?.createdAt)}
          </dd>
        </div>
        <div className="rounded-control border border-surface-border p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Last confirmed
          </dt>
          <dd className="mt-1 text-sm font-medium text-ink">
            {traffic.report?.lastConfirmedAt
              ? formatTrafficAge(traffic.report.lastConfirmedAt)
              : 'Not yet confirmed'}
          </dd>
        </div>
      </dl>

      <div className="rounded-control border border-surface-border p-4">
        <h2 className="text-sm font-bold text-ink">Details</h2>
        <p className="mt-2 text-sm text-ink-muted break-words whitespace-pre-wrap">
          {traffic.report?.description}
        </p>
        <p className="mt-3 text-xs text-ink-muted">
          Report status: <strong className="text-ink">{traffic.report?.status}</strong>
          {' · '}
          Source: <strong className="text-ink">{traffic.report?.sourceType}</strong>
          {' · '}
          Freshness: <strong className="text-ink capitalize">{traffic.report?.freshness}</strong>
        </p>
      </div>

      <MapFoundation
        label="MapLibre-ready traffic location"
        coordinates={traffic.coordinates}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            setActionError('');
            try {
              await trafficApi.confirm(traffic.id, { type: 'still_accurate' });
              await load();
            } catch (err) {
              setActionError(err instanceof ApiError ? err.message : 'Confirmation failed.');
            }
          }}
        >
          Still accurate
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            setActionError('');
            try {
              await trafficApi.correct(traffic.id, {
                type: 'no_longer_accurate',
                note: 'Marked no longer accurate from traffic detail',
              });
              await load();
            } catch (err) {
              setActionError(err instanceof ApiError ? err.message : 'Update failed.');
            }
          }}
        >
          No longer accurate
        </Button>
        <Button as={Link} href="/traffic" variant="ghost">
          Back to Traffic
        </Button>
      </div>

      <section>
        <h2 className="text-lg font-bold text-ink">Update history</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No history events yet.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {history.map((event) => (
              <li
                key={event.id}
                className="rounded-control border border-surface-border px-3 py-2 text-sm"
              >
                <span className="font-semibold text-ink capitalize">
                  {String(event.eventType).replace(/_/g, ' ')}
                </span>
                {event.reason ? (
                  <span className="text-ink-muted"> — {event.reason}</span>
                ) : null}
                <div className="mt-1 text-xs text-ink-muted">
                  {formatTrafficAge(event.createdAt)}
                  {event.actor?.displayName ? ` · ${event.actor.displayName}` : ''}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
