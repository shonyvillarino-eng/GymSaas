import { createApp } from './app.js'
import { env } from './config/env.js'
import { prismaClient } from './lib/prisma.js'
import { startNotificationSweep } from './services/notifications.js'

const app = createApp()

let running = false

// Membership lifecycle sweep
async function sweepMembershipLifecycle() {
  if (running) return
  running = true
  const now = new Date()

  try {
    await prismaClient.memberProfile.updateMany({
      where: { status: 'ACTIVE', joinDate: { lt: now } },
      data: { status: 'INACTIVE' },
    })
    await prismaClient.memberSubscription.updateMany({
      where: { status: 'PENDING', startDate: { lte: now }, endDate: { gte: now } },
      data: { status: 'ACTIVE' },
    })
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'membership_lifecycle_failed',
      message: error instanceof Error ? error.message : 'unknown',
    }))
  } finally {
    running = false
  }
}

const expirationTimer = env.NODE_ENV === 'test' ? null : setInterval(() => {
  void sweepMembershipLifecycle()
}, 60_000)

if (expirationTimer) expirationTimer.unref()

const stopNotificationSweep = env.NODE_ENV === 'test' ? null : startNotificationSweep()

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${env.PORT}`)
  console.log(`   Health:  http://localhost:${env.PORT}/health`)
  console.log(`   Ready:   http://localhost:${env.PORT}/ready`)
  console.log(`   Metrics: http://localhost:${env.PORT}/metrics`)
})

let shuttingDown = false

function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true

  if (expirationTimer) clearInterval(expirationTimer)
  stopNotificationSweep?.()
  console.log(`\n${signal} received. Shutting down gracefully...`)

  server.close(() => {
    void prismaClient.$disconnect().then(() => process.exit(0))
  })

  setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
