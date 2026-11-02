import type { Request, Response, NextFunction } from 'express'

import { createLogEntry, INFO, WARN, ERROR, safeStringify } from './logger.js'
import { env } from './config/env.js'

function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  req.requestId = req.requestId ?? crypto.randomUUID?.() ?? null
  const reqId = req.requestId

  res.on('finish', () => {
    const dur = Date.now() - start
    const isError = res.statusCode >= 500
    const isWarn = !isError && res.statusCode >= 400
    const level: 'error' | 'warn' | 'info' = isError ? ERROR : isWarn ? WARN : INFO

    const ctx = createLogEntry({
      level,
      env: env.NODE_ENV,
      service: 'gym-saas',
      method: req.method,
      path: req.originalUrl.split('?')[0],
      statusCode: res.statusCode,
      durationMs: dur,
      requestId: reqId,
      userId: req.auth?.userId ?? null,
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

export { requestLoggerMiddleware as logRequest }
