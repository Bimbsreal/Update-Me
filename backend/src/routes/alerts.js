import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, verifyToken } from '../middleware/auth.js';
import {
  alertHistory,
  confirmAlert,
  correctAlert,
  createAlert,
  flagAlert,
  getAlert,
  getAlertsTaxonomy,
  listAlerts,
  nearbyAlerts,
} from '../controllers/alertsController.js';

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many alert reports. Please wait and try again.',
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

router.get('/taxonomy', getAlertsTaxonomy);
router.get('/nearby', nearbyAlerts);
router.get('/', listAlerts);
router.post('/', requireAuth, createLimiter, createAlert);
router.get('/:id', softAuth, getAlert);
router.post('/:id/confirm', requireAuth, interactLimiter, confirmAlert);
router.post('/:id/correct', requireAuth, interactLimiter, correctAlert);
router.post('/:id/flag', requireAuth, interactLimiter, flagAlert);
router.get('/:id/history', softAuth, alertHistory);

export default router;
