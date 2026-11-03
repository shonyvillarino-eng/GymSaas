import express from 'express'
import { requestLogger } from './lib/logger.js'
import { metricsMiddleware } from './middlewares/metrics.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { notFoundHandler } from './middlewares/notFound.js'
import { apiRouter } from './routes/index.js'
import { env } from './config/env.js'
import { prismaClient } from './lib/prisma.js'
import { checkReadiness } from './lib/readiness.js'

export function createApp(): express.Express {
  const app = express()

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.use(requestLogger)
  app.use(metricsMiddleware)

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeMs: Math.round(process.uptime() * 1000),
      env: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    })
  })

  app.post('/ready', async (_req, res) => {
    const ready = await checkReadiness(prismaClient, 5_000)
    res.status(ready.ready ? 200 : 503).json({
      status: ready.ready ? 'ok' : 'error',
      ready: ready.ready,
      timestamp: new Date().toISOString(),
      database: ready.ready
        ? { connected: true, latencyMs: ready.latencyMs }
        : { connected: false },
    })
  })

  app.get('/metrics', async (_req, res) => {
    const { metrics } = await import('./services/metrics.js')
    const data = await metrics.collect()
    res.json(data)
  })

  app.use('/api/v1', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
