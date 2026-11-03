import type { Request } from 'express'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  level: LogLevel
  env?: string
  service?: string
  requestId?: string | null
  method?: string
  path?: string
  statusCode?: number
  userId?: string | null
  durationMs?: number
  errorType?: string
  message?: string
  traceId?: string | null
  eventId?: string | null
  meta?: Record<string, unknown>
}

const SECRET_KEY_TOKENS = new Set([
  'password',
  'secret',
  'token',
  'key',
  'jwt',
  'cookie',
  'session',
])

/* eslint-disable regexp/no-obscure-name */
const TSTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z?$/

function isLikelySecretKey(key: string): boolean {
  const k = key.toLowerCase()
  if (SECRET_KEY_TOKENS.has(k)) return true
  if (k.includes('__secret') || k.includes('__token') || k.includes('__key')) return true
  return false
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return value
  if (typeof value === 'string') {
    if (value.length > 400) {
      return `[REDACTED_${value.length}chars]`
    }
    if (TSTAMP_RE.test(value) || /^[A-Za-z0-9+/=]{40,}$/.test(value)) {
      return value
    }
  }
  return value
}

export function safeStringify(obj: unknown, maxKeys = 64): string {
  if (typeof obj !== 'object' || obj === null) return JSON.stringify(sanitizeValue(obj))
  const safe = sanitizeObject(obj as Record<string, unknown>, 0, maxKeys)
  try {
    return JSON.stringify(safe)
  } catch {
    return '[serialization_failed]'
  }
}

function sanitizeObject(
  obj: Record<string, unknown>,
  depth: number,
  maxDepth: number,
): unknown {
  if (depth > maxDepth) return '[max_depth]'
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeValue(item))
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (isLikelySecretKey(key)) {
      out[key] = '[redacted]'
      continue
    }
    if (typeof value === 'object' && value !== null) {
      out[key] = sanitizeObject(value as Record<string, unknown>, depth + 1, maxDepth)
    } else {
      out[key] = sanitizeValue(value)
    }
  }
  return out
}

export function requestId(req?: Request): string | null {
  if (!req) return null
  return (req as unknown as { requestId?: string }).requestId ?? null
}

export type Env = { NODE_ENV: 'development' | 'production' | 'test' }

export function getNodeEnv(): Env {
  return { NODE_ENV: (process.env?.NODE_ENV as Env['NODE_ENV']) || 'development' }
}

export const env = getNodeEnv()

export function createLogEntry(ctx: LogContext): Omit<LogContext, 'requestId'> & {
  'trace.id'?: string | null
  'event.id'?: string
  ts?: string
  level?: string
  message?: string
} {
  const requestId = ctx.requestId ?? null
  const plain: Omit<LogContext, 'requestId'> & {
    'trace.id'?: string | null
    'event.id'?: string
    ts?: string
    level?: string
    message?: string
  } = {
    level: ctx.level,
    env: ctx.env ?? env.NODE_ENV, // eslint-disable-line @typescript-eslint/naming-conflict
    service: ctx.service,
    'trace.id': requestId,
    method: ctx.method,
    path: ctx.path,
    statusCode: ctx.statusCode,
    userId: ctx.userId,
    durationMs: ctx.durationMs,
    errorType: ctx.errorType,
    ts: new Date().toISOString(),
    message: ctx.message,
    ...(ctx.meta != null ? { meta: ctx.meta } : {}),
  }
  return plain
}

export const DEBUG: LogLevel = 'debug'
export const INFO: LogLevel = 'info'
export const WARN: LogLevel = 'warn'
export const ERROR: LogLevel = 'error'

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
export const env: Env = getNodeEnv()


