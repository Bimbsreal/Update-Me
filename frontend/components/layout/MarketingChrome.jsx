'use client';

import { usePathname } from 'next/navigation';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

const BARE_PREFIXES = [
  '/login',
  '/register',
  '/onboarding',
  '/home',
  '/app',
  '/explore',
  '/traffic',
  '/fuel',
  '/transport',
  '/prices',
  '/alerts',
  '/directions',
  '/community',
  '/notifications',
  '/profile',
  '/forgot-password',
  '/admin',
  '/official-updates',
  '/offline',
];

export function MarketingChrome({ children }) {
  const pathname = usePathname();
  const bare = BARE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (bare) {
    return <main>{children}</main>;
  }

  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
