'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Copy link + native Web Share for public detail pages.
 */
export function ShareControls({
  title,
  text,
  url,
  className,
  label = 'Share',
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const resolveUrl = useCallback(() => {
    if (url) return url;
    if (typeof window !== 'undefined') return window.location.href;
    return '';
  }, [url]);

  const copyLink = useCallback(async () => {
    setError('');
    const target = resolveUrl();
    if (!target) {
      setError('Link unavailable');
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(target);
      } else {
        const input = document.createElement('input');
        input.value = target;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy link');
    }
  }, [resolveUrl]);

  const nativeShare = useCallback(async () => {
    setError('');
    const target = resolveUrl();
    if (!target) {
      setError('Link unavailable');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: title || 'Update Me',
        text: text || undefined,
        url: target,
      });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      await copyLink();
    }
  }, [copyLink, resolveUrl, text, title]);

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {canNativeShare ? (
        <button
          type="button"
          onClick={nativeShare}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted"
        >
          <ShareIcon />
          {label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted"
      >
        <LinkIcon />
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {error ? <span className="text-xs text-status-urgent">{error}</span> : null}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" />
      <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.07" />
    </svg>
  );
}
