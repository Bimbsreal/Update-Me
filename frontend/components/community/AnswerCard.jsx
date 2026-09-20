'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, communityApi } from '@/lib/api';
import { formatRelativeTime } from '@/lib/reports';
import { cn } from '@/lib/cn';

export function AnswerCard({ answer, onUpdated }) {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function act(action) {
    if (!user) {
      setError('Sign in to mark this response.');
      return;
    }
    setBusy(action);
    setError('');
    try {
      let data;
      if (action === 'useful') {
        data = await communityApi.markUseful(answer.id);
      } else if (action === 'inaccurate') {
        data = await communityApi.markInaccurate(answer.id, {
          type: 'no_longer_accurate',
          note: 'Marked as no longer accurate by a community member.',
        });
      } else {
        data = await communityApi.markInaccurate(answer.id, {
          type: 'needs_correction',
          note: 'Marked as needing correction by a community member.',
        });
      }
      onUpdated?.(data.answer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update response.');
    } finally {
      setBusy('');
    }
  }

  return (
    <article className="rounded-card border border-surface-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap gap-2">
        {(answer.trustLabels || []).map((label) => (
          <span
            key={label}
            className={cn(
              'inline-flex items-center rounded-pill border px-2.5 py-1 text-[11px] font-bold',
              label === 'Community Confirmed'
                ? 'border-brand-100 bg-brand-50 text-brand-800'
                : 'border-surface-border bg-surface-muted text-ink-muted'
            )}
          >
            {label}
          </span>
        ))}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink break-words whitespace-pre-wrap">
        {answer.content}
      </p>

      <p className="mt-3 text-xs text-ink-soft">{formatRelativeTime(answer.createdAt)}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={() => act('useful')}
        >
          {busy === 'useful' ? '…' : 'Useful'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => act('inaccurate')}
        >
          {busy === 'inaccurate' ? '…' : 'No longer accurate'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => act('correction')}
        >
          {busy === 'correction' ? '…' : 'Needs correction'}
        </Button>
      </div>
      <FormError message={error} />
    </article>
  );
}

export function AnswerComposer({ questionId, onSubmitted, disabled }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!user) {
      setError('Sign in to share useful information.');
      return;
    }
    setBusy(true);
    try {
      const data = await communityApi.createAnswer(questionId, {
        content: content.trim(),
      });
      setContent('');
      onSubmitted?.(data.answer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit answer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Share useful information
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Answer with practical local detail — not opinions or social chat.
        </p>
      </div>
      <textarea
        className="min-h-28 w-full rounded-control border border-surface-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What do you know that would help?"
        minLength={3}
        maxLength={4000}
        required
        disabled={disabled}
      />
      <FormError message={error} />
      <Button type="submit" disabled={busy || disabled || !user}>
        {busy ? 'Submitting…' : 'Submit answer'}
      </Button>
    </form>
  );
}
