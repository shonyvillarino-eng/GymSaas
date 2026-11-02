import type { PrismaClient } from '@prisma/client'

export async function getHealthStatus(prisma: PrismaClient) {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    const latencyMs = Date.now() - start
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString(), database: { connected: true, latencyMs } }
  } catch {
    return { status: 'degraded', uptime: process.uptime(), timestamp: new Date().toISOString(), database: { connected: false, latencyMs: Date.now() - start } }
  }
}

export async function getReadiness(prisma: PrismaClient) {
  const db = await getHealthStatus(prisma)
  return { ready: db.database.connected, timestamp: new Date().toISOString(), database: db.database }
}

