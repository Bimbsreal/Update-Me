import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, COOKIE_NAME, cookieOptions, signToken } from '../middleware/auth.js';
import {
  login,
  logout,
  me,
  register,
  setLocation,
} from '../controllers/authController.js';
import { sessionService } from '../services/sessionService.js';
import { adminAccessService } from '../services/adminAccessService.js';
import { acceptInviteSchema } from '../validators/admin.js';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many sign-in attempts. Please wait and try again.',
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many registration attempts. Please wait and try again.',
  },
});

const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many invitation attempts. Please wait and try again.',
  },
});

const router = Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.patch('/me/location', requireAuth, setLocation);

router.get('/admin-invite/:token', inviteLimiter, async (req, res, next) => {
  try {
    const result = await adminAccessService.verifyInvitationToken(req.params.token);
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
});

router.post('/admin-invite/:token/accept', inviteLimiter, async (req, res, next) => {
  try {
    const body = acceptInviteSchema.parse(req.body);
    const result = await adminAccessService.acceptInvitation(req.params.token, body, req);
    const session = await sessionService.create(result.user.id, req);
    const token = signToken({ sub: result.user.id, sid: session.id });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({
      success: true,
      user: result.user,
      role: result.role,
      permissions: result.permissions,
      next: '/admin',
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
