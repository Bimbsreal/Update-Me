/**
 * Community Questions & Answers tests.
 * Run: node --test tests/community.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { communityService } from '../src/services/communityService.js';
import { communityRepository } from '../src/repositories/communityRepository.js';
import {
  createQuestionSchema,
  createAnswerSchema,
  questionFlagSchema,
} from '../src/validators/community.js';
import { AppError } from '../src/middleware/errorHandler.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Community Tester', email, 'test-hash-not-for-login']
  );
  return created.rows[0].id;
}

async function sampleLocationId() {
  const result = await getPool().query(
    `SELECT id FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL
     ORDER BY name LIMIT 1`
  );
  assert.ok(result.rows[0], 'Need seeded area location');
  return result.rows[0].id;
}

test('taxonomy is utility-focused with no social/news categories', () => {
  const tax = communityService.taxonomy();
  assert.ok(tax.categories.some((c) => c.code === 'fuel'));
  assert.ok(tax.categories.some((c) => c.code === 'directions'));
  assert.ok(tax.categories.some((c) => c.code === 'local_services'));
  assert.ok(
    !tax.categories.some((c) =>
      ['sports', 'politics', 'entertainment', 'religion', 'general_news', 'gossip'].includes(
        c.code
      )
    )
  );
  assert.equal(tax.terms.question, 'Question');
  assert.equal(tax.terms.usefulResponse, 'Useful response');
});

test('question validation rejects invalid category and short title', () => {
  assert.throws(() =>
    createQuestionSchema.parse({
      title: 'Hi',
      category: 'fuel',
      locationId: '00000000-0000-4000-8000-000000000001',
    })
  );
  assert.throws(() =>
    createQuestionSchema.parse({
      title: 'Is there fuel nearby this morning?',
      category: 'sports',
      locationId: '00000000-0000-4000-8000-000000000001',
    })
  );
  assert.throws(() =>
    createAnswerSchema.parse({ content: 'no' })
  );
  assert.throws(() =>
    questionFlagSchema.parse({ reason: 'trolling' })
  );
});

test('create question requires auth context and location association', async () => {
  const locationId = await sampleLocationId();
  await assert.rejects(
    () =>
      communityService.createQuestion(null, {
        title: 'Is there fuel around Lekki Phase 1 this morning?',
        category: 'fuel',
        locationId,
      }),
    (err) => err instanceof AppError && err.code === 'UNAUTHORIZED'
  );

  const authorId = await ensureUser('community.author@example.com');
  const uniqueTitle = `Is there fuel around this area this morning? ${Date.now()}`;
  const question = await communityService.createQuestion(authorId, {
    title: uniqueTitle,
    description: 'Looking for PMS availability near the main road.',
    category: 'fuel',
    locationId,
    relevanceHours: 12,
  });

  assert.ok(question.id);
  assert.equal(question.category, 'fuel');
  assert.equal(question.location.id, locationId);
  assert.equal(question.status, 'open');
  assert.ok(question.expiresAt);
  assert.equal(question.author?.displayName, undefined);
  assert.ok(question.relatedGroupId);
});

test('answer flow, permissions, usefulness, inaccurate, expiry, flag, duplicate', async () => {
  const authorId = await ensureUser('community.author2@example.com');
  const otherId = await ensureUser('community.other@example.com');
  const thirdId = await ensureUser('community.third@example.com');
  const locationId = await sampleLocationId();

  const stamp = Date.now();
  const question = await communityService.createQuestion(authorId, {
    title: `What is the current bus fare from Lekki to VI? ${stamp}`,
    category: 'transport',
    locationId,
    relevanceHours: 48,
  });

  // Duplicate protection for same user/title/location within 24h
  await assert.rejects(
    () =>
      communityService.createQuestion(authorId, {
        title: `What is the current bus fare from Lekki to VI? ${stamp}`,
        category: 'transport',
        locationId,
      }),
    (err) => err instanceof AppError && err.code === 'DUPLICATE_QUESTION'
  );

  const answer = await communityService.createAnswer(otherId, question.id, {
    content: 'Bus fare is typically ₦800–₦1,000 depending on the time of day.',
  });
  assert.ok(answer.id);
  assert.ok(answer.trustLabels.includes('Useful response'));
  assert.ok(!answer.trustLabels.includes('Community Confirmed'));

  const detail = await communityService.getQuestion(question.id);
  assert.equal(detail.question.status, 'answered');
  assert.equal(detail.answers.length, 1);

  // Owner cannot mark own answer
  await assert.rejects(
    () => communityService.markUseful(otherId, answer.id),
    (err) => err instanceof AppError && err.code === 'OWN_ANSWER'
  );

  // Non-owner cannot edit
  await assert.rejects(
    () =>
      communityService.updateAnswer(authorId, answer.id, {
        content: 'Trying to change someone else answer text here.',
      }),
    (err) => err instanceof AppError && err.code === 'FORBIDDEN'
  );

  // Owner can edit
  const edited = await communityService.updateAnswer(otherId, answer.id, {
    content: 'Recent fare is about ₦800–₦1,000 on this corridor.',
  });
  assert.match(edited.content, /Recent fare/);

  const useful = await communityService.markUseful(authorId, answer.id);
  assert.equal(useful.usefulCount, 1);

  // Second useful → Community Confirmed threshold
  const confirmed = await communityService.markUseful(thirdId, answer.id);
  assert.equal(confirmed.usefulCount, 2);
  assert.ok(confirmed.trustLabels.includes('Community Confirmed'));

  // Duplicate feedback blocked
  await assert.rejects(
    () => communityService.markUseful(authorId, answer.id),
    (err) => err instanceof AppError && err.code === 'DUPLICATE_FEEDBACK'
  );

  // Separate answer for inaccurate flow
  const answer2 = await communityService.createAnswer(thirdId, question.id, {
    content: 'Someone said fares dropped to ₦200 — please verify.',
  });
  const inaccurate = await communityService.markInaccurate(authorId, answer2.id, {
    type: 'needs_correction',
    note: 'That fare sounds outdated for this corridor.',
  });
  assert.equal(inaccurate.needsCorrectionCount, 1);
  assert.ok(inaccurate.trustLabels.includes('Needs review'));

  // Flag — does not delete
  const flagged = await communityService.flagQuestion(otherId, question.id, {
    reason: 'duplicate',
    details: 'Similar question already exists for this corridor.',
  });
  assert.equal(flagged.question.status, 'flagged');
  assert.equal(flagged.question.moderationState, 'flagged');
  assert.ok(flagged.moderationHook.queued);
  assert.ok(await communityRepository.findQuestionById(question.id));

  await assert.rejects(
    () =>
      communityService.flagQuestion(otherId, question.id, {
        reason: 'spam',
      }),
    (err) => err instanceof AppError && err.code === 'DUPLICATE_FLAG'
  );

  // Expiry: force expire and ensure listing excludes from current priority
  const shortQ = await communityService.createQuestion(authorId, {
    title: `Is traffic heavy on Admiralty Way right now? ${stamp}`,
    category: 'traffic',
    locationId,
    relevanceHours: 1,
  });
  await getPool().query(
    `UPDATE questions SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
    [shortQ.id]
  );
  await communityRepository.applyExpiryTransitions();
  const expired = await communityRepository.findQuestionById(shortQ.id);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.freshness, 'expired');

  const listed = await communityService.listQuestions({
    locationId,
    page: 1,
    limit: 50,
    includeExpired: false,
    status: 'any',
    sort: 'recent',
  });
  assert.ok(!listed.items.some((item) => item.id === shortQ.id));

  const listedExpired = await communityService.listQuestions({
    locationId,
    page: 1,
    limit: 50,
    includeExpired: true,
    status: 'expired',
    sort: 'recent',
  });
  assert.ok(listedExpired.items.some((item) => item.id === shortQ.id));

  // Cannot answer expired question
  await assert.rejects(
    () =>
      communityService.createAnswer(otherId, shortQ.id, {
        content: 'Yes, heavy traffic near the roundabout.',
      }),
    (err) => err instanceof AppError && err.code === 'QUESTION_EXPIRED'
  );
});

test('cleanup pool', async () => {
  await closePool();
});
