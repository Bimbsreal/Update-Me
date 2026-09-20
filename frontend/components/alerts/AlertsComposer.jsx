'use client';

import { useMemo, useState } from 'react';
import { LocationSelector } from '@/components/location/LocationSelector';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, alertsApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  ALERT_CATEGORIES,
  ALERT_SEVERITIES,
  alertSeverityClass,
} from '@/lib/alerts';

const STEPS = ['category', 'location', 'severity', 'details', 'when', 'extras', 'review'];

export function AlertsComposer({ onSubmitted, compactHeader = false }) {
  const { user } = useAuth();
  const [step, setStep] = useState('category');
  const [alertCategory, setAlertCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [whatHappened, setWhatHappened] = useState('');
  const [observedAt, setObservedAt] = useState('');
  const [roadName, setRoadName] = useState('');
  const [affectedArea, setAffectedArea] = useState('');
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

  const stepIndex = STEPS.indexOf(step);
  const categoryLabel = useMemo(
    () => ALERT_CATEGORIES.find((c) => c.value === alertCategory)?.label,
    [alertCategory]
  );
  const severityLabel = useMemo(
    () => ALERT_SEVERITIES.find((s) => s.value === severity)?.label,
    [severity]
  );

  function canContinue() {
    if (step === 'category') return Boolean(alertCategory);
    if (step === 'location') return Boolean(locationId);
    if (step === 'severity') return Boolean(severity);
    if (step === 'details') return whatHappened.trim().length >= 3;
    return true;
  }

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const data = await alertsApi.create({
        locationId,
        alertCategory,
        severity,
        whatHappened: whatHappened.trim(),
        roadName: roadName.trim() || undefined,
        affectedArea: affectedArea.trim() || undefined,
        notes: notes.trim() || undefined,
        observedAt: observedAt ? new Date(observedAt).toISOString() : undefined,
      });
      setDone(data.alert);
      onSubmitted?.(data.alert);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit alert.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-card border border-brand-100 bg-brand-50/40 p-5">
        <p className="text-sm font-semibold text-brand-800">Alert submitted</p>
        <p className="mt-2 text-sm text-ink-muted">
          Your community alert is marked <strong>Unverified</strong> until others nearby confirm
          it. It is not an official government alert.
        </p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() => {
            setDone(null);
            setStep('category');
            setAlertCategory('');
            setSeverity('');
            setWhatHappened('');
            setObservedAt('');
            setRoadName('');
            setAffectedArea('');
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
            Report a local alert
          </p>
          <h2 className="mt-1 text-lg font-bold text-ink">Share useful safety information</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Keep it factual and local. Do not include unnecessary personal details.
          </p>
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

      {step === 'category' ? (
        <div className="flex flex-wrap gap-2">
          {ALERT_CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setAlertCategory(item.value)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                alertCategory === item.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {step === 'location' ? (
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between rounded-control border border-surface-border px-3 text-left text-sm"
          onClick={() => setSelectorOpen(true)}
        >
          <span className="truncate">{locationLabel || 'Select location'}</span>
          <span aria-hidden>▾</span>
        </button>
      ) : null}

      {step === 'severity' ? (
        <div className="flex flex-wrap gap-2">
          {ALERT_SEVERITIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setSeverity(item.value)}
              className={cn(
                'min-h-11 rounded-pill border px-3 py-1.5 text-xs font-semibold',
                severity === item.value
                  ? alertSeverityClass(item.value)
                  : 'border-surface-border bg-surface-muted text-ink-muted'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {step === 'details' ? (
        <label className="block space-y-1.5" htmlFor="alert-what">
          <span className="text-sm font-medium text-ink">What happened?</span>
          <textarea
            id="alert-what"
            rows={4}
            value={whatHappened}
            onChange={(e) => setWhatHappened(e.target.value)}
            placeholder="Short factual description"
            className="w-full rounded-control border border-surface-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
      ) : null}

      {step === 'when' ? (
        <Input
          id="alert-observed-at"
          label="When did it happen? (optional — defaults to now)"
          type="datetime-local"
          value={observedAt}
          onChange={(e) => setObservedAt(e.target.value)}
        />
      ) : null}

      {step === 'extras' ? (
        <div className="space-y-3">
          <Input
            id="alert-road"
            label="Affected road (optional)"
            value={roadName}
            onChange={(e) => setRoadName(e.target.value)}
            placeholder="e.g. Lekki–Epe Expressway"
          />
          <Input
            id="alert-area"
            label="Affected area (optional)"
            value={affectedArea}
            onChange={(e) => setAffectedArea(e.target.value)}
            placeholder="e.g. Near Admiralty Way"
          />
          <label className="block space-y-1.5" htmlFor="alert-notes">
            <span className="text-sm font-medium text-ink">Additional details (optional)</span>
            <textarea
              id="alert-notes"
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
            <span className="font-semibold text-ink">Category:</span> {categoryLabel}
          </p>
          <p>
            <span className="font-semibold text-ink">Severity:</span> {severityLabel}
          </p>
          <p>
            <span className="font-semibold text-ink">Location:</span> {locationLabel}
          </p>
          <p className="break-words">
            <span className="font-semibold text-ink">What happened:</span> {whatHappened}
          </p>
          {roadName ? (
            <p>
              <span className="font-semibold text-ink">Road:</span> {roadName}
            </p>
          ) : null}
          <p className="text-xs text-ink-soft">
            Will be published as Community Report — Unverified. Not an official alert.
          </p>
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
            {busy ? 'Submitting…' : 'Submit alert'}
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
