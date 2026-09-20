'use client';

import { BrandLogo } from '@/components/brand/BrandLogo';

export default function OfflinePage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <BrandLogo showTagline={false} />
      <h1 className="text-2xl font-bold text-ink">You’re offline</h1>
      <p className="max-w-md text-sm text-ink-muted">
        Update Me needs a connection for live local information. Cached pages may be shown when
        available and may not be current. Report submissions require connectivity.
      </p>
      <button
        type="button"
        className="rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        onClick={() => window.location.reload()}
      >
        Try again
      </button>
    </div>
  );
}
