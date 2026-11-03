import { checkReadiness } from './readiness.js'
import { prisma } from './prisma.js'

export async function startNotificationSweep(): Promise<() => void> {
  const controller = new AbortController()
  const ping = setInterval(async () => {
    if (controller.signal.aborted) return
    try {
      const ready = await checkReadiness(prisma, 5000)
      if (!ready.ready) {
        console.warn(JSON.stringify({ level: 'warn', event: 'notification_sweep_unhealthy', ready }))
      }
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'notification_sweep_error', error: error instanceof Error ? error.message : 'unknown' }))
    }
  }, 10_000)

  return () => {
    controller.abort()
    clearInterval(ping)
    prisma.$disconnect()
  }
}
