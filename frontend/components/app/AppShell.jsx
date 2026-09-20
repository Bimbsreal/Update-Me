'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { LocationSelector } from '@/components/location/LocationSelector';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { LiveStatusIndicator, RealtimeProvider, useRealtime } from '@/components/realtime/RealtimeProvider';
import { Button } from '@/components/ui/Button';
import { notificationsApi } from '@/lib/api';
import { cn } from '@/lib/cn';

const navItems = [
  { href: '/home', label: 'Home', icon: 'home' },
  { href: '/traffic', label: 'Traffic', icon: 'traffic' },
  { href: '/fuel', label: 'Fuel', icon: 'fuel' },
  { href: '/transport', label: 'Transport', icon: 'transport' },
  { href: '/prices', label: 'Prices', icon: 'prices' },
  { href: '/alerts', label: 'Alerts', icon: 'alerts' },
  { href: '/directions', label: 'Directions', icon: 'directions' },
  { href: '/community', label: 'Community', icon: 'community' },
  { href: '/explore', label: 'Explore', icon: 'explore' },
  { href: '/notifications', label: 'Notifications', icon: 'notifications' },
  { href: '/app/report', label: 'Report', icon: 'report', prominent: true },
  { href: '/profile', label: 'Profile', icon: 'profile' },
];

/** Compact mobile primary destinations — full list remains in the sidebar. */
const mobileNavItems = [
  { href: '/home', label: 'Home', icon: 'home' },
  { href: '/notifications', label: 'Inbox', icon: 'notifications' },
  { href: '/explore', label: 'Explore', icon: 'explore' },
  { href: '/app/report', label: 'Report', icon: 'report', prominent: true },
  { href: '/profile', label: 'Profile', icon: 'profile' },
];

function NavIcon({ name }) {
  const props = {
    className: 'h-5 w-5',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    'aria-hidden': true,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case 'explore':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
          <path d="m10 14 4-6-6 4 6 2-4 0Z" />
        </svg>
      );
    case 'traffic':
      return (
        <svg {...props}>
          <path d="M4 16h16M7 16V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v7M9 19h.01M15 19h.01" />
        </svg>
      );
    case 'fuel':
      return (
        <svg {...props}>
          <path d="M8 4h6v12H8zM14 8h2a2 2 0 0 1 2 2v5a2 2 0 1 0 4 0V9l-3-3" />
          <path d="M8 16v3h6v-3" />
        </svg>
      );
    case 'transport':
      return (
        <svg {...props}>
          <path d="M5 16h14M7 16V8l5-3 5 3v8M9 19h.01M15 19h.01M9 11h6" />
        </svg>
      );
    case 'prices':
      return (
        <svg {...props}>
          <path d="M12 3v18M8 8h6a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7" />
        </svg>
      );
    case 'alerts':
      return (
        <svg {...props}>
          <path d="M12 9v4M12 17h.01M10.3 4.3 3.6 16a2 2 0 0 0 1.7 3h13.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
        </svg>
      );
    case 'directions':
      return (
        <svg {...props}>
          <path d="M12 3v18M12 3l4 4M12 3 8 7M5 12h14" />
        </svg>
      );
    case 'report':
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      );
    case 'community':
      return (
        <svg {...props}>
          <path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
          <circle cx="9.5" cy="8" r="3" />
          <path d="M20 19v-1a3.5 3.5 0 0 0-2.5-3.35M16 5.1a3 3 0 0 1 0 5.8" />
        </svg>
      );
    case 'notifications':
      return (
        <svg {...props}>
          <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19a7 7 0 0 1 14 0" />
        </svg>
      );
    default:
      return null;
  }
}

function AreaChip({ area, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-brand-100 bg-brand-50 px-3 py-1.5 text-left text-sm font-semibold text-brand-800 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <span aria-hidden>📍</span>
      <span className="truncate">{area ? area.name : 'Choose area'}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-brand-600">Change</span>
    </button>
  );
}

export function AppShell({ children }) {
  return (
    <RealtimeProvider>
      <AppShellInner>{children}</AppShellInner>
    </RealtimeProvider>
  );
}

