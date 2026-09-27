'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FuelComposer } from '@/components/fuel/FuelComposer';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { ReportTrustLabel } from '@/components/reports/ReportTrustLabel';
import { ShareControls } from '@/components/share/ShareControls';
import { FxLineChart } from '@/components/fx/FxLineChart';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { ApiError, fuelApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  availabilityClass,
  formatFuelAge,
  formatFuelPrice,
  fuelTypeLabel,
} from '@/lib/fuel';

export default function FuelStationDetailClient({ id: idProp } = {}) {
  const params = useParams();
  const id = idProp || params?.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [historyHours, setHistoryHours] = useState(168);
  const [historyOverride, setHistoryOverride] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const result = await fuelApi.station(id);
      setData(result);
      setError('');
      setHistoryOverride(null);
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : 'Unable to load station.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fuelApi
      .stationHistory(id, { fuelType: 'pms', hours: historyHours, limit: 40 })
      .then((hist) => {
        if (cancelled) return;
        setHistoryOverride({
          fuelType: 'pms',
          items: hist.items || [],
          points: hist.points || [],
          hours: hist.hours,
          note: hist.note || 'Historical observations — not a live quote.',
        });
      })
      .catch(() => {
        if (!cancelled) setHistoryOverride(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, historyHours]);

  async function handleConfirm(reportId) {
    setActionError('');
    try {
      await fuelApi.confirm(reportId, { type: 'still_accurate' });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Confirmation failed.');
    }
  }

  async function handleCorrect(reportId) {
    setActionError('');
    try {
      await fuelApi.correct(reportId, {
        type: 'no_longer_accurate',
        note: 'Marked no longer accurate from station page',
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Correction failed.');
    }
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading station…</p>;
  if (error || !data?.station) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-status-urgent">{error || 'Station not found.'}</p>
        <Button as={Link} href="/fuel" variant="secondary">
          Back to Fuel
        </Button>
      </div>
    );
  }

  const { station, recentReports = [], officialUpdates = [], priceHistory: baseHistory, asOf } = data;
  const priceHistory = historyOverride || baseHistory;
  const HISTORY_WINDOWS = [
    { hours: 24, label: '24h' },
    { hours: 168, label: '7d' },
    { hours: 720, label: '30d' },
    { hours: 2160, label: '90d' },
  ];
  const place = [
    station.address,
    station.landmarkLabel,
    station.location?.name,
    station.location?.subtitle,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-6">
      <Button as={Link} href="/fuel" variant="secondary" size="sm">
        ← Fuel around you
      </Button>

      <div className="rounded-card border border-surface-border bg-white p-5 shadow-card sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Fuel station
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink break-words sm:text-3xl">
          {station.name}
        </h1>
        <ShareControls className="mt-3" title={`${station.name} — Fuel`} text={place || station.name} />
        {station.brand ? (
          <p className="mt-1 text-sm font-semibold text-ink-muted">{station.brand}</p>
        ) : null}
        {place ? <p className="mt-3 text-sm text-ink-muted break-words">{place}</p> : null}
        {asOf ? (
          <p className="mt-2 text-[11px] text-ink-soft">
            Snapshot as of {new Date(asOf).toLocaleTimeString()}. Cached pages must not be treated as
            live pump prices.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {(station.latestReports || []).map((report) => (
            <span
              key={`${report.fuelType}-${report.reportId}`}
              className={cn(
                'inline-flex items-center rounded-pill border px-2.5 py-1 text-xs font-semibold',
                availabilityClass(report.availability)
              )}
            >
              {fuelTypeLabel(report.fuelType)} · {report.availabilityLabel}
              {formatFuelPrice(report.price) ? ` · ${formatFuelPrice(report.price)}` : ''}
            </span>
          ))}
          {!station.latestReports?.length ? (
            <span className="text-sm text-ink-muted">No recent reports yet.</span>
          ) : null}
        </div>

        <Button className="mt-5" onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? 'Close form' : 'Submit an update'}
        </Button>
      </div>

      {priceHistory?.points?.length || priceHistory?.items?.length ? (
        <section className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">
                Price history ({fuelTypeLabel(priceHistory.fuelType || 'pms')})
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                {priceHistory.note || 'Historical observations — not a live quote.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="History window">
              {HISTORY_WINDOWS.map((w) => (
                <button
                  key={w.hours}
                  type="button"
                  onClick={() => setHistoryHours(w.hours)}
                  className={cn(
                    'rounded-pill border px-2.5 py-1 text-xs font-semibold',
                    historyHours === w.hours
                      ? 'border-brand-600 bg-brand-50 text-brand-800'
                      : 'border-surface-border text-ink-muted'
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          {priceHistory?.points?.length ? (
            <div className="mt-3">
              <FxLineChart points={priceHistory.points} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">No observations in this window.</p>
          )}
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-ink-muted" aria-label="Price history list">
            {[...(priceHistory.items || [])].reverse().slice(0, 12).map((h) => (
              <li key={h.id}>
                {formatFuelPrice(h.price) || '—'} ·{' '}
                {h.observedAt ? new Date(h.observedAt).toLocaleString() : '—'} ·{' '}
                {h.trustLabel || h.sourceType || 'Community'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {composerOpen ? (
        <FuelComposer
          presetStation={station}
          onSubmitted={() => {
            setComposerOpen(false);
            load();
          }}
        />
      ) : null}

      {actionError ? <FormError>{actionError}</FormError> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Recent community reports</h2>
        {!recentReports.length ? (
          <p className="text-sm text-ink-muted">No community fuel reports for this station yet.</p>
        ) : null}
        {recentReports.map((fuel) => (
          <article
            key={fuel.id}
            className="rounded-card border border-surface-border bg-white p-4 shadow-card"
          >
            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  'rounded-pill border px-2.5 py-1 text-xs font-bold',
                  availabilityClass(fuel.availability)
                )}
              >
                {fuel.availabilityLabel}
              </span>
              {(fuel.report?.trustLabels || []).map((label) => (
                <ReportTrustLabel
                  key={label}
                  label={label}
                  sourceType={fuel.report?.sourceType}
                />
              ))}
            </div>
            <p className="mt-3 font-bold text-ink">
              {fuel.fuelTypeLabel}
              {formatFuelPrice(fuel.price) ? ` · ${formatFuelPrice(fuel.price)}` : ''}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Updated{' '}
              {formatFuelAge(
                fuel.report?.lastConfirmedAt || fuel.report?.occurredAt || fuel.report?.createdAt
              )}
              {fuel.report?.lastConfirmedAt
                ? ` · Confirmed ${formatFuelAge(fuel.report.lastConfirmedAt)}`
                : ''}
              {fuel.report?.freshness === 'stale' || fuel.report?.freshness === 'expired'
                ? ` · ${fuel.report.freshness === 'expired' ? 'Expired' : 'Stale'}`
                : ''}
            </p>
            {fuel.report?.description ? (
              <p className="mt-2 text-sm text-ink-muted break-words">{fuel.report.description}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleConfirm(fuel.id)}
              >
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleCorrect(fuel.id)}>
                No longer accurate
              </Button>
            </div>
          </article>
        ))}
      </section>

      {officialUpdates.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Related official updates</h2>
          <p className="text-xs text-ink-soft">
            Official petroleum notices — never shown as community prices.
          </p>
          {officialUpdates.map((item) => (
            <OfficialUpdateCard key={item.id} update={item} compact />
          ))}
        </section>
      ) : null}
    </div>
  );
}
