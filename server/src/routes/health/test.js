export async function getReadiness(prisma) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const start = Date.now();
        await prisma.$queryRawUnsafe('SELECT 1');
        return { ready: true, latencyMs: Date.now() - start };
    }
    catch {
        return { ready: false };
    }
    finally {
        clearTimeout(timeout);
    }
}
