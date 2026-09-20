import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  exploreTaxonomy,
  getExplore,
  searchExplore,
} from '../controllers/exploreController.js';

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many explore searches. Please wait a moment.',
  },
});

const router = Router();

router.get('/taxonomy', exploreTaxonomy);
router.get('/search', searchLimiter, searchExplore);
router.get('/', getExplore);

export default router;
