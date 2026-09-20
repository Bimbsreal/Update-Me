import { Router } from 'express';
import { getHealth, getLive, getReady } from '../controllers/healthController.js';

const router = Router();

router.get('/live', getLive);
router.get('/ready', getReady);
router.get('/', getHealth);

export default router;
