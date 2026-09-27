'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  GEO_STATUS,
  getCurrentPosition,
  messageForStatus,
  queryPermissionState,
} from '@/lib/geolocation';
import {
  LOCATION_SOURCES,
  applySelection,
  clearLocationContext,
  clearPrivateCoords,
  contextModeTitle,
  loadLocationContext,
  saveLocationContext,
} from '@/lib/locationSource';
import { ApiError } from '@/lib/api';
import { resolveDeviceToPublicLocation } from '@/lib/resolveDeviceLocation';

const LocationSourceContext = createContext(null);

export function LocationSourceProvider({ children }) {
  const [context, setContext] = useState(() => emptySafe());
  const [permission, setPermission] = useState('unknown');
  const [geoStatus, setGeoStatus] = useState(GEO_STATUS.IDLE);

  function emptySafe() {
    try {
      return loadLocationContext();
    } catch {
      return {
        source: null,
        label: null,
        locationId: null,
        areaId: null,
        lgaId: null,
        public: {},
        privateCoords: null,
        unresolved: false,
      };
    }
  }

  useEffect(() => {
    setContext(loadLocationContext());
    queryPermissionState().then(setPermission).catch(() => setPermission('unknown'));
  }, []);

  const persist = useCallback((next) => {
    const saved = saveLocationContext(next);
    setContext(saved);
    return saved;
  }, []);

  const setFromSelection = useCallback(
    (selection = {}) => {
      const privateCoords =
        selection.privateLat != null && selection.privateLng != null
          ? {
              lat: selection.privateLat,
              lng: selection.privateLng,
              accuracy: selection.accuracy ?? null,
              acquiredAt: Date.now(),
            }
          : selection.privateCoords || null;

      const source =
        selection.source ||
        (privateCoords ? LOCATION_SOURCES.DEVICE : LOCATION_SOURCES.MANUAL);

      const next = applySelection({
        source,
        label: selection.label,
        locationId: selection.locationId,
        areaId: selection.areaId,
        lgaId: selection.lgaId,
        public: selection.public,
        name: selection.name,
        lga: selection.lga,
        state: selection.state,
        stateCode: selection.stateCode,
        privateCoords,
        lowAccuracy: selection.lowAccuracy,
        unresolved: selection.unresolved,
      });
      setContext(next);
      return next;
    },
    []
  );

  const setSavedSource = useCallback(
    (selection = {}) => {
      const next = applySelection({
        ...selection,
        source: LOCATION_SOURCES.SAVED,
        privateCoords: null,
      });
      setContext(next);
      return next;
    },
    []
  );

  /**
   * Acquire device GPS once, resolve to public area, update session context.
   * Does not call watchPosition.
   */
  const acquireAndResolve = useCallback(async (options = {}) => {
    setGeoStatus(GEO_STATUS.REQUESTING);
    const result = await getCurrentPosition(options);
    if (!result.ok) {
      setGeoStatus(result.status);
      if (result.status === GEO_STATUS.DENIED) setPermission('denied');
      return {
        ok: false,
        status: result.status,
        message: result.message || messageForStatus(result.status),
      };
    }

    setPermission('granted');
    setGeoStatus(GEO_STATUS.GRANTED);

    try {
      const resolved = await resolveDeviceToPublicLocation(result.position);
      if (!resolved.resolved) {
        const next = applySelection({
          source: LOCATION_SOURCES.DEVICE,
          privateCoords: resolved.privateCoords,
          lowAccuracy: resolved.lowAccuracy,
          unresolved: true,
          label: 'Area not identified',
        });
        setContext(next);
        return {
          ok: false,
          status: 'unresolved',
          message:
            'We found your position but could not match it to a known area. Choose a location manually.',
          privateCoords: resolved.privateCoords,
          context: next,
        };
      }

      const next = applySelection({
        source: LOCATION_SOURCES.DEVICE,
        locationId: resolved.locationId,
        areaId: resolved.areaId,
        lgaId: resolved.lgaId,
        label: resolved.label,
        public: resolved.public,
        privateCoords: resolved.privateCoords,
        lowAccuracy: resolved.lowAccuracy,
        unresolved: false,
      });
      setContext(next);
      return {
        ok: true,
        status: GEO_STATUS.GRANTED,
        message: messageForStatus(GEO_STATUS.GRANTED),
        selection: {
          source: LOCATION_SOURCES.DEVICE,
          locationId: resolved.locationId,
          areaId: resolved.areaId,
          lgaId: resolved.lgaId,
          label: resolved.label,
          privateLat: resolved.privateCoords.lat,
          privateLng: resolved.privateCoords.lng,
          accuracy: resolved.privateCoords.accuracy,
          lowAccuracy: resolved.lowAccuracy,
          placeCoordinates: resolved.placeCoordinates,
          public: resolved.public,
        },
        context: next,
      };
    } catch (err) {
      setGeoStatus(GEO_STATUS.ERROR);
      return {
        ok: false,
        status: GEO_STATUS.ERROR,
        message:
          err instanceof ApiError
            ? err.message
            : 'Location lookup failed. Choose a location manually.',
      };
    }
  }, []);

  const dropPrivateCoords = useCallback(() => {
    const next = clearPrivateCoords(context);
    setContext(next);
    return next;
  }, [context]);

  const reset = useCallback(() => {
    clearLocationContext();
    setContext(loadLocationContext());
    setGeoStatus(GEO_STATUS.IDLE);
  }, []);

  const value = useMemo(
    () => ({
      context,
      source: context.source,
      permission,
      geoStatus,
      modeTitle: contextModeTitle(context.source),
      setFromSelection,
      setSavedSource,
      acquireAndResolve,
      dropPrivateCoords,
      reset,
      persist,
      LOCATION_SOURCES,
    }),
    [
      context,
      permission,
      geoStatus,
      setFromSelection,
      setSavedSource,
      acquireAndResolve,
      dropPrivateCoords,
      reset,
      persist,
    ]
  );

  return (
    <LocationSourceContext.Provider value={value}>{children}</LocationSourceContext.Provider>
  );
}

export function useLocationSource() {
  const ctx = useContext(LocationSourceContext);
  if (!ctx) {
    throw new Error('useLocationSource must be used within LocationSourceProvider');
  }
  return ctx;
}

/** Optional hook when provider may be absent (e.g. isolated tests). */
export function useLocationSourceOptional() {
  return useContext(LocationSourceContext);
}
