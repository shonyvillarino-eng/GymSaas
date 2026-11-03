import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'

export function requestId(req?: Request): string {
  if (req?.headers['x-request-id']) {
    return req.headers['x-request-id'] as string
  }
  if (req?.headers['x-correlation-id']) {
    return req.headers['x-correlation-id'] as string
  }
  return randomUUID()
}

export function log(msg: string, data?: object): void {
  const timestamp = new Date().toISOString()
  const entry = data ? `${timestamp} ${msg} ${JSON.stringify(data)}` : `${timestamp} ${msg}`
  process.stdout.write(entry + '\n')
}

export function logError(msg: string, error?: Error): void {
  const timestamp = new Date().toISOString()
  const stack = error ? `\n${error.stack}` : ''
  process.stderr.write(`${timestamp} ERROR ${msg}${stack}\n`)
}

export const logger = {
  info: (data: object) => log('INFO', data),
  warn: (data: object) => log('WARN', data),
  error: (data: object) => logError('ERROR', new Error(JSON.stringify(data))),
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()
  const id = requestId(req)

  res.on('finish', () => {
    logger.info({
      event: 'request',
      requestId: id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    })
  })

  next()
}
