'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CorridorSummaryCard, DirectionResultCard } from '@/components/directions/DirectionResultCard';
import { DirectionsComposer } from '@/components/directions/DirectionsComposer';
import { PlaceSearchField } from '@/components/directions/PlaceSearchField';
import { MapFoundation } from '@/components/location/MapFoundation';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, directionsApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { DIRECTION_MODES } from '@/lib/directions';

export default function DirectionsPage() {
  const { user } = useAuth();
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

  function useCurrentLocation() {
    if (!navigator?.geolocation) {
      setGeoNote('Location is not available in this browser.');
      return;
    }
    setGeoNote('Resolving your location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const nearby = await locationsApiNearby(pos.coords.latitude, pos.coords.longitude);
          if (nearby) {
            setOrigin(nearby);
            setGeoNote('Using the nearest known area to your current location.');
          } else {
            setGeoNote('Could not match your location to a known area. Please search manually.');
          }
        } catch {
          setGeoNote('Could not resolve your location. Please search manually.');
        }
      },
      () => setGeoNote('Location permission denied. Please search for your area instead.'),
      { enableHighAccuracy: false, timeout: 10000 }
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
            onChange={setOrigin}
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
            <Button type="button" variant="secondary" onClick={useCurrentLocation}>
              Use my current location
            </Button>
            <Button type="button" onClick={findDirections} disabled={loading}>
              {loading ? 'Finding…' : 'Find directions'}
            </Button>
          </div>
          {geoNote ? <p className="text-xs text-ink-soft">{geoNote}</p> : null}
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

async function locationsApiNearby(lat, lng) {
  const { locationsApi } = await import('@/lib/api');
  const data = await locationsApi.nearby(lat, lng, { radiusKm: 8, limit: 5 });
  const item = (data.results || data.items || [])[0];
  if (!item) return null;
  return {
    locationId: item.id,
    label: item.subtitle ? `${item.name} · ${item.subtitle}` : item.name,
    name: item.name,
    type: item.type,
    coordinates: item.coordinates || { lat, lng },
  };
}
