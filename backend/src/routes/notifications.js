import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import {
  getNotificationTaxonomy,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../controllers/notificationController.js';

const interactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many notification actions. Please wait and try again.',
  },
});

const router = Router();

router.use(requireAuth);

router.get('/taxonomy', getNotificationTaxonomy);
router.get('/unread-count', getUnreadCount);
router.get('/', listNotifications);
router.post('/read-all', interactLimiter, markAllNotificationsRead);
router.post('/:id/read', interactLimiter, markNotificationRead);

export default router;
