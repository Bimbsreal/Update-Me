import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, verifyToken } from '../middleware/auth.js';
import {
  confirmPriceReport,
  correctPriceReport,
  createPriceReport,
  getPriceDetail,
  getPriceReport,
  getPricesTaxonomy,
  listCommodities,
  listPrices,
  nearbyPrices,
  priceReportHistory,
  pricesSummary,
} from '../controllers/pricesController.js';

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many price reports. Please wait and try again.',
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

router.get('/taxonomy', getPricesTaxonomy);
router.get('/commodities', listCommodities);
router.get('/summary', pricesSummary);
router.get('/nearby', nearbyPrices);
router.get('/', listPrices);
router.post('/', requireAuth, createLimiter, createPriceReport);
router.get('/reports/:id', softAuth, getPriceReport);
router.post('/:id/confirm', requireAuth, interactLimiter, confirmPriceReport);
router.post('/:id/correct', requireAuth, interactLimiter, correctPriceReport);
router.get('/:id/history', softAuth, priceReportHistory);
router.get('/:commodity/:variant', getPriceDetail);

export default router;
