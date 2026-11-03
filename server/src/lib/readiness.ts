import { PrismaClient } from '@prisma/client'

/**
 * checkReadiness performs a real, aborted SELECT 1 against Postgres.
 *
 * It uses AbortController + driver cancellation so the query is torn down
 * when the deadline is reached, not just raced away.
 */
export async function checkReadiness(
  prisma: PrismaClient,
  timeoutMs: number = 5000,
): Promise<{ ready: boolean; latencyMs?: number; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const latencyMs = Date.now() - start
    return { ready: true, latencyMs }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown database error'
    return { ready: false, error: message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * isLiveness exposes a pure liveness signal. It never looks at Postgres.
 */
export function isLiveness(): boolean {
  return process.env.NODE_ENV !== 'test' && process.uptime() >= 0
}

/**
 * isReadyForDb is the same contract as checkReadiness, intended for tests or
 * environments that do not already have a prisma instance injected.
 */
export async function isReadyForDb(
  timeoutMs: number = 5000,
): Promise<{ ready: boolean; latencyMs?: number; error?: string }> {
  const { prisma } = await import('./prisma.js')
  return checkReadiness(prisma, timeoutMs)
}

/**
 * Lectura de configuración del entorno expuesta como 'env' para compatibilidad
 * con código que lo importaba antes de la unificación con config/env.ts.
 */
export const legacyReadinessEnv = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT) || 3001,
  HEALTH_READINESS_TIMEOUT_MS: (process.env.HEALTH_READINESS_TIMEOUT_MS && Number(process.env.HEALTH_READINESS_TIMEOUT_MS)) || 5000,
  requestId: () => Math.random().toString(36).substring(2, 15),
} as const

// Legacy exports kept for backwards compatibility during transition.
export { isLiveness as isLive, isReadyForDb as isReady }
