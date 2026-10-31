import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { startNotificationSweep } from './services/notifications.js';

const app = createApp();

/**
 * Membership lifecycle sweep.
 *
 * `running` prevents a slow sweep from overlapping with the next tick. The
 * updates are idempotent (a status change is a no-op once applied), so several
 * instances may run them without corrupting data; the (status, endDate) and
 * (status, startDate) indexes keep each tick cheap.
 */
let running = false;

async function sweepMembershipLifecycle() {
  if (running) return;
  running = true;
  const now = new Date();
  try {
    await prisma.memberSubscription.updateMany({
      where: { status: 'ACTIVE', endDate: { lt: now } },
      data: { status: 'EXPIRED' },
    });
    await prisma.memberSubscription.updateMany({
      where: { status: 'PENDING', startDate: { lte: now }, endDate: { gte: now } },
      data: { status: 'ACTIVE' },
    });
  } catch (error) {
    // Never log the query or connection string, only the failure event.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'membership_lifecycle_failed',
        message: error instanceof Error ? error.message : 'unknown',
      })
    );
  } finally {
    running = false;
  }
}

const expirationTimer =
  env.NODE_ENV === 'test'
    ? null
    : setInterval(() => {
        void sweepMembershipLifecycle();
      }, 60_000);
expirationTimer?.unref();

const stopNotificationSweep =
  env.NODE_ENV === 'test' ? null : startNotificationSweep();

const server = app.listen(env.PORT, () => {
  console.log(`✅ API listening on http://localhost:${env.PORT}/api/v1`);
  console.log(`   Health: http://localhost:${env.PORT}/api/v1/health`);
  console.log(`   Env:    ${env.NODE_ENV}`);
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (expirationTimer) clearInterval(expirationTimer);
  stopNotificationSweep?.();
  console.log(`\n${signal} received, shutting down gracefully...`);

  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));