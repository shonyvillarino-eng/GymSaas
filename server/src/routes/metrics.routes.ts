import { Router, type Request, type Response } from 'express'

import { getMetrics, clearMetrics } from '../lib/metrics.js'
import { env } from '../config/env.js'

const router = Router()

router.get('/metrics', (_req: Request, res: Response) => {
  const snap = getMetrics()
  res.status(200).json({
    requestCount: snap.requestCount,
    errorCount: snap.errorCount,
    slowCount: snap.slowCount,
    latencyAvgMs: snap.requestCount > 0
      ? Math.round(snap.latencySumMs / snap.requestCount)
      : null,
    latencyMinMs: snap.latencyMinMs,
    latencyMaxMs: snap.latencyMaxMs,
    truncated: snap.truncated,
    windowStartMs: snap.entries[0]?.timestamp ?? null,
    windowEndMs: snap.entries[snap.entries.length - 1]?.timestamp ?? null,
  })
})

router.post('/metrics/clear', (_req: Request, res: Response) => {
  clearMetrics()
  res.status(200).json({ cleared: true })
})

export { router as metricsRouter }
