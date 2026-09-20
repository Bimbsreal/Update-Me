'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { FxHistoryPanel } from '@/components/fx/FxHistoryPanel';
import { fxApi } from '@/lib/api';
import {
  FX_DEFAULT_BASES,
  formatChangePercent,
  formatNaira,
  sourceLabel,
} from '@/lib/fx';

function DirectionGlyph({ direction }) {
  if (direction === 'up') {
    return (
      <span className="text-status-urgent" aria-label="up">
        ▲
      </span>
    );
  }
  if (direction === 'down') {
    return (
      <span className="text-status-normal" aria-label="down">
        ▼
      </span>
    );
  }
  return (
    <span className="text-ink-soft" aria-label="unchanged">
      –
    </span>
  );
}

export function FxSection() {
  const [items, setItems] = useState([]);
  const [bases, setBases] = useState([...FX_DEFAULT_BASES]);
  const [available, setAvailable] = useState(true);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBase, setHistoryBase] = useState('USD');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [currencies, latest] = await Promise.all([
          fxApi.currencies().catch(() => null),
          fxApi.latest(),
        ]);
        if (cancelled) return;

        if (currencies?.currencies?.baseCurrencies?.length) {
          setBases(currencies.currencies.baseCurrencies);
        }

        setAvailable(Boolean(latest.available));
        setMessage(latest.message || null);
        setItems(latest.items || []);
      } catch {
        if (!cancelled) {
          setAvailable(false);
          setMessage('FX data temporarily unavailable.');
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sharedSource = items[0]?.source;
  const sharedFreshness = items[0]?.freshness;
  const sharedRateType = items[0]?.rateTypeLabel;

  return (
    <section id="naira-fx" className="section-y">
      <Container>
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Everyday utility
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                Naira FX Today
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                A quick look at key naira pairs — compact reference for daily life, not a
                trading dashboard.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full shrink-0 sm:w-auto"
              onClick={() => {
                setHistoryBase(items[0]?.baseCurrency || bases[0] || 'USD');
                setHistoryOpen(true);
              }}
            >
              View history
            </Button>
          </div>

          <div className="mt-6 rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
            {loading && (
              <p className="py-6 text-center text-sm text-ink-muted">Loading FX rates…</p>
            )}

            {!loading && !available && (
              <p className="py-6 text-center text-sm text-ink-muted">
                {message || 'FX data temporarily unavailable.'}
              </p>
            )}

            {!loading && available && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {items.map((item) => {
                    const pct = formatChangePercent(item.changePercent);
                    return (
                      <button
                        key={`${item.baseCurrency}-${item.quoteCurrency}`}
                        type="button"
                        onClick={() => {
                          setHistoryBase(item.baseCurrency);
                          setHistoryOpen(true);
                        }}
                        className="rounded-control border border-surface-border bg-surface-muted/50 px-3 py-3 text-left transition-colors hover:border-brand-600/35 hover:bg-brand-50/40 focus-visible:ring-2 focus-visible:ring-brand-500/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            {item.pair}
                          </p>
                          <DirectionGlyph direction={item.direction} />
                        </div>
                        <p className="mt-1.5 text-lg font-bold tabular-nums tracking-tight text-ink">
                          {formatNaira(item.rate)}
                        </p>
                        {pct && (
                          <p
                            className={`mt-1 text-xs font-medium tabular-nums ${
                              item.changePercent > 0
                                ? 'text-status-urgent'
                                : item.changePercent < 0
                                  ? 'text-status-normal'
                                  : 'text-ink-soft'
                            }`}
                          >
                            {pct}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-col gap-1 border-t border-surface-border pt-3 text-xs text-ink-soft sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                  <span>{sharedFreshness || 'Timestamp unavailable'}</span>
                  <span className="hidden sm:inline" aria-hidden="true">
                    ·
                  </span>
                  <span>{sharedRateType || 'Market / indicative'}</span>
                  <span className="hidden sm:inline" aria-hidden="true">
                    ·
                  </span>
                  <span className="break-words">{sourceLabel(sharedSource)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </Container>

      <FxHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        initialBase={historyBase}
        bases={bases}
      />
    </section>
  );
}
