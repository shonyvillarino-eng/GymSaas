import type { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { parseOrThrow } from '../validations/schemas.js';
import { writeAudit, clientIp } from '../services/audit.js';
import {
  createAnnouncementNotifications,
  resolveAnnouncementAudience,
  visibleAnnouncementWhere,
} from '../services/announcements.js';

function getGymId(req: Request) {
  const gymId = req.auth?.gymId;
  if (!gymId) throw new AppError('Gym context required', 403);
  return gymId;
}

const NOTIFICATION_TYPES = [
  'MEMBERSHIP_EXPIRING', 'MEMBERSHIP_EXPIRED', 'MEMBERSHIP_RENEWED', 'MEMBERSHIP_STATUS',
  'ROUTINE_ASSIGNED', 'ROUTINE_UPDATED', 'ROUTINE_REPLACED',
  'PAYMENT_REGISTERED', 'PAYMENT_VOIDED', 'PAYMENT_PENDING',
  'ANNOUNCEMENT', 'GENERAL', 'INSTRUCTOR_NOTICE',
] as const;

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    type: z.enum(NOTIFICATION_TYPES).optional(),
    status: z.enum(['all', 'unread', 'read']).default('all'),
  })
  .strict();

export async function getNotifications(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  const q = parseOrThrow(listQuerySchema, req.query);

  const where = {
    gymId,
    userId,
    ...(q.type ? { type: q.type } : {}),
    ...(q.status === 'unread' ? { isRead: false } : q.status === 'read' ? { isRead: true } : {}),
  };

  const [data, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        link: true,
        isRead: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { gymId, userId, isRead: false } }),
  ]);

  res.json({
    data,
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      unread,
    },
  });
}

export async function getUnreadCount(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  const count = await prisma.notification.count({ where: { gymId, userId, isRead: false } });
  res.json({ data: { count } });
}

export async function markAsRead(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const notification = await prisma.notification.findFirst({ where: { id, gymId, userId } });
  if (!notification) throw new AppError('Notification not found', 404);
  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: notification.readAt ?? new Date() },
  });
  res.json({ data: updated });
}

export async function markAllAsRead(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  await prisma.notification.updateMany({
    where: { gymId, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  res.json({ data: { success: true } });
}

/**
 * Personal feed of announcements. The audience, publication state and expiry
 * filter are resolved server-side from the authenticated session; no client
 * parameter can widen it.
 */
export async function getAnnouncements(req: Request, res: Response) {
  const gymId = getGymId(req);
  const auth = req.auth!;
  if (!auth.userId) throw new AppError('Authentication required', 401);

  const announcements = await prisma.announcement.findMany({
    where: visibleAnnouncementWhere({
      gymId,
      userId: auth.userId,
      role: auth.role,
    }),
    orderBy: { publishAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      audience: true,
      targetUserId: true,
      publishAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  res.json({ data: announcements });
}

/** Administrative list: drafts, archived and scheduled rows, same gym only. */
export async function manageAnnouncements(req: Request, res: Response) {
  const gymId = getGymId(req);
  const q = parseOrThrow(
    z
      .object({
        status: z.enum(['all', 'DRAFT', 'PUBLISHED', 'ARCHIVED']).default('all'),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
      })
      .strict(),
    req.query,
  );

  const where = { gymId, ...(q.status !== 'all' ? { status: q.status as never } : {}) };
  const [data, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        title: true,
        content: true,
        status: true,
        audience: true,
        targetUserId: true,
        publishAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.announcement.count({ where }),
  ]);
  res.json({
    data,
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  });
}

const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(5000),
    audience: z.enum(['ALL', 'MEMBERS', 'INSTRUCTORS', 'SPECIFIC_MEMBER', 'SPECIFIC_INSTRUCTOR']).default('ALL'),
    targetUserId: z.string().trim().min(1).max(64).optional(),
    expiresAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  })
  .strict();

export async function createAnnouncement(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  const input = parseOrThrow(createAnnouncementSchema, req.body);

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new AppError('Expiry date must be in the future', 400, {
      expiresAt: ['Expiry date must be in the future'],
    });
  }

  const targetUserId = await resolveAnnouncementAudience(gymId, input.audience, input.targetUserId);

  const announcement = await prisma.announcement.create({
    data: {
      gymId,
      authorId: userId,
      title: input.title,
      content: input.content,
      audience: input.audience,
      targetUserId,
      expiresAt,
      status: 'DRAFT',
    },
  });

  await writeAudit({
    gymId,
    userId,
    action: 'CREATE',
    entityType: 'Announcement',
    entityId: announcement.id,
    newValues: { title: announcement.title, audience: announcement.audience, status: announcement.status },
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });

  res.status(201).json({ data: announcement });
}

export async function publishAnnouncement(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const announcement = await prisma.announcement.findFirst({ where: { id, gymId } });
  if (!announcement) throw new AppError('Announcement not found', 404);
  if (announcement.status === 'ARCHIVED') {
    throw new AppError('Archived announcements cannot be published', 409);
  }

  const now = new Date();
  if (announcement.expiresAt && announcement.expiresAt.getTime() <= now.getTime()) {
    throw new AppError('Expired announcements cannot be published', 409);
  }

  // Re-validate the stored target: membership may have changed since creation.
  const targetUserId = await resolveAnnouncementAudience(
    gymId,
    announcement.audience,
    announcement.targetUserId,
  );

  const updated = await prisma.announcement.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      targetUserId,
      publishAt: announcement.publishAt ?? now,
    },
  });

  // Idempotent: the unique dedupeKey prevents duplicates on repeated publishes.
  const notified = await createAnnouncementNotifications(updated);

  await writeAudit({
    gymId,
    userId,
    action: 'UPDATE',
    entityType: 'Announcement',
    entityId: updated.id,
    newValues: { status: 'PUBLISHED', audience: updated.audience, notified },
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });

  res.json({ data: updated, meta: { notified } });
}

export async function archiveAnnouncement(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const announcement = await prisma.announcement.findFirst({ where: { id, gymId } });
  if (!announcement) throw new AppError('Announcement not found', 404);
  const updated = await prisma.announcement.update({
    where: { id },
    data: { status: 'ARCHIVED' },
  });

  await writeAudit({
    gymId,
    userId,
    action: 'UPDATE',
    entityType: 'Announcement',
    entityId: updated.id,
    newValues: { status: 'ARCHIVED' },
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });

  res.json({ data: updated });
}

export async function getMyNotificationPreferences(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  let prefs = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!prefs) {
    prefs = await prisma.notificationPreference.create({
      data: { userId, gymId },
    });
  }
  res.json({ data: prefs });
}

const prefSchema = z
  .object({
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
    membershipAlerts: z.boolean().optional(),
    routineAlerts: z.boolean().optional(),
    paymentAlerts: z.boolean().optional(),
    generalAlerts: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export async function updateMyNotificationPreferences(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  const input = parseOrThrow(prefSchema, req.body);
  const prefs = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, gymId, ...input },
    update: input,
  });
  res.json({ data: prefs });
}
