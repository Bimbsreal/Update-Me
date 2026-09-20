'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { FormError, Select } from '@/components/ui/Input';
import { ApiError, geoApi } from '@/lib/api';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading, setLocation } = useAuth();
  const [mode, setMode] = useState('choose');
  const [states, setStates] = useState([]);
  const [lgas, setLgas] = useState([]);
  const [areas, setAreas] = useState([]);
  const [stateId, setStateId] = useState('');
  const [lgaId, setLgaId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [resolved, setResolved] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user?.onboardingCompleted && !completing && !done) {
      router.replace('/home');
    }
  }, [loading, user, router, completing, done]);

  useEffect(() => {
    geoApi
      .states()
      .then((data) => setStates(data.states || []))
      .catch(() => setError('Unable to load states. Please refresh.'));
  }, []);

  useEffect(() => {
    if (!stateId) {
      setLgas([]);
      setLgaId('');
      setAreas([]);
      setAreaId('');
      return;
    }
    setBusy(true);
    geoApi
      .lgas(stateId)
      .then((data) => {
        setLgas(data.lgas || []);
        setLgaId('');
        setAreas([]);
        setAreaId('');
      })
      .catch(() => setError('Unable to load LGAs for that state.'))
      .finally(() => setBusy(false));
  }, [stateId]);

  useEffect(() => {
    if (!lgaId) {
      setAreas([]);
      setAreaId('');
      return;
    }
    setBusy(true);
    geoApi
      .areas(lgaId)
      .then((data) => {
        setAreas(data.areas || []);
        setAreaId('');
      })
      .catch(() => setError('Unable to load areas for that LGA.'))
      .finally(() => setBusy(false));
  }, [lgaId]);

  const nigeriaDefault = useMemo(
    () => states.find((s) => s.code === 'LA' || s.name === 'Lagos') || states[0],
    [states]
  );

  useEffect(() => {
    if (!stateId && nigeriaDefault?.id) setStateId(nigeriaDefault.id);
  }, [nigeriaDefault, stateId]);

  async function useMyLocation() {
    setError('');
    setResolved(null);
    if (!navigator.geolocation) {
      setError('Location is not supported in this browser. Please choose manually.');
      setMode('manual');
      return;
    }
    setBusy(true);
    setMode('locate');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const data = await geoApi.resolve(position.coords.latitude, position.coords.longitude);
          setResolved(data.area);
          setAreaId(data.area.id);
          setSelectedLabel(`${data.area.name}, ${data.area.lga}, ${data.area.state}`);
        } catch (err) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Location lookup failed. Please choose manually.'
          );
          setMode('manual');
        } finally {
          setBusy(false);
        }
      },
      (geoError) => {
        setBusy(false);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError('Location permission was denied. You can choose your area manually.');
        } else {
          setError('We could not read your location. Please choose manually.');
        }
        setMode('manual');
      },
      { enableHighAccuracy: false, timeout: 12000 }
    );
  }

  async function confirmArea(id, label) {
    setBusy(true);
    setCompleting(true);
    setError('');
    try {
      const data = await setLocation(id);
      const area = data.user.currentArea;
      setSelectedLabel(label || `${area.name}, ${area.lga}, ${area.state}`);
      setDone(true);
    } catch (err) {
      setCompleting(false);
      setError(err.message || 'Unable to save your area.');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  if (done) {
    return (
      <AuthShell title="You're all set." subtitle="Your updates will now be tailored to:">
        <div className="space-y-5 text-center">
          <p className="rounded-control border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800">
            📍 {selectedLabel}
          </p>
          <p className="text-sm text-ink-muted">
            We store your selected area — not a precise public pin of your exact location.
          </p>
          <Button className="w-full" onClick={() => router.replace('/home')}>
            Continue to Update Me
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Where are you usually around?"
      subtitle="Choose an area so Update Me can tailor useful local information."
    >
      <div className="space-y-4">
        <FormError message={error} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant={mode === 'locate' ? 'primary' : 'secondary'}
            onClick={useMyLocation}
            disabled={busy}
            className="w-full"
          >
            Use My Location
          </Button>
          <Button
            type="button"
            variant={mode === 'manual' || mode === 'choose' ? 'primary' : 'secondary'}
            onClick={() => setMode('manual')}
            className="w-full"
          >
            Choose Manually
          </Button>
        </div>

        {resolved ? (
          <div className="rounded-control border border-surface-border bg-surface-muted p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Suggested area
            </p>
            <p className="mt-1 font-semibold text-ink">
              {resolved.name}, {resolved.lga}, {resolved.state}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Approximate match only — your exact coordinates are not shown publicly.
            </p>
            <Button
              className="mt-3 w-full"
              disabled={busy}
              onClick={() =>
                confirmArea(
                  resolved.id,
                  `${resolved.name}, ${resolved.lga}, ${resolved.state}`
                )
              }
            >
              {busy ? 'Saving…' : 'Use this area'}
            </Button>
          </div>
        ) : null}

        {(mode === 'manual' || mode === 'choose') && (
          <div className="space-y-3">
            <Select id="country" label="Country" value="NG" disabled>
              <option value="NG">Nigeria</option>
            </Select>
            <Select
              id="state"
              label="State"
              value={stateId}
              onChange={(e) => setStateId(e.target.value)}
            >
              <option value="">Select state</option>
              {states.map((state) => (
                <option key={state.id} value={state.id}>
                  {state.name}
                </option>
              ))}
            </Select>
            <Select
              id="lga"
              label="LGA"
              value={lgaId}
              onChange={(e) => setLgaId(e.target.value)}
              disabled={!stateId || busy}
            >
              <option value="">{lgas.length ? 'Select LGA' : 'No LGAs seeded for this state yet'}</option>
              {lgas.map((lga) => (
                <option key={lga.id} value={lga.id}>
                  {lga.name}
                </option>
              ))}
            </Select>
            <Select
              id="area"
              label="Area"
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              disabled={!lgaId || busy}
            >
              <option value="">{areas.length ? 'Select area' : 'No areas seeded for this LGA yet'}</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
            <Button
              className="w-full"
              disabled={!areaId || busy}
              onClick={() => {
                const area = areas.find((item) => item.id === areaId);
                const lga = lgas.find((item) => item.id === lgaId);
                const state = states.find((item) => item.id === stateId);
                confirmArea(
                  areaId,
                  `${area?.name}, ${lga?.name}, ${state?.name}`
                );
              }}
            >
              {busy ? 'Saving…' : 'Save area'}
            </Button>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
