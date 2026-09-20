import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, verifyToken } from '../middleware/auth.js';
import {
  confirmReport,
  correctReport,
  createReport,
  flagReport,
  getReport,
  listCategories,
  listReports,
  nearbyReports,
  reportHistory,
  updateReport,
} from '../controllers/reportController.js';

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many reports submitted. Please wait and try again.',
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

function softAuth(req, _res, next) {
  try {
    const token = req.cookies?.um_session;
    if (token) {
      const decoded = verifyToken(token);
      req.auth = { userId: decoded.sub };
    }
  } catch {
    // public access continues without auth
  }
  next();
}

const router = Router();

router.get('/categories', listCategories);
router.get('/nearby', nearbyReports);
router.get('/', listReports);
router.post('/', requireAuth, createLimiter, createReport);
router.get('/:id', softAuth, getReport);
router.patch('/:id', requireAuth, updateReport);
router.post('/:id/confirm', requireAuth, interactLimiter, confirmReport);
router.post('/:id/correct', requireAuth, interactLimiter, correctReport);
router.post('/:id/flag', requireAuth, interactLimiter, flagReport);
router.get('/:id/history', softAuth, reportHistory);

export default router;
