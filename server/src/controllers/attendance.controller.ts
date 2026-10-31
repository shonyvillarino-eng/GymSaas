import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { clientIp, writeAudit } from '../services/audit.js';
import { idParamSchema, parseOrThrow } from '../validations/schemas.js';
import {
  attendanceListQuerySchema,
  eligibilityQuerySchema,
  manualCheckInSchema,
  memberAttendanceQuerySchema,
  qrCheckInSchema,
} from '../validations/attendance.schemas.js';
import {
  attendanceSelect,
  evaluateAccess,
  findMemberForCheckIn,
  generateQrToken,
  gymDayRange,
  memberFromQrToken,
  qrPayload,
  registerCheckIn,
  weeklyBuckets,
} from '../services/attendance.js';
import { gymCalendarDate, startOfGymDate } from '../services/financial.js';
import { loadGymPreferences } from '../services/gymPreferences.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Gym always comes from the authenticated session, never from the request. */
function gymIdFromSession(req: Request) {
  if (!req.auth?.gymId) throw new AppError('Gym access required', 403, { code: 'FORBIDDEN' });
  return req.auth.gymId;
}

async function audit(req: Request, gymId: string, entityType: string, entityId: string, newValues: Prisma.InputJsonValue) {
  await writeAudit({
    gymId,
    userId: req.auth?.userId ?? null,
    action: 'ATTENDANCE_MARKED',
    entityType,
    entityId,
    newValues,
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });
}

/** Only justified exceptions are audited: they are administrative decisions. */
async function auditException(
  req: Request,
  gymId: string,
  attendance: { id: string; memberId: string; method: string; result: string; exceptionReason: string | null },
) {
  if (attendance.result !== 'EXCEPTION') return;
  await audit(req, gymId, 'AttendanceException', attendance.id, {
    memberId: attendance.memberId,
    method: attendance.method,
    reason: attendance.exceptionReason,
    result: attendance.result,
  });
}

/** Membership attendance history of the authenticated member (self-service). */
async function membershipForSessionUser(req: Request, gymId: string) {
  const profile = await prisma.memberProfile.findFirst({
    where: { gymId, userId: req.auth!.userId },
    select: { id: true, status: true, user: { select: { fullName: true, avatarUrl: true } } },
  });
  if (!profile) throw new AppError('Member profile not found', 404);
  return profile;
}

/**
 * INSTRUCTOR access is limited to members currently assigned to them.
 * Checked in the database on every request — never taken from the client.
 */
async function assertInstructorCanSeeMember(req: Request, gymId: string, memberId: string) {
  if (req.auth?.role === 'GYM_ADMIN') return;
  if (req.auth?.role !== 'INSTRUCTOR') {
    throw new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' });
  }
  const instructor = await prisma.instructorProfile.findFirst({
    where: { gymId, userId: req.auth.userId },
    select: { id: true },
  });
  if (!instructor) throw new AppError('Instructor profile not found', 403, { code: 'FORBIDDEN' });
  const assignment = await prisma.instructorMember.findFirst({
    where: { gymId, instructorId: instructor.id, memberId, isActive: true },
    select: { id: true },
  });
  if (!assignment) {
    throw new AppError('You can only consult members assigned to you', 403, { code: 'NOT_ASSIGNED' });
  }
}

