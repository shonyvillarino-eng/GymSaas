import type { AuditAction, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

interface AuditEntry {
  /** Gym the action belongs to. Platform-level actions use their own gym. */
  gymId: string;
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only audit trail writer. Never throws into the request flow: a
 * failed audit write is logged but does not roll back the business operation.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write AuditLog:', err);
  }
}

export function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } }): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}
