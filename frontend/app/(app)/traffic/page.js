'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { LocationSelector } from '@/components/location/LocationSelector';
import { TrafficCard } from '@/components/traffic/TrafficCard';
import { TrafficEventCard } from '@/components/traffic/TrafficEventCard';
import { TrafficComposer } from '@/components/traffic/TrafficComposer';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, trafficApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { getCurrentPosition, GEO_STATUS } from '@/lib/geolocation';
import { severityClass, TRAFFIC_SEVERITIES } from '@/lib/traffic';

const ExploreMap = dynamic(
  () => import('@/components/explore/ExploreMap').then((m) => m.ExploreMap),
  { ssr: false, loading: () => <p className="p-4 text-sm text-ink-muted">Loading map…</p> }
);

const SUMMARY_KEYS = ['clear', 'moderate', 'heavy', 'standstill'];

export default function TrafficPage() {
  const { user, setLocation } = useAuth();
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [geojson, setGeojson] = useState(null);
  const [asOf, setAsOf] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('');
  const [view, setView] = useState('list');
  const [feed, setFeed] = useState('events');
  const [gpsHint, setGpsHint] = useState('');
  const [deviceCoords, setDeviceCoords] = useState(null);

  const area = user?.currentArea;
  const locationLabel = area
    ? `${area.name}${area.state ? `, ${area.state}` : ''}`
    : 'Choose your area';

  const mapCenter = useMemo(() => {
    if (deviceCoords) return deviceCoords;
    const withCoords = events.find((e) => e.coordinates);
    if (withCoords?.coordinates) return withCoords.coordinates;
    return { lat: 6.5244, lng: 3.3792 };
  }, [deviceCoords, events]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const reportParams = { freshness: 'any', limit: 30 };
      const summaryParams = {};
      const eventParams = { limit: 60 };

      if (area?.locationId) {
        reportParams.locationId = area.locationId;
        summaryParams.locationId = area.locationId;
        eventParams.locationId = area.locationId;
      }
      if (severityFilter) reportParams.severity = severityFilter;
      if (deviceCoords) {
        eventParams.lat = deviceCoords.lat;
        eventParams.lng = deviceCoords.lng;
        eventParams.radiusKm = 20;
        delete eventParams.locationId;
      }

      const [listData, summaryData, eventsData] = await Promise.all([
        trafficApi.list(reportParams),
        trafficApi.summary(summaryParams),
        trafficApi.events(eventParams),
      ]);
      setItems(listData.items || []);
      setSummary(summaryData.summary || null);
      setEvents(eventsData.items || []);
      setGeojson(eventsData.geojson || null);
      setAsOf(eventsData.asOf || new Date().toISOString());
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load traffic.');
    } finally {
      setLoading(false);
    }
  }, [area?.locationId, severityFilter, deviceCoords]);

  useEffect(() => {
    load();
  }, [load]);

  async function useMyLocation() {
    setGpsHint('');
    const result = await getCurrentPosition({ enableHighAccuracy: false });
    if (result.status === GEO_STATUS.GRANTED && result.position) {
      setDeviceCoords({
        lat: result.position.lat,
        lng: result.position.lng,
      });
      setGpsHint('Showing traffic near your current position. Precise GPS is not shared publicly.');
      return;
    }
    if (result.status === GEO_STATUS.DENIED) {
      setGpsHint('Location permission denied. Choose a location manually.');
      setSelectorOpen(true);
      return;
    }
    setGpsHint(result.message || 'Unable to read device location. Choose a location manually.');
    setSelectorOpen(true);
  }

  async function handleConfirm(traffic) {
    setActionError('');
    try {
      await trafficApi.confirm(traffic.id, { type: 'still_accurate' });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Confirmation failed.');
    }
  }

  async function handleCorrect(traffic) {
    setActionError('');
    try {
      await trafficApi.correct(traffic.id, {
        type: 'no_longer_accurate',
        note: 'Marked no longer accurate from traffic feed',
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Update failed.');
    }
  }

  const hasSummaryData = summary && summary.total > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Traffic
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Traffic around you
          </h1>
          <button
            type="button"
            onClick={() => setSelectorOpen(true)}
            className="mt-3 inline-flex max-w-full items-center gap-2 rounded-pill border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800"
          >
            <span className="truncate">{locationLabel}</span>
            <span className="text-[10px] uppercase tracking-wide text-brand-600">Change</span>
          </button>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={useMyLocation}>
              Traffic near me
            </Button>
            {deviceCoords ? (
              <button
                type="button"
                className="text-xs font-semibold text-brand-700 underline"
                onClick={() => setDeviceCoords(null)}
              >
                Clear GPS filter
              </button>
            ) : null}
          </div>
          {gpsHint ? <p className="mt-2 text-xs text-ink-muted">{gpsHint}</p> : null}
          {asOf ? (
            <p className="mt-1 text-[11px] text-ink-soft">
              Live snapshot as of {new Date(asOf).toLocaleTimeString()}. Offline or cached copies
              must not be treated as current traffic.
            </p>
          ) : null}
          <p className="mt-2 rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Please use Update Me only when safely stopped or through a passenger — do not interact
            while driving.
          </p>
        </div>
        <Button onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? 'Hide form' : 'Report Traffic'}
        </Button>
      </div>

      {summary?.activityWindow ? (
        <div className="rounded-card border border-surface-border bg-white px-4 py-3 text-sm shadow-card">
          <p className="font-semibold text-ink">
            Active events: {summary.activeEvents ?? 0}
            {summary.highSeverityEvents != null
              ? ` · High severity: ${summary.highSeverityEvents}`
              : ''}
          </p>
          <p className="mt-1 text-xs text-ink-muted">{summary.activityWindow.note}</p>
        </div>
      ) : null}

      {composerOpen ? (
        <TrafficComposer
          onSubmitted={() => {
            setComposerOpen(false);
            load();
          }}
        />
      ) : null}

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Traffic view"
      >
        {[
          { id: 'list', label: 'List' },
          { id: 'map', label: 'Map' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={cn(
              'rounded-pill border px-3 py-1.5 text-sm font-semibold',
              view === tab.id
                ? 'border-brand-500 bg-brand-50 text-brand-900'
                : 'border-surface-border text-ink-muted'
            )}
          >
            {tab.label}
          </button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-surface-border sm:inline-block" aria-hidden />
        {[
          { id: 'events', label: 'Events' },
          { id: 'reports', label: 'Community reports' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFeed(tab.id)}
            className={cn(
              'rounded-pill border px-3 py-1.5 text-sm font-semibold',
              feed === tab.id
                ? 'border-ink bg-ink text-white'
                : 'border-surface-border text-ink-muted'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-sm font-bold text-ink">Area overview</h2>
        {hasSummaryData ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SUMMARY_KEYS.map((key) => {
              const count = summary.bySeverity?.[key] || 0;
              const label = TRAFFIC_SEVERITIES.find((s) => s.value === key)?.label || key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSeverityFilter((prev) => (prev === key ? '' : key))}
                  className={cn(
                    'rounded-control border px-3 py-3 text-left',
                    severityFilter === key ? 'border-brand-500 bg-brand-50' : 'border-surface-border',
                    severityClass(key)
                  )}
                >
                  <span className="block text-xs font-semibold uppercase tracking-wide opacity-80">
                    {label}
                  </span>
                  <span className="mt-1 block text-xl font-bold">{count}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">No recent traffic reports for this area.</p>
        )}
      </section>

      <FormError message={actionError || error} />

      {loading ? <p className="text-sm text-ink-muted">Loading traffic updates…</p> : null}

      {view === 'map' ? (
        <section
          className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card"
          aria-label="Traffic map"
        >
          <div className="h-[min(70vh,520px)] w-full min-h-[280px]">
            <ExploreMap
              center={mapCenter}
              geojson={geojson}
              className="h-full w-full"
            />
          </div>
          <p className="border-t border-surface-border px-3 py-2 text-xs text-ink-muted">
            Clustered active events only. List view below remains available for accessibility and
            poor connectivity.
          </p>
        </section>
      ) : null}

      {feed === 'events' ? (
        <>
          {!loading && events.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-border bg-surface-muted/50 p-6 text-center">
              <h2 className="text-lg font-bold text-ink">No active traffic events</h2>
              <p className="mt-2 text-sm text-ink-muted">
                There are no live events for this area right now.
              </p>
              <Button className="mt-4" onClick={() => setComposerOpen(true)}>
                Report Traffic
              </Button>
            </div>
          ) : null}
          <div className="grid gap-3" role="list" aria-label="Traffic events">
            {events.map((event) => (
              <TrafficEventCard key={event.id} event={event} />
            ))}
          </div>
        </>
      ) : (
        <>
          {!loading && items.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-border bg-surface-muted/50 p-6 text-center">
              <h2 className="text-lg font-bold text-ink">No recent community reports</h2>
              <p className="mt-2 text-sm text-ink-muted">
                Community reports stay labeled as community — never as official.
              </p>
              <Button className="mt-4" onClick={() => setComposerOpen(true)}>
                Report Traffic
              </Button>
            </div>
          ) : null}
          <div className="grid gap-3">
            {items.map((traffic) => (
              <TrafficCard
                key={traffic.id}
                traffic={traffic}
                showActions
                onConfirm={handleConfirm}
                onCorrect={handleCorrect}
              />
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-ink-muted">
        Looking for the full report composer?{' '}
        <Link href="/app/report" className="font-semibold text-brand-700 hover:underline">
          Open Report
        </Link>
      </p>

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={async (selection) => {
          setDeviceCoords(null);
          await setLocation(selection);
        }}
      />
    </div>
  );
}
