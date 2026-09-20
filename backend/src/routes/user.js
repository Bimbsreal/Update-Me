import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import {
  createSavedArea,
  createSavedRoute,
  deleteSavedArea,
  deleteSavedRoute,
  getNotificationPreferences,
  getPersonalization,
  listSavedAreas,
  listSavedRoutes,
  updateNotificationPreferences,
  updateSavedArea,
  updateSavedRoute,
} from '../controllers/notificationController.js';

const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many saved-place updates. Please wait and try again.',
  },
});

const router = Router();

router.use(requireAuth);

router.get('/personalization', getPersonalization);
router.get('/notification-preferences', getNotificationPreferences);
router.put('/notification-preferences', writeLimiter, updateNotificationPreferences);

router.get('/saved-areas', listSavedAreas);
router.post('/saved-areas', writeLimiter, createSavedArea);
router.patch('/saved-areas/:id', writeLimiter, updateSavedArea);
router.delete('/saved-areas/:id', writeLimiter, deleteSavedArea);

router.get('/saved-routes', listSavedRoutes);
router.post('/saved-routes', writeLimiter, createSavedRoute);
router.patch('/saved-routes/:id', writeLimiter, updateSavedRoute);
router.delete('/saved-routes/:id', writeLimiter, deleteSavedRoute);

export default router;
