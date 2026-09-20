import { Router } from 'express';
import {
  listAreas,
  listLgas,
  listStates,
  resolveLocation,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/states', listStates);
router.get('/states/:stateId/lgas', listLgas);
router.get('/lgas/:lgaId/areas', listAreas);
router.post('/resolve', requireAuth, resolveLocation);

export default router;
