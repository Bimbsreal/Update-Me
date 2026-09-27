import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireOfficialAdmin } from '../middleware/officialAdmin.js';
import {
  contextOfficialUpdates,
  createOfficialSource,
  getOfficialAdminStatus,
  getOfficialSourceAdmin,
  getOfficialSourcePublic,
  getOfficialUpdate,
  listOfficialSourcesPublic,
  listOfficialTaxonomy,
  listOfficialUpdates,
  nearbyOfficialUpdates,
  postOfficialAdminSync,
  updateOfficialSource,
} from '../controllers/officialController.js';

const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many official sync requests. Please wait and try again.',
  },
});

const router = Router();

router.get('/taxonomy', listOfficialTaxonomy);
router.get('/sources', listOfficialSourcesPublic);
router.get('/sources/:id', getOfficialSourcePublic);
router.get('/nearby', nearbyOfficialUpdates);
router.get('/context', contextOfficialUpdates);
router.get('/', listOfficialUpdates);

router.get('/admin/status', requireOfficialAdmin, getOfficialAdminStatus);
router.post('/admin/sync', requireOfficialAdmin, syncLimiter, postOfficialAdminSync);
router.post('/admin/sources', requireOfficialAdmin, createOfficialSource);
router.get('/admin/sources/:id', requireOfficialAdmin, getOfficialSourceAdmin);
router.patch('/admin/sources/:id', requireOfficialAdmin, updateOfficialSource);

router.get('/:id', getOfficialUpdate);

export default router;
