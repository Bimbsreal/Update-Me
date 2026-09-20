/**
 * Centralized SSE client for Update Me.
 * REST remains source of truth for initial state; SSE delivers deltas.
 */

import { API_BASE_URL } from './api.js';

const INFORMATION_EVENTS = new Set([
  'traffic.updated',
  'fuel.updated',
  'transport.updated',
  'price.updated',
  'alert.created',
  'alert.updated',
  'official.updated',
  'report.updated',
  'report.confirmed',
]);

const USER_EVENTS = new Set([
  'notification.created',
  'saved_area.updated',
  'saved_route.updated',
]);

export const REALTIME_EVENTS = {
  INFORMATION: INFORMATION_EVENTS,
  USER: USER_EVENTS,
};

/**
 * @param {{ locationId?: string, categories?: string, onEvent?: Function, onStatus?: Function }} options
 */
export function createRealtimeClient(options = {}) {
  let source = null;
  let closed = true;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let lastEventId = null;
  let status = 'disconnected';

  const listeners = new Set();
  if (options.onEvent) listeners.add(options.onEvent);

  function setStatus(next) {
    status = next;
    options.onStatus?.(next);
  }

  function buildUrl() {
    const params = new URLSearchParams();
    if (options.locationId) params.set('locationId', options.locationId);
    if (options.categories) params.set('categories', options.categories);
    const qs = params.toString();
    return `${API_BASE_URL}/realtime/events${qs ? `?${qs}` : ''}`;
  }

  function emit(type, data) {
    for (const fn of listeners) {
      try {
        fn({ type, data });
      } catch {
        /* listener errors must not break the stream */
      }
    }
  }

  function scheduleReconnect() {
    if (closed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt, 4));
    reconnectAttempt += 1;
    setStatus('reconnecting');
    reconnectTimer = setTimeout(() => {
      connect();
    }, delay);
  }

  function connect() {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      setStatus('unavailable');
      return;
    }
    if (source) {
      try {
        source.close();
      } catch {
        /* ignore */
      }
      source = null;
    }

    closed = false;
    setStatus(reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    try {
      // Cookie session: withCredentials for cross-origin localhost:5000
      source = new EventSource(buildUrl(), { withCredentials: true });
    } catch {
      setStatus('offline');
      scheduleReconnect();
      return;
    }

    source.onopen = () => {
      reconnectAttempt = 0;
      setStatus('connected');
    };

    source.onerror = () => {
      if (closed) return;
      try {
        source?.close();
      } catch {
        /* ignore */
      }
      source = null;
      setStatus('offline');
      scheduleReconnect();
    };

    const handleMessage = (event) => {
      if (event.lastEventId) lastEventId = event.lastEventId;
      let data = null;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      emit(event.type || data?.type || 'message', data);
    };

    // Named events
    for (const name of [...INFORMATION_EVENTS, ...USER_EVENTS, 'realtime.ready']) {
      source.addEventListener(name, handleMessage);
    }
    source.onmessage = handleMessage;
  }

  function disconnect() {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (source) {
      try {
        source.close();
      } catch {
        /* ignore */
      }
      source = null;
    }
    setStatus('disconnected');
  }

  function setContext({ locationId, categories } = {}) {
    if (locationId !== undefined) options.locationId = locationId || undefined;
    if (categories !== undefined) options.categories = categories || undefined;
    if (!closed) {
      // Reconnect with new query — EventSource cannot PATCH context
      reconnectAttempt = 0;
      connect();
    }
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    connect,
    disconnect,
    setContext,
    subscribe,
    getStatus: () => status,
    getLastEventId: () => lastEventId,
  };
}
