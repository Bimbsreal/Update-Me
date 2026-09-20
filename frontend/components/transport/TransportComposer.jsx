'use client';

import { useState } from 'react';
import { LocationSelector } from '@/components/location/LocationSelector';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { ApiError, transportApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { TRANSPORT_MODES, transportModeLabel } from '@/lib/transport';

const STEPS = ['from', 'to', 'mode', 'fare', 'notes', 'review'];

export function TransportComposer({ onSubmitted, presetRoute = null, compactHeader = false }) {
  const [step, setStep] = useState(presetRoute ? 'mode' : 'from');
  const [from, setFrom] = useState(
    presetRoute?.origin
      ? {
          locationId: presetRoute.origin.id,
          label: presetRoute.origin.name,
        }
      : null
  );
  const [to, setTo] = useState(
    presetRoute?.destination
      ? {
          locationId: presetRoute.destination.id,
          label: presetRoute.destination.name,
        }
      : null
  );
  const [selectorFor, setSelectorFor] = useState(null);
  const [mode, setMode] = useState(presetRoute?.primaryMode || 'bus');
  const [fareAmount, setFareAmount] = useState('');
  const [boardingPointLabel, setBoardingPointLabel] = useState('');
  const [alightingPointLabel, setAlightingPointLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const stepIndex = STEPS.indexOf(step);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const payload = {
        transportMode: mode,
        fareAmount: Number(fareAmount),
        boardingPointLabel: boardingPointLabel.trim() || undefined,
        alightingPointLabel: alightingPointLabel.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (presetRoute?.id) {
        payload.routeId = presetRoute.id;
      } else {
        payload.newRoute = {
          originLocationId: from.locationId,
          destinationLocationId: to.locationId,
          primaryMode: mode,
        };
      }
      const data = await transportApi.createFare(payload);
      setDone(data.fare);
      onSubmitted?.(data.fare);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit fare update.');
    } finally {
      setBusy(false);
    }
  }

  function canContinue() {
    if (step === 'from') return Boolean(from?.locationId);
    if (step === 'to') return Boolean(to?.locationId) && to.locationId !== from?.locationId;
    if (step === 'mode') return Boolean(mode);
    if (step === 'fare') return Number(fareAmount) > 0;
    return true;
  }

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }

  function back() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  if (done) {
    return (
      <div className="rounded-card border border-brand-100 bg-brand-50/40 p-5">
        <p className="text-sm font-semibold text-brand-800">Fare reported</p>
        <p className="mt-2 text-sm text-ink-muted">
          Your community fare report is active. Others can confirm if it is still accurate.
        </p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() => {
            setDone(null);
            setStep(presetRoute ? 'mode' : 'from');
            setFareAmount('');
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
            Report a fare
          </p>
          <h2 className="mt-1 text-lg font-bold text-ink">Share what you paid</h2>
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

      {step === 'from' ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">From</p>
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between rounded-control border border-surface-border px-3 text-left text-sm"
            onClick={() => setSelectorFor('from')}
          >
            <span className="truncate">{from?.label || 'Select origin area'}</span>
            <span aria-hidden>▾</span>
          </button>
        </div>
      ) : null}

      {step === 'to' ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">To</p>
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between rounded-control border border-surface-border px-3 text-left text-sm"
            onClick={() => setSelectorFor('to')}
          >
            <span className="truncate">{to?.label || 'Select destination area'}</span>
            <span aria-hidden>▾</span>
          </button>
        </div>
      ) : null}

      {step === 'mode' ? (
        <div className="flex flex-wrap gap-2">
          {TRANSPORT_MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                mode === item.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted hover:text-ink'
              )}
            >
              {item.shortLabel}
            </button>
          ))}
        </div>
      ) : null}

      {step === 'fare' ? (
        <div className="space-y-3">
          <Input
            id="fare-amount"
            label="Fare paid (₦)"
            type="number"
            min="1"
            step="1"
            value={fareAmount}
            onChange={(e) => setFareAmount(e.target.value)}
            placeholder="e.g. 800"
          />
          <Input
            id="boarding"
            label="Boarding point (optional)"
            value={boardingPointLabel}
            onChange={(e) => setBoardingPointLabel(e.target.value)}
            placeholder="e.g. Admiralty Way"
          />
        </div>
      ) : null}

      {step === 'notes' ? (
        <div className="space-y-3">
          <Input
            id="alighting"
            label="Alighting / destination stop (optional)"
            value={alightingPointLabel}
            onChange={(e) => setAlightingPointLabel(e.target.value)}
          />
          <label className="block space-y-1.5" htmlFor="fare-notes">
            <span className="text-sm font-medium text-ink">Additional information</span>
            <textarea
              id="fare-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-control border border-surface-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="Anything else riders should know?"
            />
          </label>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="space-y-2 text-sm text-ink-muted">
          <p>
            <span className="font-semibold text-ink">From:</span> {from?.label || presetRoute?.origin?.name}
          </p>
          <p>
            <span className="font-semibold text-ink">To:</span> {to?.label || presetRoute?.destination?.name}
          </p>
          <p>
            <span className="font-semibold text-ink">Mode:</span> {transportModeLabel(mode)}
          </p>
          <p>
            <span className="font-semibold text-ink">Fare:</span> ₦ {fareAmount}
          </p>
          {boardingPointLabel ? (
            <p>
              <span className="font-semibold text-ink">Board:</span> {boardingPointLabel}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {stepIndex > 0 ? (
          <Button type="button" variant="secondary" onClick={back} disabled={busy}>
            Back
          </Button>
        ) : null}
        {step !== 'review' ? (
          <Button type="button" onClick={next} disabled={!canContinue() || busy}>
            Continue
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit fare update'}
          </Button>
        )}
      </div>

      <LocationSelector
        open={Boolean(selectorFor)}
        onClose={() => setSelectorFor(null)}
        onSelect={(selection) => {
          const payload = {
            locationId: selection.locationId,
            label: selection.label || 'Selected area',
          };
          if (selectorFor === 'from') setFrom(payload);
          if (selectorFor === 'to') setTo(payload);
          setSelectorFor(null);
        }}
      />
    </div>
  );
}
