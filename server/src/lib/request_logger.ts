import type { Request, Response, NextFunction } from 'express'

import { createLogEntry, safeStringify, env } from './logger.js'
import type { LogLevel } from './logger.js'

const INFO: LogLevel = 'info'
const WARN: LogLevel = 'warn'
const ERROR: LogLevel = 'error'

function createRequestLoggerMiddleware() {
  return function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
    const start = Date.now()
    const reqId = (req as Request & { requestId?: string | null }).requestId ?? crypto.randomUUID?.() ?? null
    req.requestId = reqId

    res.on('finish', () => {
      const dur = Date.now() - start
      const isError = res.statusCode >= 500
      const isWarn = !isError && res.statusCode >= 400
      const level: LogLevel = isError ? ERROR : isWarn ? WARN : INFO

      const ctx = createLogEntry({
        level,
        env: env.NODE_ENV,
        service: 'gym-saas',
        method: req.method,
        path: req.originalUrl.split('?')[0],
        statusCode: res.statusCode,
        durationMs: dur,
        requestId: reqId,
        userId: (req as Request & { auth?: { userId?: string } }).auth?.userId ?? null,
        errorType: isError ? (res as any).errorType : undefined,
        message: isError ? (res as any).errorMessage : undefined,
      })

      if (level === ERROR || level === WARN || env.NODE_ENV !== 'production') {
        if (level === ERROR) {
          console.error(safeStringify(ctx))
        } else {
          console.warn(safeStringify(ctx))
        }
      }
    })

    next()
  }
}

export { createRequestLoggerMiddleware as logRequest }
