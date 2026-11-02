export const metricsStore = new Map<string, unknown>()

export type MetricsEntry = {
  method: string
  path: string
  statusCode: number
  responseTimeMs: number
}