function rangeFilter(from: string | undefined, to: string | undefined, timezone: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: startOfGymDate(from, timezone) } : {}),
    ...(to ? { lte: new Date(startOfGymDate(to, timezone).getTime() + 86_400_000 - 1) } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

/**
 * GET /attendance/eligibility?memberId=... | ?code=...
 * Read-only preview used by the reception desk before recording an entry.
 */
export async function getEligibility(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const query = parseOrThrow(eligibilityQuerySchema, req.query);
  const gym = await loadGymPreferences(gymId);
  if (!gym) throw new AppError('Gym not found', 404);

  const memberId = query.code ? (await memberFromQrToken(gymId, query.code)).id : (query.memberId as string);
  const member = await findMemberForCheckIn(prisma, gymId, memberId);
  const now = new Date();
  const decision = evaluateAccess(member, gym.preferences.attendancePolicy, now);

  const { start: dayStart, end: dayEnd } = await gymDayRange(gymId);
  const [lastAttendance, todayCount] = await Promise.all([
    prisma.attendance.findFirst({
      where: { gymId, memberId, deletedAt: null },
      orderBy: { checkInTime: 'desc' },
      select: { id: true, checkInTime: true, method: true, result: true },
    }),
    prisma.attendance.count({ where: { gymId, memberId, deletedAt: null, checkInTime: { gte: dayStart, lte: dayEnd } } }),
  ]);

  res.json({
    data: {
      ...decision,
      lastAttendance,
      todayCount,
      duplicateWindowMinutes: gym.preferences.attendanceDuplicateToleranceMinutes,
      gym: { name: gym.name, currency: gym.currency, timezone: gym.timezone, logoUrl: gym.logoUrl },
      qr: query.code ? { scanned: true } : { scanned: false },
    },
  });
}

/* ------------------------------------------------------------------ */
/* Check-in                                                            */
/* ------------------------------------------------------------------ */

export async function manualCheckIn(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const input = parseOrThrow(manualCheckInSchema, req.body);
  const result = await registerCheckIn({
    gymId,
    memberId: input.memberId,
    method: 'MANUAL',
    userId: req.auth!.userId,
    notes: input.notes ?? null,
    exceptionReason: input.exceptionReason ?? null,
  });
  await auditException(req, gymId, result.attendance);
  res.status(201).json({ data: result });
}

export async function qrCheckIn(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const input = parseOrThrow(qrCheckInSchema, req.body);
  const resolved = await memberFromQrToken(gymId, input.code);
  const result = await registerCheckIn({
    gymId,
    memberId: resolved.id,
    method: 'QR',
    userId: req.auth!.userId,
    notes: input.notes ?? null,
    exceptionReason: input.exceptionReason ?? null,
  });
  await auditException(req, gymId, result.attendance);
  res.status(201).json({ data: result });
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export async function listAttendance(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const query = parseOrThrow(attendanceListQuerySchema, req.query);
  const gym = await prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { timezone: true } });

  const where: Prisma.AttendanceWhereInput = {
    gymId,
    deletedAt: null,
    ...(query.memberId ? { memberId: query.memberId } : {}),
    ...(query.method !== 'all' ? { method: query.method } : {}),
    ...(query.result !== 'all' ? { result: query.result } : {}),
    ...(rangeFilter(query.from, query.to, gym.timezone)
      ? { checkInTime: rangeFilter(query.from, query.to, gym.timezone) }
      : {}),
    ...(query.search
      ? {
          member: {
            OR: [
              { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
              { documentNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      orderBy: { checkInTime: query.order },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: attendanceSelect,
    }),
  ]);

  res.json({
    data: rows,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  });
}

export async function getAttendance(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const id = parseOrThrow(idParamSchema, req.params.id);
  const record = await prisma.attendance.findFirst({
    where: { id, gymId, deletedAt: null },
    select: attendanceSelect,
  });
  if (!record) throw new AppError('Attendance record not found', 404);
  res.json({ data: record });
}

/** GET /attendance/member/:memberId — admin, or the instructor it is assigned to. */
export async function memberAttendance(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const memberId = parseOrThrow(idParamSchema, req.params.memberId);
  const query = parseOrThrow(memberAttendanceQuerySchema, req.query);
  await assertInstructorCanSeeMember(req, gymId, memberId);

  const member = await prisma.memberProfile.findFirst({
    where: { id: memberId, gymId },
    select: {
      id: true,
      status: true,
      joinDate: true,
      user: { select: { fullName: true, avatarUrl: true } },
      subscriptions: {
        where: { cancelledAt: null },
        orderBy: { endDate: 'desc' },
        take: 1,
        select: { status: true, startDate: true, endDate: true, planNameAtPurchase: true },
      },
    },
  });
  if (!member) throw new AppError('Member not found', 404);

  const gym = await prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { timezone: true } });
  const range = rangeFilter(query.from, query.to, gym.timezone);
  const where: Prisma.AttendanceWhereInput = {
    gymId,
    memberId,
    deletedAt: null,
    ...(range ? { checkInTime: range } : {}),
  };

  const now = new Date();
  const monthStart = startOfGymDate(`${gymCalendarDate(now, gym.timezone).slice(0, 7)}-01`, gym.timezone);
  const [total, rows, monthCount, lastVisit, weekTimes] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      orderBy: { checkInTime: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: attendanceSelect,
    }),
    prisma.attendance.count({ where: { gymId, memberId, deletedAt: null, checkInTime: { gte: monthStart } } }),
    prisma.attendance.findFirst({
      where: { gymId, memberId, deletedAt: null },
      orderBy: { checkInTime: 'desc' },
      select: { checkInTime: true },
    }),
    prisma.attendance.findMany({
      where: {
        gymId,
        memberId,
        deletedAt: null,
        checkInTime: { gte: new Date(now.getTime() - 56 * 86_400_000) },
      },
      select: { checkInTime: true },
    }),
  ]);

  const times = weekTimes.map((row) => row.checkInTime);
  const last28 = times.filter((time) => time >= new Date(now.getTime() - 28 * 86_400_000)).length;

  res.json({
    data: {
      member: {
        id: member.id,
        fullName: member.user.fullName,
        photoUrl: member.user.avatarUrl,
        status: member.status,
        joinDate: member.joinDate,
        membership: member.subscriptions[0] ?? null,
      },
      records: rows,
      stats: {
        total,
        thisMonth: monthCount,
        lastVisitAt: lastVisit?.checkInTime ?? null,
        averagePerWeek: Number((last28 / 4).toFixed(1)),
        weekly: weeklyBuckets(times, gym.timezone, 8),
      },
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    },
  });
}

