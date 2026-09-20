import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  capabilities,
  getLocation,
  listAreas,
  listLgas,
  listStates,
  nearbyLocations,
  searchLocations,
  setMyLocation,
} from '../controllers/locationController.js';

const router = Router();

router.get('/capabilities', capabilities);
router.get('/search', searchLocations);
router.get('/nearby', nearbyLocations);
router.get('/states', listStates);
router.get('/lgas', listLgas);
router.get('/states/:stateId/lgas', listLgas);
router.get('/areas', listAreas);
router.get('/lgas/:lgaId/areas', listAreas);
router.patch('/me', requireAuth, setMyLocation);
router.get('/:id', getLocation);

export default router;
