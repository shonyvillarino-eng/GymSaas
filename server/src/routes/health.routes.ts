import { Router } from 'express'
import type { Request, Response } from 'express'

import { isLive, isReady, checkReadiness } from '../lib/health.js'
import { env } from '../config/env.js'

const router = Router()

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptimeMs: Math.round(process.uptime() * 1000),
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  })
})

router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    uptimeMs: Math.round(process.uptime() * 1000),
    timestamp: new Date().toISOString(),
  })
})

router.get('/ready', async (req: Request, res: Response) => {
  const payload = await checkReadiness(req, res)
  res.status(payload.status === 'ok' ? 200 : 503).json(payload)
})

export { router as healthRouter }
