import { Router } from 'express';
import { checkReadiness } from '../lib/readiness.js';
export const env = {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: Number(process.env.PORT ?? 3000),
    PUBLIC_URL: process.env.PUBLIC_URL ?? 'http://localhost:3000',
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? process.env.PUBLIC_URL ?? 'http://localhost:3000',
    isProd: process.env.NODE_ENV === 'production',
    requestId: process.env.REQUEST_ID,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
    JWT_COOKIE_NAME: process.env.JWT_COOKIE_NAME ?? 'gym_saas_jwt',
    JWT_COOKIE_SECURE: process.env.JWT_COOKIE_SECURE !== 'false',
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_REGION: process.env.S3_REGION,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
};
export function isProd() {
    return process.env.NODE_ENV === 'production';
}
export const healthRouter = Router();
healthRouter.get('/', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        uptimeMs: Math.round(process.uptime() * 1000),
        env: env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});
healthRouter.get('/live', (_req, res) => {
    res.status(200).json({
        status: 'alive',
        uptimeMs: Math.round(process.uptime() * 1000),
        timestamp: new Date().toISOString(),
    });
});
healthRouter.post('/ready', async (_req, res) => {
    const readiness = await checkReadiness(env, 5000);
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
