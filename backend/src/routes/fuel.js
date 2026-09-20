import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, verifyToken } from '../middleware/auth.js';
import {
  confirmFuelReport,
  correctFuelReport,
  createFuelReport,
  createFuelStation,
  fuelReportHistory,
  fuelSummary,
  getFuelReport,
  getFuelStation,
  getFuelTaxonomy,
  listFuelReports,
  listFuelStations,
  nearbyFuel,
} from '../controllers/fuelController.js';

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many fuel reports. Please wait and try again.',
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

router.get('/taxonomy', getFuelTaxonomy);
router.get('/summary', fuelSummary);
router.get('/nearby', nearbyFuel);
router.get('/stations', listFuelStations);
router.post('/stations', requireAuth, createLimiter, createFuelStation);
router.get('/stations/:id', getFuelStation);
router.get('/reports', listFuelReports);
router.post('/reports', requireAuth, createLimiter, createFuelReport);
router.get('/reports/:id', softAuth, getFuelReport);
router.post('/reports/:id/confirm', requireAuth, interactLimiter, confirmFuelReport);
router.post('/reports/:id/correct', requireAuth, interactLimiter, correctFuelReport);
router.get('/reports/:id/history', softAuth, fuelReportHistory);

export default router;
