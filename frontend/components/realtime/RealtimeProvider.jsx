'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { createRealtimeClient, REALTIME_EVENTS } from '@/lib/realtime';

const RealtimeContext = createContext({
  status: 'disconnected',
  lastEvent: null,
  explorePending: 0,
  clearExplorePending: () => {},
  setExploreLocationId: () => {},
  subscribe: () => () => {},
});

export function useRealtime() {
  return useContext(RealtimeContext);
}

/**
 * Single app-wide EventSource. Mount once inside authenticated AppShell.
 */
export function RealtimeProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const clientRef = useRef(null);
  const [status, setStatus] = useState('disconnected');
  const [lastEvent, setLastEvent] = useState(null);
  const [explorePending, setExplorePending] = useState(0);
  const [exploreLocationId, setExploreLocationIdState] = useState(null);
  const listenersRef = useRef(new Set());

  const clearExplorePending = useCallback(() => setExplorePending(0), []);

  const setExploreLocationId = useCallback((locationId) => {
    setExploreLocationIdState(locationId || null);
    clientRef.current?.setContext({
      locationId: locationId || user?.currentArea?.locationId || undefined,
    });
  }, [user?.currentArea?.locationId]);

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      clientRef.current?.disconnect();
      clientRef.current = null;
      setStatus('disconnected');
      return undefined;
    }

    const client = createRealtimeClient({
      locationId: exploreLocationId || user.currentArea?.locationId || undefined,
      onStatus: setStatus,
      onEvent: ({ type, data }) => {
        setLastEvent({ type, data, at: Date.now() });
        for (const fn of listenersRef.current) {
          try {
            fn({ type, data });
          } catch {
            /* ignore */
          }
        }
        if (REALTIME_EVENTS.INFORMATION.has(type)) {
          setExplorePending((n) => Math.min(99, n + 1));
        }
      },
    });
    clientRef.current = client;
    client.connect();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && client.getStatus() === 'offline') {
        client.connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onOnline = () => {
      if (client.getStatus() === 'offline' || client.getStatus() === 'disconnected') {
        client.connect();
      }
    };
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      client.disconnect();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [isAuthenticated, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update explore location without tearing down auth effect
  useEffect(() => {
    if (!clientRef.current || !user) return;
    clientRef.current.setContext({
      locationId: exploreLocationId || user.currentArea?.locationId || undefined,
    });
  }, [exploreLocationId, user?.currentArea?.locationId, user]);

  const value = useMemo(
    () => ({
      status,
      lastEvent,
      explorePending,
      clearExplorePending,
      setExploreLocationId,
      subscribe,
    }),
    [status, lastEvent, explorePending, clearExplorePending, setExploreLocationId, subscribe]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function LiveStatusIndicator({ className = '' }) {
  const { status } = useRealtime();
  const label =
    status === 'connected'
      ? 'Live'
      : status === 'reconnecting' || status === 'connecting'
        ? 'Reconnecting…'
        : status === 'offline' || status === 'unavailable'
          ? 'Live updates unavailable'
          : 'Offline';

  const dot =
    status === 'connected'
      ? 'bg-brand-600'
      : status === 'reconnecting' || status === 'connecting'
        ? 'bg-amber-500'
        : 'bg-ink-muted';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-muted ${className}`}
      title={
        status === 'connected'
          ? 'Live updates connected'
          : 'Realtime stream unavailable — app still works via normal loading'
      }
      role="status"
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}
