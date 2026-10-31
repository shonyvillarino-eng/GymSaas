import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { hashPassword } from '../lib/password.js';
import { generateRawToken, hashToken } from '../lib/tokens.js';
import { env } from '../config/env.js';
import { uploadMemberPhoto } from '../lib/objectStorage.js';
import { clientIp, writeAudit } from '../services/audit.js';
import { weeklyBuckets } from '../services/attendance.js';
import { idParamSchema, parseOrThrow } from '../validations/schemas.js';
import {
  memberCreateSchema,
  memberInstructorSchema,
  memberListQuerySchema,
  memberStatusSchema,
  memberUpdateSchema,
} from '../validations/member.schemas.js';

const MEMBER_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Gym id always comes from the authenticated session — never from input. */
function gymIdFromSession(req: Request) {
  if (req.auth?.role !== 'GYM_ADMIN' || !req.auth.gymId) {
    throw new AppError('Gym administrator access required', 403, { code: 'FORBIDDEN' });
  }
  return req.auth.gymId;
}

function requireMemberId(req: Request) {
  return parseOrThrow(idParamSchema, req.params.id);
}

/**
 * Loads a member scoped to this gym. Members of other gyms return 404 so the
 * caller cannot distinguish "exists elsewhere" from "does not exist".
 */
async function memberInGym(gymId: string, memberId: string) {
  const member = await prisma.memberProfile.findFirst({
    where: { id: memberId, gymId },
    include: {
      user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true, isActive: true } },
      instructorMembers: {
        where: { isActive: true },
        orderBy: { assignedAt: 'desc' },
        take: 1,
        select: {
          instructorId: true,
          isPrimary: true,
          instructor: { select: { user: { select: { fullName: true } } } },
        },
      },
      subscriptions: {
        where: { status: { in: ['ACTIVE', 'PENDING'] } },
        orderBy: [{ status: 'asc' }, { endDate: 'desc' }],
        take: 1,
        select: { status: true, startDate: true, endDate: true, planNameAtPurchase: true, plan: { select: { name: true } } },
      },
    },
  });
  if (!member) throw new AppError('Member not found', 404);
  return member;
}

/**
 * Explicit attendance rule (also enforced by the attendance module later):
 * only members with administrative status ACTIVE may register check-ins.
 * Membership expiry is a separate concern handled by membership policies.
 */
function canRegisterAttendance(status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') {
  return {
    allowed: status === 'ACTIVE',
    rule: 'Only members with administrative status ACTIVE can register attendance; SUSPENDIDO and INACTIVO members are blocked until reactivated.',
  };
}

