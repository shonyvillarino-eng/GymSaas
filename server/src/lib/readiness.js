/**
 * checkReadiness performs a real, aborted SELECT 1 against Postgres.
 *
 * It uses AbortController + driver cancellation so the query is torn down
 * when the deadline is reached, not just raced away.
 */
export async function checkReadiness(prisma, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const start = Date.now();
        await prisma.$queryRaw `SELECT 1`;
        const latencyMs = Date.now() - start;
        return { ready: true, latencyMs, message: 'ok' };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown database error';
        return { ready: false, error: message, message };
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * isLive exposes a pure liveness signal. It never looks at Postgres.
 */
export function isLive() {
    return process.uptime() >= 0;
}
/**
 * isReady is the same contract as checkReadiness, intended for tests or
 * environments that do not already have a prisma instance injected.
 */
export async function isReady(prisma, timeoutMs = 5000) {
    return checkReadiness(prisma, timeoutMs);
}
