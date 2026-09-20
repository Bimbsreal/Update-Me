'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'um_pwa_install_dismissed_v1';

/**
 * Optional, dismissible install hint when the browser fires beforeinstallprompt.
 * Never blocks navigation; respects prior dismissal.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return undefined;
    } catch {
      /* ignore */
    }

    const onPrompt = (event) => {
      event.preventDefault();
      setDeferred(event);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    setVisible(false);
  }

  function dismiss() {
    setVisible(false);
    setDeferred(null);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  if (!visible || !deferred) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-3 md:bottom-6">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-card border border-brand-100 bg-white px-3 py-2.5 shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">Install Update Me</p>
          <p className="text-[11px] text-ink-muted">Add to your home screen for quicker access.</p>
        </div>
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-control bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-control px-2 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface-muted"
          aria-label="Dismiss install prompt"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
