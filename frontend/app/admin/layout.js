'use client';

import { AdminShell } from '@/components/admin/AdminShell';
import { AppErrorBoundary } from '@/components/app/AppErrorBoundary';

export default function AdminLayout({ children }) {
  return (
    <AdminShell>
      <AppErrorBoundary fallbackMessage="This admin section could not load. Try again or return to the dashboard.">
        {children}
      </AppErrorBoundary>
    </AdminShell>
  );
}
