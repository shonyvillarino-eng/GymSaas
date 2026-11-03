import { PrismaClient } from '@prisma/client'
import { env } from '../config/env.js'
import { checkReadiness } from '../lib/readiness.js'
import { prisma } from '../lib/prisma.js'

/**
 * Estado de disponibilidad global del sistema.
 *
 * `running` indica si se puede acceder al menos a Postgres. Se usa para
 * decisiones del servidor (por ejemplo, en health endpoints legacy).
 */
let running = false

async function checkAll() {
  const database = await checkReadiness(prisma, 5_000)
  running = database.ready

  return {
    status: {
      ready: running,
      timestamp: new Date().toISOString(),
    },
    database: {
      ready: database.ready,
      latencyMs: database.latencyMs,
      error: database.error,
    },
  }
}

export const readiness = {
  async check() {
    return checkAll()
  },
  get status() {
    return {
      ready: running,
      timestamp: new Date().toISOString(),
    }
  },
  get canAccessS3() {
    return running
  },
}
