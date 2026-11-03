import type { GaugeValue, CounterValue, HistogramValue } from '../lib/metrics_types.js'

type MetricValue = number

interface MetricStore {
  counters: Map<string, MetricValue>
  gauges: Map<string, MetricValue>
  histograms: Map<string, MetricValue[]>
}

const store: MetricStore = {
  counters: new Map(),
  gauges: new Map(),
  histograms: new Map(),
}

// Allowlist de métricas permitidas para evitar cardinalidad no controlada.
// Cada métrica debe incluir el prefijo completo gym.metrics.<nombre>.
const allowlistedCounters = new Set([
  'gym.metrics.requests.total',
  'gym.metrics.requests.status.200',
  'gym.metrics.requests.status.400',
  'gym.metrics.requests.status.401',
  'gym.metrics.requests.status.403',
  'gym.metrics.requests.status.404',
  'gym.metrics.requests.status.500',
  'gym.metrics.attendance.checked_in',
  'gym.metrics.attendance.checked_out',
  'gym.metrics.membership.activated',
  'gym.metrics.membership.expired',
])

const allowlistedGauges = new Set([
  'gym.metrics.requests.duration_ms',
  'gym.metrics.requests.active',
  'gym.metrics.atmHealthy',
  'gym.metrics.atmHealthyN',
])

function assertAllowlistedCounter(name: string): void {
  if (!allowlistedCounters.has(name)) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'metrics_counter_not_allowlisted',
        metric: name,
        timestamp: new Date().toISOString(),
      }),
    )
  }
}

function assertAllowlistedGauge(name: string): void {
  if (!allowlistedGauges.has(name)) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'metrics_gauge_not_allowlisted',
        metric: name,
        timestamp: new Date().toISOString(),
      }),
    )
  }
}

export const metrics = {
  prefix: 'gym.metrics.',

  counter(name: string, value: MetricValue = 1): void {
    const sanitized = name.replace(/^gym\.metrics\./, '')
    const key = this.prefix + sanitized
    store.counters.set(key, (store.counters.get(key) ?? 0) + value)
    assertAllowlistedCounter(name)
  },

  increment(name: string, value: MetricValue = 1): void {
    this.counter(name, value)
  },

  gauge(name: string, value: MetricValue): void {
    const sanitized = name.replace(/^gym\.metrics\./, '')
    const key = this.prefix + sanitized
    store.gauges.set(key, value)
    assertAllowlistedGauge(name)
  },

  histogram(name: string, value: MetricValue): void {
    const sanitized = name.replace(/^gym\.metrics\./, '')
    const key = this.prefix + sanitized
    const values = store.histograms.get(key) ?? []
    values.push(value)
    store.histograms.set(key, values)
  },

  async _metrics(): Promise<{ counters: [string, MetricValue][]; gauges: [string, MetricValue][]; histograms: [string, MetricValue[]][] }> {
    return {
      counters: [...store.counters.entries()],
      gauges: [...store.gauges.entries()],
      histograms: [...store.histograms.entries()],
    }
  },

  async collect(): Promise<{
    counters: Record<string, MetricValue>;
    gauges: Record<string, MetricValue>;
    histograms: Record<string, { count: number; sum: number; values: MetricValue[] }>;
  }> {
    const collected = await this._metrics()
    return {
      counters: Object.fromEntries(collected.counters),
      gauges: Object.fromEntries(collected.gauges),
      histograms: Object.fromEntries(collected.histograms.map(([key, values]) => [key, { count: values.length, sum: values.reduce((total, value) => total + value, 0), values }])),
    }
  },
}

// Allowlist adicional para métricas de salud atm (no duplicar nombres).
export const allowlistedCountersForAtm = new Set([
  'gym.metrics.atmHealthy',
  'gym.metrics.atmHealthyN',
])

export const allowlistedGaugesForAtm = new Set([
  'gym.metrics.requests.duration_ms',
  'gym.metrics.requests.active',
])
