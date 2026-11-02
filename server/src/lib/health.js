import { prisma } from './prisma.js'
import { env } from '../config/env.js'

export function isLive() {
  return true
}

export function isReady(): Promise<boolean> {
  return prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false)
}

export async function checkReadiness() {
  const startedAt = Date.now()
  let dbStatus = 'ok'
  let dbLatency = 0
  try {
    await prisma.$queryRaw`SELECT 1`
    dbLatency = Date.now() - startedAt
  } catch (err) {
    dbStatus = 'unavailable'
    dbLatency = 0
  }
  const status = dbStatus === 'ok' ? 'ok' : 'degraded'
  const payload = {
    status,
    uptimeMs: Math.round(process.uptime() * 1000),
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      latencyMs: dbLatency,
    },
  }
  return payload
}

export function healthSummary() {
  return { live: isLive(), ready: isReady() }
}
