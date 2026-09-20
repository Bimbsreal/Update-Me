'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LocationSelector } from '@/components/location/LocationSelector';
import { FuelStationCard } from '@/components/fuel/FuelStationCard';
import { FuelComposer } from '@/components/fuel/FuelComposer';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, fuelApi, officialApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { FUEL_AVAILABILITY, FUEL_TYPES, availabilityClass } from '@/lib/fuel';

export default function FuelPage() {
  const { user, setLocation } = useAuth();
  const [stations, setStations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [officialItems, setOfficialItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [fuelType, setFuelType] = useState('pms');
  const [availability, setAvailability] = useState('');

  const area = user?.currentArea;
  const locationLabel = area
    ? `${area.name}${area.state ? `, ${area.state}` : ''}`
    : 'Choose your area';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stationParams = { freshness: 'any', limit: 30, fuelType };
      const summaryParams = {};
      if (availability) stationParams.availability = availability;
      if (area?.locationId) {
        stationParams.locationId = area.locationId;
        summaryParams.locationId = area.locationId;
      }

      let stationData;
      if (area?.locationId) {
        // Prefer location-scoped list; fall back to nearby if coords available later
        stationData = await fuelApi.stations(stationParams);
      } else {
        stationData = await fuelApi.stations({ ...stationParams, limit: 20 });
      }

      const [summaryData, officialData] = await Promise.all([
        fuelApi.summary(summaryParams),
        officialApi.list({ category: 'fuel_petroleum', limit: 3 }).catch(() => ({ items: [] })),
      ]);

      setStations(stationData.items || []);
      setSummary(summaryData.summary || null);
      setOfficialItems(officialData.items || []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load fuel information.');
    } finally {
      setLoading(false);
    }
  }, [area?.locationId, fuelType, availability]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Fuel around you
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Fuel information
          </h1>
          <button
            type="button"
            onClick={() => setSelectorOpen(true)}
            className="mt-3 inline-flex max-w-full items-center gap-2 rounded-pill border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800"
          >
            <span className="truncate">{locationLabel}</span>
            <span aria-hidden>▾</span>
          </button>
        </div>
        <Button onClick={() => setComposerOpen((v) => !v)} className="w-full sm:w-auto">
          {composerOpen ? 'Close form' : 'Report fuel'}
        </Button>
      </div>

      {composerOpen ? (
        <FuelComposer
          onSubmitted={() => {
            setComposerOpen(false);
            load();
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Fuel type">
        {FUEL_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            role="tab"
            aria-selected={fuelType === type.value}
            onClick={() => setFuelType(type.value)}
            className={cn(
              'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
              fuelType === type.value
                ? 'bg-brand-600 text-white'
                : 'bg-surface-muted text-ink-muted hover:text-ink'
            )}
          >
            {type.shortLabel}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Availability">
        <button
          type="button"
          onClick={() => setAvailability('')}
          className={cn(
            'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
            !availability ? 'bg-ink text-white' : 'bg-surface-muted text-ink-muted'
          )}
        >
          Any status
        </button>
        {FUEL_AVAILABILITY.filter((a) => a.value !== 'unknown').map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setAvailability(item.value)}
            className={cn(
              'min-h-11 rounded-pill border px-3 py-1.5 text-xs font-semibold',
              availability === item.value ? availabilityClass(item.value) : 'border-surface-border'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {summary?.total ? (
        <div className="rounded-card border border-surface-border bg-white p-4 text-sm text-ink-muted shadow-card">
          {summary.total} recent community fuel report{summary.total === 1 ? '' : 's'}
          {summary.byAvailability?.available
            ? ` · ${summary.byAvailability.available} available`
            : ''}
        </div>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}
      {loading ? <p className="text-sm text-ink-muted">Loading stations…</p> : null}

      {!loading && stations.length === 0 ? (
        <div className="rounded-card border border-dashed border-surface-border p-5 text-sm text-ink-muted">
          No recent fuel reports around you.{' '}
          <button
            type="button"
            className="font-semibold text-brand-700 hover:underline"
            onClick={() => setComposerOpen(true)}
          >
            Report fuel information
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {stations.map((station) => (
          <FuelStationCard
            key={station.id}
            station={station}
            preferredFuelType={fuelType}
            showActions
            onConfirm={async (report) => {
              try {
                await fuelApi.confirm(report.reportId, { type: 'still_accurate' });
                await load();
              } catch (err) {
                setError(
                  err instanceof ApiError ? err.message : 'Unable to confirm this fuel report.'
                );
              }
            }}
          />
        ))}
      </div>

      {officialItems.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">Official petroleum updates</h2>
            <Link
              href="/official-updates"
              className="text-sm font-semibold text-status-official hover:underline"
            >
              View all
            </Link>
          </div>
          <p className="text-xs text-ink-soft">
            Official information from verified sources — not community-reported prices.
          </p>
          {officialItems.map((item) => (
            <OfficialUpdateCard key={item.id} update={item} compact />
          ))}
        </section>
      ) : null}

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={async (selection) => {
          await setLocation(selection);
        }}
      />
    </div>
  );
}
