import { Router } from 'express';
import { checkReadiness } from '../lib/readiness.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
const router = Router();
router.get('/', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        uptimeMs: Math.round(process.uptime() * 1000),
        env: env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});
router.get('/live', (_req, res) => {
    res.status(200).json({
        status: 'alive',
        uptimeMs: Math.round(process.uptime() * 1000),
        timestamp: new Date().toISOString(),
    });
});
router.post('/ready', async (_req, res) => {
    const readiness = await checkReadiness(prisma, env.READY_TIMEOUT_MS ?? 5000);
    res.status(readiness.ready ? 200 : 503).json({
        status: readiness.ready ? 'ok' : 'error',
        ready: readiness.ready,
        timestamp: new Date().toISOString(),
        message: readiness.message ?? '',
        database: readiness.ready
            ? { connected: true, latencyMs: readiness.latencyMs }
            : { connected: false, error: readiness.error },
    });
});
export { router as healthRouter };
