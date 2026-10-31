import type { Request, Response } from 'express';
import { Prisma, type Prisma as PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { generateRawToken, hashToken } from '../lib/tokens.js';
import { AppError } from '../middlewares/errorHandler.js';
import { clientIp, writeAudit } from '../services/audit.js';
import {
  createGymSchema,
  idParamSchema,
  listGymsQuerySchema,
  pageQuerySchema,
  parseOrThrow,
  suspendGymSchema,
  updateGymSchema,
} from '../validations/schemas.js';

const SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const gymSummarySelect = {
  id: true,
  name: true,
  slug: true,
  legalName: true,
  taxId: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  province: true,
  country: true,
  timezone: true,
  isActive: true,
  suspendedAt: true,
  suspensionReason: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      memberProfiles: true,
      instructorProfiles: true,
      memberships: true,
      plans: true,
      payments: true,
      routines: true,
      attendances: true,
    },
  },
  memberships: {
    where: { role: 'GYM_ADMIN' as const, isActive: true },
    take: 1,
    select: {
      joinedAt: true,
      user: { select: { id: true, fullName: true, email: true, phone: true, isActive: true } },
    },
  },
} satisfies PrismaClient.GymSelect;

function gymAdmin(gym: { memberships: { joinedAt: Date; user: unknown }[] }) {
  const admin = gym.memberships[0];
  if (!admin) return null;
  const user = admin.user as { id: string; fullName: string; email: string; phone: string | null; isActive: boolean };
  return { ...user, joinedAt: admin.joinedAt };
}

function mapGym<T extends { memberships: unknown[] }>(gym: T) {
  const { memberships, ...rest } = gym;
  return { ...rest, admin: gymAdmin({ memberships } as { memberships: { joinedAt: Date; user: unknown }[] }) };
}

function requireParam(req: Request): string {
  return parseOrThrow(idParamSchema, req.params.id);
}

function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/* ================================================================== */
/* Dashboard                                                           */
/* ================================================================== */

export async function getDashboard(_req: Request, res: Response) {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [totalGyms, activeGyms, suspendedGyms, gymsThisMonth, totalMembers, totalInstructors, trend] =
    await Promise.all([
      prisma.gym.count(),
      prisma.gym.count({ where: { isActive: true } }),
      prisma.gym.count({ where: { isActive: false } }),
      prisma.gym.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.memberProfile.count(),
      prisma.instructorProfile.count(),
      prisma.$queryRaw<Array<{ month: string; count: number }>>`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
               COUNT(*)::int AS count
        FROM "Gym"
        WHERE "createdAt" >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1
        ORDER BY 1`,
    ]);

  res.json({
    totalGyms,
    activeGyms,
    suspendedGyms,
    gymsThisMonth,
    totalMembers,
    totalInstructors,
    registrationTrend: trend,
    statusDistribution: [
      { status: 'ACTIVE', count: activeGyms },
      { status: 'SUSPENDED', count: suspendedGyms },
    ],
  });
}

/* ================================================================== */
/* List (backend pagination, search, filter, sort)                     */
/* ================================================================== */

