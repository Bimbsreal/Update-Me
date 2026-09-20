'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LocationSelector } from '@/components/location/LocationSelector';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, communityApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_RELEVANCE_OPTIONS,
} from '@/lib/community';

export function QuestionComposer({ onSubmitted, compactHeader = false }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [relevanceHours, setRelevanceHours] = useState('');
  const [locationId, setLocationId] = useState(user?.currentArea?.locationId || '');
  const [locationLabel, setLocationLabel] = useState(
    user?.currentArea
      ? `${user.currentArea.name}${user.currentArea.lga ? `, ${user.currentArea.lga}` : ''}`
      : ''
  );
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!user) {
      setError('Sign in to ask the community.');
      return;
    }
    if (!locationId) {
      setError('Choose a location for this question.');
      return;
    }
    if (!category) {
      setError('Choose a category.');
      return;
    }
    setBusy(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        locationId,
      };
      if (relevanceHours) body.relevanceHours = Number(relevanceHours);
      const data = await communityApi.createQuestion(body);
      setDone(data.question);
      onSubmitted?.(data.question);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit question.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-card border border-brand-100 bg-brand-50/50 p-5">
        <p className="text-sm font-semibold text-brand-800">Question posted</p>
        <p className="mt-2 text-sm text-ink-muted break-words">{done.title}</p>
        <Button as={Link} href={`/community/questions/${done.id}`} className="mt-4" size="sm">
          View question
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5"
    >
      {!compactHeader ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Ask the Community
          </p>
          <h2 className="mt-1 text-lg font-bold text-ink">Share a practical local question</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Keep it useful — traffic, fuel, transport, prices, directions, and local services.
          </p>
        </div>
      ) : null}

      {!user ? (
        <p className="text-sm text-ink-muted">
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>{' '}
          to ask a question.
        </p>
      ) : null}

      <Input
        id="community-title"
        label="Question"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Is there fuel around Lekki Phase 1 this morning?"
        required
        minLength={5}
        maxLength={160}
      />

      <div>
        <label htmlFor="community-details" className="text-sm font-medium text-ink">
          Details <span className="font-normal text-ink-soft">(optional)</span>
        </label>
        <textarea
          id="community-details"
          className="mt-1.5 min-h-24 w-full rounded-control border border-surface-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          placeholder="Add context that helps people give a useful response."
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Category</p>
        <div className="flex flex-wrap gap-2">
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
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Location</p>
        <button
          type="button"
          onClick={() => setSelectorOpen(true)}
          className="flex min-h-11 w-full items-center justify-between rounded-control border border-surface-border bg-white px-3.5 text-left text-sm"
        >
          <span className={locationLabel ? 'text-ink break-words' : 'text-ink-soft'}>
            {locationLabel || 'Choose location…'}
          </span>
          <span className="shrink-0 text-xs font-bold uppercase text-brand-700">Change</span>
        </button>
      </div>

      <div>
        <label htmlFor="community-relevance" className="text-sm font-medium text-ink">
          Relevance period <span className="font-normal text-ink-soft">(optional)</span>
        </label>
        <select
          id="community-relevance"
          className="mt-1.5 min-h-11 w-full rounded-control border border-surface-border bg-white px-3.5 text-sm"
          value={relevanceHours}
          onChange={(e) => setRelevanceHours(e.target.value)}
        >
          {COMMUNITY_RELEVANCE_OPTIONS.map((item) => (
            <option key={item.value || 'default'} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <FormError message={error} />

      <Button type="submit" disabled={busy || !user} className="w-full sm:w-auto">
        {busy ? 'Posting…' : 'Ask the Community'}
      </Button>

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={(area) => {
          setLocationId(area.locationId || area.id);
          setLocationLabel(
            area.label ||
              `${area.name || 'Selected location'}${
                area.lga ? `, ${area.lga}` : area.lgaName ? `, ${area.lgaName}` : ''
              }`
          );
          setSelectorOpen(false);
        }}
      />
    </form>
  );
}
