'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
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
import { FUEL_AVAILABILITY, FUEL_TYPES, availabilityClass, formatFuelAge, formatFuelPrice } from '@/lib/fuel';
import { getCurrentPosition, GEO_STATUS, GEO_MESSAGES } from '@/lib/geolocation';

const ExploreMap = dynamic(
  () => import('@/components/explore/ExploreMap').then((m) => m.ExploreMap),
  { ssr: false, loading: () => <p className="p-4 text-sm text-ink-muted">Loading map…</p> }
);

export default function FuelPage() {
  const { user, setLocation } = useAuth();
  const [stations, setStations] = useState([]);
  const [compareRows, setCompareRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [officialItems, setOfficialItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [fuelType, setFuelType] = useState('pms');
  const [availability, setAvailability] = useState('');
  const [deviceCoords, setDeviceCoords] = useState(null);
  const [geoStatus, setGeoStatus] = useState(GEO_STATUS.IDLE);
  const [geoBusy, setGeoBusy] = useState(false);
  const [view, setView] = useState('list');
  const [asOf, setAsOf] = useState(null);

  const area = user?.currentArea;
  const locationLabel = area
    ? `${area.name}${area.state ? `, ${area.state}` : ''}`
    : 'Choose your area';

  const mapCenter = useMemo(() => {
    if (deviceCoords) return deviceCoords;
    const withCoords = stations.find((s) => s.coordinates || s.map?.lat != null);
    if (withCoords?.coordinates) return withCoords.coordinates;
    if (withCoords?.map?.lat != null) return { lat: withCoords.map.lat, lng: withCoords.map.lng };
    return { lat: 6.5244, lng: 3.3792 };
  }, [deviceCoords, stations]);

  const geojson = useMemo(() => {
    const features = stations
      .map((s) => {
        const lat = s.coordinates?.lat ?? s.map?.lat;
        const lng = s.coordinates?.lng ?? s.map?.lng;
        if (lat == null || lng == null) return null;
        const latest =
          s.latestReports?.find((r) => r.fuelType === fuelType) || s.latestReports?.[0];
        return {
          type: 'Feature',
          id: s.id,
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            id: s.id,
            title: s.name,
            brand: s.brand,
            price: latest?.price?.amount ?? null,
            freshness: latest?.report?.freshness || latest?.freshness || null,
            sourceType: latest?.report?.sourceType || 'community',
          },
        };
      })
      .filter(Boolean);
    return { type: 'FeatureCollection', features };
  }, [stations, fuelType]);

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
      if (deviceCoords?.lat != null && deviceCoords?.lng != null) {
        stationData = await fuelApi.nearby(deviceCoords.lat, deviceCoords.lng, {
          ...stationParams,
          radiusKm: 8,
        });
      } else if (area?.locationId) {
        stationData = await fuelApi.stations(stationParams);
      } else {
        stationData = await fuelApi.stations({ ...stationParams, limit: 20 });
      }

      const compareParams = {
        fuelType,
        limit: 12,
        radiusKm: 8,
      };
      if (deviceCoords?.lat != null && deviceCoords?.lng != null) {
        compareParams.lat = deviceCoords.lat;
        compareParams.lng = deviceCoords.lng;
      } else if (area?.locationId) {
        compareParams.locationId = area.locationId;
      }

      const [summaryData, officialData, compareData] = await Promise.all([
        fuelApi.summary(summaryParams),
        officialApi.list({ category: 'fuel_petroleum', limit: 3 }).catch(() => ({ items: [] })),
        compareParams.lat != null || compareParams.locationId
          ? fuelApi.compare(compareParams).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ]);

      const list = stationData.items || stationData.stations || stationData || [];
      setStations(Array.isArray(list) ? list : []);
      setCompareRows(compareData.items || []);
      setSummary(summaryData.summary || null);
      setAsOf(summaryData.summary?.asOf || new Date().toISOString());
      setOfficialItems(officialData.items || []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load fuel information.');
    } finally {
      setLoading(false);
    }
  }, [area?.locationId, fuelType, availability, deviceCoords?.lat, deviceCoords?.lng]);

  useEffect(() => {
    load();
  }, [load]);

  async function useMyLocation() {
    setGeoBusy(true);
    setGeoStatus(GEO_STATUS.REQUESTING);
    setError('');
    const result = await getCurrentPosition({ enableHighAccuracy: false });
    if (!result.ok || !result.position) {
      setDeviceCoords(null);
      setGeoStatus(result.status || GEO_STATUS.ERROR);
      setError(result.message || GEO_MESSAGES[GEO_STATUS.ERROR]);
      setGeoBusy(false);
      return;
    }
    setDeviceCoords({ lat: result.position.lat, lng: result.position.lng });
    setGeoStatus(GEO_STATUS.GRANTED);
    setGeoBusy(false);
  }

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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectorOpen(true)}
              className="inline-flex max-w-full items-center gap-2 rounded-pill border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800"
            >
              <span className="truncate">{locationLabel}</span>
              <span aria-hidden>▾</span>
            </button>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={geoBusy}
              className="inline-flex min-h-11 items-center rounded-pill border border-surface-border bg-white px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {geoBusy
                ? 'Locating…'
                : deviceCoords
                  ? 'Using nearby GPS'
                  : 'Stations near me'}
            </button>
            {deviceCoords ? (
              <button
                type="button"
                onClick={() => {
                  setDeviceCoords(null);
                  setGeoStatus(GEO_STATUS.IDLE);
                }}
                className="text-xs font-semibold text-ink-muted underline"
              >
                Clear GPS
              </button>
            ) : null}
          </div>
          {geoStatus !== GEO_STATUS.IDLE && geoStatus !== GEO_STATUS.GRANTED && geoStatus !== GEO_STATUS.REQUESTING ? (
            <p className="mt-2 text-xs text-ink-muted" role="status">
              {GEO_MESSAGES[geoStatus] || 'Choose a location manually.'}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-ink-soft">
            Community pump prices are not official marketer prices. Your precise coordinates are
            never shown to other users.
            {asOf ? ` Snapshot as of ${new Date(asOf).toLocaleTimeString()}.` : ''}
          </p>
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

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Fuel view">
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
              'min-h-11 rounded-pill border px-3 py-1.5 text-sm font-semibold',
              view === tab.id
                ? 'border-brand-500 bg-brand-50 text-brand-900'
                : 'border-surface-border text-ink-muted'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
          {summary.observedRange ? (
            <p className="mt-2 text-ink">
              Observed range:{' '}
              <strong>
                ₦{Number(summary.observedRange.min).toLocaleString('en-NG')}–₦
                {Number(summary.observedRange.max).toLocaleString('en-NG')}/L
              </strong>
              <span className="mt-1 block text-xs text-ink-muted">{summary.observedRange.note}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {view === 'map' ? (
        <section
          className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card"
          aria-label="Fuel stations map"
        >
          <div className="h-[min(70vh,520px)] w-full min-h-[280px]">
            <ExploreMap center={mapCenter} geojson={geojson} className="h-full w-full" />
          </div>
          <p className="border-t border-surface-border px-3 py-2 text-xs text-ink-muted">
            Clustered stations with latest fresh observations. List view remains available for
            accessibility and low connectivity.
          </p>
        </section>
      ) : null}

      {compareRows.length ? (
        <section aria-labelledby="fuel-compare-heading" className="space-y-3">
          <div>
            <h2 id="fuel-compare-heading" className="text-lg font-bold text-ink">
              Nearby price comparison
            </h2>
            <p className="text-xs text-ink-muted">
              Fresh retail pump observations only · sorted by freshness, then distance — not lowest
              price alone.
            </p>
          </div>
          <div className="hidden overflow-x-auto rounded-card border border-surface-border bg-white shadow-card md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Station
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Price
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Reported
                  </th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.stationId || row.id} className="border-b border-surface-border/70 last:border-0">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/fuel/stations/${row.stationId || row.id}`}
                        className="font-semibold text-brand-800 hover:underline"
                      >
                        {row.stationName || row.name}
                      </Link>
                      {row.brand ? (
                        <span className="mt-0.5 block text-xs text-ink-muted">{row.brand}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums text-ink">
                      {formatFuelPrice({
                        amount:
                          row.priceAmount ??
                          row.price?.amount ??
                          (typeof row.price === 'number' ? row.price : null),
                        currency: row.currency || row.price?.currency || 'NGN',
                        unit: row.unit || row.price?.unit || 'litre',
                      }) || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">
                      {formatFuelAge(row.observedAt || row.reportedAt) || '—'}
                      {row.distanceKm != null ? (
                        <span className="mt-0.5 block text-xs">{Number(row.distanceKm).toFixed(1)} km</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden" aria-label="Nearby price comparison list">
            {compareRows.map((row) => (
              <li
                key={`m-${row.stationId || row.id}`}
                className="rounded-card border border-surface-border bg-white p-3 shadow-card"
              >
                <Link
                  href={`/fuel/stations/${row.stationId || row.id}`}
                  className="font-semibold text-brand-800"
                >
                  {row.stationName || row.name}
                </Link>
                <p className="mt-1 text-sm font-bold tabular-nums">
                  {formatFuelPrice({
                    amount:
                      row.priceAmount ??
                      row.price?.amount ??
                      (typeof row.price === 'number' ? row.price : null),
                    currency: row.currency || 'NGN',
                    unit: row.unit || 'litre',
                  }) || '—'}
                </p>
                <p className="text-xs text-ink-muted">
                  {formatFuelAge(row.observedAt || row.reportedAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
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
          setDeviceCoords(null);
          await setLocation(selection);
        }}
      />
    </div>
  );
}
