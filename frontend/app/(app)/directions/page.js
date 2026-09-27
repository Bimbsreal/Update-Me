'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CorridorSummaryCard, DirectionResultCard } from '@/components/directions/DirectionResultCard';
import { DirectionsComposer } from '@/components/directions/DirectionsComposer';
import { PlaceSearchField } from '@/components/directions/PlaceSearchField';
import { MapFoundation } from '@/components/location/MapFoundation';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { useLocationSource } from '@/components/location/LocationSourceProvider';
import { resolveDeviceToPublicLocation } from '@/lib/resolveDeviceLocation';
import { ApiError, directionsApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { DIRECTION_MODES } from '@/lib/directions';
import {
  GEO_STATUS,
  getCurrentPosition,
  messageForStatus,
  watchPosition,
} from '@/lib/geolocation';
import { LOCATION_SOURCES } from '@/lib/locationSource';

export default function DirectionsPage() {
  const { user } = useAuth();
  const { setFromSelection } = useLocationSource();
  const [origin, setOrigin] = useState(
    user?.currentArea?.locationId
      ? {
          locationId: user.currentArea.locationId,
          label: `${user.currentArea.name}${user.currentArea.lga ? ` · ${user.currentArea.lga}` : ''}`,
          name: user.currentArea.name,
        }
      : null
  );
  const [destination, setDestination] = useState(null);
  const [mode, setMode] = useState('driving');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [geoNote, setGeoNote] = useState('');
  const [geoStatus, setGeoStatus] = useState(GEO_STATUS.IDLE);
  const [liveTracking, setLiveTracking] = useState(false);
  const watchRef = useRef(null);

  useEffect(() => {
    return () => {
      watchRef.current?.clear?.();
      watchRef.current = null;
    };
  }, []);

  const mapCoords = useMemo(() => {
    return data?.origin?.coordinates || origin?.coordinates || null;
  }, [data, origin]);

  async function findDirections() {
    setError('');
    setGeoNote('');
    if (!origin?.locationId || !destination?.locationId) {
      setError('Choose both a From and To place.');
      return;
    }
    setLoading(true);
    try {
      const result = await directionsApi.search({
        originLocationId: origin.locationId,
        destinationLocationId: destination.locationId,
        mode,
      });
      setData(result);
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : 'Unable to find directions.');
    } finally {
      setLoading(false);
    }
  }

  async function applyDeviceOrigin(position) {
    const resolved = await resolveDeviceToPublicLocation(position, { radiusKm: 8, limit: 5 });
    if (!resolved.resolved) {
      setGeoStatus(GEO_STATUS.UNAVAILABLE);
      setGeoNote(
        'We found your position but could not match it to a known area. Search manually.'
      );
      return false;
    }

    // Never put private GPS on the map — only the resolved place centroid.
    setOrigin({
      locationId: resolved.locationId,
      label: resolved.label,
      name: resolved.public?.name || resolved.label,
      type: resolved.type,
      coordinates: resolved.placeCoordinates || null,
      source: LOCATION_SOURCES.DEVICE,
    });
    setFromSelection({
      source: LOCATION_SOURCES.DEVICE,
      locationId: resolved.locationId,
      areaId: resolved.areaId,
      label: resolved.label,
      privateCoords: resolved.privateCoords,
      public: resolved.public,
      lowAccuracy: resolved.lowAccuracy,
    });
    setGeoStatus(GEO_STATUS.GRANTED);
    setGeoNote(
      resolved.lowAccuracy
        ? 'Using the nearest known area to your current location (approximate accuracy).'
        : 'From: my current location (nearest known area). Exact GPS is not shown on the map.'
    );
    return true;
  }

  async function useCurrentLocation() {
    setGeoStatus(GEO_STATUS.REQUESTING);
    setGeoNote(messageForStatus(GEO_STATUS.REQUESTING));
    const result = await getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 60000,
    });
    if (!result.ok) {
      setGeoStatus(result.status);
      setGeoNote(result.message);
      return;
    }
    try {
      await applyDeviceOrigin(result.position);
    } catch {
      setGeoStatus(GEO_STATUS.ERROR);
      setGeoNote('Could not resolve your location. Please search manually.');
    }
  }

  function stopLiveTracking() {
    watchRef.current?.clear?.();
    watchRef.current = null;
    setLiveTracking(false);
    setGeoNote((prev) =>
      prev?.includes('Updating') ? 'Stopped updating From as you move.' : prev
    );
  }

  function startLiveTracking() {
    if (liveTracking) {
      stopLiveTracking();
      return;
    }
    setGeoNote(
      'Live tracking updates your From place as you move. Tracking stops when you leave this page or turn it off.'
    );
    setLiveTracking(true);
    watchRef.current?.clear?.();
    watchRef.current = watchPosition(
      async (update) => {
        if (!update.ok) return;
        setGeoNote('Updating From from your current location…');
        try {
          await applyDeviceOrigin(update.position);
        } catch {
          /* keep last known origin */
        }
      },
      (err) => {
        setGeoStatus(err.status || GEO_STATUS.ERROR);
        setGeoNote(err.message || messageForStatus(GEO_STATUS.ERROR));
        stopLiveTracking();
      }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Directions
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Where are you going?
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Local Nigerian route context — transport corridors, traffic, alerts, and community
          knowledge. Not a turn-by-turn navigation app.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
          <PlaceSearchField
            id="directions-from"
            label="From"
            value={origin}
            onChange={(value) => {
              setOrigin(value);
              if (liveTracking) stopLiveTracking();
            }}
            placeholder="Search area, road, landmark…"
          />
          <PlaceSearchField
            id="directions-to"
            label="To"
            value={destination}
            onChange={setDestination}
            placeholder="Search destination…"
          />

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Transport mode</p>
            <div className="flex flex-wrap gap-2">
              {DIRECTION_MODES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value)}
                  className={cn(
                    'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                    mode === item.value
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface-muted text-ink-muted'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={useCurrentLocation}
              disabled={geoStatus === GEO_STATUS.REQUESTING}
              aria-label="Use my current location as From"
            >
              {geoStatus === GEO_STATUS.REQUESTING
                ? 'Getting your location…'
                : 'From: My current location'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={startLiveTracking}
              aria-pressed={liveTracking}
              aria-label={
                liveTracking
                  ? 'Stop updating From as I move'
                  : 'Update From as I move (optional)'
              }
            >
              {liveTracking ? 'Stop live From updates' : 'Update From as I move'}
            </Button>
            <Button type="button" onClick={findDirections} disabled={loading}>
              {loading ? 'Finding…' : 'Find directions'}
            </Button>
          </div>
          {geoNote ? (
            <p className="text-xs text-ink-soft" aria-live="polite">
              {geoNote}
            </p>
          ) : null}
          <FormError message={error} />
        </div>

        <MapFoundation
          label="MapLibre-ready · origin / destination markers planned"
          coordinates={mapCoords}
          className="min-h-[220px] lg:min-h-full"
        />
      </div>

      {data ? (
        <div className="space-y-4">
          <CorridorSummaryCard
            corridor={data.corridor}
            routing={data.routing}
            context={data.context}
          />

          {data.results?.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {data.results.map((item) => (
                <DirectionResultCard key={item.id} result={item} />
              ))}
            </div>
          ) : (
            <div className="rounded-card border border-dashed border-surface-border p-5 text-sm text-ink-muted">
              {data.empty?.message ||
                'No local directions have been reported for this route yet.'}
              <div className="mt-3">
                <Button type="button" onClick={() => setComposerOpen(true)}>
                  Share local knowledge
                </Button>
              </div>
            </div>
          )}

          {data.results?.length && data.empty?.noLocalKnowledge ? (
            <div className="rounded-card border border-dashed border-surface-border p-4 text-sm text-ink-muted">
              No local directions have been reported for this route yet.{' '}
              <button
                type="button"
                className="font-semibold text-brand-700 hover:underline"
                onClick={() => setComposerOpen(true)}
              >
                Share local knowledge
              </button>
            </div>
          ) : null}

          {data.corridor?.id ? (
            <Link
              href={`/directions/${encodeURIComponent(data.corridor.id)}`}
              className="inline-flex text-sm font-semibold text-brand-700 hover:underline"
            >
              Open full corridor view →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? 'Close form' : 'Share local knowledge'}
        </Button>
      </div>

      {composerOpen ? (
        <DirectionsComposer
          presetOrigin={origin}
          presetDestination={destination}
          onSubmitted={() => {
            setComposerOpen(false);
            if (origin?.locationId && destination?.locationId) findDirections();
          }}
        />
      ) : null}
    </div>
  );
}
