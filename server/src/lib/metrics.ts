import { Router, type Request as ExpressRequest, type Response, type NextFunction, type Router as ExpressRouter } from 'express'

type Request = ExpressRequest

import { checkReadiness } from '../lib/readiness.js'

export type MetricEntry = {
  timestamp: number
  method: string
  route: string
  status: number
  duration_ms: number
  gymId?: string
}

export type MetricsSnapshot = {
  in_flight: number
  total_requests: number
  ok: number
  errors: number
  by_route: Record<string, { count: number; errors: number; latency_sum_ms: number }>
  window_start_ms?: number
}

const store = new Map<string, MetricEntry>()

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  const endSpy = res.end.bind(res)
  res.end = function (this: Response, chunk?: unknown, encoding?: BufferEncoding) {
    const duration = Date.now() - start
    const key = `${req.method} ${req.originalUrl.split('?')[0]}`
    const entry: MetricEntry = {
      timestamp: Date.now(),
      method: req.method,
      route: key,
      status: res.statusCode,
      duration_ms: duration,
      gymId: (req as Request & { gymId?: string }).gymId,
    }
    store.set(key, entry)
    // eslint-disable-next-line prefer-rest-params, @typescript-eslint/no-unsafe-argument
    return endSpy.call(this, chunk as any, encoding as any)
  }
  next()
}

export const metricsRouter = Router()
export type { ExpressRouter }

metricsRouter.get('/metrics', (_req: Request, res: Response) => {
  const snapshot: MetricsSnapshot = {
    in_flight: 0,
    total_requests: store.size,
    ok: 0,
    errors: 0,
    by_route: {},
    window_start_ms: Date.now() - 60_000,
  }
  for (const entry of store.values()) {
    if (entry.status >= 400) snapshot.errors++
    else snapshot.ok++
    const route = entry.route
    snapshot.by_route[route] ??= { count: 0, errors: 0, latency_sum_ms: 0 }
    snapshot.by_route[route].count++
    snapshot.by_route[route].latency_sum_ms += entry.duration_ms
    if (entry.status >= 400) snapshot.by_route[route].errors++
  }
  res.json(snapshot)
})

metricsRouter.get('/health', async (_req: Request, res: Response) => {
  const ready = await checkReadiness()
  res.json({
    status: ready.ready ? 'ok' : 'error',
    ready: ready.ready,
    timestamp: new Date().toISOString(),
    message: ready.message,
    database: ready.ready
      ? { connected: true, latencyMs: ready.latencyMs }
      : { connected: false, error: ready.error },
  })
})
