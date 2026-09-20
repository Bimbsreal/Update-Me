'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { AppErrorBoundary } from '@/components/app/AppErrorBoundary';
import { useAuth } from '@/components/auth/AuthProvider';

export default function AppGroupLayout({ children }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!user.onboardingCompleted) {
      router.replace('/onboarding');
    }
  }, [user, loading, router]);

  if (loading || !user || !user.onboardingCompleted) {
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
