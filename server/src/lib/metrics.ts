export interface MetricEntry {
  request_id: string | null
  method: string
  path: string
  status_code: number
  latency_ms: number
  is_slow: boolean
  is_error: boolean
  timestamp: string
}

export interface MetricsSnapshot {
  requestCount: number
  errorCount: number
  slowCount: number
  latencySumMs: number
  latencyMinMs: number | null
  latencyMaxMs: number | null
  entries: MetricEntry[]
  truncated: boolean
}

const maxEntries = 500
const entries: MetricEntry[] = []

export function recordMetric(entry: MetricEntry): void {
  entries.push(entry)
  if (entries.length > maxEntries) {
    entries.shift()
  }
}

export function getMetrics(): MetricsSnapshot {
  let requestCount = 0
  let errorCount = 0
  let slowCount = 0
  let latencySum = 0
  let latencyMin: number | null = null
  let latencyMax: number | null = null

  for (const e of entries) {
    requestCount++
    if (e.isError) errorCount++
    if (e.isSlow) slowCount++
    latencySum += e.latency_ms
    if (latencyMin === null || e.latency_ms < latencyMin) latencyMin = e.latency_ms
    if (latencyMax === null || e.latency_ms > latencyMax) latencyMax = e.latency_ms
  }

  return {
    requestCount,
    errorCount,
    slowCount,
    latencySumMs: latencySum,
    latencyMinMs: latencyMin,
    latencyMaxMs: latencyMax,
    entries: [...entries],
    truncated: entries.length >= maxEntries,
  }
}

export function clearMetrics(): void {
  entries.length = 0
}

export function metricsMiddleware(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
): void {
  const start = performance.now()
  res.on('finish', () => {
    const duration = Math.round(performance.now() - start)
    const slowThreshold = Number(process.env.SLOW_REQUEST_MS ?? 1000)
    const isSlow = duration >= slowThreshold
    const statusCode = res.statusCode
    const isError = statusCode >= 500

    recordMetric({
      request_id: (req as any).requestId ?? null,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status_code: statusCode,
      latency_ms: duration,
      is_slow: isSlow,
      is_error: isError,
      timestamp: new Date().toISOString(),
    })

    if (isSlow && !isError) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'slow_request',
          request_id: (req as any).requestId ?? null,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status_code: statusCode,
          latency_ms: duration,
        }),
      )
    }
  })

  next()
}
