import {
  answerIdParamSchema,
  answerInaccurateSchema,
  answerUsefulSchema,
  createAnswerSchema,
  createQuestionSchema,
  listQuestionsQuerySchema,
  questionFlagSchema,
  questionIdParamSchema,
  updateAnswerSchema,
} from '../validators/community.js';
import { communityService } from '../services/communityService.js';

export async function getCommunityTaxonomy(_req, res, next) {
  try {
    return res.json({ success: true, ...communityService.taxonomy() });
  } catch (error) {
    return next(error);
  }
}

export async function listQuestions(req, res, next) {
  try {
    const query = listQuestionsQuerySchema.parse(req.query);
    const result = await communityService.listQuestions(query);
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function getQuestion(req, res, next) {
  try {
    const { id } = questionIdParamSchema.parse(req.params);
    const result = await communityService.getQuestion(id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function createQuestion(req, res, next) {
  try {
    const body = createQuestionSchema.parse(req.body);
    const question = await communityService.createQuestion(req.auth.userId, body);
    return res.status(201).json({ success: true, question });
  } catch (error) {
    return next(error);
  }
}

export async function createAnswer(req, res, next) {
  try {
    const { id } = questionIdParamSchema.parse(req.params);
    const body = createAnswerSchema.parse(req.body);
    const answer = await communityService.createAnswer(req.auth.userId, id, body);
    return res.status(201).json({ success: true, answer });
  } catch (error) {
    return next(error);
  }
}

export async function updateAnswer(req, res, next) {
  try {
    const { id } = answerIdParamSchema.parse(req.params);
    const body = updateAnswerSchema.parse(req.body);
    const answer = await communityService.updateAnswer(req.auth.userId, id, body);
    return res.json({ success: true, answer });
  } catch (error) {
    return next(error);
  }
}

export async function markAnswerUseful(req, res, next) {
  try {
    const { id } = answerIdParamSchema.parse(req.params);
    const body = answerUsefulSchema.parse(req.body || {});
    const answer = await communityService.markUseful(req.auth.userId, id, body);
    return res.json({ success: true, answer });
  } catch (error) {
    return next(error);
  }
}

export async function markAnswerInaccurate(req, res, next) {
  try {
    const { id } = answerIdParamSchema.parse(req.params);
    const body = answerInaccurateSchema.parse(req.body || {});
    const answer = await communityService.markInaccurate(req.auth.userId, id, body);
    return res.json({ success: true, answer });
  } catch (error) {
    return next(error);
  }
}

export async function flagQuestion(req, res, next) {
  try {
    const { id } = questionIdParamSchema.parse(req.params);
    const body = questionFlagSchema.parse(req.body);
    const result = await communityService.flagQuestion(req.auth.userId, id, body);
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}
