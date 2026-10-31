import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { clientIp, writeAudit } from '../services/audit.js';
import { parseOrThrow } from '../validations/schemas.js';
import { gymPreferencesSchema, gymProfileUpdateSchema, passwordChangeSchema, profileUpdateSchema } from '../validations/gym-admin.schemas.js';
import { uploadGymLogo } from '../lib/objectStorage.js';
import { preferencesFromSettings } from '../services/gymPreferences.js';

function gymIdFromSession(req: Request) {
  if (req.auth?.role !== 'GYM_ADMIN' || !req.auth.gymId) {
    throw new AppError('Gym administrator access required', 403, { code: 'FORBIDDEN' });
  }
  return req.auth.gymId;
}

async function audit(req: Request, gymId: string, entityType: string, newValues: Prisma.InputJsonValue, oldValues?: Prisma.InputJsonValue) {
  await writeAudit({
    gymId,
    userId: req.auth?.userId ?? null,
    action: 'UPDATE',
    entityType,
    entityId: gymId,
    ...(oldValues ? { oldValues } : {}),
    newValues,
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });
}

export async function getMyGym(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await prisma.gym.findFirst({
    where: { id: gymId, isActive: true },
    select: {
      id: true, name: true, email: true, phone: true, address: true, city: true,
      province: true, postalCode: true, country: true, timezone: true, currency: true,
      logoUrl: true, isActive: true, settings: true, createdAt: true, updatedAt: true,
      _count: { select: { memberProfiles: true, instructorProfiles: true, plans: true, subscriptions: true } },
    },
  });
  if (!gym) throw new AppError('Gym not found', 404);
  const { settings, ...safeGym } = gym;
  res.json({ data: { ...safeGym, preferences: preferencesFromSettings(settings) } });
}

export async function updateMyGym(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const input = parseOrThrow(gymProfileUpdateSchema, req.body);
  const current = await prisma.gym.findFirst({ where: { id: gymId, isActive: true }, select: {
    id: true, name: true, email: true, phone: true, address: true, city: true,
    province: true, postalCode: true, country: true, timezone: true, currency: true, logoUrl: true,
  } });
  if (!current) throw new AppError('Gym not found', 404);

  const changed = await prisma.gym.updateMany({ where: { id: gymId, isActive: true }, data: input });
  if (changed.count !== 1) throw new AppError('Gym is suspended or unavailable', 403);
  const updated = await prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: {
    id: true, name: true, email: true, phone: true, address: true, city: true,
    province: true, postalCode: true, country: true, timezone: true, currency: true, logoUrl: true,
    updatedAt: true,
  } });
  await audit(req, gymId, 'GymProfile', input as Prisma.InputJsonValue, current as unknown as Prisma.InputJsonValue);
  res.json({ data: updated });
}

export async function uploadMyGymLogo(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const file = req.file;
  if (!file) throw new AppError('Choose an image file to upload.', 400);
  const activeGym = await prisma.gym.findFirst({ where: { id: gymId, isActive: true }, select: { logoUrl: true } });
  if (!activeGym) throw new AppError('Gym is suspended or unavailable', 403);
  const result = await uploadGymLogo(gymId, file);
  const changed = await prisma.gym.updateMany({ where: { id: gymId, isActive: true }, data: { logoUrl: result.url } });
  if (changed.count !== 1) throw new AppError('Gym is suspended or unavailable', 403);
  const updated = await prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { id: true, logoUrl: true, updatedAt: true } });
  await audit(req, gymId, 'GymLogo', { objectKey: result.key }, activeGym.logoUrl ? { logoUrl: activeGym.logoUrl } : undefined);
  res.status(201).json({ data: updated });
}

export async function getMyPreferences(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await prisma.gym.findFirst({ where: { id: gymId, isActive: true }, select: { settings: true } });
  if (!gym) throw new AppError('Gym not found', 404);
  res.json({ data: preferencesFromSettings(gym.settings) });
}

export async function updateMyPreferences(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const preferences = parseOrThrow(gymPreferencesSchema, req.body);
  const current = await prisma.gym.findFirst({ where: { id: gymId, isActive: true }, select: { settings: true } });
  if (!current) throw new AppError('Gym not found', 404);
  const previous = preferencesFromSettings(current.settings);
  const changed = await prisma.$transaction((tx) => tx.$executeRaw`
    UPDATE "Gym"
    SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{preferences}', ${JSON.stringify(preferences)}::jsonb, true),
        "updatedAt" = NOW()
    WHERE "id" = ${gymId} AND "isActive" = true
  `);
  if (changed !== 1) throw new AppError('Gym is suspended or unavailable', 403);
  await audit(req, gymId, 'GymPreferences', preferences as unknown as Prisma.InputJsonValue, previous as unknown as Prisma.InputJsonValue);
  res.json({ data: preferences });
}

/**
 * GET /gym/instructors — active instructors of this gym.
 * Used by the members module for filtering and primary-instructor assignment.
 */
export async function listMyGymInstructors(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const instructors = await prisma.instructorProfile.findMany({
    where: { gymId, isAvailable: true, gym: { isActive: true } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, isAvailable: true, user: { select: { fullName: true, email: true } } },
  });
  res.json({
    data: instructors.map((instructor) => ({
      id: instructor.id,
      fullName: instructor.user.fullName,
      email: instructor.user.email,
      isAvailable: instructor.isAvailable,
    })),
  });
}

export async function getMyProfile(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const user = await prisma.user.findFirst({
    where: { id: req.auth!.userId, isActive: true, memberships: { some: { gymId, role: 'GYM_ADMIN', isActive: true } } },
    select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, role: true, createdAt: true },
  });
  if (!user) throw new AppError('Administrator profile not found', 404);
  res.json({ data: user });
}

export async function updateMyProfile(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const input = parseOrThrow(profileUpdateSchema, req.body);
  const current = await prisma.user.findFirst({
    where: { id: req.auth!.userId, memberships: { some: { gymId, role: 'GYM_ADMIN', isActive: true } } },
    select: { id: true, fullName: true, phone: true },
  });
  if (!current) throw new AppError('Administrator profile not found', 404);
  const updated = await prisma.user.update({
    where: { id: current.id }, data: input,
    select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, role: true },
  });
  await audit(req, gymId, 'GymAdminProfile', input as Prisma.InputJsonValue, { fullName: current.fullName, phone: current.phone });
  res.json({ data: updated });
}

export async function changeMyPassword(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const input = parseOrThrow(passwordChangeSchema, req.body);
  const user = await prisma.user.findFirst({
    where: { id: req.auth!.userId, memberships: { some: { gymId, role: 'GYM_ADMIN', isActive: true } } },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new AppError('Administrator profile not found', 404);
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError('Current password is incorrect', 400, { currentPassword: ['Current password is incorrect'] });
  }
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash }, select: { id: true } });
  await audit(req, gymId, 'GymAdminPassword', { passwordChanged: true });
  res.status(204).end();
}
