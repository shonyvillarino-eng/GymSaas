/**
 * Health endpoints with real database checks.
 *
 * GET /health       -> public liveness-ish (includes DB status)
 * GET /health/live  -> public liveness, no DB check
 * GET /health/ready -> DB-backed readiness; 503 when DB is unavailable
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { checkReadiness } from '../lib/health.js'

export const healthRouter = Router()

healthRouter.get('/', async (_req: Request, res: Response) => {
  const readiness = await checkReadiness()
  const status = readiness.ready ? 'ok' : 'degraded'
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
  }
  res.status(readiness.ready ? 200 : 503).json(health)
})

healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' })
})

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const readiness = await checkReadiness()
  res.status(readiness.ready ? 200 : 503).json({
    status: readiness.ready ? 'ok' : 'error',
    ready: readiness.ready,
    timestamp: new Date().toISOString(),
    message: readiness.ready ? 'Database reachable' : 'Database check failed',
    database: readiness.ready
      ? { connected: true, latencyMs: readiness.latencyMs }
      : { connected: false, error: readiness.error },
  })
})
