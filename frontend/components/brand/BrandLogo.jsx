'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Reusable Update Me brand mark.
 * Always navigates to the public landing page (`/`).
 */
export function BrandLogo({
  href = '/',
  size = 'md',
  showWordmark = true,
  showTagline = false,
  tagline = 'Useful local updates',
  className,
  wordmarkClassName,
  priority = false,
}) {
  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-10 w-10',
  };

  return (
    <Link
      href={href}
      aria-label="Update Me — Home"
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt=""
        width={size === 'lg' ? 40 : size === 'sm' ? 32 : 36}
        height={size === 'lg' ? 40 : size === 'sm' ? 32 : 36}
        className={cn('shrink-0', sizes[size] || sizes.md)}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
      />
      {showWordmark ? (
        <span className="min-w-0">
          <span
            className={cn(
              'block truncate font-bold text-brand-700',
              size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-base' : 'text-base md:text-lg',
              wordmarkClassName
            )}
          >
            Update Me
          </span>
          {showTagline ? (
            <span className="hidden truncate text-[10px] font-medium text-ink-muted sm:block">
              {tagline}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="sr-only">Update Me</span>
      )}
    </Link>
  );
}
