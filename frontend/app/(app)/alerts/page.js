'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCard } from '@/components/alerts/AlertCard';
import { AlertsComposer } from '@/components/alerts/AlertsComposer';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, alertsApi, officialApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ALERT_CATEGORIES, ALERT_SEVERITIES } from '@/lib/alerts';

export default function AlertsPage() {
  const { user } = useAuth();
  const area = user?.currentArea;
  const [items, setItems] = useState([]);
  const [officialItems, setOfficialItems] = useState([]);
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [freshness, setFreshness] = useState('fresh');
  const [sourceType, setSourceType] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { freshness, limit: 30 };
      if (area?.locationId) params.locationId = area.locationId;
      if (category) params.category = category;
      if (severity) params.severity = severity;
      if (sourceType) params.sourceType = sourceType;
      if (q.trim()) params.q = q.trim();

      const [alertsData, officialData] = await Promise.all([
        alertsApi.list(params),
        officialApi.context({
          limit: 4,
          locationId: area?.locationId,
          category: 'road_traffic',
        }).catch(() => ({ items: [] })),
      ]);
      setItems(alertsData.items || []);
      setOfficialItems(officialData.items || []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load alerts.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [area?.locationId, category, severity, freshness, sourceType, q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Local safety alerts
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Alerts around you
          </h1>
          {area ? (
            <p className="mt-2 text-sm text-ink-muted">
              {area.name}
              {area.lga ? `, ${area.lga}` : ''}
              {area.state ? `, ${area.state}` : ''}
            </p>
          ) : null}
        </div>
        <Button onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? 'Close form' : 'Report an alert'}
        </Button>
      </div>

      {composerOpen ? (
        <AlertsComposer
          onSubmitted={() => {
            setComposerOpen(false);
            load();
          }}
        />
      ) : null}

      <div className="space-y-3">
        <Input
          id="alert-search"
          label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search alerts…"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory('')}
            className={cn(
              'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
              !category ? 'bg-ink text-white' : 'bg-surface-muted text-ink-muted'
            )}
          >
            All types
          </button>
          {ALERT_CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategory(item.value)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                category === item.value
                  ? 'bg-ink text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSeverity('')}
            className={cn(
              'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
              !severity ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'
            )}
          >
            Any severity
          </button>
          {ALERT_SEVERITIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setSeverity(item.value)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                severity === item.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['fresh', 'Recent'],
            ['any', 'All statuses'],
            ['stale', 'Stale'],
            ['expired', 'Expired'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFreshness(value)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                freshness === value
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['', 'All sources'],
            ['community', 'Community'],
            ['official', 'Official'],
          ].map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              onClick={() => setSourceType(value)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                sourceType === value
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <FormError message={error} /> : null}
      {loading ? <p className="text-sm text-ink-muted">Loading alerts…</p> : null}

      {!loading && items.length === 0 ? (
        <div className="rounded-card border border-dashed border-surface-border p-5 text-sm text-ink-muted">
          No recent local alerts around you.{' '}
          <button
            type="button"
            className="font-semibold text-brand-700 hover:underline"
            onClick={() => setComposerOpen(true)}
          >
            Report an alert
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <AlertCard key={item.id} alert={item} />
        ))}
      </div>

      {officialItems.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Related official notices</h2>
          <p className="text-xs text-ink-soft">
            Official notices from verified sources — never shown as community alerts.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {officialItems.map((item) => (
              <OfficialUpdateCard key={item.id} update={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
