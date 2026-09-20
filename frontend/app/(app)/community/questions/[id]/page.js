'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AnswerCard, AnswerComposer } from '@/components/community/AnswerCard';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, communityApi } from '@/lib/api';
import { formatRelativeTime } from '@/lib/reports';
import { COMMUNITY_FLAG_REASONS, communityCategoryLabel } from '@/lib/community';
import { cn } from '@/lib/cn';

export default function CommunityQuestionDetailPage() {
  const params = useParams();
  const id = params?.id;
  const { user } = useAuth();
  const [question, setQuestion] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('misleading');
  const [flagDetails, setFlagDetails] = useState('');
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagNote, setFlagNote] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await communityApi.getQuestion(id);
      setQuestion(data.question);
      setAnswers(data.answers || []);
    } catch (err) {
      setQuestion(null);
      setAnswers([]);
      setError(err instanceof ApiError ? err.message : 'Unable to load question.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitFlag(e) {
    e.preventDefault();
    if (!user) {
      setFlagNote('Sign in to flag a question.');
      return;
    }
    setFlagBusy(true);
    setFlagNote('');
    try {
      await communityApi.flagQuestion(id, {
        reason: flagReason,
        details: flagDetails.trim() || undefined,
      });
      setFlagNote('Thanks — this was queued for moderation review.');
      setFlagOpen(false);
      load();
    } catch (err) {
      setFlagNote(err instanceof ApiError ? err.message : 'Could not flag question.');
    } finally {
      setFlagBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading question…</p>;
  if (error || !question) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-status-urgent">{error || 'Not found.'}</p>
        <Button as={Link} href="/community" variant="secondary">
          Back to Community
        </Button>
      </div>
    );
  }

  const locationLabel =
    question.location?.name ||
    [question.location?.area?.name, question.location?.lga?.name, question.location?.state?.name]
      .filter(Boolean)
      .join(', ');
  const expired = question.expired || question.status === 'expired';
  const underReview =
    question.status === 'flagged' || question.status === 'under_review';

  return (
    <div className="space-y-6">
      <Button as={Link} href="/community" variant="secondary" size="sm">
        ← Community
      </Button>

      <article className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800">
            {question.categoryLabel || communityCategoryLabel(question.category)}
          </span>
          {expired ? (
            <span className="inline-flex items-center rounded-pill border border-surface-border bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-ink-muted">
              Expired
            </span>
          ) : null}
          {underReview ? (
            <span className="inline-flex items-center rounded-pill border border-surface-border bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-ink-muted">
              Under review
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink break-words">
          {question.title}
        </h1>
        {question.description ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-muted break-words whitespace-pre-wrap">
            {question.description}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
          {locationLabel ? <span className="break-words">{locationLabel}</span> : null}
          <span>{formatRelativeTime(question.createdAt)}</span>
          <span>
            {question.usefulResponseCount || 0} useful response
            {(question.usefulResponseCount || 0) === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => setFlagOpen((v) => !v)}>
            {flagOpen ? 'Cancel flag' : 'Flag question'}
          </Button>
        </div>

        {flagOpen ? (
          <form onSubmit={submitFlag} className="mt-4 space-y-3 rounded-control border border-surface-border p-3">
            <p className="text-sm font-medium text-ink">Why are you flagging this?</p>
            <div className="flex flex-wrap gap-2">
              {COMMUNITY_FLAG_REASONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFlagReason(item.value)}
                  className={cn(
                    'min-h-10 rounded-pill px-3 py-1.5 text-xs font-semibold',
                    flagReason === item.value
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface-muted text-ink-muted'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <textarea
              className="min-h-20 w-full rounded-control border border-surface-border px-3 py-2 text-sm"
              placeholder="Optional details"
              value={flagDetails}
              onChange={(e) => setFlagDetails(e.target.value)}
              maxLength={1000}
            />
            <Button type="submit" size="sm" disabled={flagBusy}>
              {flagBusy ? 'Sending…' : 'Submit flag'}
            </Button>
          </form>
        ) : null}
        {flagNote ? <p className="mt-2 text-xs text-ink-soft">{flagNote}</p> : null}
      </article>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Useful responses</h2>
        {answers.length ? (
          answers.map((answer) => (
            <AnswerCard
              key={answer.id}
              answer={answer}
              onUpdated={(updated) => {
                setAnswers((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
              }}
            />
          ))
        ) : (
          <p className="text-sm text-ink-muted">No useful responses yet.</p>
        )}
      </section>

      {expired ? (
        <p className="rounded-control border border-dashed border-surface-border bg-surface-muted/70 px-3 py-2 text-sm text-ink-muted">
          This question has expired and is kept for history. It is no longer accepting answers.
        </p>
      ) : underReview ? (
        <p className="rounded-control border border-dashed border-surface-border bg-surface-muted/70 px-3 py-2 text-sm text-ink-muted">
          This question is under review and is not accepting new answers right now.
        </p>
      ) : (
        <AnswerComposer questionId={question.id} onSubmitted={() => load()} />
      )}
    </div>
  );
}
