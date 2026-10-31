import express, { type Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';

import { env, isProd } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { apiRouter } from './routes/index.js';
import { notFoundHandler } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';

/** Requests slower than this are logged as a warning, with their request id. */
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS ?? 1000);

function requestContext(req: Request, res: Response, next: express.NextFunction) {
  const incoming = req.get('x-request-id');
  const requestId = incoming && incoming.length <= 100 ? incoming : randomUUID();
  (req as Request & { requestId?: string }).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (durationMs >= SLOW_REQUEST_MS) {
      // No body, no query dump, no tokens: only the route and the timing.
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'slow_request',
          request_id: requestId,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          duration_ms: Math.round(durationMs),
        })
      );
    }
  });

  next();
}

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestContext);
  app.use(
    morgan(isProd ? 'combined' : 'dev', {
      skip: () => app.get('env') === 'test',
    })
  );

  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
    })
  );

  app.use(
    '/api/v1/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 50,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many authentication attempts, please try again later.' },
    })
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'gym-saas-api',
      timestamp: new Date().toISOString(),
    });
  });

  // Liveness: the process is up, without dependency checks.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'gym-saas-api', version: 'v1' });
  });

  // Readiness: verifies the database round-trip. Returns 503 when it fails and
  // never exposes the connection string or the driver error.
  app.get('/api/v1/health', async (_req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({
        status: 'ok',
        service: 'gym-saas-api',
        version: 'v1',
        database: { status: 'ok', latencyMs: Date.now() - startedAt },
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        service: 'gym-saas-api',
        version: 'v1',
        database: { status: 'unavailable' },
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}