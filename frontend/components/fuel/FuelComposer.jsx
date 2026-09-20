'use client';

import { useEffect, useState } from 'react';
import { LocationSelector } from '@/components/location/LocationSelector';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, fuelApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  FUEL_AVAILABILITY,
  FUEL_QUEUE,
  FUEL_TYPES,
  fuelTypeMeta,
} from '@/lib/fuel';

const STEPS = ['station', 'fuel', 'availability', 'price', 'notes', 'review'];

export function FuelComposer({ onSubmitted, presetStation = null, compactHeader = false }) {
  const { user } = useAuth();
  const [step, setStep] = useState(presetStation ? 'fuel' : 'station');
  const [locationId, setLocationId] = useState(user?.currentArea?.locationId || '');
  const [locationLabel, setLocationLabel] = useState(
    user?.currentArea
      ? `${user.currentArea.name}${user.currentArea.lga ? `, ${user.currentArea.lga}` : ''}${user.currentArea.state ? `, ${user.currentArea.state}` : ''}`
      : ''
  );
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState(presetStation?.id || '');
  const [stationMode, setStationMode] = useState(presetStation ? 'existing' : 'existing');
  const [newStationName, setNewStationName] = useState('');
  const [newStationBrand, setNewStationBrand] = useState('');
  const [fuelType, setFuelType] = useState('pms');
  const [availability, setAvailability] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [queueCondition, setQueueCondition] = useState('unknown');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!locationId) {
      setStations([]);
      return;
    }
    fuelApi
      .stations({ locationId, limit: 50 })
      .then((data) => setStations(data.items || []))
      .catch(() => setStations([]));
  }, [locationId]);

  const stepIndex = STEPS.indexOf(step);
  const needsPrice = availability === 'available' || availability === 'limited';

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const payload = {
        locationId,
        fuelType,
        availability,
        priceAmount: needsPrice && priceAmount ? Number(priceAmount) : undefined,
        priceUnit: fuelTypeMeta(fuelType)?.defaultUnit || 'litre',
        queueCondition: queueCondition || undefined,
        notes: notes.trim() || undefined,
      };
      if (stationMode === 'existing' && stationId) {
        payload.stationId = stationId;
      } else {
        payload.newStation = {
          name: newStationName.trim(),
          brand: newStationBrand.trim() || undefined,
          locationId,
        };
      }
      const data = await fuelApi.createReport(payload);
      setDone(data.fuel);
      onSubmitted?.(data.fuel);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit fuel update.');
    } finally {
      setBusy(false);
    }
  }

  function canContinue() {
    if (step === 'station') {
      if (!locationId) return false;
      if (stationMode === 'existing') return Boolean(stationId);
      return newStationName.trim().length >= 2;
    }
    if (step === 'fuel') return Boolean(fuelType);
    if (step === 'availability') return Boolean(availability);
    if (step === 'price') {
      if (!needsPrice) return true;
      const n = Number(priceAmount);
      return Number.isFinite(n) && n > 0;
    }
    return true;
  }

  if (done) {
    return (
      <div className="rounded-card border border-brand-100 bg-brand-50/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Fuel update submitted
        </p>
        <h2 className="mt-2 text-xl font-bold text-ink">Thanks — this helps people nearby</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Your community fuel report is active. Others can confirm if it is still accurate.
        </p>
        <Button
          className="mt-4"
          onClick={() => {
            setDone(null);
            setStep(presetStation ? 'fuel' : 'station');
            setAvailability('');
            setPriceAmount('');
            setNotes('');
            if (!presetStation) {
              setStationId('');
              setNewStationName('');
            }
          }}
        >
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-surface-border bg-white p-5 shadow-card sm:p-6">
      {!compactHeader ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Report fuel
          </p>
          <h2 className="mt-2 text-xl font-bold text-ink">Share what you observed</h2>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {STEPS.map((item, index) => (
          <span
            key={item}
            className={cn(
              'rounded-pill px-2.5 py-1 text-[11px] font-semibold capitalize',
              index <= stepIndex ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-soft'
            )}
          >
            {item}
          </span>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {step === 'station' ? (
          <>
            <div>
              <p className="text-sm font-medium text-ink">Area</p>
              <button
                type="button"
                onClick={() => setSelectorOpen(true)}
                className="mt-2 flex min-h-11 w-full items-center justify-between rounded-control border border-surface-border px-3 text-left text-sm"
              >
                <span className="truncate">{locationLabel || 'Choose location'}</span>
                <span className="text-brand-700">Change</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStationMode('existing')}
                className={cn(
                  'min-h-11 rounded-control px-3 text-sm font-semibold',
                  stationMode === 'existing'
                    ? 'bg-brand-600 text-white'
                    : 'border border-surface-border'
                )}
              >
                Existing station
              </button>
              <button
                type="button"
                onClick={() => setStationMode('new')}
                className={cn(
                  'min-h-11 rounded-control px-3 text-sm font-semibold',
                  stationMode === 'new' ? 'bg-brand-600 text-white' : 'border border-surface-border'
                )}
              >
                New station
              </button>
            </div>
            {stationMode === 'existing' ? (
              <label className="block text-sm font-medium text-ink">
                Station
                <select
                  value={stationId}
                  onChange={(e) => setStationId(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-control border border-surface-border px-3 text-sm"
                >
                  <option value="">Select a station</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.brand ? ` · ${s.brand}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <Input
                  label="Station name"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  placeholder="e.g. Admiralty Way Filling Station"
                />
                <Input
                  label="Brand / operator (optional)"
                  value={newStationBrand}
                  onChange={(e) => setNewStationBrand(e.target.value)}
                  placeholder="NNPC, TotalEnergies…"
                />
              </>
            )}
          </>
        ) : null}

        {step === 'fuel' ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {FUEL_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setFuelType(type.value)}
                className={cn(
                  'min-h-11 rounded-control border px-3 py-3 text-sm font-semibold',
                  fuelType === type.value
                    ? 'border-brand-600 bg-brand-50 text-brand-800'
                    : 'border-surface-border'
                )}
              >
                {type.shortLabel}
              </button>
            ))}
          </div>
        ) : null}

        {step === 'availability' ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FUEL_AVAILABILITY.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setAvailability(item.value)}
                className={cn(
                  'min-h-11 rounded-control border px-3 py-3 text-sm font-semibold',
                  availability === item.value
                    ? 'border-brand-600 bg-brand-50 text-brand-800'
                    : 'border-surface-border'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {step === 'price' ? (
          <>
            {needsPrice ? (
              <Input
                label={`Observed price (₦ per ${fuelTypeMeta(fuelType)?.defaultUnit || 'litre'})`}
                type="number"
                min="1"
                step="0.01"
                value={priceAmount}
                onChange={(e) => setPriceAmount(e.target.value)}
                placeholder="e.g. 945"
              />
            ) : (
              <p className="text-sm text-ink-muted">
                Price is optional when fuel is unavailable or unknown.
              </p>
            )}
            <label className="block text-sm font-medium text-ink">
              Queue / wait (optional)
              <select
                value={queueCondition}
                onChange={(e) => setQueueCondition(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-control border border-surface-border px-3 text-sm"
              >
                {FUEL_QUEUE.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {step === 'notes' ? (
          <label className="block text-sm font-medium text-ink">
            Extra note (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="mt-1.5 w-full rounded-control border border-surface-border px-3 py-2 text-sm"
              placeholder="Anything else people nearby should know?"
            />
          </label>
        ) : null}

        {step === 'review' ? (
          <div className="space-y-2 rounded-control border border-surface-border bg-surface-muted/60 p-4 text-sm">
            <p>
              <span className="font-semibold">Location:</span> {locationLabel || '—'}
            </p>
            <p>
              <span className="font-semibold">Station:</span>{' '}
              {stationMode === 'existing'
                ? stations.find((s) => s.id === stationId)?.name || presetStation?.name || '—'
                : newStationName}
            </p>
            <p>
              <span className="font-semibold">Fuel:</span>{' '}
              {FUEL_TYPES.find((t) => t.value === fuelType)?.label}
            </p>
            <p>
              <span className="font-semibold">Availability:</span>{' '}
              {FUEL_AVAILABILITY.find((a) => a.value === availability)?.label}
            </p>
            {needsPrice ? (
              <p>
                <span className="font-semibold">Price:</span> ₦{priceAmount}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <FormError className="mt-4">{error}</FormError> : null}

      <div className="mt-6 flex flex-wrap gap-3">
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
            disabled={!canContinue() || busy}
            onClick={() => setStep(STEPS[stepIndex + 1])}
          >
            Continue
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={submit}>
            {busy ? 'Submitting…' : 'Submit fuel update'}
          </Button>
        )}
      </div>

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={(selection) => {
          setLocationId(selection.locationId || selection.area?.locationId || selection.id);
          setLocationLabel(
            [selection.name || selection.area?.name, selection.lga?.name || selection.lga, selection.state?.name || selection.state]
              .filter(Boolean)
              .join(', ')
          );
          setStationId('');
        }}
      />
    </div>
  );
}
