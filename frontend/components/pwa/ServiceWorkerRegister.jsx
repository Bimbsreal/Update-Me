'use client';

import { useEffect } from 'react';

/**
 * Registers the Update Me service worker (production or when explicitly enabled).
 * Does not register during `next dev` unless NEXT_PUBLIC_ENABLE_SW=true.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined;

    const allowDev = process.env.NEXT_PUBLIC_ENABLE_SW === 'true';
    const isLocalhost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    // Allow SW on localhost for PWA verification; skip only in mixed HMR confusion if disabled.
    if (process.env.NODE_ENV !== 'production' && !allowDev && !isLocalhost) {
      return undefined;
    }

    let cancelled = false;
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version ready — activate on next navigation/reload without force-refresh.
              worker.postMessage('SKIP_WAITING');
            }
          });
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[pwa] service worker registration failed', err?.message || err);
        }
      }
    };

    register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
