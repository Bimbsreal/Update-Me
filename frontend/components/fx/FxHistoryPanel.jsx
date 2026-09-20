'use client';

import { useEffect, useId, useState } from 'react';
import { fxApi } from '@/lib/api';
import { FX_DEFAULT_BASES, formatChangePercent, formatNaira, sourceLabel } from '@/lib/fx';
import { FxLineChart } from '@/components/fx/FxLineChart';
import { Button } from '@/components/ui/Button';

const PERIODS = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
];

export function FxHistoryPanel({ open, onClose, initialBase = 'USD', bases = FX_DEFAULT_BASES }) {
  const titleId = useId();
  const [base, setBase] = useState(initialBase);
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (open) setBase(initialBase);
  }, [open, initialBase]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fxApi.history({ base, quote: 'NGN', period });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Could not load FX history');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, base, period]);

  if (!open) return null;

  const changeLabel = formatChangePercent(data?.changePercent);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close FX history"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-surface-border bg-white shadow-soft sm:rounded-card">
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-4 py-4 sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
              Utility
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-bold text-ink">
              Naira FX history
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label="Close"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="block text-sm font-medium text-ink">
              Currency
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="mt-1.5 block h-11 w-full min-w-[8rem] rounded-control border border-surface-border bg-white px-3 text-sm text-ink focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:w-auto"
              >
                {bases.map((code) => (
                  <option key={code} value={code}>
                    {code} / NGN
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-2" role="group" aria-label="History period">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`h-11 min-w-11 flex-1 rounded-control px-3 text-sm font-semibold transition-colors sm:flex-none ${
                    period === p.id
                      ? 'bg-brand-600 text-white'
                      : 'border border-surface-border bg-white text-ink hover:border-brand-600/40'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <p className="mt-6 text-sm text-ink-muted">Loading history…</p>
          )}

          {error && (
            <p className="mt-6 rounded-control border border-status-urgent/30 bg-red-50 px-3 py-3 text-sm text-status-urgent">
              {error}
            </p>
          )}

          {!loading && !error && data && (
            <div className="mt-5 space-y-4">
              <div>
                <p className="text-sm text-ink-muted">{data.pair}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-ink">
                  {formatNaira(data.currentRate?.rate)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  {changeLabel && (
                    <span
                      className={
                        data.changePercent > 0
                          ? 'font-semibold text-status-urgent'
                          : data.changePercent < 0
                            ? 'font-semibold text-status-normal'
                            : 'font-semibold text-ink-muted'
                      }
                    >
                      {changeLabel} over period
                    </span>
                  )}
                  <span>{data.currentRate?.freshness || '—'}</span>
                </div>
                <p className="mt-2 text-xs text-ink-soft">
                  {data.currentRate?.rateTypeLabel || 'Rate type unavailable'}
                </p>
                <p className="mt-1 text-xs text-ink-soft">{sourceLabel(data.source)}</p>
              </div>

              {data.chartAvailable ? (
                <FxLineChart points={data.points} />
              ) : (
                <div className="rounded-control border border-dashed border-surface-border bg-surface-muted/80 px-4 py-8 text-center text-sm text-ink-muted">
                  {data.message ||
                    'Not enough historical observations to draw a reliable chart yet.'}
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-ink-soft">
                Indicative utility rates for everyday reference — not trading advice.
                Official CBN rates appear only when a verified CBN source is connected.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-surface-border px-4 py-3 sm:px-5">
          <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
