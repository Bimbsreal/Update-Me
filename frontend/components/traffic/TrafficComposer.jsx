'use client';

import { useEffect, useMemo, useState } from 'react';
import { LocationSelector } from '@/components/location/LocationSelector';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, trafficApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { TRAFFIC_CAUSES, TRAFFIC_SEVERITIES, severityClass } from '@/lib/traffic';

const STEPS = ['location', 'condition', 'direction', 'cause', 'notes', 'review'];

export function TrafficComposer({ onSubmitted, compactHeader = false }) {
  const { user } = useAuth();
  const [step, setStep] = useState('location');
  const [locationId, setLocationId] = useState(user?.currentArea?.locationId || '');
  const [locationLabel, setLocationLabel] = useState(
    user?.currentArea
      ? `${user.currentArea.name}${user.currentArea.lga ? `, ${user.currentArea.lga}` : ''}${user.currentArea.state ? `, ${user.currentArea.state}` : ''}`
      : ''
  );
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [severity, setSeverity] = useState('');
  const [fromLabel, setFromLabel] = useState('');
  const [towardLabel, setTowardLabel] = useState('');
  const [roadName, setRoadName] = useState('');
  const [cause, setCause] = useState('');
  const [notes, setNotes] = useState('');
  const [affectedSection, setAffectedSection] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (user?.currentArea?.locationId && !locationId) {
      setLocationId(user.currentArea.locationId);
      setLocationLabel(
        `${user.currentArea.name}${user.currentArea.lga ? `, ${user.currentArea.lga}` : ''}${user.currentArea.state ? `, ${user.currentArea.state}` : ''}`
      );
    }
  }, [user, locationId]);

  const directionLabel = useMemo(() => {
    if (fromLabel.trim() && towardLabel.trim()) return `${fromLabel.trim()} → ${towardLabel.trim()}`;
    if (towardLabel.trim()) return `Toward ${towardLabel.trim()}`;
    if (fromLabel.trim()) return `From ${fromLabel.trim()}`;
    return '';
  }, [fromLabel, towardLabel]);

  const stepIndex = STEPS.indexOf(step);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const payload = {
        locationId,
        severity,
        roadName: roadName.trim() || undefined,
        fromLabel: fromLabel.trim() || undefined,
        towardLabel: towardLabel.trim() || undefined,
        directionLabel: directionLabel || undefined,
        cause: cause || undefined,
        notes: notes.trim() || undefined,
        affectedSection: affectedSection.trim() || undefined,
      };
      const data = await trafficApi.create(payload);
      setDone(data.traffic);
      onSubmitted?.(data.traffic);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit traffic update.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-card border border-brand-100 bg-brand-50/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Traffic update submitted
        </p>
        <h2 className="mt-2 text-xl font-bold text-ink">Thanks — this helps people nearby</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Your community traffic report is active. Others can confirm if it is still accurate.
        </p>
        <Button
          className="mt-4"
          onClick={() => {
            setDone(null);
            setStep('location');
            setSeverity('');
            setFromLabel('');
            setTowardLabel('');
            setRoadName('');
            setCause('');
            setNotes('');
            setAffectedSection('');
          }}
        >
          Report more traffic
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-6">
      {!compactHeader ? (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Traffic update
          </p>
          <h2 className="mt-2 text-xl font-bold text-ink sm:text-2xl">Share a traffic update</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Quick, factual information that helps people moving through this area.
          </p>
        </div>
      ) : null}

      <ol className="mb-5 flex flex-wrap gap-2" aria-label="Traffic report steps">
        {STEPS.map((id, index) => (
          <li key={id}>
            <span
              className={cn(
                'inline-flex rounded-pill px-3 py-1 text-xs font-semibold capitalize',
                index <= stepIndex ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'
              )}
            >
              {index + 1}. {id}
            </span>
          </li>
        ))}
      </ol>

      <FormError message={error} />

      {step === 'location' ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-ink">Where is the traffic?</p>
          <div className="rounded-control border border-surface-border bg-surface-muted/50 px-3 py-3">
            <p className="text-sm font-semibold text-ink break-words">
              {locationLabel || 'No location selected'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setSelectorOpen(true)}>
              Change location
            </Button>
            <Button disabled={!locationId} onClick={() => setStep('condition')}>
              Continue
            </Button>
          </div>
          <LocationSelector
            open={selectorOpen}
            onClose={() => setSelectorOpen(false)}
            onSelect={(selection) => {
              if (selection.locationId) {
                setLocationId(selection.locationId);
                setLocationLabel(selection.label || 'Selected location');
                setError('');
              } else {
                setError('Choose an area linked to the location system.');
              }
            }}
          />
        </div>
      ) : null}

      {step === 'condition' ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-ink">What is the traffic condition?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TRAFFIC_SEVERITIES.filter((item) => item.value !== 'unknown').map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setSeverity(item.value)}
                className={cn(
                  'rounded-control border px-3 py-3 text-left font-semibold transition',
                  severity === item.value
                    ? cn('border-transparent ring-2 ring-brand-500', severityClass(item.value))
                    : 'border-surface-border hover:border-brand-200'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep('location')}>
              Back
            </Button>
            <Button disabled={!severity} onClick={() => setStep('direction')}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'direction' ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-ink">Which direction?</p>
          <Input
            id="traffic-road"
            label="Road or corridor (optional)"
            value={roadName}
            onChange={(e) => setRoadName(e.target.value)}
            placeholder="e.g. Lekki–Epe Expressway"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="traffic-from"
              label="From"
              value={fromLabel}
              onChange={(e) => setFromLabel(e.target.value)}
              placeholder="e.g. Lekki"
            />
            <Input
              id="traffic-toward"
              label="Toward"
              value={towardLabel}
              onChange={(e) => setTowardLabel(e.target.value)}
              placeholder="e.g. Victoria Island"
            />
          </div>
          {directionLabel ? (
            <p className="text-sm text-brand-700 font-semibold">{directionLabel}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep('condition')}>
              Back
            </Button>
            <Button onClick={() => setStep('cause')}>Continue</Button>
          </div>
        </div>
      ) : null}

      {step === 'cause' ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-ink">What is causing it? (optional)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={cn(
                'rounded-control border px-3 py-2.5 text-left text-sm font-medium',
                !cause ? 'border-brand-500 bg-brand-50' : 'border-surface-border'
              )}
              onClick={() => setCause('')}
            >
              Skip / not sure
            </button>
            {TRAFFIC_CAUSES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={cn(
                  'rounded-control border px-3 py-2.5 text-left text-sm font-medium',
                  cause === item.value
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-surface-border'
                )}
                onClick={() => setCause(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep('direction')}>
              Back
            </Button>
            <Button onClick={() => setStep('notes')}>Continue</Button>
          </div>
        </div>
      ) : null}

      {step === 'notes' ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-ink">Anything else people should know?</p>
          <Input
            id="traffic-section"
            label="Affected section (optional)"
            value={affectedSection}
            onChange={(e) => setAffectedSection(e.target.value)}
            placeholder="e.g. After Admiralty roundabout"
          />
          <label className="block space-y-1.5" htmlFor="traffic-notes">
            <span className="text-sm font-medium text-ink">Extra details (optional)</span>
            <textarea
              id="traffic-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-control border border-surface-border px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="Keep it short and useful."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep('cause')}>
              Back
            </Button>
            <Button onClick={() => setStep('review')}>Review</Button>
          </div>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="space-y-4">
          <div className="rounded-control border border-surface-border bg-surface-muted/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Community traffic preview
            </p>
            <p className={cn('mt-2 inline-flex rounded-pill border px-2.5 py-1 text-xs font-bold', severityClass(severity))}>
              {TRAFFIC_SEVERITIES.find((s) => s.value === severity)?.label}
            </p>
            <p className="mt-2 font-semibold text-ink break-words">
              {roadName || locationLabel}
            </p>
            {directionLabel ? (
              <p className="mt-1 text-sm text-ink-muted break-words">{directionLabel}</p>
            ) : null}
            {cause ? (
              <p className="mt-2 text-sm text-ink-muted">
                Cause: {TRAFFIC_CAUSES.find((c) => c.value === cause)?.label}
              </p>
            ) : null}
            {notes ? (
              <p className="mt-2 text-sm text-ink-muted break-words whitespace-pre-wrap">{notes}</p>
            ) : null}
            <p className="mt-3 text-xs font-semibold text-brand-700">Source: Community</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep('notes')}>
              Back
            </Button>
            <Button disabled={busy} onClick={submit}>
              {busy ? 'Submitting…' : 'Submit Traffic Update'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
