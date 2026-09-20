'use client';

import { useEffect, useMemo, useState } from 'react';
import { LocationSelector } from '@/components/location/LocationSelector';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, pricesApi } from '@/lib/api';
import { cn } from '@/lib/cn';

const STEPS = ['commodity', 'variant', 'price', 'place', 'review'];

export function PricesComposer({
  onSubmitted,
  presetCommodity = null,
  presetVariant = null,
  compactHeader = false,
}) {
  const { user } = useAuth();
  const [commodities, setCommodities] = useState([]);
  const [step, setStep] = useState(presetCommodity ? (presetVariant ? 'price' : 'variant') : 'commodity');
  const [commodityId, setCommodityId] = useState(presetCommodity?.id || '');
  const [variantId, setVariantId] = useState(presetVariant?.id || '');
  const [priceAmount, setPriceAmount] = useState('');
  const [placeLabel, setPlaceLabel] = useState('');
  const [observedAt, setObservedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [locationId, setLocationId] = useState(user?.currentArea?.locationId || '');
  const [locationLabel, setLocationLabel] = useState(
    user?.currentArea
      ? `${user.currentArea.name}${user.currentArea.lga ? `, ${user.currentArea.lga}` : ''}`
      : ''
  );
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    pricesApi
      .commodities()
      .then((data) => setCommodities(data.commodities || []))
      .catch(() => setError('Unable to load commodities.'));
  }, []);

  const commodity = useMemo(
    () => commodities.find((c) => c.id === commodityId) || presetCommodity,
    [commodities, commodityId, presetCommodity]
  );
  const variants = commodity?.variants || [];
  const variant = useMemo(
    () => variants.find((v) => v.id === variantId) || presetVariant,
    [variants, variantId, presetVariant]
  );

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const data = await pricesApi.create({
        commodityId: commodity.id,
        variantId: variant.id,
        locationId,
        priceAmount: Number(priceAmount),
        placeLabel: placeLabel.trim() || undefined,
        placeType: 'market',
        observedAt: observedAt ? new Date(observedAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
      });
      setDone(data.price);
      onSubmitted?.(data.price);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit price report.');
    } finally {
      setBusy(false);
    }
  }

  function canContinue() {
    if (step === 'commodity') return Boolean(commodityId);
    if (step === 'variant') return Boolean(variantId);
    if (step === 'price') return Number(priceAmount) > 0 && Boolean(locationId);
    return true;
  }

  const stepIndex = STEPS.indexOf(step);

  if (done) {
    return (
      <div className="rounded-card border border-brand-100 bg-brand-50/40 p-5">
        <p className="text-sm font-semibold text-brand-800">Price reported</p>
        <p className="mt-2 text-sm text-ink-muted">
          Your community price report is active. Others can confirm if it is still accurate.
        </p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() => {
            setDone(null);
            setStep(presetCommodity ? 'price' : 'commodity');
            setPriceAmount('');
            setNotes('');
          }}
        >
          Report another
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
      {!compactHeader ? (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Report a price
          </p>
          <h2 className="mt-1 text-lg font-bold text-ink">Share what you observed</h2>
        </div>
      ) : null}

      <div className="mb-4 flex gap-1">
        {STEPS.map((id, index) => (
          <span
            key={id}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              index <= stepIndex ? 'bg-brand-600' : 'bg-surface-muted'
            )}
          />
        ))}
      </div>

      <FormError message={error} />

      {step === 'commodity' ? (
        <div className="flex flex-wrap gap-2">
          {commodities.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCommodityId(item.id);
                setVariantId('');
              }}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                commodityId === item.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}

      {step === 'variant' ? (
        <div className="flex flex-wrap gap-2">
          {variants.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setVariantId(item.id)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                variantId === item.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {item.displayName}
            </button>
          ))}
        </div>
      ) : null}

      {step === 'price' ? (
        <div className="space-y-3">
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between rounded-control border border-surface-border px-3 text-left text-sm"
            onClick={() => setSelectorOpen(true)}
          >
            <span className="truncate">{locationLabel || 'Select location'}</span>
            <span aria-hidden>▾</span>
          </button>
          <Input
            id="price-amount"
            label={`Price (₦${variant ? ` / ${variant.displayName}` : ''})`}
            type="number"
            min="1"
            value={priceAmount}
            onChange={(e) => setPriceAmount(e.target.value)}
            placeholder="e.g. 7500"
          />
        </div>
      ) : null}

      {step === 'place' ? (
        <div className="space-y-3">
          <Input
            id="place-label"
            label="Market / shop / place (optional)"
            value={placeLabel}
            onChange={(e) => setPlaceLabel(e.target.value)}
            placeholder="e.g. Balogun Market"
          />
          <Input
            id="price-observed-at"
            label="When observed (optional)"
            type="datetime-local"
            value={observedAt}
            onChange={(e) => setObservedAt(e.target.value)}
          />
          <label className="block space-y-1.5" htmlFor="price-notes">
            <span className="text-sm font-medium text-ink">Note (optional)</span>
            <textarea
              id="price-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-control border border-surface-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="space-y-2 text-sm text-ink-muted">
          <p>
            <span className="font-semibold text-ink">Commodity:</span> {commodity?.name}
          </p>
          <p>
            <span className="font-semibold text-ink">Unit:</span> {variant?.displayName}
          </p>
          <p>
            <span className="font-semibold text-ink">Price:</span> ₦ {priceAmount}
          </p>
          <p>
            <span className="font-semibold text-ink">Location:</span> {locationLabel}
          </p>
          {placeLabel ? (
            <p>
              <span className="font-semibold text-ink">Place:</span> {placeLabel}
            </p>
          ) : null}
          {observedAt ? (
            <p>
              <span className="font-semibold text-ink">Observed:</span>{' '}
              {new Date(observedAt).toLocaleString()}
            </p>
          ) : (
            <p>
              <span className="font-semibold text-ink">Observed:</span> Just now
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {stepIndex > 0 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStep(STEPS[stepIndex - 1])}
            disabled={busy}
          >
            Back
          </Button>
        ) : null}
        {step !== 'review' ? (
          <Button
            type="button"
            onClick={() => setStep(STEPS[stepIndex + 1])}
            disabled={!canContinue() || busy}
          >
            Continue
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit price'}
          </Button>
        )}
      </div>

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={(selection) => {
          setLocationId(selection.locationId);
          setLocationLabel(selection.label || 'Selected area');
          setSelectorOpen(false);
        }}
      />
    </div>
  );
}
