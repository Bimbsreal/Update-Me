import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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
  resolvePlace,
  geocodeForward,
  geocodeReverse,
} from '../controllers/locationController.js';

const router = Router();

const nearbyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many nearby requests. Try again shortly.' },
  },
});

const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many geocoding requests. Try again shortly.' },
  },
});

router.get('/capabilities', capabilities);
router.get('/search', searchLocations);
router.get('/resolve', geocodeLimiter, resolvePlace);
router.get('/geocode', geocodeLimiter, geocodeForward);
router.get('/reverse-geocode', geocodeLimiter, geocodeReverse);
router.get('/nearby', nearbyLimiter, nearbyLocations);
router.get('/states', listStates);
router.get('/lgas', listLgas);
router.get('/states/:stateId/lgas', listLgas);
router.get('/areas', listAreas);
router.get('/lgas/:lgaId/areas', listAreas);
router.patch('/me', requireAuth, setMyLocation);
router.get('/:id', getLocation);

export default router;
