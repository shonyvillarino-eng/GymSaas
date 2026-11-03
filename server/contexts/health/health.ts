import { Router } from 'express';
import type { Request, Response } from 'express';

import { metricsMiddleware } from '../middleware/metrics.js';
import { resetMetricsStore } from '../lib/metrics.js';

export const metricsRouter = Router();

metricsRouter.use(metricsMiddleware);

metricsRouter.get('/metrics/health', async (_req: Request, res: Response) => {
  const snapshot = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
  res.json(snapshot);
});

metricsRouter.get('/metrics/reset', async (_req: Request, res: Response) => {
  resetMetricsStore();
  res.json({ status: 'ok', resetAt: new Date().toISOString() });
});

export { metricsMiddleware };
