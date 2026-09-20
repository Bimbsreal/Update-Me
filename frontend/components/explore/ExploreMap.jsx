'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MARKER_COLORS } from '@/lib/explore';

/**
 * MapLibre map with clustering + OSM-compatible raster tiles.
 * Loaded client-side only (no SSR).
 */
export function ExploreMap({
  center,
  geojson,
  selectedId,
  onSelectFeature,
  onMoveEnd,
  className = '',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [popup, setPopup] = useState(null);
  const onMoveEndRef = useRef(onMoveEnd);
  const onSelectRef = useRef(onSelectFeature);

  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
  }, [onMoveEnd]);
  useEffect(() => {
    onSelectRef.current = onSelectFeature;
  }, [onSelectFeature]);

  useEffect(() => {
    let cancelled = false;
    let map;

    async function init() {
      try {
        // Support both MapLibre v4 (default export) and v5+ (named exports)
        const mod = await import('maplibre-gl');
        const maplibregl = mod.default ?? mod;
        if (cancelled || !containerRef.current) return;

        // Ensure container has dimensions before MapLibre measures it
        await new Promise((r) => requestAnimationFrame(r));
        if (cancelled || !containerRef.current) return;

        const el = containerRef.current;
        if (!el.offsetWidth || !el.offsetHeight) {
          // Parent may still be layouting; wait one more frame
          await new Promise((r) => requestAnimationFrame(r));
        }

        // OSM-compatible raster basemap (no commercial API key).
        // Prefer raster over remote vector styles for reliable Next.js/WebGL loading.
        map = new maplibregl.Map({
          container: el,
          style: {
            version: 8,
            sources: {
              osm: {
                type: 'raster',
                tiles: [
                  'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
                  'https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
                  'https://c.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
                ],
                tileSize: 256,
                attribution:
                  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxzoom: 19,
              },
            },
            layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
          },
          center: [center?.lng ?? 3.3792, center?.lat ?? 6.5244],
          zoom: 12,
          attributionControl: true,
        });

        map.once('load', () => {
          map.resize();
        });

        // Keep WebGL canvas sized with responsive layout changes
        const resizeObserver = new ResizeObserver(() => {
          try {
            map.resize();
          } catch {
            /* map may be removed */
          }
        });
        resizeObserver.observe(el);
        map.__exploreResizeObserver = resizeObserver;

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        map.on('load', () => {
          if (cancelled) return;
          map.addSource('explore', {
            type: 'geojson',
            data: geojson || { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterMaxZoom: 15,
            clusterRadius: 48,
          });

          map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'explore',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': '#006d44',
              'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 26],
              'circle-opacity': 0.88,
            },
          });

          map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'explore',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': '{point_count_abbreviated}',
              'text-size': 12,
            },
            paint: { 'text-color': '#ffffff' },
          });

          map.addLayer({
            id: 'unclustered',
            type: 'circle',
            source: 'explore',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': [
                'match',
                ['get', 'markerKind'],
                'traffic',
                MARKER_COLORS.traffic,
                'fuel',
                MARKER_COLORS.fuel,
                'transport',
                MARKER_COLORS.transport,
                'prices',
                MARKER_COLORS.prices,
                'alert',
                MARKER_COLORS.alert,
                'local_alerts',
                MARKER_COLORS.alert,
                'official',
                MARKER_COLORS.official,
                'community',
                MARKER_COLORS.community,
                MARKER_COLORS.report,
              ],
              'circle-radius': 8,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            },
          });

          map.on('click', 'clusters', (e) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const clusterId = features[0]?.properties?.cluster_id;
            const source = map.getSource('explore');
            source.getClusterExpansionZoom(clusterId, (err, zoom) => {
              if (err) return;
              map.easeTo({
                center: features[0].geometry.coordinates,
                zoom,
              });
            });
          });

          map.on('click', 'unclustered', (e) => {
            const feature = e.features?.[0];
            if (!feature) return;
            const props = feature.properties || {};
            setPopup({
              ...props,
              lng: feature.geometry.coordinates[0],
              lat: feature.geometry.coordinates[1],
            });
            onSelectRef.current?.(props);
          });

          map.on('mouseenter', 'clusters', () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', 'clusters', () => {
            map.getCanvas().style.cursor = '';
          });
          map.on('mouseenter', 'unclustered', () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', 'unclustered', () => {
            map.getCanvas().style.cursor = '';
          });

          let moveTimer;
          map.on('moveend', () => {
            clearTimeout(moveTimer);
            moveTimer = setTimeout(() => {
              const b = map.getBounds();
              onMoveEndRef.current?.({
                bbox: `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`,
                center: { lat: map.getCenter().lat, lng: map.getCenter().lng },
                zoom: map.getZoom(),
              });
            }, 400);
          });

          setReady(true);
        });

        map.on('error', (e) => {
          // Tile errors are non-fatal; only show message for hard failures
          if (e?.error?.message && /Failed to fetch|network/i.test(e.error.message)) {
            setError('Map tiles could not be loaded. You can still use the list view.');
          }
        });

        mapRef.current = map;
      } catch (err) {
        console.error('ExploreMap init failed', err);
        if (!cancelled) setError('Map failed to initialize. Use list view instead.');
      }
    }

    init();
    return () => {
      cancelled = true;
      try {
        mapRef.current?.__exploreResizeObserver?.disconnect();
      } catch {
        /* ignore */
      }
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !center?.lat) return;
    map.easeTo({ center: [center.lng, center.lat], duration: 600 });
  }, [center?.lat, center?.lng, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource('explore');
    if (source) {
      source.setData(geojson || { type: 'FeatureCollection', features: [] });
    }
  }, [geojson, ready]);

  return (
    <div className={`relative min-h-[280px] overflow-hidden rounded-card border border-surface-border bg-[#d9ebe1] ${className}`}>
      <div ref={containerRef} className="absolute inset-0" data-map-provider="maplibre" />
      {!ready && !error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#d9ebe1]/70 text-sm text-ink-muted">
          Loading map…
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-x-3 bottom-3 rounded-card border border-surface-border bg-white/95 p-3 text-sm text-ink-muted">
          {error}
        </div>
      ) : null}
      {popup ? (
        <div className="absolute bottom-3 left-3 right-3 z-10 rounded-card border border-surface-border bg-white p-3 shadow-card sm:left-auto sm:right-3 sm:w-72">
          <button
            type="button"
            className="absolute right-2 top-2 text-xs text-ink-muted"
            onClick={() => setPopup(null)}
            aria-label="Close preview"
          >
            ✕
          </button>
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
            {popup.markerKind || popup.category}
          </p>
          <p className="mt-1 font-bold text-ink break-words">{popup.title}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {popup.locationName || ''}
            {popup.freshness ? ` · ${popup.freshness}` : ''}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {popup.sourceLabel}
            {popup.statusLabel ? ` · ${popup.statusLabel}` : ''}
          </p>
          {popup.detailPath ? (
            <Link
              href={popup.detailPath}
              className="mt-3 inline-flex text-sm font-semibold text-brand-700 hover:underline"
            >
              View details →
            </Link>
          ) : null}
        </div>
      ) : null}
      {selectedId ? (
        <span className="sr-only">Selected {selectedId}</span>
      ) : null}
    </div>
  );
}
