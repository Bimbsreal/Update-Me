'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { ApiError, userApi } from '@/lib/api';

export default function AlertSubscriptionsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    kind: 'fx_rate',
    fxBase: 'USD',
    fxQuote: 'NGN',
    thresholdValue: '',
    thresholdDirection: 'above',
    commodityCode: 'rice',
  });

  function load() {
    userApi
      .alertSubscriptions()
      .then((d) => setItems(d.items || []))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load alerts.'));
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const body = {
        kind: form.kind,
        thresholdDirection: form.thresholdDirection,
        thresholdValue: form.thresholdValue === '' ? null : Number(form.thresholdValue),
      };
      if (form.kind === 'fx_rate') {
        body.fxBase = form.fxBase;
        body.fxQuote = form.fxQuote;
      }
      if (form.kind === 'commodity_price') {
        body.commodityCode = form.commodityCode;
      }
      await userApi.createAlertSubscription(body);
      setForm((f) => ({ ...f, thresholdValue: '' }));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create alert.');
    }
  }

  async function remove(id) {
    try {
      await userApi.deleteAlertSubscription(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete alert.');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Alerts</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Personal alert rules</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Threshold alerts for FX and commodities. Traffic and official coverage also come from your
          saved places. Exact coordinates are never shown publicly.
        </p>
        <Link href="/profile" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">
          ← Back to profile
        </Link>
      </div>

      <FormError message={error} />

      <form
        onSubmit={create}
        className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-2"
      >
        <label className="text-xs font-medium text-ink-muted">
          Kind
          <select
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
          >
            <option value="fx_rate">FX rate</option>
            <option value="commodity_price">Commodity price</option>
          </select>
        </label>
        <label className="text-xs font-medium text-ink-muted">
          Direction
          <select
            value={form.thresholdDirection}
            onChange={(e) => setForm((f) => ({ ...f, thresholdDirection: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
          >
            <option value="above">Above</option>
            <option value="below">Below</option>
            <option value="any_change">Any change</option>
          </select>
        </label>
        {form.kind === 'fx_rate' ? (
          <>
            <label className="text-xs font-medium text-ink-muted">
              Base
              <input
                value={form.fxBase}
                onChange={(e) => setForm((f) => ({ ...f, fxBase: e.target.value.toUpperCase() }))}
                className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-ink-muted">
              Quote
              <input
                value={form.fxQuote}
                onChange={(e) => setForm((f) => ({ ...f, fxQuote: e.target.value.toUpperCase() }))}
                className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
              />
            </label>
          </>
        ) : (
          <label className="text-xs font-medium text-ink-muted sm:col-span-2">
            Commodity code
            <input
              value={form.commodityCode}
              onChange={(e) => setForm((f) => ({ ...f, commodityCode: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
            />
          </label>
        )}
        <label className="text-xs font-medium text-ink-muted sm:col-span-2">
          Threshold (optional)
          <input
            type="number"
            step="any"
            value={form.thresholdValue}
            onChange={(e) => setForm((f) => ({ ...f, thresholdValue: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit" className="sm:col-span-2">
          Create alert
        </Button>
      </form>

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">No personal threshold alerts yet.</p>
        ) : null}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-surface-border bg-white p-4"
          >
            <div className="min-w-0">
              <p className="font-semibold text-ink break-words">{item.kind}</p>
              <p className="text-xs text-ink-muted break-words">
                {item.fxBase && item.fxQuote ? `${item.fxBase}/${item.fxQuote}` : ''}
                {item.commodityCode || ''}
                {item.thresholdValue != null
                  ? ` · ${item.thresholdDirection} ${item.thresholdValue}`
                  : ''}
                {item.enabled ? '' : ' · disabled'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="min-h-11 text-sm font-semibold text-ink-muted hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
