'use client';

import Link from 'next/link';
import { ReportTrustLabel } from '@/components/reports/ReportTrustLabel';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatDirectionsAge, travelModeLabel } from '@/lib/directions';

export function DirectionResultCard({ result, className }) {
  if (!result) return null;
  const href = `/directions/${encodeURIComponent(result.id)}`;

  return (
    <article
      className={cn(
        'rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5',
        className
      )}
    >
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800">
          {result.modeLabel || travelModeLabel(result.mode)}
        </span>
        {result.type === 'local_knowledge' ? (
          <span className="inline-flex items-center rounded-pill border border-surface-border bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-ink-muted">
            Community Local Knowledge
          </span>
        ) : null}
        {result.type === 'transport_corridor' ? (
          <span className="inline-flex items-center rounded-pill border border-surface-border bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-ink-muted">
            Transport corridor
          </span>
        ) : null}
      </div>

      {(result.trustLabels || []).length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {result.trustLabels.map((label) => (
            <ReportTrustLabel key={label} label={label} sourceType="community" />
          ))}
        </div>
      ) : null}

      <h3 className="mt-3 text-lg font-bold text-ink break-words">{result.title}</h3>

      {result.majorRoads ? (
        <p className="mt-2 text-sm text-ink-muted break-words">
          <span className="font-semibold text-ink">Major roads:</span> {result.majorRoads}
        </p>
      ) : null}

      {result.instructionSummary ? (
        <p className="mt-2 text-sm text-ink-muted break-words">{result.instructionSummary}</p>
      ) : null}

      {result.transport?.fareSummary?.fareRange ? (
        <p className="mt-2 text-sm text-ink-muted">
          Recent fare information available
          {result.transport.fareSummary.freshness
            ? ` · ${result.transport.fareSummary.freshness}`
            : ''}
        </p>
      ) : null}

      {result.localKnowledgeAvailable ? (
        <p className="mt-2 text-xs font-semibold text-brand-700">Community update available</p>
      ) : null}

      {result.freshness ? (
        <p className="mt-2 text-xs text-ink-soft capitalize">Freshness: {result.freshness}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button as={Link} href={href} size="sm">
          View route
        </Button>
        <Button as={Link} href={href} variant="secondary" size="sm">
          View updates
        </Button>
      </div>
    </article>
  );
}

export function CorridorSummaryCard({ corridor, routing, context }) {
  if (!corridor) return null;
  return (
    <article className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
        Route context
      </p>
      <h2 className="mt-2 text-xl font-bold text-ink break-words">{corridor.title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{corridor.modeLabel}</p>

      {corridor.estimatedDistanceKm != null ? (
        <p className="mt-2 text-sm text-ink-muted">
          About {corridor.estimatedDistanceKm} km straight-line (not a driving distance).
        </p>
      ) : null}

      {!routing?.available ? (
        <p className="mt-3 rounded-control border border-dashed border-surface-border bg-surface-muted/80 px-3 py-2 text-sm text-ink-muted">
          {routing?.message || 'Directions are temporarily unavailable for this route.'}
        </p>
      ) : null}

      {context?.traffic?.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-ink">Traffic on route</p>
          {context.traffic.slice(0, 3).map((item) => (
            <p key={item.id} className="text-sm text-ink-muted break-words">
              {item.title || item.severity}
              {item.roadName ? ` on ${item.roadName}` : ''}
              {item.occurredAt ? ` · Updated ${formatDirectionsAge(item.occurredAt)}` : ''}
            </p>
          ))}
        </div>
      ) : context?.trafficNote ? (
        <p className="mt-3 text-xs text-ink-soft">{context.trafficNote}</p>
      ) : null}

      {context?.alerts?.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-ink">Road Alert</p>
          {context.alerts.slice(0, 3).map((item) => (
            <div key={item.id} className="text-sm text-ink-muted">
              <p className="break-words">{item.title}</p>
              <p className="text-xs text-ink-soft">
                {(item.trustLabels || [])[0] || 'Community Report — Unverified'}
                {item.occurredAt ? ` · Reported ${formatDirectionsAge(item.occurredAt)}` : ''}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {context?.fuelNearby?.length ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">Nearby fuel (secondary)</p>
          <ul className="mt-1 space-y-1 text-sm text-ink-muted">
            {context.fuelNearby.map((station) => (
              <li key={station.id} className="break-words">
                {station.name}
                {station.distanceKm != null
                  ? station.distanceKm < 0.1
                    ? ' · nearby'
                    : ` · ${station.distanceKm} km`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
