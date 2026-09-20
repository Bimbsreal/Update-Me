import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import {
  confirmLocalKnowledge,
  correctLocalKnowledge,
  createLocalKnowledge,
  getDirectionsDetail,
  getDirectionsTaxonomy,
  listLocalKnowledge,
  searchDirections,
} from '../controllers/directionsController.js';

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many local-knowledge submissions. Please wait and try again.',
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

router.get('/taxonomy', getDirectionsTaxonomy);
router.get('/local-knowledge', listLocalKnowledge);
router.post('/local-knowledge', requireAuth, createLimiter, createLocalKnowledge);
router.post('/local-knowledge/:id/confirm', requireAuth, interactLimiter, confirmLocalKnowledge);
router.post('/local-knowledge/:id/correct', requireAuth, interactLimiter, correctLocalKnowledge);
router.get('/', searchDirections);
router.get('/:id', getDirectionsDetail);

export default router;