function AppShellInner({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loading, setLocation } = useAuth();
  const { subscribe } = useRealtime();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return undefined;
    }
    let cancelled = false;
    const load = () => {
      notificationsApi
        .unreadCount()
        .then((data) => {
          if (!cancelled) setUnreadCount(data.unreadCount || 0);
        })
        .catch(() => {
          if (!cancelled) setUnreadCount(0);
        });
    };
    load();
    // SSE handles live bumps; keep a slow reconcile poll as fallback
    const timer = setInterval(load, 180_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, pathname]);

  useEffect(() => {
    return subscribe(({ type }) => {
      if (type === 'notification.created') {
        setUnreadCount((n) => n + 1);
      }
    });
  }, [subscribe]);

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  async function handleSelect(selection) {
    await setLocation(selection);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">
        Loading Update Me…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted/60">
      <header className="sticky top-0 z-40 border-b border-surface-border bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <BrandLogo
            size="sm"
            className="min-w-0"
            wordmarkClassName="!hidden min-[360px]:!block"
          />
          <div className="flex min-w-0 items-center gap-2">
            <LiveStatusIndicator className="hidden min-[400px]:inline-flex" />
            <Link
              href="/notifications"
              className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-brand-50 hover:text-brand-700"
              aria-label={
                unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'
              }
            >
              <NavIcon name="notifications" />
              {unreadCount > 0 ? (
                <span className="absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold leading-4 text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </Link>
            <AreaChip area={user?.currentArea} onClick={() => setSelectorOpen(true)} />
          </div>
        </div>
        <div className="border-t border-surface-border px-4 py-2">
          <GlobalSearch
            compact
            locationId={user?.currentArea?.locationId || undefined}
            placeholder="Search Update Me…"
          />
        </div>
      </header>

      <div className="mx-auto flex min-h-screen max-w-6xl gap-0 md:gap-6 md:px-4 md:py-6 lg:px-6">
        <aside className="hidden w-64 shrink-0 flex-col rounded-card border border-surface-border bg-white p-4 shadow-card md:flex">
          <BrandLogo
            className="mb-4"
            showTagline
            tagline="Useful local updates"
          />

          <div className="mb-4">
            <AreaChip area={user?.currentArea} onClick={() => setSelectorOpen(true)} />
            {user?.currentArea ? (
              <p className="mt-2 truncate text-xs text-ink-muted">
                {user.currentArea.lga}, {user.currentArea.state}
              </p>
            ) : null}
            <LiveStatusIndicator className="mt-2" />
            <GlobalSearch
              className="mt-3"
              compact
              locationId={user?.currentArea?.locationId || undefined}
              placeholder="Search…"
            />
          </div>

          <nav className="flex flex-1 flex-col gap-1" aria-label="App">
            {navItems.map((item) => {
              const active =
                item.href === '/explore'
                  ? pathname.startsWith('/explore')
                  : item.href === '/traffic'
                    ? pathname.startsWith('/traffic')
                    : item.href === '/fuel'
                      ? pathname.startsWith('/fuel')
                      : item.href === '/transport'
                        ? pathname.startsWith('/transport')
                        : item.href === '/prices'
                          ? pathname.startsWith('/prices')
                          : item.href === '/alerts'
                            ? pathname.startsWith('/alerts')
                            : item.href === '/directions'
                              ? pathname.startsWith('/directions')
                              : item.href === '/community'
                                ? pathname.startsWith('/community')
                                : item.href === '/notifications'
                                  ? pathname.startsWith('/notifications')
                                  : item.href === '/profile'
                                    ? pathname.startsWith('/profile')
                          : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'inline-flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                    item.prominent
                      ? 'bg-brand-600 text-white hover:bg-brand-700'
                      : active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                  )}
                >
                  <NavIcon name={item.icon} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.href === '/notifications' && unreadCount > 0 ? (
                    <span className="rounded-full bg-brand-100 px-1.5 text-[10px] font-bold text-brand-800">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  ) : null}
                  {item.soon ? (
                    <span className="ml-auto text-[10px] uppercase tracking-wide opacity-70">Soon</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 border-t border-surface-border pt-4">
            <p className="truncate text-sm font-semibold text-ink">{user?.displayName}</p>
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onLogout}>
              Log out
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 md:rounded-card md:border md:border-surface-border md:bg-white md:p-6 md:pb-6 md:shadow-card">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Mobile"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-2 py-2">
          {mobileNavItems.map((item) => {
            const active =
              item.href === '/explore'
                ? pathname.startsWith('/explore')
                : item.href === '/notifications'
                  ? pathname.startsWith('/notifications')
                  : item.href === '/profile'
                    ? pathname.startsWith('/profile')
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-control px-1 text-[10px] font-semibold',
                    item.prominent || active ? 'text-brand-700' : 'text-ink-muted'
                  )}
                >
                  <span
                    className={cn(
                      'relative inline-flex h-8 w-8 items-center justify-center rounded-full',
                      item.prominent ? 'bg-brand-600 text-white' : 'bg-transparent'
                    )}
                  >
                    <NavIcon name={item.icon} />
                    {item.href === '/notifications' && unreadCount > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-3.5 items-center justify-center rounded-full bg-brand-600 px-0.5 text-[8px] font-bold leading-3.5 text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    ) : null}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={handleSelect}
      />
    </div>
  );
}
