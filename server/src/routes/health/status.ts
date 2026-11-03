import type { PrismaClient } from '@prisma/client'

export async function getReadiness(prisma: PrismaClient, timeoutMs = 5000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const start = Date.now()
    await prisma.$queryRawUnsafe('SELECT 1')
    const latencyMs = Date.now() - start
    return { ready: true, latencyMs }
  } catch {
    return { ready: false }
  } finally {
    clearTimeout(timeout)
  }
}
