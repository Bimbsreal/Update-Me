'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { adminApi, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/admin', label: 'Overview', match: 'exact' },
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/alerts', label: 'Alerts' },
  { href: '/admin/official-sources', label: 'Data sources' },
  { href: '/admin/ingestion-runs', label: 'Ingestion runs' },
  { href: '/admin/official-updates', label: 'Updates' },
  { href: '/admin/fx', label: 'FX' },
  { href: '/admin/locations', label: 'Locations' },
  { href: '/admin/fuel', label: 'Fuel' },
  { href: '/admin/transport', label: 'Transport' },
  { href: '/admin/commodities', label: 'Commodities' },
  { href: '/admin/community', label: 'Community' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/data-quality', label: 'Data quality' },
  { href: '/admin/audit-log', label: 'Audit log' },
];

function isActive(pathname, item) {
  if (item.match === 'exact') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminShell({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [adminMeta, setAdminMeta] = useState(null);
  const [gateError, setGateError] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login?next=/admin');
      return;
    }
    let cancelled = false;
    adminApi
      .me()
      .then((data) => {
        if (cancelled) return;
        setAdminMeta(data.admin);
        setGateError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setAdminMeta(null);
        setGateError(err instanceof ApiError ? err.message : 'Admin access denied.');
      });
    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  useEffect(() => {
    setNavOpen(false);
    setSearchResults(null);
  }, [pathname]);

  const roleLabel = useMemo(() => {
    const role = adminMeta?.role || user?.adminRole;
    if (!role) return null;
    return String(role).replace(/_/g, ' ');
  }, [adminMeta, user]);

  async function runSearch(e) {
    e?.preventDefault();
    const q = search.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      const data = await adminApi.search(q);
      setSearchResults(data.results);
    } catch {
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  }

  if (loading || (user && !adminMeta && !gateError)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted text-sm text-ink-muted">
        Loading admin…
      </div>
    );
  }

  if (!user || gateError || !adminMeta) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-muted px-4 text-center">
        <BrandLogo />
        <p className="text-sm font-semibold text-ink">Admin access denied</p>
        <p className="max-w-sm text-sm text-ink-muted">
          {gateError || 'You need an administrator account to continue.'}
        </p>
        <Link href="/home" className="text-sm font-semibold text-brand-700 underline">
          Back to app
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f6f4] text-ink">
      <header className="sticky top-0 z-40 border-b border-surface-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3 sm:px-4">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-surface-border lg:hidden"
            aria-label="Toggle admin menu"
            onClick={() => setNavOpen((v) => !v)}
          >
            <span className="text-lg leading-none">☰</span>
          </button>
          <BrandLogo size="sm" className="min-w-0 flex-1" showTagline={false} wordmarkClassName="text-sm" />
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs capitalize text-ink-muted">
              {user.displayName}
              {roleLabel ? ` · ${roleLabel}` : ''}
            </p>
          </div>
          <Link
            href="/home"
            className="hidden rounded-lg px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-muted sm:inline"
          >
            App
          </Link>
          <button
            type="button"
            onClick={() => logout().then(() => router.push('/login'))}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-muted"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-0 lg:gap-6">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-surface-border bg-white pt-16 transition-transform lg:static lg:z-0 lg:block lg:w-56 lg:shrink-0 lg:translate-x-0 lg:pt-0',
            navOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          )}
        >
          <nav className="flex flex-col gap-0.5 p-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-lg px-3 py-2.5 text-sm font-medium',
                  isActive(pathname, item)
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        {navOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
        ) : null}

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 lg:px-2 lg:py-6">
          <form onSubmit={runSearch} className="mb-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports, locations, users…"
              className="min-w-0 flex-1 rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>

          {searchResults ? (
            <div className="mb-4 rounded-xl border border-surface-border bg-white p-3 text-sm shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold">Search results</p>
                <button
                  type="button"
                  className="text-xs text-ink-muted"
                  onClick={() => setSearchResults(null)}
                >
                  Clear
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(searchResults).map(([key, rows]) =>
                  rows?.length ? (
                    <div key={key}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        {key}
                      </p>
                      <ul className="space-y-1">
                        {rows.slice(0, 5).map((row) => (
                          <li key={row.id} className="truncate text-ink">
                            {row.title || row.name || row.displayName || row.id}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          ) : null}

          {children}
        </main>
      </div>
    </div>
  );
}
