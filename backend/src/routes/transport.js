import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, verifyToken } from '../middleware/auth.js';
import {
  confirmTransportFare,
  correctTransportFare,
  createTransportFare,
  createTransportRoute,
  getTransportFare,
  getTransportRoute,
  getTransportTaxonomy,
  listTransportFares,
  listTransportRoutes,
  searchTransport,
  transportFareHistory,
  transportSummary,
} from '../controllers/transportController.js';

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many transport reports. Please wait and try again.',
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

router.get('/taxonomy', getTransportTaxonomy);
router.get('/summary', transportSummary);
router.get('/search', searchTransport);
router.get('/routes', listTransportRoutes);
router.post('/routes', requireAuth, createLimiter, createTransportRoute);
router.get('/routes/:id', getTransportRoute);
router.get('/fares', listTransportFares);
router.post('/fares', requireAuth, createLimiter, createTransportFare);
router.get('/fares/:id', softAuth, getTransportFare);
router.post('/fares/:id/confirm', requireAuth, interactLimiter, confirmTransportFare);
router.post('/fares/:id/correct', requireAuth, interactLimiter, correctTransportFare);
router.get('/fares/:id/history', softAuth, transportFareHistory);

export default router;
