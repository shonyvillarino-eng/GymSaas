export interface CounterValue {
  value: number
}

export interface GaugeValue {
  value: number
}

export interface HistogramValue {
  count: number
  sum: number
  values: number[]
}
