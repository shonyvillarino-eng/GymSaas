import { prisma } from '../lib/prisma.js';
/**
 * Append-only audit trail writer. Never throws into the request flow: a
 * failed audit write is logged but does not roll back the business operation.
 */
export async function writeAudit(entry) {
    try {
        await prisma.auditLog.create({
            data: {
                gymId: entry.gymId,
                userId: entry.userId,
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId,
                oldValues: entry.oldValues,
                newValues: entry.newValues,
                ipAddress: entry.ipAddress ?? null,
                userAgent: entry.userAgent ?? null,
            },
        });
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('[audit] failed to write AuditLog:', err);
    }
}
export function clientIp(req) {
    return req.ip ?? req.socket?.remoteAddress ?? null;
}