export async function listGyms(req: Request, res: Response) {
  const q = parseOrThrow(listGymsQuerySchema, req.query);

  const where: PrismaClient.GymWhereInput = {
    ...(q.status !== 'all' ? { isActive: q.status === 'active' } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { slug: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.gym.count({ where }),
    prisma.gym.findMany({
      where,
      orderBy: { [q.sort]: q.order },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: gymSummarySelect,
    }),
  ]);

  res.json({
    data: rows.map(mapGym),
    meta: pageMeta(q.page, q.pageSize, total),
  });
}

/* ================================================================== */
/* Detail                                                              */
/* ================================================================== */

export async function getGymDetail(req: Request, res: Response) {
  const id = requireParam(req);
  const gym = await prisma.gym.findUnique({ where: { id }, select: gymSummarySelect });
  if (!gym) throw new AppError('Gym not found', 404);

  res.json({ data: mapGym(gym) });
}

/* ================================================================== */
/* Create gym + initial administrator (single transaction)             */
/* ================================================================== */

export async function createGym(req: Request, res: Response) {
  const input = parseOrThrow(createGymSchema, req.body);

  const [slugTaken, emailTaken] = await Promise.all([
    prisma.gym.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: input.adminEmail }, select: { id: true } }),
  ]);
  if (slugTaken) throw new AppError('Identifier already in use', 409, { slug: ['Already in use'] });
  if (emailTaken) {
    throw new AppError('An account with this administrator email already exists', 409, {
      adminEmail: ['Already in use'],
    });
  }

  const setupToken = generateRawToken();
  const tokenHash = hashToken(setupToken);
  // Unusable placeholder hash: the account cannot sign in until the setup
  // token is redeemed and a real password is chosen.
  const placeholderHash = await hashPassword(generateRawToken());

  const gym = await prisma.$transaction(async (tx) => {
    const created = await tx.gym.create({
      data: {
        name: input.name,
        slug: input.slug,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        province: input.province ?? null,
        country: input.country ?? null,
        timezone: input.timezone ?? 'UTC',
        isActive: true,
      },
    });

    const adminUser = await tx.user.create({
      data: {
        email: input.adminEmail,
        fullName: input.adminFullName,
        role: 'GYM_ADMIN',
        passwordHash: placeholderHash,
        isActive: false, // activated when the setup token is redeemed
      },
    });

    await tx.gymMembership.create({
      data: { gymId: created.id, userId: adminUser.id, role: 'GYM_ADMIN', isActive: true },
    });

    // Defense in depth: exactly one active admin for this gym
    // (the partial unique index is the race-safe enforcement).
    const adminCount = await tx.gymMembership.count({
      where: { gymId: created.id, role: 'GYM_ADMIN', isActive: true },
    });
    if (adminCount !== 1) {
      throw new AppError('Could not assign a single active administrator', 500);
    }

    await tx.authToken.create({
      data: {
        userId: adminUser.id,
        tokenHash,
        type: 'SETUP',
        expiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS),
      },
    });

    return created;
  });

  await writeAudit({
    gymId: gym.id,
    userId: req.auth!.userId,
    action: 'CREATE',
    entityType: 'Gym',
    entityId: gym.id,
    newValues: { name: gym.name, slug: gym.slug, adminEmail: input.adminEmail },
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });

  const origin = env.CORS_ORIGIN.split(',')[0]?.trim() ?? 'http://localhost:5173';

  res.status(201).json({
    data: { id: gym.id, name: gym.name, slug: gym.slug, createdAt: gym.createdAt },
    // Returned exactly once; only its hash is stored server-side.
    setupToken,
    setupUrl: `${origin}/complete-setup#token=${encodeURIComponent(setupToken)}`,
    setupExpiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS).toISOString(),
  });
}

/* ================================================================== */
/* Update commercial / contact data                                    */
/* ================================================================== */

export async function updateGym(req: Request, res: Response) {
  const id = requireParam(req);
  const input = parseOrThrow(updateGymSchema, req.body);

  const existing = await prisma.gym.findUnique({ where: { id }, select: { id: true, slug: true } });
  if (!existing) throw new AppError('Gym not found', 404);

  if (input.slug && input.slug !== existing.slug) {
    const taken = await prisma.gym.findUnique({ where: { slug: input.slug }, select: { id: true } });
    if (taken) throw new AppError('Identifier already in use', 409, { slug: ['Already in use'] });
  }

  const data: PrismaClient.GymUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.address !== undefined) data.address = input.address;
  if (input.city !== undefined) data.city = input.city;
  if (input.province !== undefined) data.province = input.province;
  if (input.country !== undefined) data.country = input.country;
  if (input.timezone !== undefined && input.timezone !== null) data.timezone = input.timezone;

  const updated = await prisma.gym.update({ where: { id }, data, select: gymSummarySelect });

  await writeAudit({
    gymId: id,
    userId: req.auth!.userId,
    action: 'UPDATE',
    entityType: 'Gym',
    entityId: id,
    newValues: { ...input },
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });

  res.json({ data: mapGym(updated) });
}

