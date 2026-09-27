import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, verifyToken } from '../middleware/auth.js';
import {
  confirmTraffic,
  correctTraffic,
  createTraffic,
  getTraffic,
  getTrafficEvent,
  listTraffic,
  listTrafficEvents,
  nearbyTraffic,
  trafficHistory,
  trafficSummary,
} from '../controllers/trafficController.js';

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many traffic reports. Please wait and try again.',
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
    // public reads continue without auth
  }
  next();
}

const router = Router();

router.get('/summary', trafficSummary);
router.get('/nearby', nearbyTraffic);
router.get('/events', listTrafficEvents);
router.get('/events/:id', getTrafficEvent);
router.get('/', listTraffic);
router.post('/', requireAuth, createLimiter, createTraffic);
router.get('/:id', softAuth, getTraffic);
router.post('/:id/confirm', requireAuth, interactLimiter, confirmTraffic);
router.post('/:id/correct', requireAuth, interactLimiter, correctTraffic);
router.get('/:id/history', softAuth, trafficHistory);

export default router;
