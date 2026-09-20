/**
 * Lightweight MapLibre foundation used on location detail pages.
 * Full interactive Explore map lives in components/explore/ExploreMap.jsx.
 */
export function MapFoundation({
  label = 'Map preview',
  coordinates = null,
  className = '',
}) {
  return (
    <div
      className={`relative min-h-[180px] overflow-hidden rounded-card border border-surface-border bg-[#d9ebe1] ${className}`}
      data-map-provider="maplibre"
      data-lat={coordinates?.lat ?? ''}
      data-lng={coordinates?.lng ?? ''}
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,109,68,0.08), rgba(0,109,68,0.08)), radial-gradient(circle at 30% 40%, #b7d7c5 0 8%, transparent 9%), radial-gradient(circle at 62% 58%, #9ad4b5 0 6%, transparent 7%)',
        }}
        aria-hidden
      />
      <div className="absolute bottom-3 left-3 rounded-pill bg-white/95 px-3 py-1 text-[11px] font-semibold text-brand-700">
        {label}
      </div>
      {coordinates ? (
        <div className="absolute right-3 top-3 rounded-control bg-ink/80 px-2.5 py-1 text-[11px] text-white">
          {Number(coordinates.lat).toFixed(3)}, {Number(coordinates.lng).toFixed(3)}
        </div>
      ) : null}
    </div>
  );
}