/** GET /attendance/me — the member's own history. */
export async function myAttendance(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const profile = await membershipForSessionUser(req, gymId);
  const gym = await prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { timezone: true } });
  const now = new Date();
  const monthStart = startOfGymDate(`${gymCalendarDate(now, gym.timezone).slice(0, 7)}-01`, gym.timezone);

  const [total, monthCount, lastVisit, rows, weekTimes] = await Promise.all([
    prisma.attendance.count({ where: { gymId, memberId: profile.id, deletedAt: null } }),
    prisma.attendance.count({ where: { gymId, memberId: profile.id, deletedAt: null, checkInTime: { gte: monthStart } } }),
    prisma.attendance.findFirst({
      where: { gymId, memberId: profile.id, deletedAt: null },
      orderBy: { checkInTime: 'desc' },
      select: { checkInTime: true },
    }),
    prisma.attendance.findMany({
      where: { gymId, memberId: profile.id, deletedAt: null },
      orderBy: { checkInTime: 'desc' },
      take: 50,
      select: attendanceSelect,
    }),
    prisma.attendance.findMany({
      where: {
        gymId,
        memberId: profile.id,
        deletedAt: null,
        checkInTime: { gte: new Date(now.getTime() - 56 * 86_400_000) },
      },
      select: { checkInTime: true },
    }),
  ]);

  res.json({
    data: {
      memberId: profile.id,
      fullName: profile.user.fullName,
      records: rows,
      stats: {
        total,
        thisMonth: monthCount,
        lastVisitAt: lastVisit?.checkInTime ?? null,
        weekly: weeklyBuckets(weekTimes.map((row) => row.checkInTime), gym.timezone, 8),
      },
    },
  });
}

/* ------------------------------------------------------------------ */
/* Reception dashboard                                                 */
/* ------------------------------------------------------------------ */

