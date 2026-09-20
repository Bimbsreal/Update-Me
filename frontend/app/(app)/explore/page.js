'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { LocationSelector } from '@/components/location/LocationSelector';
import { ExploreFilters } from '@/components/explore/ExploreFilters';
import { ExploreResultCard } from '@/components/explore/ExploreResultCard';
import { ExploreSearch } from '@/components/explore/ExploreSearch';
import { SearchGroupSection } from '@/components/search/SearchResultCard';
import { LiveStatusIndicator, useRealtime } from '@/components/realtime/RealtimeProvider';
import { Button } from '@/components/ui/Button';
import { ApiError, exploreApi, geoApi, locationsApi, searchApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { emptyMessage, reportHref } from '@/lib/explore';
import { REALTIME_EVENTS } from '@/lib/realtime';
const ExploreMap = dynamic(
  () => import('@/components/explore/ExploreMap').then((m) => m.ExploreMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[320px] items-center justify-center rounded-card border border-surface-border bg-[#d9ebe1] text-sm text-ink-muted">
        Loading map…
      </div>
    ),
  }
);

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return desktop;
}

function ExplorePageInner() {
  const router = useRouter();
  const { user, setLocation } = useAuth();
  const { explorePending, clearExplorePending, setExploreLocationId, subscribe, status: liveStatus } =
    useRealtime();
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();

  const [view, setView] = useState('list');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [freshness, setFreshness] = useState(searchParams.get('freshness') || 'recent');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [locationId, setLocationId] = useState(
    searchParams.get('locationId') || user?.currentArea?.locationId || ''
  );
  const [center, setCenter] = useState(null);
  const [bbox, setBbox] = useState('');
  const [useBbox, setUseBbox] = useState(false);
  const [items, setItems] = useState([]);
  const [geojson, setGeojson] = useState({ type: 'FeatureCollection', features: [] });
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [nearMeBusy, setNearMeBusy] = useState(false);
  const [nearMeNote, setNearMeNote] = useState('');
  const [pendingHint, setPendingHint] = useState('');
  const [searchGroups, setSearchGroups] = useState(null);
  const [searchEmpty, setSearchEmpty] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    if (isDesktop) setView('map');
    else setView('list');
  }, [isDesktop]);

  useEffect(() => {
    const nextQ = searchParams.get('q') || '';
    const nextLoc = searchParams.get('locationId') || '';
    const nextCat = searchParams.get('category') || 'all';
    const nextFresh = searchParams.get('freshness') || 'recent';
    setQ(nextQ);
    if (nextLoc) setLocationId(nextLoc);
    setCategory(nextCat);
    setFreshness(nextFresh);
  }, [searchParams]);

  useEffect(() => {
    if (locationId) return;
    if (user?.currentArea?.locationId) {
      setLocationId(user.currentArea.locationId);
    }
  }, [user?.currentArea?.locationId, locationId]);

  useEffect(() => {
    setExploreLocationId(locationId || null);
  }, [locationId, setExploreLocationId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (locationId) params.set('locationId', locationId);
    if (category && category !== 'all') params.set('category', category);
    if (freshness && freshness !== 'recent') params.set('freshness', freshness);
    const qs = params.toString();
    const next = qs ? `/explore?${qs}` : '/explore';
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) {
      router.replace(next, { scroll: false });
    }
  }, [q, locationId, category, freshness, router]);

  useEffect(() => {
    return subscribe(({ type, data }) => {
      if (!REALTIME_EVENTS.INFORMATION.has(type)) return;
      const label =
        type === 'traffic.updated'
          ? 'Traffic update available'
          : type === 'fuel.updated'
            ? 'Fuel update available'
            : type === 'alert.created' || type === 'alert.updated'
              ? 'Alert update available'
              : type === 'official.updated'
                ? 'Official update available'
                : 'New update available';
      setPendingHint(data?.status ? `${label} · ${data.status}` : label);
    });
  }, [subscribe]);

  const loadSearch = useCallback(async () => {
    const term = q.trim();
    if (!term) {
      setSearchGroups(null);
      setSearchEmpty(false);
      setSearchError('');
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    try {
      const data = await searchApi.search(term, {
        category: category !== 'all' ? category : undefined,
        freshness,
        locationId: locationId || undefined,
        limit: 30,
        mode: 'full',
      });
      setSearchGroups(data.groups || {});
      setSearchEmpty(Boolean(data.empty));
    } catch (err) {
      setSearchGroups(null);
      setSearchEmpty(false);
      setSearchError(err instanceof ApiError ? err.message : 'Search failed.');
    } finally {
      setSearchLoading(false);
    }
  }, [q, category, freshness, locationId]);

  useEffect(() => {
    loadSearch();
  }, [loadSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        category,
        freshness,
        status: status || undefined,
        q: q || undefined,
        limit: 40,
        page: 1,
      };
      if (useBbox && bbox) {
        params.bbox = bbox;
      } else if (locationId) {
        params.locationId = locationId;
        params.radiusKm = 12;
      }

      const data = await exploreApi.list(params);
      setItems(data.items || []);
      setGeojson(data.geojson || { type: 'FeatureCollection', features: [] });
      if (data.center) {
        setCenter({ lat: data.center.lat, lng: data.center.lng, location: data.center.location });
      }
    } catch (err) {
      setItems([]);
      setGeojson({ type: 'FeatureCollection', features: [] });
      setError(err instanceof ApiError ? err.message : 'Could not load explore results.');
    } finally {
      setLoading(false);
    }
  }, [category, freshness, status, q, locationId, bbox, useBbox]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId]
  );

  async function handleNearMe() {
    if (!navigator.geolocation) {
      setNearMeNote('Location is not available on this device. Choose an area instead.');
      return;
    }
    setNearMeBusy(true);
    setNearMeNote('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const resolved = await geoApi.resolve(pos.coords.latitude, pos.coords.longitude);
          const area = resolved.area;
          if (area?.id) {
            await setLocation({ areaId: area.id });
            const search = await locationsApi.search(area.name, { limit: 5 });
            const hit =
              (search.results || []).find((r) => r.type === 'area' && r.name === area.name) ||
              search.results?.[0];
            if (hit?.id) {
              setLocationId(hit.id);
              setUseBbox(false);
              if (hit.coordinates) {
                setCenter({
                  lat: hit.coordinates.lat,
                  lng: hit.coordinates.lng,
                  location: { id: hit.id, name: hit.name, coordinates: hit.coordinates },
                });
              }
            }
            setNearMeNote(`Showing updates around ${area.name}. Exact location is not shared.`);
          } else {
            setNearMeNote('Could not match your position to a known area. Select an area manually.');
          }
        } catch {
          setNearMeNote('Could not resolve your area. Select a location manually.');
        } finally {
          setNearMeBusy(false);
        }
      },
      () => {
        setNearMeBusy(false);
        setNearMeNote('Location permission denied. Select an area manually.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 }
    );
  }

  const showMap = isDesktop || view === 'map';
  const showList = isDesktop || view === 'list';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Explore</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            What&apos;s happening around you?
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Explore real-time and recently reported information around your selected area.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSelectorOpen(true)}>
            Change area
          </Button>
          <Button variant="secondary" disabled={nearMeBusy} onClick={handleNearMe}>
            {nearMeBusy ? 'Locating…' : 'Near Me'}
          </Button>
        </div>
      </div>

      {center?.location?.name || user?.currentArea?.name ? (
        <p className="text-sm text-ink-muted">
          Exploring{' '}
          <span className="font-semibold text-ink">
            {center?.location?.name || user?.currentArea?.name}
          </span>
          {user?.currentArea?.lga ? ` · ${user.currentArea.lga}` : ''}
          {user?.currentArea?.state ? ` · ${user.currentArea.state}` : ''}
        </p>
      ) : null}
      {nearMeNote ? <p className="text-xs text-brand-800">{nearMeNote}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <LiveStatusIndicator />
        {liveStatus === 'offline' || liveStatus === 'unavailable' ? (
          <span className="text-[11px] text-ink-muted">Browsing still works — refresh manually if needed.</span>
        ) : null}
      </div>

      {explorePending > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-brand-100 bg-brand-50/80 px-3 py-2.5 text-sm">
          <p className="min-w-0 text-brand-900">
            <span className="font-semibold">
              {explorePending} new update{explorePending === 1 ? '' : 's'}
            </span>
            {pendingHint ? <span className="text-brand-800"> · {pendingHint}</span> : null}
          </p>
          <button
            type="button"
            className="shrink-0 rounded-pill bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            onClick={() => {
              clearExplorePending();
              setPendingHint('');
              load();
            }}
          >
            Refresh results
          </button>
        </div>
      ) : null}

      <ExploreSearch
        locationId={locationId}
        initialQuery={q}
        onPickLocation={(s) => {
          setLocationId(s.id);
          setUseBbox(false);
          setQ('');
          if (s.coordinates) {
            setCenter({
              lat: s.coordinates.lat,
              lng: s.coordinates.lng,
              location: { id: s.id, name: s.title, coordinates: s.coordinates },
            });
          }
        }}
        onSubmitQuery={(term) => {
          setQ(term);
          setUseBbox(false);
        }}
      />

      {q.trim() ? (
        <div className="space-y-4 rounded-card border border-surface-border bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">Search results for “{q.trim()}”</h2>
            <button
              type="button"
              className="text-xs font-semibold text-brand-700"
              onClick={() => setQ('')}
            >
              Clear search
            </button>
          </div>
          {searchLoading ? <p className="text-sm text-ink-muted">Searching…</p> : null}
          {searchError ? (
            <div className="space-y-2">
              <p className="text-sm text-status-urgent" role="alert">
                {searchError}
              </p>
              <Button size="sm" variant="secondary" onClick={loadSearch}>
                Retry
              </Button>
            </div>
          ) : null}
          {searchEmpty && !searchLoading ? (
            <div className="space-y-2 py-4 text-center">
              <p className="text-sm font-semibold text-ink">No results found</p>
              <ul className="space-y-1 text-xs text-ink-muted">
                <li>Try a different spelling</li>
                <li>Search a road, area, station or update</li>
                <li>
                  <button type="button" className="font-semibold text-brand-700" onClick={handleNearMe}>
                    Explore nearby
                  </button>
                </li>
              </ul>
            </div>
          ) : null}
          {searchGroups && !searchEmpty ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {[
                'places',
                'fuel',
                'transport',
                'prices',
                'traffic',
                'alerts',
                'official',
                'community',
              ].map((group) => (
                <SearchGroupSection key={group} group={group} items={searchGroups[group]} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-pill border border-surface-border bg-white p-1 lg:hidden">
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'min-h-10 rounded-pill px-4 text-xs font-semibold',
              view === 'list' ? 'bg-brand-600 text-white' : 'text-ink-muted'
            )}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            className={cn(
              'min-h-10 rounded-pill px-4 text-xs font-semibold',
              view === 'map' ? 'bg-brand-600 text-white' : 'text-ink-muted'
            )}
          >
            Map
          </button>
        </div>
        <button
          type="button"
          className="min-h-10 rounded-pill border border-surface-border bg-white px-4 text-xs font-semibold text-ink lg:hidden"
          onClick={() => setFiltersOpen(true)}
        >
          Filters
        </button>
        <button
          type="button"
          className="min-h-10 rounded-pill border border-surface-border bg-white px-4 text-xs font-semibold text-ink-muted"
          onClick={() => {
            setCategory('all');
            setFreshness('recent');
            setStatus('');
            setQ('');
            setUseBbox(false);
          }}
        >
          Clear filters
        </button>
      </div>

      <div className="hidden lg:block">
        <ExploreFilters
          category={category}
          freshness={freshness}
          status={status}
          onCategory={(c) => {
            setCategory(c);
            setStatus('');
          }}
          onFreshness={setFreshness}
          onStatus={setStatus}
        />
      </div>

      <ExploreFilters
        variant="sheet"
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        category={category}
        freshness={freshness}
        status={status}
        onCategory={(c) => {
          setCategory(c);
          setStatus('');
        }}
        onFreshness={setFreshness}
        onStatus={setStatus}
      />

      {error ? (
        <div className="rounded-card border border-status-urgent/30 bg-white p-4 text-sm">
          <p className="font-semibold text-status-urgent">{error}</p>
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-brand-700"
            onClick={() => load()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        {showMap ? (
          <div className={cn(isDesktop ? 'lg:col-span-3' : '', 'min-h-[320px]')}>
            <ExploreMap
              className="h-[55vh] min-h-[320px] lg:h-[calc(100vh-14rem)]"
              center={center}
              geojson={geojson}
              selectedId={selectedId}
              onSelectFeature={(props) => setSelectedId(props.id)}
              onMoveEnd={({ bbox: nextBbox, zoom }) => {
                if (isDesktop && zoom >= 11) {
                  setBbox(nextBbox);
                  setUseBbox(true);
                }
              }}
            />
            {!isDesktop && view === 'map' ? (
              <button
                type="button"
                className="mt-3 w-full rounded-control border border-surface-border bg-white py-3 text-sm font-semibold"
                onClick={() => setView('list')}
              >
                Show list
              </button>
            ) : null}
          </div>
        ) : null}

        {showList ? (
          <div className={cn(isDesktop ? 'lg:col-span-2' : '', 'space-y-3')}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-ink">
                {loading ? 'Loading…' : `${items.length} result${items.length === 1 ? '' : 's'}`}
              </h2>
              {!isDesktop && view === 'list' ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-brand-700"
                  onClick={() => setView('map')}
                >
                  Show map
                </button>
              ) : null}
            </div>

            {!loading && !items.length ? (
              <div className="rounded-card border border-dashed border-surface-border p-5 text-sm text-ink-muted">
                <p>{emptyMessage(category)}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="font-semibold text-brand-700"
                    onClick={() => setSelectorOpen(true)}
                  >
                    Change area
                  </button>
                  <button
                    type="button"
                    className="font-semibold text-brand-700"
                    onClick={() => {
                      setCategory('all');
                      setFreshness('any');
                      setStatus('');
                      setQ('');
                    }}
                  >
                    Clear filters
                  </button>
                  <Link href={reportHref(category)} className="font-semibold text-brand-700">
                    Report an update
                  </Link>
                </div>
              </div>
            ) : null}

            <ul className="space-y-3 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1">
              {items.map((item) => (
                <li key={item.id}>
                  <ExploreResultCard
                    item={item}
                    selected={item.id === selectedId}
                    onSelect={(i) => setSelectedId(i.id)}
                    compact
                  />
                </li>
              ))}
            </ul>

            {selectedItem && isDesktop ? (
              <p className="text-xs text-ink-muted">
                Selected: {selectedItem.title}. Open details from the card or map popup.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {category === 'directions' ? (
        <div className="rounded-card border border-surface-border bg-white p-4">
          <p className="text-sm text-ink-muted">
            Directions combine corridors and local knowledge between places.
          </p>
          <Button as={Link} href="/directions" className="mt-3">
            Open Directions
          </Button>
        </div>
      ) : null}

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={async (selection) => {
          await setLocation(selection);
          if (selection.locationId) setLocationId(selection.locationId);
          setUseBbox(false);
        }}
      />
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading Explore…</p>}>
      <ExplorePageInner />
    </Suspense>
  );
}
