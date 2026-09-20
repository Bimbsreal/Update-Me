'use client';

import { useId, useMemo } from 'react';

/**
 * Lightweight SVG line chart — no chart library dependency.
 */
export function FxLineChart({ points = [], className = '' }) {
  const gradientId = useId().replace(/:/g, '');

  const { path, area, minLabel, maxLabel } = useMemo(() => {
    if (!points.length) {
      return { path: '', area: '', minLabel: '', maxLabel: '' };
    }

    const rates = points.map((p) => Number(p.rate));
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const pad = max === min ? Math.max(Math.abs(min) * 0.01, 1) : (max - min) * 0.08;
    const yMin = min - pad;
    const yMax = max + pad;
    const width = 100;
    const height = 56;
    const n = points.length;

    const coords = points.map((p, i) => {
      const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
      const y = height - ((Number(p.rate) - yMin) / (yMax - yMin)) * height;
      return [x, y];
    });

    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const areaPath = `${line} L ${coords[coords.length - 1][0].toFixed(2)} ${height} L ${coords[0][0].toFixed(2)} ${height} Z`;

    return {
      path: line,
      area: areaPath,
      minLabel: min.toFixed(2),
      maxLabel: max.toFixed(2),
    };
  }, [points]);

  if (!points.length) {
    return (
      <div className={`flex h-40 items-center justify-center rounded-control bg-surface-muted text-sm text-ink-muted ${className}`}>
        No chart data
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-1 flex justify-between text-[11px] text-ink-soft">
        <span>Low ₦{minLabel}</span>
        <span>High ₦{maxLabel}</span>
      </div>
      <svg
        viewBox="0 0 100 56"
        className="h-40 w-full overflow-visible"
        role="img"
        aria-label="FX rate history chart"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#006D44" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#006D44" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          stroke="#006D44"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-ink-soft">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}
