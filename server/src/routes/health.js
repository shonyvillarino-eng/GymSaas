import { Router } from 'express';
import { checkReadiness } from '../lib/readiness.js';
import { prisma } from '../lib/prisma.js';
export const healthRouter = Router();
healthRouter.get('/', async (_req, res) => {
    const readiness = await checkReadiness(prisma);
    const status = readiness.ready ? 'ok' : 'degraded';
    const health = {
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
            connected: readiness.ready,
            ...(readiness.ready
                ? { latencyMs: readiness.latencyMs }
                : { error: readiness.error }),
        },
    };
    res.status(readiness.ready ? 200 : 503).json(health);
});
healthRouter.get('/live', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});
healthRouter.get('/ready', async (_req, res) => {
    const readiness = await checkReadiness(prisma);
    res.status(readiness.ready ? 200 : 503).json({
        status: readiness.ready ? 'ok' : 'error',
        ready: readiness.ready,
        timestamp: new Date().toISOString(),
        message: readiness.message ?? 'Database check failed',
        database: readiness.ready
            ? { connected: true, latencyMs: readiness.latencyMs }
            : { connected: false, error: readiness.error },
    });
});