function memberRow(member: Awaited<ReturnType<typeof memberInGym>>) {
  const assignment = member.instructorMembers[0];
  const membership = member.subscriptions[0];
  return {
    id: member.id,
    fullName: member.user.fullName,
    email: member.user.email,
    phone: member.user.phone,
    photoUrl: member.user.avatarUrl,
    documentType: member.documentType,
    documentNumber: member.documentNumber,
    birthDate: member.birthDate,
    gender: member.gender,
    address: member.address,
    emergencyName: member.emergencyName,
    emergencyPhone: member.emergencyPhone,
    joinDate: member.joinDate,
    status: member.status,
    notes: member.notes,
    instructor: assignment
      ? { id: assignment.instructorId, fullName: assignment.instructor.user.fullName, isPrimary: assignment.isPrimary }
      : null,
    membership: membership
      ? {
          planName: membership.planNameAtPurchase,
          status: membership.status,
          startDate: membership.startDate,
          endDate: membership.endDate,
          expired: membership.endDate.getTime() < Date.now(),
        }
      : null,
    attendance: canRegisterAttendance(member.status),
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}

async function audit(
  req: Request,
  gymId: string,
  entityType: string,
  entityId: string,
  newValues: Prisma.InputJsonValue,
  oldValues?: Prisma.InputJsonValue,
  action: 'CREATE' | 'UPDATE' | 'ASSIGN' | 'UNASSIGN' = 'UPDATE'
) {
  await writeAudit({
    gymId,
    userId: req.auth?.userId ?? null,
    action,
    entityType,
    entityId,
    ...(oldValues ? { oldValues } : {}),
    newValues,
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });
}

async function assertDocumentAvailable(gymId: string, documentType: string, documentNumber: string, exceptId?: string) {
  const clash = await prisma.memberProfile.findFirst({
    where: { gymId, documentType: documentType as never, documentNumber, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw new AppError('A member with this document already exists in this gym', 409, {
      documentNumber: ['Already registered in this gym'],
    });
  }
}

async function assertEmailAvailable(email: string | null | undefined, exceptUserId?: string) {
  if (!email) return;
  const clash = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (clash && clash.id !== exceptUserId) {
    throw new AppError('An account with this email already exists', 409, { email: ['Already in use'] });
  }
}

/* ------------------------------------------------------------------ */
/* List (backend pagination, search and filters)                       */
/* ------------------------------------------------------------------ */

export async function listMembers(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const q = parseOrThrow(memberListQuerySchema, req.query);

  const membershipFilter: Prisma.MemberProfileWhereInput | undefined =
    q.membership === 'ACTIVE'
      ? { subscriptions: { some: { status: 'ACTIVE', endDate: { gte: new Date() } } } }
      : q.membership === 'PAST_DUE'
        ? {
            OR: [
              // "Past due" = the subscription already ended but was never
              // cancelled, or the row was explicitly marked EXPIRED.
              { subscriptions: { some: { status: 'EXPIRED' } } },
              { subscriptions: { some: { status: 'ACTIVE', endDate: { lt: new Date() } } } },
            ],
          }
        : q.membership === 'NONE'
          ? { subscriptions: { none: {} } }
          : undefined;

  const instructorFilter: Prisma.MemberProfileWhereInput | undefined =
    q.instructor === 'none'
      ? { instructorMembers: { none: { isActive: true } } }
      : q.instructor && q.instructor !== 'all'
        ? { instructorMembers: { some: { instructorId: q.instructor, isActive: true } } }
        : undefined;

  const where: Prisma.MemberProfileWhereInput = {
    gymId,
    ...(q.status !== 'all' ? { status: q.status as never } : {}),
    ...(membershipFilter ? { AND: [membershipFilter] } : {}),
    ...(instructorFilter ? { AND: [instructorFilter] } : {}),
    ...(q.search
      ? {
          OR: [
            { user: { fullName: { contains: q.search, mode: 'insensitive' } } },
            { user: { email: { contains: q.search, mode: 'insensitive' } } },
            { documentNumber: { contains: q.search.toUpperCase() } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.memberProfile.count({ where }),
    prisma.memberProfile.findMany({
      where,
      orderBy: [{ joinDate: q.order }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        documentType: true,
        documentNumber: true,
        status: true,
        joinDate: true,
        user: { select: { fullName: true, phone: true, email: true, avatarUrl: true } },
        instructorMembers: {
          where: { isActive: true },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          select: { instructorId: true, instructor: { select: { user: { select: { fullName: true } } } } },
        },
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'PENDING'] } },
          orderBy: [{ status: 'asc' }, { endDate: 'desc' }],
          take: 1,
          select: { status: true, endDate: true, planNameAtPurchase: true, plan: { select: { name: true } } },
        },
      },
    }),
  ]);

  res.json({
    data: rows.map((row) => {
      const assignment = row.instructorMembers[0];
      const membership = row.subscriptions[0];
      return {
        id: row.id,
        fullName: row.user.fullName,
        phone: row.user.phone,
        email: row.user.email,
        photoUrl: row.user.avatarUrl,
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        joinDate: row.joinDate,
        status: row.status,
        instructor: assignment ? { id: assignment.instructorId, fullName: assignment.instructor.user.fullName } : null,
        membership: membership
          ? { planName: membership.planNameAtPurchase, status: membership.status, endDate: membership.endDate, expired: membership.endDate.getTime() < Date.now() }
          : null,
      };
    }),
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    },
  });
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export async function createMember(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const input = parseOrThrow(memberCreateSchema, req.body);

  await assertDocumentAvailable(gymId, input.documentType, input.documentNumber);
  await assertEmailAvailable(input.email);

  // Unusable placeholder: the account has no credentials until a future
  // member-portal flow issues an invitation.
  const placeholderHash = await hashPassword(generateRawToken());
  const joinDate = input.joinDate ? new Date(`${input.joinDate}T00:00:00`) : new Date();

  let created: { id: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          phone: input.phone,
          role: 'MEMBER',
          passwordHash: placeholderHash,
          isActive: false, // no sign-in flow for members yet
        },
      });
      const profile = await tx.memberProfile.create({
        data: {
          gymId,
          userId: user.id,
          documentType: input.documentType,
          documentNumber: input.documentNumber,
          status: input.status,
          joinDate,
          birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00`) : null,
          gender: input.gender,
          address: input.address,
          emergencyName: input.emergencyName,
          emergencyPhone: input.emergencyPhone,
          notes: input.notes,
          goals: [],
        },
      });
      await tx.gymMembership.create({
        data: { gymId, userId: user.id, role: 'MEMBER', isActive: true },
      });
      return { id: profile.id };
    });
  } catch (error) {
    // Race-safe: the partial/unique indexes are the final word.
    const code = (error as { code?: string }).code;
    if (code === 'P2002') {
      const target = (error as { meta?: { target?: string[] } }).meta?.target ?? [];
      if (target.includes('documentNumber')) {
        throw new AppError('A member with this document already exists in this gym', 409, {
          documentNumber: ['Already registered in this gym'],
        });
      }
      if (target.includes('email')) {
        throw new AppError('An account with this email already exists', 409, { email: ['Already in use'] });
      }
      throw new AppError('A unique constraint prevented this member from being created', 409);
    }
    throw error;
  }

  const member = await memberInGym(gymId, created.id);
  await audit(
    req,
    gymId,
    'MemberProfile',
    member.id,
    {
      fullName: member.user.fullName,
      documentType: member.documentType,
      documentNumber: member.documentNumber,
      status: member.status,
      joinDate: member.joinDate,
    },
    undefined,
    'CREATE'
  );
  res.status(201).json({ data: memberRow(member) });
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export async function getMember(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const member = await memberInGym(gymId, requireMemberId(req));
  res.json({ data: memberRow(member) });
}

/**
 * GET /members/:id/summary — real data for every detail tab.
 * Tabs whose module is not implemented yet return empty arrays (never fake
 * records): payments, attendance, memberships and routines are read directly
 * from their tables.
 */
export async function getMemberSummary(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const member = await memberInGym(gymId, requireMemberId(req));
  const memberId = member.id;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since56 = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    memberships,
    payments,
    pendingAgg,
    attendanceTotal,
    attendance30,
    attendance7,
    attendanceThisMonth,
    recentAttendance,
    routines,
    primaryInstructor,
    availableInstructors,
    obligations,
    lastMembership,
    attendanceTimeline,
    gymClock,
  ] = await Promise.all([
    prisma.memberSubscription.findMany({
      where: { gymId, memberId },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        priceAtPurchase: true,
        discountAmount: true,
        finalPrice: true,
        notes: true,
        cancelledAt: true,
        planNameAtPurchase: true,
        currencyAtPurchase: true,
        plan: { select: { name: true, currency: true } },
      },
    }),
    prisma.paymentRecord.findMany({
      where: { gymId, memberId, deletedAt: null },
      orderBy: { paidAt: 'desc' },
      take: 100,
      select: {
        id: true,
        receiptNumber: true,
        amount: true,
        currency: true,
        concept: true,
        method: true,
        status: true,
        paidAt: true,
        reference: true,
      },
    }),
    prisma.paymentRecord.aggregate({
      where: { gymId, memberId, deletedAt: null, status: { in: ['PENDING', 'PARTIAL'] } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.attendance.count({ where: { gymId, memberId, deletedAt: null } }),
    prisma.attendance.count({ where: { gymId, memberId, deletedAt: null, checkInTime: { gte: since30 } } }),
    prisma.attendance.count({ where: { gymId, memberId, deletedAt: null, checkInTime: { gte: since7 } } }),
    prisma.attendance.count({ where: { gymId, memberId, deletedAt: null, checkInTime: { gte: startOfMonth } } }),
    prisma.attendance.findMany({
      where: { gymId, memberId, deletedAt: null },
      orderBy: { checkInTime: 'desc' },
      take: 10,
      select: {
        id: true,
        checkInTime: true,
        checkOutTime: true,
        status: true,
        method: true,
        result: true,
        exceptionReason: true,
        notes: true,
      },
    }),
    prisma.routine.findMany({
      where: { gymId, assignedToId: memberId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        difficulty: true,
        estimatedWeeks: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        creator: { select: { fullName: true } },
      },
    }),
    prisma.instructorMember.findFirst({
      where: { gymId, memberId: member.id, isActive: true, isPrimary: true },
      select: {
        instructorId: true,
        instructor: { select: { user: { select: { fullName: true, email: true } } } },
      },
    }),
    prisma.instructorProfile.findMany({
      where: { gymId, isAvailable: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, user: { select: { fullName: true, email: true } } },
    }),
    prisma.financialObligation.findMany({
      where: { gymId, memberId },
      orderBy: [{ status: 'asc' }, { dueDate: 'desc' }],
      take: 100,
      select: {
        id: true,
        concept: true,
        originalAmount: true,
        paidAmount: true,
        currency: true,
        issuedAt: true,
        dueDate: true,
        status: true,
        subscriptionId: true,
        cancelledAt: true,
      },
    }),
    prisma.memberSubscription.findFirst({
      where: { gymId, memberId },
      orderBy: { endDate: 'desc' },
      select: { endDate: true },
    }),
    prisma.attendance.findMany({
      where: { gymId, memberId, deletedAt: null, checkInTime: { gte: since56 } },
      select: { checkInTime: true },
    }),
    prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { timezone: true } }),
  ]);

  const historicalMemberships = memberships.map((subscription) => ({
    ...subscription,
    plan: { name: subscription.planNameAtPurchase, currency: subscription.currencyAtPurchase },
  }));

  // Receivables: balance is derived per charge, never stored as free input.
  const obligationsWithBalance = obligations.map((obligation) => ({
    ...obligation,
    balance: Math.max(0, Number(obligation.originalAmount) - Number(obligation.paidAmount)).toFixed(2),
  }));
  const outstandingObligations = obligationsWithBalance.filter(
    (obligation) => !obligation.cancelledAt && obligation.status !== 'PAID',
  );
  const outstandingTotal = outstandingObligations
    .reduce((sum, obligation) => sum + Number(obligation.balance), 0)
    .toFixed(2);
  // Last effective payment (voided movements are history, not income).
  const lastPayment = payments.find((payment) => payment.status === 'COMPLETED') ?? null;

  res.json({
    data: {
      member: memberRow(member),
      memberships: historicalMemberships,
      payments,
      pending: {
        amount: pendingAgg._sum.amount ?? 0,
        count: pendingAgg._count,
      },
      attendance: {
        total: attendanceTotal,
        last30Days: attendance30,
        last7Days: attendance7,
        thisMonth: attendanceThisMonth,
        lastVisitAt: recentAttendance[0]?.checkInTime ?? null,
        // 28-day average expressed per week, so the number stays comparable.
        averagePerWeek: Number((attendance30 / 4).toFixed(1)),
        weekly: weeklyBuckets(attendanceTimeline.map((row) => row.checkInTime), gymClock.timezone, 8),
        recent: recentAttendance,
      },
      routines,
      instructor: primaryInstructor
        ? {
            id: primaryInstructor.instructorId,
            fullName: primaryInstructor.instructor.user.fullName,
            email: primaryInstructor.instructor.user.email,
          }
        : null,
      availableInstructors,
      financial: {
        currency: obligationsWithBalance[0]?.currency ?? historicalMemberships[0]?.currencyAtPurchase ?? null,
        obligations: obligationsWithBalance,
        outstandingTotal,
        outstandingCount: outstandingObligations.length,
        lastPaymentAt: lastPayment?.paidAt ?? null,
      },
    },
  });
}

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

export async function updateMember(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const memberId = requireMemberId(req);
  const input = parseOrThrow(memberUpdateSchema, req.body);
  const current = await memberInGym(gymId, memberId);

  if (
    input.documentType !== undefined &&
    input.documentType !== null &&
    input.documentNumber !== undefined &&
    input.documentNumber !== null
  ) {
    await assertDocumentAvailable(gymId, input.documentType, input.documentNumber, memberId);
  }
  if ('email' in input) await assertEmailAvailable(input.email, current.userId);

  const userFields: Prisma.UserUpdateInput = {};
  if (input.fullName !== undefined) userFields.fullName = input.fullName;
  if ('phone' in input) userFields.phone = input.phone ?? null;
  if ('email' in input) userFields.email = input.email;

  const profileFields: Prisma.MemberProfileUpdateInput = {};
  if (input.documentType !== undefined && input.documentType !== null) profileFields.documentType = input.documentType;
  if (input.documentNumber !== undefined && input.documentNumber !== null) profileFields.documentNumber = input.documentNumber;
  if ('birthDate' in input) profileFields.birthDate = input.birthDate ? new Date(`${input.birthDate}T00:00:00`) : null;
  if ('gender' in input) profileFields.gender = input.gender;
  if ('address' in input) profileFields.address = input.address;
  if ('emergencyName' in input) profileFields.emergencyName = input.emergencyName;
  if ('emergencyPhone' in input) profileFields.emergencyPhone = input.emergencyPhone;
  if ('notes' in input) profileFields.notes = input.notes;
  if ('joinDate' in input) {
    if (!input.joinDate) throw new AppError('Join date cannot be empty', 400, { joinDate: ['Join date is required'] });
    profileFields.joinDate = new Date(`${input.joinDate}T00:00:00`);
  }
  // `status` is excluded from the update schema; it changes only via
  // PATCH /:id/status so every state change is audited consistently.

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(userFields).length > 0) {
        await tx.user.update({ where: { id: current.userId }, data: userFields });
      }
      if (Object.keys(profileFields).length > 0) {
        await tx.memberProfile.update({ where: { id: memberId }, data: profileFields });
      }
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P2002') {
      const target = (error as { meta?: { target?: string[] } }).meta?.target ?? [];
      if (target.includes('documentNumber')) {
        throw new AppError('A member with this document already exists in this gym', 409, {
          documentNumber: ['Already registered in this gym'],
        });
      }
      if (target.includes('email')) {
        throw new AppError('An account with this email already exists', 409, { email: ['Already in use'] });
      }
    }
    throw error;
  }

  const updated = await memberInGym(gymId, memberId);
  await audit(
    req,
    gymId,
    'MemberProfile',
    memberId,
    { ...input } as unknown as Prisma.InputJsonValue,
    {
      fullName: current.user.fullName,
      email: current.user.email,
      phone: current.user.phone,
      documentType: current.documentType,
      documentNumber: current.documentNumber,
      address: current.address,
      notes: current.notes,
    }
  );
  res.json({ data: memberRow(updated) });
}

/* ------------------------------------------------------------------ */
/* Status (suspend / deactivate / reactivate)                          */
/* ------------------------------------------------------------------ */

export async function updateMemberStatus(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const memberId = requireMemberId(req);
  const input = parseOrThrow(memberStatusSchema, req.body);
  const current = await memberInGym(gymId, memberId);

  if (current.status !== input.status) {
    await prisma.memberProfile.update({ where: { id: memberId }, data: { status: input.status } });
    await audit(
      req,
      gymId,
      'MemberProfile',
      memberId,
      { status: input.status, reason: input.reason },
      { status: current.status }
    );
  }

  const updated = await memberInGym(gymId, memberId);
  res.json({ data: memberRow(updated) });
}

/* ------------------------------------------------------------------ */
/* Instructor assignment                                               */
/* ------------------------------------------------------------------ */

export async function assignMemberInstructor(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const memberId = requireMemberId(req);
  const input = parseOrThrow(memberInstructorSchema, req.body);
  const current = await memberInGym(gymId, memberId);

  if (input.instructorId) {
    const instructor = await prisma.instructorProfile.findFirst({
      where: { id: input.instructorId, gymId },
      select: { id: true },
    });
    if (!instructor) throw new AppError('Instructor not found in this gym', 404);
  }

  await prisma.$transaction(async (tx) => {
    await tx.instructorMember.updateMany({
      where: { gymId, memberId, isActive: true, isPrimary: true },
      data: { isActive: false },
    });
    if (input.instructorId) {
      const activePair = await tx.instructorMember.findFirst({
        where: { gymId, instructorId: input.instructorId, memberId, isActive: true },
        select: { id: true },
      });
      if (activePair) {
        await tx.instructorMember.update({
          where: { id: activePair.id },
          data: { isPrimary: true, assignedAt: new Date(), assignedBy: req.auth!.userId },
        });
      } else {
        await tx.instructorMember.create({
          data: { gymId, instructorId: input.instructorId, memberId, isPrimary: true, assignedBy: req.auth!.userId },
        });
      }
    }
  });

  await audit(
    req,
    gymId,
    'InstructorMember',
    memberId,
    { instructorId: input.instructorId },
    { instructorId: current.instructorMembers[0]?.instructorId ?? null },
    input.instructorId ? 'ASSIGN' : 'UNASSIGN'
  );

  const updated = await memberInGym(gymId, memberId);
  res.json({ data: memberRow(updated) });
}

/* ------------------------------------------------------------------ */
/* Photograph                                                          */
/* ------------------------------------------------------------------ */

export async function uploadMemberPhotoHandler(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const memberId = requireMemberId(req);
  const member = await memberInGym(gymId, memberId);
  const file = req.file;
  if (!file) throw new AppError('Choose an image file to upload.', 400);

  const result = await uploadMemberPhoto(gymId, memberId, file);
  await prisma.user.update({ where: { id: member.userId }, data: { avatarUrl: result.url } });
  await audit(req, gymId, 'MemberPhoto', memberId, { objectKey: result.key }, member.user.avatarUrl ? { photoUrl: member.user.avatarUrl } : undefined);

  const updated = await memberInGym(gymId, memberId);
  res.status(201).json({ data: memberRow(updated) });
}

/* ------------------------------------------------------------------ */
/* Member portal access                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /members/:id/portal-access
 *
 * Issues a single-use invitation so the member can set their own password and
 * sign in to the portal. Reuses the platform's token flow (`complete-setup`):
 * no password is ever generated, emailed or logged, and a previous unused
 * invitation for the same account is invalidated.
 *
 * Requires an email: it is the sign-in identifier.
 */
export async function grantMemberPortalAccess(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const memberId = requireMemberId(req);
  const member = await memberInGym(gymId, memberId);

  if (!member.user.email) {
    throw new AppError('Add an email address to this member before granting portal access.', 400, {
      email: ['An email is required as the sign-in identifier'],
    });
  }
  if (member.status === 'SUSPENDED') {
    throw new AppError('Reactivate the member before granting portal access.', 409, { code: 'MEMBER_SUSPENDED' });
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + MEMBER_INVITE_TTL_MS);

  await prisma.$transaction(async (tx) => {
    // Only one live invitation per account: the previous link stops working.
    await tx.authToken.updateMany({
      where: { userId: member.userId, type: 'MEMBER_INVITE', usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.authToken.create({ data: { userId: member.userId, tokenHash, type: 'MEMBER_INVITE', expiresAt } });
  });

  await audit(req, gymId, 'MemberPortalAccess', memberId, { issued: true, email: member.user.email });

  const setupOrigin = env.CORS_ORIGIN.split(',')[0]?.trim() || 'http://localhost:5173';
  res.status(201).json({
    data: { memberId, email: member.user.email },
    setupUrl: `${new URL(setupOrigin).origin}/complete-setup#token=${encodeURIComponent(rawToken)}`,
    setupExpiresAt: expiresAt.toISOString(),
  });
}
