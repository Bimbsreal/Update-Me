import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { getPool } from '../db/pool.js';
import { readAdminSecret, secureCompare } from '../lib/secureCompare.js';
import {
  getFxAdminStatus,
  getFxCurrencies,
  getFxHistory,
  getFxLatest,
  getFxPair,
  postFxAdminSync,
} from '../controllers/fxController.js';

const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many FX sync requests. Please wait and try again.',
  },
});

/**
 * FX admin gate:
 * - FX_ADMIN_TOKEN via header (query only allowed outside production), OR
 * - authenticated staff user
 */
async function requireFxAdmin(req, _res, next) {
  try {
    const token = readAdminSecret(req, ['x-fx-admin-token', 'x-admin-token']);

    if (env.FX_ADMIN_TOKEN && token && secureCompare(token, env.FX_ADMIN_TOKEN)) {
      req.fxAdmin = { via: 'token' };
      return next();
    }

    await new Promise((resolve, reject) => {
      requireAuth(req, _res, (err) => (err ? reject(err) : resolve()));
    });

    const result = await getPool().query(
      `SELECT id, is_moderator, admin_role, suspended_at, is_active
       FROM users WHERE id = $1`,
      [req.auth.userId]
    );
    const user = result.rows[0];
    if (!user?.is_active || user.suspended_at) {
      throw new AppError('FX admin access denied.', 403, 'FORBIDDEN');
    }
    if (!user.is_moderator && !user.admin_role) {
      throw new AppError('FX admin access requires a staff account or admin token.', 403, 'FORBIDDEN');
    }
    req.fxAdmin = { via: 'moderator', userId: user.id };
    return next();
  } catch (error) {
    return next(error);
  }
}

const router = Router();

router.get('/currencies', getFxCurrencies);
router.get('/latest', getFxLatest);
router.get('/history', getFxHistory);
router.get('/admin/status', requireFxAdmin, getFxAdminStatus);
router.post('/admin/sync', requireFxAdmin, syncLimiter, postFxAdminSync);
router.get('/:base/:quote', getFxPair);

export default router;
