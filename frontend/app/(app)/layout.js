'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { AppErrorBoundary } from '@/components/app/AppErrorBoundary';
import { useAuth } from '@/components/auth/AuthProvider';

/** Routes that require a signed-in, onboarded user. */
const PRIVATE_PREFIXES = ['/home', '/notifications', '/profile', '/app'];

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Soft-auth layout:
 * - Private app surfaces still require auth + onboarding.
 * - Public information routes (traffic, fuel, explore, …) are browsable without login.
 */
export default function AppGroupLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const { user, loading } = useAuth();
  const privatePath = isPrivatePath(pathname);

  useEffect(() => {
    if (loading) return;
    if (!privatePath) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!user.onboardingCompleted) {
      router.replace('/onboarding');
    }
  }, [user, loading, router, privatePath, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  if (privatePath && (!user || !user.onboardingCompleted)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  return (
    <AppShell>
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </AppShell>
  );
}