export async function attendanceStats(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const now = new Date();
  const { start: todayStart, end: todayEnd, timezone } = await gymDayRange(gymId);
  const todayKey = gymCalendarDate(now, timezone);
  const monthStart = startOfGymDate(`${todayKey.slice(0, 7)}-01`, timezone);
  const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000);
  const seriesStart = new Date(todayStart.getTime() - 13 * 86_400_000);

  const [seriesRows, todayRows, monthCount, recent, withoutValidMembership] = await Promise.all([
    prisma.attendance.findMany({
      where: { gymId, deletedAt: null, checkInTime: { gte: seriesStart } },
      select: { checkInTime: true, method: true, result: true },
    }),
    prisma.attendance.count({ where: { gymId, deletedAt: null, checkInTime: { gte: todayStart, lte: todayEnd } } }),
    prisma.attendance.count({ where: { gymId, deletedAt: null, checkInTime: { gte: monthStart } } }),
    prisma.attendance.findMany({
      where: { gymId, deletedAt: null },
      orderBy: { checkInTime: 'desc' },
      take: 10,
      select: attendanceSelect,
    }),
    prisma.memberProfile.count({
      where: {
        gymId,
        status: 'ACTIVE',
        subscriptions: {
          none: { cancelledAt: null, startDate: { lte: now }, endDate: { gte: now } },
        },
      },
    }),
  ]);

  const days = new Map<string, number>();
  for (let index = 13; index >= 0; index -= 1) {
    days.set(gymCalendarDate(new Date(todayStart.getTime() - index * 86_400_000), timezone), 0);
  }
  for (const row of seriesRows) {
    const key = gymCalendarDate(row.checkInTime, timezone);
    if (days.has(key)) days.set(key, (days.get(key) ?? 0) + 1);
  }

  const inToday = seriesRows.filter((row) => row.checkInTime >= todayStart && row.checkInTime <= todayEnd);
  const byMethod = (['MANUAL', 'QR'] as const).map((method) => ({
    method,
    count: inToday.filter((row) => row.method === method).length,
  }));

  res.json({
    data: {
      today: todayRows,
      todayManual: byMethod.find((entry) => entry.method === 'MANUAL')?.count ?? 0,
      todayQr: byMethod.find((entry) => entry.method === 'QR')?.count ?? 0,
      last7Days: seriesRows.filter((row) => row.checkInTime >= weekStart).length,
      thisMonth: monthCount,
      exceptionsToday: inToday.filter((row) => row.result === 'EXCEPTION').length,
      withoutValidMembership,
      series: Array.from(days, ([date, count]) => ({ date, count })),
      recent,
      timezone,
    },
  });
}

/* ------------------------------------------------------------------ */
/* QR credentials                                                      */
/* ------------------------------------------------------------------ */

async function credentialFor(gymId: string, memberId: string) {
  const member = await prisma.memberProfile.findFirst({
    where: { id: memberId, gymId },
    select: { id: true, qrToken: true, qrTokenCreatedAt: true, qrRevokedAt: true, user: { select: { fullName: true } } },
  });
  if (!member) throw new AppError('Member not found', 404);
  return {
    memberId: member.id,
    fullName: member.user.fullName,
    token: member.qrToken,
    payload: member.qrToken ? qrPayload(member.qrToken) : null,
    createdAt: member.qrTokenCreatedAt,
    revokedAt: member.qrRevokedAt,
  };
}

export async function getMemberCredential(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const memberId = parseOrThrow(idParamSchema, req.params.memberId);
  res.json({ data: await credentialFor(gymId, memberId) });
}

export async function regenerateMemberCredential(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const memberId = parseOrThrow(idParamSchema, req.params.memberId);
  const current = await prisma.memberProfile.findFirst({
    where: { id: memberId, gymId },
    select: { id: true, qrToken: true },
  });
  if (!current) throw new AppError('Member not found', 404);

  await prisma.memberProfile.update({
    where: { id: memberId },
    data: { qrToken: generateQrToken(), qrTokenCreatedAt: new Date(), qrRevokedAt: null },
  });
  await audit(req, gymId, 'MemberQrCredential', memberId, {
    action: current.qrToken ? 'REGENERATED' : 'CREATED',
    previousCredentialInvalidated: Boolean(current.qrToken),
  });
  res.status(201).json({ data: await credentialFor(gymId, memberId) });
}

export async function revokeMemberCredential(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const memberId = parseOrThrow(idParamSchema, req.params.memberId);
  const current = await prisma.memberProfile.findFirst({
    where: { id: memberId, gymId },
    select: { id: true, qrToken: true },
  });
  if (!current) throw new AppError('Member not found', 404);
  if (!current.qrToken) throw new AppError('This member has no active credential.', 409);

  await prisma.memberProfile.update({
    where: { id: memberId },
    data: { qrToken: null, qrRevokedAt: new Date() },
  });
  await audit(req, gymId, 'MemberQrCredential', memberId, { action: 'REVOKED' });
  res.json({ data: await credentialFor(gymId, memberId) });
}

export async function getMyCredential(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const profile = await membershipForSessionUser(req, gymId);
  res.json({ data: await credentialFor(gymId, profile.id) });
}
