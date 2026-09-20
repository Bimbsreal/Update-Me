'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { cn } from '@/lib/cn';

const navLinks = [
  { href: '/', label: 'Home', match: 'home' },
  { href: '/#how-it-works', label: 'How It Works', match: 'anchor' },
  { href: '/#features', label: 'Features', match: 'anchor' },
  { href: '/explore', label: 'Explore', match: 'explore' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-surface-border/80 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-3 md:h-[4.5rem]">
        <BrandLogo
          priority
          showTagline
          tagline="Real people. Real updates. A better Nigeria."
        />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {navLinks.map((link) => {
            const isHome = link.match === 'home' && pathname === '/';
            const isExplore = link.match === 'explore' && pathname.startsWith('/explore');
            const active = isHome || isExplore;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-control px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                  active
                    ? 'text-brand-700 underline decoration-2 underline-offset-8'
                    : 'text-ink-muted hover:text-brand-700'
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            as={Link}
            href="/login"
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
          >
            Sign In
          </Button>
          <Button as={Link} href="/register" size="sm" className="hidden min-[380px]:inline-flex">
            Get Started
          </Button>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-surface-border text-ink transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 lg:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              {open ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </Container>

      <div
        id={menuId}
        className={cn('border-t border-surface-border bg-white lg:hidden', open ? 'block' : 'hidden')}
      >
        <Container className="flex flex-col gap-1 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-control px-3 py-3 text-base font-medium text-ink hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button as={Link} href="/login" variant="outline" onClick={() => setOpen(false)}>
              Sign In
            </Button>
            <Button as={Link} href="/register" onClick={() => setOpen(false)}>
              Get Started
            </Button>
          </div>
        </Container>
      </div>
    </header>
  );
}
