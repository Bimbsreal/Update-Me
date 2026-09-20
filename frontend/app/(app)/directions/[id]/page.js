'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CorridorSummaryCard, DirectionResultCard } from '@/components/directions/DirectionResultCard';
import { DirectionsComposer } from '@/components/directions/DirectionsComposer';
import { MapFoundation } from '@/components/location/MapFoundation';
import { ReportTrustLabel } from '@/components/reports/ReportTrustLabel';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { ApiError, directionsApi } from '@/lib/api';
import { formatDirectionsAge, travelModeLabel } from '@/lib/directions';
import { formatFareRange, routeDisplayName } from '@/lib/transport';

export default function DirectionsDetailPage() {
  const params = useParams();
  const id = params?.id ? decodeURIComponent(params.id) : null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    directionsApi
      .get(id)
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch((err) => {
        setData(null);
        setError(err instanceof ApiError ? err.message : 'Unable to load directions.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-sm text-ink-muted">Loading directions…</p>;
  if (error || !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-status-urgent">{error || 'Not found.'}</p>
        <Button as={Link} href="/directions" variant="secondary">
          Back to Directions
        </Button>
      </div>
    );
  }

  // Corridor search payload reused as detail
  if (data.corridor || data.results) {
    return (
      <div className="space-y-6">
        <Button as={Link} href="/directions" variant="secondary" size="sm">
          ← Directions
        </Button>
        <CorridorSummaryCard
          corridor={data.corridor}
          routing={data.routing}
          context={data.context}
        />
        <MapFoundation
          label="MapLibre-ready corridor view"
          coordinates={data.origin?.coordinates}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {(data.results || []).map((item) => (
            <DirectionResultCard key={item.id} result={item} />
          ))}
        </div>
        <Button type="button" onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? 'Close form' : 'Share local knowledge'}
        </Button>
        {composerOpen ? (
          <DirectionsComposer
            presetOrigin={
              data.origin
                ? { locationId: data.origin.id, label: data.origin.name, name: data.origin.name }
                : null
            }
            presetDestination={
              data.destination
                ? {
                    locationId: data.destination.id,
                    label: data.destination.name,
                    name: data.destination.name,
                  }
                : null
            }
          />
        ) : null}
      </div>
    );
  }

  if (data.type === 'local_knowledge' && data.knowledge) {
    const k = data.knowledge;
    return (
      <div className="space-y-6">
        <Button as={Link} href="/directions" variant="secondary" size="sm">
          ← Directions
        </Button>
        <article className="rounded-card border border-surface-border bg-white p-5 shadow-card">
          <div className="flex flex-wrap gap-1.5">
            {(k.report?.trustLabels || []).map((label) => (
              <ReportTrustLabel key={label} label={label} sourceType={k.report?.sourceType} />
            ))}
          </div>
          <h1 className="mt-3 text-2xl font-bold text-ink break-words">{k.report?.title}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {k.origin?.name} → {k.destination?.name}
            {k.travelModeLabel ? ` · ${k.travelModeLabel}` : ''}
          </p>
          <p className="mt-4 whitespace-pre-wrap text-sm text-ink-muted break-words">
            {k.instructionSummary}
          </p>
          {k.majorRoads ? (
            <p className="mt-3 text-sm text-ink-muted">
              <span className="font-semibold text-ink">Roads:</span> {k.majorRoads}
            </p>
          ) : null}
          {k.landmarks ? (
            <p className="mt-2 text-sm text-ink-muted">
              <span className="font-semibold text-ink">Landmarks:</span> {k.landmarks}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-ink-soft">
            Observed {formatDirectionsAge(k.report?.occurredAt || k.createdAt)}
          </p>
          <p className="mt-2 text-xs text-ink-soft">
            Community local knowledge — not official navigation instructions.
          </p>
        </article>
        <ContextPanels context={data.context} />
      </div>
    );
  }

  if (data.type === 'transport_corridor' && data.route) {
    const route = data.route;
    const fare = (route.fareSummaries || [])[0];
    return (
      <div className="space-y-6">
        <Button as={Link} href="/directions" variant="secondary" size="sm">
          ← Directions
        </Button>
        <article className="rounded-card border border-surface-border bg-white p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Transport corridor
          </p>
          <h1 className="mt-2 text-2xl font-bold text-ink break-words">
            {routeDisplayName(route)}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {travelModeLabel('public_transport')}
            {fare?.fareRange ? ` · ${formatFareRange(fare.fareRange)}` : ''}
          </p>
          <Button as={Link} href={`/transport/routes/${route.id}`} className="mt-4" size="sm">
            Open transport route
          </Button>
        </article>
        {(data.localKnowledge || []).length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-ink">Community Local Knowledge</h2>
            {data.localKnowledge.map((item) => (
              <DirectionResultCard
                key={item.id}
                result={{
                  id: `knowledge_${item.id}`,
                  type: 'local_knowledge',
                  title: item.report?.title,
                  instructionSummary: item.instructionSummary,
                  majorRoads: item.majorRoads,
                  trustLabels: item.report?.trustLabels,
                  freshness: item.report?.freshness,
                  mode: item.travelMode,
                  modeLabel: item.travelModeLabel,
                }}
              />
            ))}
          </section>
        ) : (
          <p className="text-sm text-ink-muted">
            No local directions have been reported for this route yet.
          </p>
        )}
        <ContextPanels context={data.context} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FormError message="Unsupported directions result." />
      <Button as={Link} href="/directions" variant="secondary">
        Back to Directions
      </Button>
    </div>
  );
}

function ContextPanels({ context }) {
  if (!context) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-card border border-surface-border bg-white p-4">
        <h2 className="font-bold text-ink">Traffic on route</h2>
        {context.traffic?.length ? (
          <ul className="mt-2 space-y-2 text-sm text-ink-muted">
            {context.traffic.map((item) => (
              <li key={item.id}>
                <Link href={`/traffic/${item.id}`} className="font-semibold text-brand-700 hover:underline">
                  {item.title || item.severity}
                </Link>
                {item.occurredAt ? ` · Updated ${formatDirectionsAge(item.occurredAt)}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">
            {context.trafficNote || 'No recent traffic reports for these locations.'}
          </p>
        )}
      </section>
      <section className="rounded-card border border-surface-border bg-white p-4">
        <h2 className="font-bold text-ink">Road alerts</h2>
        {context.alerts?.length ? (
          <ul className="mt-2 space-y-2 text-sm text-ink-muted">
            {context.alerts.map((item) => (
              <li key={item.id}>
                <Link href={`/alerts/${item.id}`} className="font-semibold text-brand-700 hover:underline">
                  {item.title}
                </Link>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  {(item.trustLabels || [])[0] || 'Community Report — Unverified'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No recent alerts for these locations.</p>
        )}
      </section>
    </div>
  );
}
