import { Router } from 'express';
import { metricsMiddleware } from '../lib/metrics.js';
const router = Router();
router.use(metricsMiddleware);
export { router as metricsRouter, metricsMiddleware };
