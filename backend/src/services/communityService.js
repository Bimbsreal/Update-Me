import { AppError } from '../middleware/errorHandler.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { communityRepository } from '../repositories/communityRepository.js';
import {
  COMMUNITY_QUESTION_CATEGORIES,
  COMMUNITY_FLAG_REASONS,
  communityCategoryTtlHours,
} from '../config/community.js';

function snapshotQuestion(raw) {
  if (!raw) return null;
  return {
    title: raw.title,
    description: raw.description,
    status: raw.status,
    moderationState: raw.moderation_state,
    expiresAt: raw.expires_at,
  };
}

export const communityService = {
  taxonomy() {
    return {
      categories: COMMUNITY_QUESTION_CATEGORIES,
      flagReasons: COMMUNITY_FLAG_REASONS,
      terms: {
        question: 'Question',
        answer: 'Answer',
        usefulResponse: 'Useful response',
      },
    };
  },

  async createQuestion(userId, input) {
    if (!userId) {
      throw new AppError('Authentication required to ask a question.', 401, 'UNAUTHORIZED');
    }

    const location = await locationRepository.findById(input.locationId);
    if (!location) {
      throw new AppError('Selected location was not found.', 404, 'LOCATION_NOT_FOUND');
    }

    const duplicate = await communityRepository.findRecentDuplicate({
      userId,
      locationId: input.locationId,
      title: input.title,
    });
    if (duplicate) {
      throw new AppError(
        'You already asked a similar question for this location recently.',
        409,
        'DUPLICATE_QUESTION'
      );
    }

    let expiresAt = null;
    if (input.expiresAt) {
      expiresAt = new Date(input.expiresAt);
    } else if (input.relevanceHours) {
      expiresAt = new Date(Date.now() + input.relevanceHours * 60 * 60 * 1000);
    } else {
      const hours = communityCategoryTtlHours(input.category);
      expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    const raw = await communityRepository.createQuestion({
      userId,
      locationId: input.locationId,
      category: input.category,
      title: input.title,
      description: input.description || null,
      expiresAt,
    });

    // Prepare related-group link for future duplicate recognition (never auto-delete)
    const groupId = await communityRepository.ensureRelatedGroup({
      category: input.category,
      locationId: input.locationId,
      title: input.title,
    });
    await communityRepository.updateQuestion(raw.id, { relatedGroupId: groupId });
    await communityRepository.linkRelatedQuestions(groupId, input.locationId, input.category);

    await communityRepository.addHistory({
      questionId: raw.id,
      actorUserId: userId,
      eventType: 'created',
      previousState: null,
      newState: snapshotQuestion(raw),
      reason: 'Community question submitted',
    });

    return communityRepository.findQuestionById(raw.id);
  },

  async listQuestions(query) {
    await communityRepository.applyExpiryTransitions();
    return communityRepository.listQuestions(query);
  },

  async getQuestion(id, { includeAnswers = true } = {}) {
    await communityRepository.applyExpiryTransitions();
    const question = await communityRepository.findQuestionById(id);
    if (!question) {
      throw new AppError('Question not found.', 404, 'QUESTION_NOT_FOUND');
    }
    if (question.status === 'removed') {
      throw new AppError('Question not found.', 404, 'QUESTION_NOT_FOUND');
    }

    const payload = { question };
    if (includeAnswers) {
      payload.answers = await communityRepository.listAnswersForQuestion(id);
    }
    return payload;
  },

  async createAnswer(userId, questionId, input) {
    if (!userId) {
      throw new AppError('Authentication required to answer.', 401, 'UNAUTHORIZED');
    }

    await communityRepository.applyExpiryTransitions();
    const raw = await communityRepository.findQuestionRawById(questionId);
    if (!raw || raw.status === 'removed') {
      throw new AppError('Question not found.', 404, 'QUESTION_NOT_FOUND');
    }
    if (raw.status === 'expired') {
      throw new AppError(
        'This question has expired and is no longer accepting answers.',
        400,
        'QUESTION_EXPIRED'
      );
    }
    if (raw.status === 'flagged' || raw.status === 'under_review') {
      throw new AppError(
        'This question is under review and cannot accept new answers right now.',
        400,
        'QUESTION_UNDER_REVIEW'
      );
    }

    if (input.locationId) {
      const location = await locationRepository.findById(input.locationId);
      if (!location) {
        throw new AppError('Selected location was not found.', 404, 'LOCATION_NOT_FOUND');
      }
    }

    const answer = await communityRepository.createAnswer({
      questionId,
      userId,
      content: input.content,
      locationId: input.locationId || null,
    });

    await communityRepository.addHistory({
      questionId,
      answerId: answer.id,
      actorUserId: userId,
      eventType: 'answered',
      newState: { answerId: answer.id },
      reason: 'Useful response submitted',
    });

    return answer;
  },

  async updateAnswer(userId, answerId, input) {
    const raw = await communityRepository.findAnswerRawById(answerId);
    if (!raw || raw.status === 'removed') {
      throw new AppError('Answer not found.', 404, 'ANSWER_NOT_FOUND');
    }
    if (raw.user_id !== userId) {
      throw new AppError('You can only edit your own answers.', 403, 'FORBIDDEN');
    }
    if (raw.status !== 'active') {
      throw new AppError('This answer can no longer be edited.', 400, 'NOT_EDITABLE');
    }

    const previous = { content: raw.content };
    const updated = await communityRepository.updateAnswer(answerId, {
      content: input.content,
    });

    await communityRepository.addHistory({
      questionId: raw.question_id,
      answerId,
      actorUserId: userId,
      eventType: 'updated',
      previousState: previous,
      newState: { content: input.content },
      reason: 'Owner updated answer',
    });

    return updated;
  },

  async markUseful(userId, answerId, { note } = {}) {
    return this._submitFeedback(userId, answerId, 'useful', note);
  },

  async markInaccurate(userId, answerId, { type = 'no_longer_accurate', note } = {}) {
    const feedbackType =
      type === 'needs_correction' ? 'needs_correction' : 'no_longer_accurate';
    return this._submitFeedback(userId, answerId, feedbackType, note);
  },

  async _submitFeedback(userId, answerId, feedbackType, note) {
    if (!userId) {
      throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
    }

    const raw = await communityRepository.findAnswerRawById(answerId);
    if (!raw || raw.status === 'removed') {
      throw new AppError('Answer not found.', 404, 'ANSWER_NOT_FOUND');
    }
    if (raw.user_id === userId) {
      throw new AppError('You cannot mark your own answer.', 400, 'OWN_ANSWER');
    }

    const existing = await communityRepository.findFeedback(answerId, userId);
    if (existing) {
      throw new AppError(
        'You already submitted feedback on this answer.',
        409,
        'DUPLICATE_FEEDBACK'
      );
    }

    await communityRepository.createFeedback({
      answerId,
      userId,
      feedbackType,
      note,
    });

    const counts = await communityRepository.recountAnswerFeedback(answerId);
    await communityRepository.updateAnswer(answerId, {
      usefulCount: counts.useful,
      inaccurateCount: counts.inaccurate,
      needsCorrectionCount: counts.needs_correction,
    });

    const usefulResponses = await communityRepository.recountUsefulResponses(raw.question_id);
    await communityRepository.updateQuestion(raw.question_id, {
      usefulResponseCount: usefulResponses,
    });

    await communityRepository.addHistory({
      questionId: raw.question_id,
      answerId,
      actorUserId: userId,
      eventType: 'feedback',
      reason: `Feedback: ${feedbackType}`,
    });

    return communityRepository.findAnswerById(answerId);
  },

  async flagQuestion(userId, questionId, { reason, details }) {
    if (!userId) {
      throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
    }

    const raw = await communityRepository.findQuestionRawById(questionId);
    if (!raw || raw.status === 'removed') {
      throw new AppError('Question not found.', 404, 'QUESTION_NOT_FOUND');
    }

    const existing = await communityRepository.findFlag(questionId, userId);
    if (existing) {
      throw new AppError('You already flagged this question.', 409, 'DUPLICATE_FLAG');
    }

    await communityRepository.createFlag({ questionId, userId, reason, details });

    const fields = {
      flagCount: Number(raw.flag_count || 0) + 1,
      moderationState: 'flagged',
    };
    // One flag queues for review — does not auto-delete
    if (['open', 'answered'].includes(raw.status)) {
      fields.status = 'flagged';
    }

    const question = await communityRepository.updateQuestion(questionId, fields);

    await communityRepository.addHistory({
      questionId,
      actorUserId: userId,
      eventType: 'flagged',
      previousState: snapshotQuestion(raw),
      newState: { status: fields.status || raw.status, moderationState: 'flagged' },
      reason: `Flagged: ${reason}`,
    });

    return {
      question,
      moderationHook: {
        type: 'community_question_flagged',
        questionId,
        reason,
        queued: true,
      },
    };
  },
};
