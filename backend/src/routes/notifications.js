import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import {
  archiveNotification,
  getNotificationTaxonomy,
  getPushConfig,
  getUnreadCount,
  listNotifications,
  listPushSubscriptions,
  markAllNotificationsRead,
  markNotificationRead,
  subscribePush,
  unsubscribePush,
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

const pushLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many push subscription changes. Please wait and try again.',
  },
});

const router = Router();

router.use(requireAuth);

router.get('/taxonomy', getNotificationTaxonomy);
router.get('/unread-count', getUnreadCount);
router.get('/push/config', getPushConfig);
router.get('/push/subscriptions', listPushSubscriptions);
router.post('/push/subscribe', pushLimiter, subscribePush);
router.post('/push/unsubscribe', pushLimiter, unsubscribePush);
router.get('/', listNotifications);
router.post('/read-all', interactLimiter, markAllNotificationsRead);
router.post('/:id/read', interactLimiter, markNotificationRead);
router.post('/:id/archive', interactLimiter, archiveNotification);

export default router;
