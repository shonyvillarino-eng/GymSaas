import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { parseOrThrow } from '../validations/schemas.js';
import { z } from 'zod';

function getGymId(req: Request) {
  const gymId = req.auth?.gymId;
  if (!gymId) throw new AppError('Gym context required', 403);
  return gymId;
}

export async function getNotifications(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  const page = 1;
  const pageSize = 20;

  const [data, total] = await Promise.all([
    prisma.notification.findMany({
      where: { gymId, userId },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: pageSize,
    }),
    prisma.notification.count({ where: { gymId, userId } }),
  ]);

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
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
    data: { isRead: true, readAt: new Date() },
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

export async function getAnnouncements(req: Request, res: Response) {
  const gymId = getGymId(req);
  const announcements = await prisma.announcement.findMany({
    where: { gymId, status: 'PUBLISHED' },
    orderBy: { publishAt: 'desc' },
  });
  res.json({ data: announcements });
}

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  audience: z.enum(['ALL', 'MEMBERS', 'INSTRUCTORS', 'SPECIFIC_MEMBER', 'SPECIFIC_INSTRUCTOR']).default('ALL'),
  targetUserId: z.string().optional(),
  expiresAt: z.string().optional(),
}).strict();

export async function createAnnouncement(req: Request, res: Response) {
  const gymId = getGymId(req);
  const userId = req.auth!.userId;
  const input = parseOrThrow(createAnnouncementSchema, req.body);
  const announcement = await prisma.announcement.create({
    data: {
      gymId,
      authorId: userId,
      title: input.title,
      content: input.content,
      audience: input.audience as any,
      targetUserId: input.targetUserId || null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      status: 'DRAFT',
    },
  });
  res.status(201).json({ data: announcement });
}

export async function publishAnnouncement(req: Request, res: Response) {
  const gymId = getGymId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const announcement = await prisma.announcement.findFirst({ where: { id, gymId } });
  if (!announcement) throw new AppError('Announcement not found', 404);
  const updated = await prisma.announcement.update({
    where: { id },
    data: { status: 'PUBLISHED', publishAt: new Date() },
  });
  res.json({ data: updated });
}

export async function archiveAnnouncement(req: Request, res: Response) {
  const gymId = getGymId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const announcement = await prisma.announcement.findFirst({ where: { id, gymId } });
  if (!announcement) throw new AppError('Announcement not found', 404);
  const updated = await prisma.announcement.update({ where: { id }, data: { status: 'ARCHIVED' } });
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

const prefSchema = z.object({
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
  membershipAlerts: z.boolean().optional(),
  routineAlerts: z.boolean().optional(),
  paymentAlerts: z.boolean().optional(),
  generalAlerts: z.boolean().optional(),
}).strict();

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
