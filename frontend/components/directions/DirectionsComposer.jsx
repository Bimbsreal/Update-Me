'use client';

import { useState } from 'react';
import { PlaceSearchField } from '@/components/directions/PlaceSearchField';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, directionsApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { DIRECTION_MODES } from '@/lib/directions';

const STEPS = ['pair', 'mode', 'tip', 'extras', 'review'];

export function DirectionsComposer({
  onSubmitted,
  presetOrigin = null,
  presetDestination = null,
  compactHeader = false,
}) {
  const { user } = useAuth();
  const [step, setStep] = useState('pair');
  const [origin, setOrigin] = useState(
    presetOrigin ||
      (user?.currentArea?.locationId
        ? {
            locationId: user.currentArea.locationId,
            label: user.currentArea.name,
            name: user.currentArea.name,
          }
        : null)
  );
  const [destination, setDestination] = useState(presetDestination);
  const [travelMode, setTravelMode] = useState('driving');
  const [instructionSummary, setInstructionSummary] = useState('');
  const [majorRoads, setMajorRoads] = useState('');
  const [landmarks, setLandmarks] = useState('');
  const [boardingHint, setBoardingHint] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const stepIndex = STEPS.indexOf(step);

  function canContinue() {
    if (step === 'pair') return Boolean(origin?.locationId && destination?.locationId);
    if (step === 'mode') return Boolean(travelMode);
    if (step === 'tip') return instructionSummary.trim().length >= 3;
    return true;
  }

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const data = await directionsApi.createLocalKnowledge({
        originLocationId: origin.locationId,
        destinationLocationId: destination.locationId,
        travelMode,
        instructionSummary: instructionSummary.trim(),
        majorRoads: majorRoads.trim() || undefined,
        landmarks: landmarks.trim() || undefined,
        boardingHint: boardingHint.trim() || undefined,
      });
      setDone(data.knowledge);
      onSubmitted?.(data.knowledge);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit local knowledge.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-card border border-brand-100 bg-brand-50/40 p-5">
        <p className="text-sm font-semibold text-brand-800">Local knowledge shared</p>
        <p className="mt-2 text-sm text-ink-muted">
          Marked as <strong>Community Local Knowledge</strong> — not official navigation
          instructions.
        </p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() => {
            setDone(null);
            setStep('pair');
            setInstructionSummary('');
            setMajorRoads('');
            setLandmarks('');
            setBoardingHint('');
          }}
        >
          Share another tip
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
      {!compactHeader ? (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Share local knowledge
          </p>
          <h2 className="mt-1 text-lg font-bold text-ink">Help others find their way</h2>
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

      {step === 'pair' ? (
        <div className="space-y-3">
          <PlaceSearchField id="lk-from" label="From" value={origin} onChange={setOrigin} />
          <PlaceSearchField id="lk-to" label="To" value={destination} onChange={setDestination} />
        </div>
      ) : null}

      {step === 'mode' ? (
        <div className="flex flex-wrap gap-2">
          {DIRECTION_MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTravelMode(item.value)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                travelMode === item.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {step === 'tip' ? (
        <label className="block space-y-1.5" htmlFor="lk-tip">
          <span className="text-sm font-medium text-ink">Useful local tip</span>
          <textarea
            id="lk-tip"
            rows={4}
            value={instructionSummary}
            onChange={(e) => setInstructionSummary(e.target.value)}
            placeholder="e.g. Turn after the blue mosque, then use the service lane entrance"
            className="w-full rounded-control border border-surface-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
      ) : null}

      {step === 'extras' ? (
        <div className="space-y-3">
          <Input
            id="lk-roads"
            label="Major roads (optional)"
            value={majorRoads}
            onChange={(e) => setMajorRoads(e.target.value)}
          />
          <Input
            id="lk-landmarks"
            label="Landmarks (optional)"
            value={landmarks}
            onChange={(e) => setLandmarks(e.target.value)}
          />
          <Input
            id="lk-board"
            label="Boarding / change point (optional)"
            value={boardingHint}
            onChange={(e) => setBoardingHint(e.target.value)}
          />
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="space-y-2 text-sm text-ink-muted">
          <p>
            <span className="font-semibold text-ink">From:</span> {origin?.label}
          </p>
          <p>
            <span className="font-semibold text-ink">To:</span> {destination?.label}
          </p>
          <p>
            <span className="font-semibold text-ink">Mode:</span>{' '}
            {DIRECTION_MODES.find((m) => m.value === travelMode)?.label}
          </p>
          <p className="break-words">
            <span className="font-semibold text-ink">Tip:</span> {instructionSummary}
          </p>
          <p className="text-xs text-ink-soft">Will be labelled Community Local Knowledge.</p>
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
            {busy ? 'Submitting…' : 'Submit tip'}
          </Button>
        )}
      </div>
    </div>
  );
}
