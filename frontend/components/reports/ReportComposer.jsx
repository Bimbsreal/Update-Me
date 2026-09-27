'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LocationSelector } from '@/components/location/LocationSelector';
import { TrafficComposer } from '@/components/traffic/TrafficComposer';
import { TransportComposer } from '@/components/transport/TransportComposer';
import { PricesComposer } from '@/components/prices/PricesComposer';
import { AlertsComposer } from '@/components/alerts/AlertsComposer';
import { DirectionsComposer } from '@/components/directions/DirectionsComposer';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, reportsApi } from '@/lib/api';
import { cn } from '@/lib/cn';

const STEPS = ['category', 'location', 'details', 'review'];

export function ReportComposer({ onSubmitted }) {
  const { user } = useAuth();
  const [step, setStep] = useState('category');
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [locationId, setLocationId] = useState(user?.currentArea?.locationId || '');
  const [locationLabel, setLocationLabel] = useState(
    user?.currentArea
      ? `${user.currentArea.name}${user.currentArea.lga ? ` · ${user.currentArea.lga}` : ''}`
      : ''
  );
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    reportsApi
      .categories()
      .then((data) => setCategories(data.categories || []))
      .catch(() => setError('Unable to load report categories.'));
  }, []);

  useEffect(() => {
    if (user?.currentArea?.locationId && !locationId) {
      setLocationId(user.currentArea.locationId);
      setLocationLabel(
        `${user.currentArea.name}${user.currentArea.lga ? ` · ${user.currentArea.lga}` : ''}`
      );
    }
  }, [user, locationId]);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.code === category) || null,
    [categories, category]
  );

  const stepIndex = STEPS.indexOf(step);

  // Traffic / Transport use dedicated composer fields on top of the same report engine.
  if (category === 'traffic' && step !== 'category') {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setStep('category')}>
          ← Change category
        </Button>
        <TrafficComposer
          onSubmitted={(traffic) => {
            onSubmitted?.(traffic);
            setCategory('');
            setStep('category');
          }}
        />
      </div>
    );
  }

  if (category === 'transport' && step !== 'category') {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setStep('category')}>
          ← Change category
        </Button>
        <TransportComposer
          onSubmitted={(fare) => {
            onSubmitted?.(fare);
            setCategory('');
            setStep('category');
          }}
        />
      </div>
    );
  }

  if (category === 'prices' && step !== 'category') {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setStep('category')}>
          ← Change category
        </Button>
        <PricesComposer
          onSubmitted={(price) => {
            onSubmitted?.(price);
            setCategory('');
            setStep('category');
          }}
        />
      </div>
    );
  }

  if (category === 'local_alerts' && step !== 'category') {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setStep('category')}>
          ← Change category
        </Button>
        <AlertsComposer
          onSubmitted={(alert) => {
            onSubmitted?.(alert);
            setCategory('');
            setStep('category');
          }}
        />
      </div>
    );
  }

  if (category === 'directions' && step !== 'category') {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setStep('category')}>
          ← Change category
        </Button>
        <DirectionsComposer
          onSubmitted={(knowledge) => {
            onSubmitted?.(knowledge);
            setCategory('');
            setStep('category');
          }}
        />
      </div>
    );
  }

  if (category === 'fuel' && step !== 'category') {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setStep('category')}>
          ← Change category
        </Button>
        <p className="text-sm text-ink-muted">
          Fuel reports use the dedicated Fuel form for station and price fields.
        </p>
        <Button as={Link} href="/fuel">
          Open Fuel reporting
        </Button>
      </div>
    );
  }

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const data = await reportsApi.create({
        category,
        title: title.trim(),
        description: description.trim(),
        locationId,
      });
      setDone(data.report);
      onSubmitted?.(data.report);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit report.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-card border border-brand-100 bg-brand-50/60 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Report submitted
        </p>
        <h2 className="mt-2 text-xl font-bold text-ink">Thank you for sharing useful information</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Your community report is active. Other people can confirm or flag it later. This is not a
          social post — it is local utility information.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setDone(null);
              setStep('category');
              setCategory('');
              setTitle('');
              setDescription('');
            }}
          >
            Submit another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Report useful information
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Share an update</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Share useful information that can help people around you. Keep it factual, local, and
          clear.
        </p>
      </div>

      <ol className="mb-5 flex flex-wrap gap-2" aria-label="Report steps">
        {STEPS.map((id, index) => (
          <li key={id}>
            <span
              className={cn(
                'inline-flex items-center rounded-pill px-3 py-1 text-xs font-semibold capitalize',
                index <= stepIndex ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'
              )}
            >
              {index + 1}. {id}
            </span>
          </li>
        ))}
      </ol>

      <FormError message={error} />

      {step === 'category' ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">What type of information is this?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setCategory(item.code)}
                className={cn(
                  'rounded-control border px-3 py-3 text-left transition',
                  category === item.code
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-surface-border hover:border-brand-200'
                )}
              >
                <span className="block text-sm font-semibold text-ink">{item.name}</span>
                <span className="mt-1 block text-xs text-ink-muted">{item.description}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-muted">
            Choosing Traffic opens the traffic-specific form. Other categories use the generic
            report engine until their modules are ready.
          </p>
          <Button
            className="w-full sm:w-auto mb-2"
            disabled={!category}
            onClick={() => setStep(category === 'traffic' ? 'location' : 'location')}
          >
            Continue
          </Button>
        </div>
      ) : null}

      {step === 'location' ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-ink">Where is this about?</p>
          <div className="rounded-control border border-surface-border bg-surface-muted/50 px-3 py-3">
            <p className="text-sm font-semibold text-ink break-words">
              {locationLabel || 'No location selected'}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Use your current location or choose an area manually. Exact private coordinates are
              never published.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setSelectorOpen(true)}
              aria-label="Choose report location — current or manual"
            >
              Use current location or choose manually
            </Button>
            <Button variant="outline" onClick={() => setStep('category')}>
              Back
            </Button>
            <Button disabled={!locationId} onClick={() => setStep('details')}>
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
                return;
              }
              setError('Please choose an area that is linked to the location system.');
            }}
          />
        </div>
      ) : null}

      {step === 'details' ? (
        <div className="space-y-4">
          <Input
            id="report-title"
            label="Short title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Slow traffic near the roundabout"
            maxLength={120}
          />
          <label className="block space-y-1.5" htmlFor="report-description">
            <span className="text-sm font-medium text-ink">Useful details</span>
            <textarea
              id="report-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="What should someone nearby know right now?"
              className="w-full rounded-control border border-surface-border px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep('location')}>
              Back
            </Button>
            <Button
              disabled={title.trim().length < 3 || description.trim().length < 5}
              onClick={() => setStep('review')}
            >
              Review
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="space-y-4">
          <div className="rounded-control border border-surface-border bg-surface-muted/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Community report preview
            </p>
            <p className="mt-2 text-sm text-ink-muted">{selectedCategory?.name}</p>
            <h2 className="mt-1 text-lg font-bold text-ink break-words">{title}</h2>
            <p className="mt-2 text-sm text-ink-muted break-words whitespace-pre-wrap">{description}</p>
            <p className="mt-3 text-xs text-ink-muted break-words">{locationLabel}</p>
            <p className="mt-3 text-xs font-semibold text-brand-700">Source: Community Report</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep('details')}>
              Back
            </Button>
            <Button disabled={busy} onClick={submit}>
              {busy ? 'Submitting…' : 'Submit report'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
