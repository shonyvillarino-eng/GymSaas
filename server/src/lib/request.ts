import { randomUUID } from 'node:crypto'
import type { Request } from 'express'

let _requestId: string | undefined

export function requestId(): string {
  if (_requestId) return _requestId
  _requestId = randomUUID()
  return _requestId
}

export function setRequestId(req: Request): string {
  const id = req.headers['x-request-id'] as string | undefined
  if (id) {
    _requestId = id
    return id
  }
  _requestId = randomUUID()
  return _requestId
}

export function getRequestId(): string | undefined {
  return _requestId
}
