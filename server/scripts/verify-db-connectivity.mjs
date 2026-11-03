import { createPrismaClient } from './lib/prisma.js'
import { read } from './lib/health.js'

// Verifica que la base de datos esté disponible y accesible para el servidor.
// Usa el mismo mecanismo de AbortController que checkReadiness.
const { prisma, disconnect } = await createPrismaClient()
try {
  const probe = await read({ prisma, timeoutMs: 5_000 })
  console.log(JSON.stringify({
    ready: probe.ready,
    latencyMs: probe.latencyMs,
    error: probe.error,
    timestamp: new Date().toISOString(),
    server: process.env.NODE_ENV,
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    ready: false,
    error: error instanceof Error ? error.message : 'Connection check failed',
    timestamp: new Date().toISOString(),
  }, null, 2))
} finally {
  await disconnect()
}
