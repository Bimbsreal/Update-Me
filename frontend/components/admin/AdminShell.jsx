'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { BrandLogo } from '@/components/brand/BrandLogo';
import {
  AdminProvider,
  useAdminContextValue,
} from '@/components/admin/AdminContext';
import { adminApi, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  SEARCH_GROUP_LABELS,
  filterAdminNav,
  hasAdminPermission,
  pageTitleForPath,
  roleDisplayLabel,
  searchResultHref,
} from '@/lib/adminNav';

function isActive(pathname, item) {
  if (item.match === 'exact') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavIcon({ name }) {
  const common = 'h-4 w-4 shrink-0';
  switch (name) {
    case 'dashboard':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="5" rx="1.5" />
          <rect x="13" y="10" width="8" height="11" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
        </svg>
      );
    case 'health':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 12h4l2-5 4 10 2-5h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" strokeLinecap="round" />
        </svg>
      );
  }
}

function iconForHref(href) {
  if (href === '/admin') return 'dashboard';
  if (href.includes('system-health')) return 'health';
  return 'default';
}

function environmentLabel() {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'Local';
  if (host.includes('staging') || host.includes('dev')) return 'Staging';
  return 'Production';
}

export function AdminShell({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [adminMeta, setAdminMeta] = useState(null);
  const [gateError, setGateError] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const adminContext = useAdminContextValue(adminMeta);
  const permissions = adminContext.permissions;
  const navSections = useMemo(() => filterAdminNav(permissions), [permissions]);
  const pageMeta = useMemo(() => pageTitleForPath(pathname || '/admin'), [pathname]);
  const envLabel = useMemo(() => environmentLabel(), []);
  const canSearch = hasAdminPermission(permissions, 'search');

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
    setProfileOpen(false);
  }, [pathname]);

  async function runSearch(e) {
    e?.preventDefault();
    if (!canSearch) return;
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
      <div className="flex min-h-screen items-center justify-center bg-[#eef2ef] text-sm text-ink-muted">
        Loading operations center…
      </div>
    );
  }

  if (!user || gateError || !adminMeta) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#eef2ef] px-4 text-center">
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

  const roleLabel = roleDisplayLabel(adminMeta.role || user.adminRole);
  const sidebarWidth = sidebarCollapsed ? 'lg:w-[4.5rem]' : 'lg:w-60';

  return (
    <AdminProvider value={adminContext}>
      <div className="min-h-screen bg-[#eef2ef] text-ink">
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-surface-border bg-white">
          <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-surface-border lg:hidden"
              aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              <span className="text-lg leading-none" aria-hidden>
                {navOpen ? '✕' : '☰'}
              </span>
            </button>

            <button
              type="button"
              className="hidden h-10 w-10 items-center justify-center rounded-lg border border-surface-border text-ink-muted hover:bg-surface-muted lg:inline-flex"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setSidebarCollapsed((v) => !v)}
            >
              <span aria-hidden className="text-sm font-bold">
                {sidebarCollapsed ? '»' : '«'}
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <BrandLogo size="sm" showTagline={false} wordmarkClassName="text-sm" />
                <span className="hidden rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-800 sm:inline">
                  Ops
                </span>
                {envLabel ? (
                  <span
                    className={cn(
                      'hidden rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:inline',
                      envLabel === 'Production'
                        ? 'bg-red-50 text-red-800'
                        : 'bg-slate-100 text-slate-700'
                    )}
                  >
                    {envLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-ink-muted sm:text-xs">
                <span className="hidden sm:inline">{pageMeta.section} · </span>
                {pageMeta.title}
              </p>
            </div>

            <div className="relative">
              <button
                type="button"
                className="flex max-w-[10rem] items-center gap-2 rounded-lg border border-surface-border px-2.5 py-1.5 text-left hover:bg-surface-muted sm:max-w-xs"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                onClick={() => setProfileOpen((v) => !v)}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
                  {(user.displayName || 'A').slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-xs font-semibold text-ink">
                    {user.displayName}
                  </span>
                  <span className="block truncate text-[10px] capitalize text-ink-muted">
                    {roleLabel}
                  </span>
                </span>
              </button>
              {profileOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-1 w-44 rounded-lg border border-surface-border bg-white py-1 shadow-lg"
                >
                  <Link
                    role="menuitem"
                    href="/home"
                    className="block px-3 py-2 text-sm text-ink hover:bg-surface-muted"
                  >
                    Open app
                  </Link>
                  <Link
                    role="menuitem"
                    href="/profile"
                    className="block px-3 py-2 text-sm text-ink hover:bg-surface-muted"
                  >
                    Profile
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted"
                    onClick={() => logout().then(() => router.push('/login'))}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="flex">
          <aside
            id="admin-nav"
            className={cn(
              'fixed inset-y-0 left-0 z-50 flex w-[16.5rem] flex-col border-r border-surface-border bg-white pt-[3.25rem] transition-transform lg:static lg:z-0 lg:translate-x-0 lg:pt-0',
              sidebarWidth,
              navOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
            )}
          >
            <div className="border-b border-surface-border px-3 py-3 lg:hidden">
              <p className="text-xs font-semibold text-ink">{user.displayName}</p>
              <p className="text-[11px] capitalize text-ink-muted">{roleLabel}</p>
            </div>
            <nav className="flex-1 overflow-y-auto p-2" aria-label="Admin sections">
              {navSections.map((section) => (
                <div key={section.id} className="mb-3">
                  {!sidebarCollapsed ? (
                    <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                      {section.label}
                    </p>
                  ) : (
                    <div className="my-2 border-t border-surface-border" aria-hidden />
                  )}
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isActive(pathname, item);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            title={item.label}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium',
                              active
                                ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-100'
                                : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                              sidebarCollapsed && 'justify-center px-2'
                            )}
                          >
                            <NavIcon name={iconForHref(item.href)} />
                            {!sidebarCollapsed ? <span className="truncate">{item.label}</span> : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          {navOpen ? (
            <button
              type="button"
              className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
              aria-label="Close navigation"
              onClick={() => setNavOpen(false)}
            />
          ) : null}

          <main id="admin-main" className="min-w-0 flex-1 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
            {canSearch ? (
              <form onSubmit={runSearch} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="sr-only" htmlFor="admin-global-search">
                  Search operations
                </label>
                <input
                  id="admin-global-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search reports, locations, users…"
                  className="min-w-0 flex-1 rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </form>
            ) : null}

            {searchResults ? (
              <div className="mb-4 rounded-xl border border-surface-border bg-white p-3 text-sm shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink">Search results</p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-ink-muted hover:text-ink"
                    onClick={() => setSearchResults(null)}
                  >
                    Clear
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(searchResults).map(([key, rows]) => {
                    if (!rows?.length) return null;
                    const visible = rows
                      .map((row) => ({
                        row,
                        href: searchResultHref(key, row, permissions),
                      }))
                      .filter((entry) => entry.href);
                    if (!visible.length) return null;
                    return (
                      <div key={key}>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {SEARCH_GROUP_LABELS[key] || key}
                        </p>
                        <ul className="space-y-1">
                          {visible.slice(0, 5).map(({ row, href }) => (
                            <li key={row.id}>
                              <Link
                                href={href}
                                className="block truncate rounded px-1 py-0.5 text-ink hover:bg-brand-50 hover:text-brand-900"
                                onClick={() => setSearchResults(null)}
                              >
                                {row.title || row.name || row.displayName || row.id}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {children}
          </main>
        </div>
      </div>
    </AdminProvider>
  );
}
