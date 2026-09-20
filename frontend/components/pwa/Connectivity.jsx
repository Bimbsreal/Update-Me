'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ConnectivityContext = createContext({
  online: true,
  offline: false,
});

export function useConnectivity() {
  return useContext(ConnectivityContext);
}

export function ConnectivityProvider({ children }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined') return undefined;
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const value = useMemo(() => ({ online, offline: !online }), [online]);
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function OfflineBanner() {
  const { offline } = useConnectivity();
  if (!offline) return null;
  return (
    <div
      role="status"
      className="border-b border-status-caution/40 bg-[#fff8e6] px-3 py-2 text-center text-xs font-semibold text-[#7a5b00] sm:text-sm"
    >
      You’re offline — shown information may not be current. Reporting requires a connection.
    </div>
  );
}
