import { PrismaClient } from '@prisma/client'
import { env } from '../config/env.js'
import { checkReadiness } from './readiness.js'

/**
 * Variante de checkReadiness para tests o entornos que no inyectan Prisma.
 *
 * Incluye una versión de `isLive` para pruebas de liveness.
 */
export async function checkReadinessEnv(
  timeoutMs: number = 5_000,
): Promise<{ ready: boolean; latencyMs?: number; error?: string }> {
  const { prisma } = await import('./prisma.js')
  return checkReadiness(prisma, timeoutMs)
}

export function isLiveEnv(): boolean {
  return env.NODE_ENV !== 'test' && process.uptime() >= 0
}
