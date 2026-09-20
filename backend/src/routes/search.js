import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { COOKIE_NAME, requireAuth, verifyToken } from '../middleware/auth.js';
import {
  clearRecentSearches,
  globalSearch,
  listRecentSearches,
  suggestSearch,
} from '../controllers/searchController.js';

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many searches. Please wait a moment.',
  },
});

/** Attach session when present; public search still works anonymously. */
function softAuth(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      const decoded = verifyToken(token);
      req.auth = { userId: decoded.sub };
    }
  } catch {
    // continue unauthenticated
  }
  next();
}

const router = Router();

router.get('/', searchLimiter, softAuth, globalSearch);
router.get('/suggest', searchLimiter, softAuth, suggestSearch);
router.get('/recent', requireAuth, listRecentSearches);
router.delete('/recent', requireAuth, clearRecentSearches);

export default router;
