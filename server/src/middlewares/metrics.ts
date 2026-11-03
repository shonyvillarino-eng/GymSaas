import type { Request, Response, NextFunction } from 'express'
import { metrics } from '../services/metrics.js'

export function metricsMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    metrics.increment('gym.metrics.requests.total', 1)
    metrics.increment(`gym.metrics.requests.status.${res.statusCode}`, 1)
    metrics.gauge('gym.metrics.requests.duration_ms', duration)
    metrics.gauge('gym.metrics.requests.active', 1)
  })
  next()
}
