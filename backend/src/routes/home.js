import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getHome } from '../controllers/homeController.js';

const router = Router();

router.use(requireAuth);
router.get('/', getHome);

export default router;
