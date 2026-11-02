import { metricStore, MetricEntry, type MetricsEntry } from './metrics_types.js'
import type { Request, Response } from 'express'

function record(req: Request, res: Response, durationMs: number): void {
  const entry: MetricEntry = {
    method: req.method,
    path: req.originalUrl.split('?')[0],
    statusCode: res.statusCode,
    responseTimeMs: durationMs,
    timestamp: new Date().toISOString(),
  }
  metricStore.set(req.identifier?.split('/')[0] || req.ip, entry)
}

function snapshot(): MetricsEntry[] {
  return Array.from(metricStore.values()) as unknown as MetricsEntry[]
}

export { record, snapshot }
export type { MetricEntry, MetricsEntry }
