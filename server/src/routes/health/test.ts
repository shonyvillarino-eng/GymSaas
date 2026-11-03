import type { PrismaClient } from '@prisma/client'

export type TestHealth =
  | { status: 'ok'; ready: true; timestamp: string; message: string; database: { connected: true; latencyMs: number } }
  | { status: 'error'; ready: false; timestamp: string; message: string; database: { connected: false; error: string } }

export type TestReadiness =
  | { ready: true; latencyMs: number }
  | { ready: false }

export async function getReadiness(prisma: PrismaClient): Promise<TestReadiness> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const start = Date.now()
    await prisma.$queryRawUnsafe('SELECT 1')
    return { ready: true, latencyMs: Date.now() - start }
  } catch {
    return { ready: false }
  } finally {
    clearTimeout(timeout)
  }
}
