import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  listAreas,
  listLgas,
  listStates,
  resolveLocation,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const resolveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many location lookups. Try again shortly.' } },
});

router.get('/states', listStates);
router.get('/states/:stateId/lgas', listLgas);
router.get('/lgas/:lgaId/areas', listAreas);
router.post('/resolve', requireAuth, resolveLimiter, resolveLocation);

export default router;
