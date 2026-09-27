'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TransportComposer } from '@/components/transport/TransportComposer';
import { TransportFareCard } from '@/components/transport/TransportRouteCard';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { ShareControls } from '@/components/share/ShareControls';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { ApiError, transportApi } from '@/lib/api';
import {
  formatFareRange,
  routeDisplayName,
  transportModeLabel,
} from '@/lib/transport';

export default function TransportRouteDetailClient({ id: idProp } = {}) {
  const params = useParams();
  const id = idProp || params?.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await transportApi.route(id);
      setData(result);
      setError('');
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : 'Unable to load route.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleConfirm(fareId) {
    setActionError('');
    try {
      await transportApi.confirm(fareId, { type: 'still_accurate' });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Confirmation failed.');
    }
  }

  async function handleCorrect(fareId) {
    setActionError('');
    try {
      await transportApi.correct(fareId, {
        type: 'no_longer_accurate',
        note: 'Marked no longer accurate from route page',
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Correction failed.');
    }
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading route…</p>;
  if (error || !data?.route) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-status-urgent">{error || 'Route not found.'}</p>
        <Button as={Link} href="/transport" variant="secondary">
          Back to Transport
        </Button>
      </div>
    );
  }

  const { route, recentFares = [], fareRanges = [], relatedTraffic = [], officialUpdates = [] } =
    data;

  return (
    <div className="space-y-6">
      <Button as={Link} href="/transport" variant="secondary" size="sm">
        ← Transport
      </Button>

      <div className="rounded-card border border-surface-border bg-white p-5 shadow-card sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Transport route
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink break-words sm:text-3xl">
          {routeDisplayName(route)}
        </h1>
        <ShareControls
          className="mt-3"
          title={`${routeDisplayName(route)} — Transport`}
          text={`${route.origin?.name || ''} → ${route.destination?.name || ''}`}
        />
        <p className="mt-3 text-sm text-ink-muted break-words">
          {route.origin?.name}
          {route.origin?.subtitle ? ` · ${route.origin.subtitle}` : ''}
          {' → '}
          {route.destination?.name}
          {route.destination?.subtitle ? ` · ${route.destination.subtitle}` : ''}
        </p>

        {fareRanges.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {fareRanges.map((item) => (
              <span
                key={item.transportMode}
                className="inline-flex items-center rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800"
              >
                {transportModeLabel(item.transportMode)} · {formatFareRange(item.fareRange)}
                {item.reportCount ? ` · ${item.reportCount} reports` : ''}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">No recent fare reports for this route.</p>
        )}

        <Button className="mt-4" onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? 'Close form' : 'Submit a fare update'}
        </Button>
      </div>

      {composerOpen ? (
        <TransportComposer
          presetRoute={route}
          onSubmitted={() => {
            setComposerOpen(false);
            load();
          }}
        />
      ) : null}

      {actionError ? <FormError message={actionError} /> : null}

      {route.stops?.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-ink">Boarding points</h2>
          <ol className="space-y-2">
            {route.stops.map((stop) => (
              <li
                key={stop.id}
                className="rounded-control border border-surface-border bg-white px-3 py-2 text-sm text-ink-muted"
              >
                <span className="font-semibold text-ink">{stop.stopOrder}.</span> {stop.label}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {relatedTraffic.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-ink">Related traffic</h2>
          <p className="text-xs text-ink-soft">From the Traffic module — not travel-time estimates.</p>
          <ul className="space-y-2">
            {relatedTraffic.map((item) => (
              <li
                key={item.id}
                className="rounded-control border border-surface-border bg-white px-3 py-2 text-sm"
              >
                <Link href={`/traffic/${item.id}`} className="font-semibold text-brand-700 hover:underline">
                  {item.report?.title || item.severity}
                </Link>
                {item.location?.name ? (
                  <span className="text-ink-muted"> · {item.location.name}</span>
                ) : null}
                {item.report?.freshness ? (
                  <span className="text-ink-soft"> · {item.report.freshness}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Recent community fares</h2>
        {!recentFares.length ? (
          <p className="text-sm text-ink-muted">No fare history yet.</p>
        ) : (
          recentFares.map((fare) => (
            <TransportFareCard
              key={fare.id}
              fare={fare}
              onConfirm={handleConfirm}
              onCorrect={handleCorrect}
            />
          ))
        )}
      </section>

      {officialUpdates.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Related official updates</h2>
          <p className="text-xs text-ink-soft">
            Official transport notices — never shown as community fares.
          </p>
          {officialUpdates.map((item) => (
            <OfficialUpdateCard key={item.id} update={item} compact />
          ))}
        </section>
      ) : null}
    </div>
  );
}