/* ================================================================== */
/* Suspend / reactivate                                                */
/* ================================================================== */

export async function suspendGym(req: Request, res: Response) {
  const id = requireParam(req);
  const { reason } = parseOrThrow(suspendGymSchema, req.body);

  const gym = await prisma.gym.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });
  if (!gym) throw new AppError('Gym not found', 404);
  if (!gym.isActive) throw new AppError('Gym is already suspended', 409);

  const suspendedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.gym.update({
      where: { id },
      data: { isActive: false, suspendedAt, suspensionReason: reason },
      select: gymSummarySelect,
    });

    // Store the suspension timestamp on memberships disabled here. This lets
    // reactivation restore only those memberships, preserving prior leavers.
    await tx.gymMembership.updateMany({
      where: { gymId: id, isActive: true },
      data: { isActive: false, leftAt: suspendedAt },
    });

    return result;
  });

  await writeAudit({
    gymId: id,
    userId: req.auth!.userId,
    action: 'UPDATE',
    entityType: 'Gym',
    entityId: id,
    oldValues: { isActive: true },
    newValues: { isActive: false, suspensionReason: reason },
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });

  res.json({ data: mapGym(updated) });
}

export async function reactivateGym(req: Request, res: Response) {
  const id = requireParam(req);

  const gym = await prisma.gym.findUnique({
    where: { id },
    select: { id: true, isActive: true, suspendedAt: true },
  });
  if (!gym) throw new AppError('Gym not found', 404);
  if (gym.isActive) throw new AppError('Gym is already active', 409);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.gym.update({
      where: { id },
      data: { isActive: true, suspendedAt: null, suspensionReason: null },
      select: gymSummarySelect,
    });

    // Restore only memberships disabled by this suspension; memberships that
    // had already ended before suspension retain their inactive state.
    if (gym.suspendedAt) {
      await tx.gymMembership.updateMany({
        where: { gymId: id, isActive: false, leftAt: gym.suspendedAt },
        data: { isActive: true, leftAt: null },
      });
    }

    return result;
  });

  await writeAudit({
    gymId: id,
    userId: req.auth!.userId,
    action: 'RESTORE',
    entityType: 'Gym',
    entityId: id,
    oldValues: { isActive: false },
    newValues: { isActive: true },
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });

  res.json({ data: mapGym(updated) });
}

/* ================================================================== */
/* Detail tabs: instructors, members, activity                         */
/* ================================================================== */

export async function listGymInstructors(req: Request, res: Response) {
  const id = requireParam(req);
  const q = parseOrThrow(pageQuerySchema, req.query);

  const [total, rows] = await Promise.all([
    prisma.instructorProfile.count({ where: { gymId: id } }),
    prisma.instructorProfile.findMany({
      where: { gymId: id },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        specialization: true,
        certifications: true,
        isAvailable: true,
        maxMembers: true,
        createdAt: true,
        _count: { select: { members: true } },
        user: { select: { id: true, fullName: true, email: true, phone: true, isActive: true } },
      },
    }),
  ]);

  res.json({ data: rows, meta: pageMeta(q.page, q.pageSize, total) });
}

export async function listGymMembers(req: Request, res: Response) {
  const id = requireParam(req);
  const q = parseOrThrow(pageQuerySchema, req.query);

  const [total, rows] = await Promise.all([
    prisma.memberProfile.count({ where: { gymId: id } }),
    prisma.memberProfile.findMany({
      where: { gymId: id },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        fitnessLevel: true,
        goals: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, email: true, phone: true, isActive: true } },
      },
    }),
  ]);

  res.json({ data: rows, meta: pageMeta(q.page, q.pageSize, total) });
}

export async function listGymActivity(req: Request, res: Response) {
  const id = requireParam(req);
  const q = parseOrThrow(pageQuerySchema, req.query);

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where: { gymId: id } }),
    prisma.auditLog.findMany({
      where: { gymId: id },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        newValues: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { fullName: true, email: true } },
      },
    }),
  ]);

  res.json({ data: rows, meta: pageMeta(q.page, q.pageSize, total) });
}
