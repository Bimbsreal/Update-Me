'use client';

import Link from 'next/link';
import { BrandLogo } from '@/components/brand/BrandLogo';

/**
 * Lightweight chrome for public information pages outside the full app shell.
 */
export function PublicInfoChrome({ children, backHref, backLabel }) {
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <header className="sticky top-0 z-30 border-b border-surface-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <BrandLogo size="sm" />
          <div className="flex items-center gap-2">
            {backHref ? (
              <Link
                href={backHref}
                className="text-xs font-semibold text-brand-700 hover:underline"
              >
                {backLabel || 'Back'}
              </Link>
            ) : null}
            <Link
              href="/explore"
              className="rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-semibold text-ink"
            >
              Explore
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6 pb-16">{children}</div>
    </div>
  );
}
