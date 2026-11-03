import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { checkReadiness } from '../lib/readiness.js'

const TIMEOUT_MS = env.HEALTH_READINESS_TIMEOUT_MS ?? 5000
export const healthRouter = Router()

healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptimeMs: Math.round(process.uptime() * 1000),
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  })
})

healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    uptimeMs: Math.round(process.uptime() * 1000),
    timestamp: new Date().toISOString(),
  })
})

healthRouter.post('/ready', async (_req: Request, res: Response) => {
  const readiness = await checkReadiness(prisma, TIMEOUT_MS)
  res.status(readiness.ready ? 200 : 503).json({
    status: readiness.ready ? 'ok' : 'error',
    ready: readiness.ready,
    timestamp: new Date().toISOString(),
    database: readiness.ready
      ? { connected: true, latencyMs: readiness.latencyMs }
      : { connected: false, error: readiness.error },
  })
})
