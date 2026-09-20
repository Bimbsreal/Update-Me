'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { QuestionCard } from '@/components/community/QuestionCard';
import { QuestionComposer } from '@/components/community/QuestionComposer';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, communityApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { COMMUNITY_CATEGORIES } from '@/lib/community';

export default function CommunityPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('recent');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { sort, limit: 30 };
      if (user?.currentArea?.locationId) params.locationId = user.currentArea.locationId;
      if (category) params.category = category;
      const data = await communityApi.listQuestions(params);
      setItems(data.items || []);
    } catch (err) {
      setItems([]);
      setError(err instanceof ApiError ? err.message : 'Unable to load questions.');
    } finally {
      setLoading(false);
    }
  }, [user?.currentArea?.locationId, category, sort]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Community
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Local questions & useful answers
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            People helping people find useful local information — not a social feed.
          </p>
        </div>
        <Button type="button" onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? 'Close' : 'Ask the Community'}
        </Button>
      </div>

      {composerOpen ? (
        <QuestionComposer
          onSubmitted={() => {
            setComposerOpen(false);
            load();
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory('')}
          className={cn(
            'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
            !category ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'
          )}
        >
          All
        </button>
        {COMMUNITY_CATEGORIES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setCategory(item.value)}
            className={cn(
              'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
              category === item.value
                ? 'bg-brand-600 text-white'
                : 'bg-surface-muted text-ink-muted'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { value: 'recent', label: 'Recent' },
          { value: 'unanswered', label: 'Unanswered' },
          { value: 'answered', label: 'Answered' },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setSort(item.value)}
            className={cn(
              'min-h-10 rounded-pill px-3 py-1.5 text-xs font-semibold',
              sort === item.value
                ? 'border border-brand-200 bg-brand-50 text-brand-800'
                : 'border border-transparent text-ink-muted hover:bg-surface-muted'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <FormError message={error} />

      {loading ? (
        <p className="text-sm text-ink-muted">Loading questions…</p>
      ) : items.length ? (
        <div className="grid gap-4">
          {items.map((question) => (
            <QuestionCard key={question.id} question={question} />
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-dashed border-surface-border p-5 text-sm text-ink-muted">
          No community questions for this area yet.
          <div className="mt-3">
            <Button type="button" onClick={() => setComposerOpen(true)}>
              Ask the Community
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-ink-soft">
        Looking for official notices?{' '}
        <Link href="/official-updates" className="font-semibold text-brand-700 hover:underline">
          Official updates
        </Link>
      </p>
    </div>
  );
}
