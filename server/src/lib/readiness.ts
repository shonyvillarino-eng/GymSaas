/**
 * Readiness helper backed by a real Prisma `SELECT 1` query against the
 * application database. Used by health and liveness probes.
 *
 * NOTES / AUDITS
 * - Uses Prisma's query binder, so connection parameters are never logged.
 * - The health endpoints deliberately return only connectivity status and
 *   latency, not credentials, connection strings, or internal topology.
 */
import { prisma } from '../lib/prisma.js'
import type { Request, Response } from 'express'

const READINESS_TIMEOUT_MS = Number(process.env.READINESS_TIMEOUT_MS ?? 5000)

type ReadinessResult =
  | { ready: true; message: string; latencyMs: number }
  | { ready: false; message: string; error: string }

export function isLive(): { live: true } {
  return { live: true }
}

export function isReady(): Promise<ReadinessResult> {
  return checkReadiness()
}

export async function checkReadiness(_req?: Request, _res?: Response): Promise<ReadinessResult> {
  // Request/Response parameters are accepted for backward compatibility with
  // route handlers but are not used here; health probes must not leak them.

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), READINESS_TIMEOUT_MS)
  try {
    const start = Date.now()
    await prisma.$queryRawUnsafe('SELECT 1')
    const latencyMs = Date.now() - start
    return { ready: true, message: 'Database reachable', latencyMs }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    return { ready: false, message: 'Database check failed', error: message }
  } finally {
    clearTimeout(timeout)
  }
}
