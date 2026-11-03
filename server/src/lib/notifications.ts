import { Router } from 'express'

import { checkReadiness } from '../lib/health.js'
import { createLogEntry, INFO, ERROR, safeStringify, env } from '../lib/logger.js'

const router = Router()

router.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptimeMs: Math.round(process.uptime() * 1000),
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  })
})

router.get('/live', (_req, res) => {
  res.status(200).json({
    status: 'alive',
    uptimeMs: Math.round(process.uptime() * 1000),
    timestamp: new Date().toISOString(),
  })
})

router.get('/ready', async (_req, res) => {
  const ready = await checkReadiness()
  res.status(ready.ready ? 200 : 503).json({
    status: ready.ready ? 'ok' : 'error',
    ready: ready.ready,
    timestamp: new Date().toISOString(),
    message: ready.message,
    database: ready.ready
      ? { connected: true, latencyMs: ready.latencyMs }
      : { connected: false, error: ready.error },
  })
})

export { router as healthRouter }
