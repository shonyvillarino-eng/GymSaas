import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env.js'

import { logger } from './logger.js'
import { requestId } from './request.js'

export function requestLogger(_req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()
  const id = requestId()

  res.on('finish', () => {
    const ms = Date.now() - start
    logger.info({
      event: 'request',
      requestId: id,
      method: _req.method,
      url: _req.originalUrl,
      status: res.statusCode,
      duration_ms: ms,
      userAgent: _req.get('user-agent'),
      ip: _req.ip,
      env: env.NODE_ENV,
    })
  })

  next()
}
