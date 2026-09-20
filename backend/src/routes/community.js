import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import {
  createAnswer,
  createQuestion,
  flagQuestion,
  getCommunityTaxonomy,
  getQuestion,
  listQuestions,
  markAnswerInaccurate,
  markAnswerUseful,
  updateAnswer,
} from '../controllers/communityController.js';

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many community posts. Please wait and try again.',
  },
});

const interactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many interactions. Please wait and try again.',
  },
});

const router = Router();

router.get('/taxonomy', getCommunityTaxonomy);
router.get('/questions', listQuestions);
router.post('/questions', requireAuth, createLimiter, createQuestion);
router.get('/questions/:id', getQuestion);
router.post('/questions/:id/answers', requireAuth, createLimiter, createAnswer);
router.post('/questions/:id/flag', requireAuth, interactLimiter, flagQuestion);

router.patch('/answers/:id', requireAuth, interactLimiter, updateAnswer);
router.post('/answers/:id/useful', requireAuth, interactLimiter, markAnswerUseful);
router.post('/answers/:id/inaccurate', requireAuth, interactLimiter, markAnswerInaccurate);

export default router;
