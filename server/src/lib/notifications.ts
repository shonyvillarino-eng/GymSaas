import { Router } from 'express'

import { checkReadiness } from '../lib/health.js'
import { createLogEntry, error, info } from '../lib/logger.js'
import { env } from '../config/env.js'

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

router.get('/ready', async (req, res) => {
  await checkReadiness(req, res)
})

export { router as healthRouter }
