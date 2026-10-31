import type { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { parseOrThrow } from '../validations/schemas.js';

const SENSITIVE_KEY = /pass(word)?|secret|token|hash|cookie|authorization|credential|api[-_]?key/i;

/**
 * Removes authentication material and personal secrets from stored JSON before
 * exposing an audit row. Audit rows are append-only, so redaction happens at
 * read time and never mutates the trail.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[redacted: depth]';
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(entry, depth + 1);
    }
    return output;
  }
  if (typeof value === 'string' && value.length > 1000) return `${value.slice(0, 1000)}…`;
  return value;
}

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    action: z
      .enum([
        'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT',
        'ASSIGN', 'UNASSIGN', 'PAYMENT_REGISTERED', 'ATTENDANCE_MARKED', 'ROUTINE_ASSIGNED',
      ])
      .optional(),
    entityType: z.string().trim().max(80).optional(),
    userId: z.string().trim().max(64).optional(),
    search: z.string().trim().max(120).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
    sort: z.enum(['asc', 'desc']).default('desc'),
    gymId: z.string().trim().max(64).optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'End date must be on or after start date.',
  });

export async function listAuditLogs(req: Request, res: Response) {
  const auth = req.auth;
  if (!auth) throw new AppError('Authentication required', 401);
  if (auth.role !== 'GYM_ADMIN' && auth.role !== 'SUPER_ADMIN') {
    throw new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' });
  }

  const q = parseOrThrow(querySchema, req.query);

  // Gym administrators are always scoped to their session gym. A global
  // administrator may optionally narrow by gym, but never inherits a tenant.
  const gymId = auth.role === 'GYM_ADMIN' ? auth.gymId : q.gymId;
  if (auth.role === 'GYM_ADMIN' && !gymId) {
    throw new AppError('Gym context required', 403);
  }

  const from = q.from ? new Date(`${q.from}T00:00:00.000Z`) : undefined;
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : undefined;

  const where = {
    ...(gymId ? { gymId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(q.search
      ? {
          OR: [
            { entityId: { contains: q.search, mode: 'insensitive' as const } },
            { entityType: { contains: q.search, mode: 'insensitive' as const } },
            {
              user: {
                OR: [
                  { fullName: { contains: q.search, mode: 'insensitive' as const } },
                  { email: { contains: q.search, mode: 'insensitive' as const } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: q.sort },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        gymId: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        createdAt: true,
        oldValues: true,
        newValues: true,
        user: { select: { id: true, fullName: true, email: true, role: true } },
        gym: { select: { id: true, name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({
    data: rows.map((row) => {
      const newValues = redact(row.newValues) as Record<string, unknown> | null;
      return {
        id: row.id,
        gymId: row.gymId,
        gymName: row.gym.name,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt,
        actor: row.user
          ? { id: row.user.id, fullName: row.user.fullName, email: row.user.email, role: row.user.role }
          : null,
        // Only reported when the application actually stored it; never inferred.
        result: newValues && typeof newValues.result === 'string' ? newValues.result : null,
        oldValues: redact(row.oldValues),
        newValues,
      };
    }),
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      scope: auth.role === 'GYM_ADMIN' ? 'gym' : 'global',
    },
  });
}
