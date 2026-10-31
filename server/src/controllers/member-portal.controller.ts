import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { AppError } from '../middlewares/errorHandler.js';
import { clientIp, writeAudit } from '../services/audit.js';
import { evaluateAccess } from '../services/attendance.js';
import { loadGymPreferences, preferencesFromSettings } from '../services/gymPreferences.js';
import { endOfGymDate, gymCalendarDate, startOfGymDate } from '../services/financial.js';
import {
  buildNotices,
  loadMemberWithMemberships,
  memberBalance,
  portalAttendanceSelect,
  portalPaymentSelect,
  resolvePortalMember,
} from '../services/memberPortal.js';
import { daysUntil, membershipStateOf, refreshSubscriptionLifecycle } from '../services/subscriptions.js';
import { parseOrThrow } from '../validations/schemas.js';
import {
  portalAttendanceQuerySchema,
  portalHistoryQuerySchema,
  portalPasswordChangeSchema,
  portalPaymentQuerySchema,
  portalProfileUpdateSchema,
} from '../validations/member-portal.schemas.js';
import { myRoutines } from './routine.controller.js';

/**
 * Member portal (`/api/v1/member-portal`).
 *
 * Read-only for attendances, memberships, payments and routines: there is no
 * write endpoint for those, and the only mutations exposed are the member's
 * own name/phone and their password. The member is always resolved from the
 * session, so no identifier from the client can address another record.
 */

function paged<T>(data: T[], total: number, page: number, pageSize: number) {
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

function monthStart(timezone: string, now: Date) {
  return startOfGymDate(`${gymCalendarDate(now, timezone).slice(0, 7)}-01`, timezone);
}

async function audit(
  req: Request,
  gymId: string,
  entityType: string,
  newValues: Prisma.InputJsonValue,
  oldValues?: Prisma.InputJsonValue,
) {
  await writeAudit({
    gymId,
    userId: req.auth?.userId ?? null,
    action: 'UPDATE',
    entityType,
    entityId: req.auth?.userId ?? gymId,
    ...(oldValues ? { oldValues } : {}),
    newValues,
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export async function getPortalDashboard(req: Request, res: Response) {
  const { gymId, member } = await resolvePortalMember(req);
  const gym = await loadGymPreferences(gymId);
  if (!gym) throw new AppError('Gym not found', 404);

  await refreshSubscriptionLifecycle(gymId);
  const now = new Date();
  const profile = await loadMemberWithMemberships(gymId, member.id);

  // Same engine the reception desk uses, so the member sees the same verdict.
  const decision = evaluateAccess(profile, gym.preferences.attendancePolicy, now);
  const snapshot = decision.membership;
  const currentSubscription = snapshot ? profile.subscriptions.find((row) => row.id === snapshot.id) ?? null : null;
  const state = currentSubscription
    ? membershipStateOf(currentSubscription, { now, warningDays: gym.preferences.membershipExpiryWarningDays })
    : null;

  const [attendanceTotal, attendanceMonth, lastAttendance, lastPayment, balance, routine, paymentsThisMonth] =
    await Promise.all([
      prisma.attendance.count({ where: { gymId, memberId: member.id, deletedAt: null } }),
      prisma.attendance.count({
        where: { gymId, memberId: member.id, deletedAt: null, checkInTime: { gte: monthStart(gym.timezone, now) } },
      }),
      prisma.attendance.findFirst({
        where: { gymId, memberId: member.id, deletedAt: null },
        orderBy: { checkInTime: 'desc' },
        select: { checkInTime: true, method: true },
      }),
      prisma.paymentRecord.findFirst({
        where: { gymId, memberId: member.id, deletedAt: null },
        orderBy: { paidAt: 'desc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          concept: true,
          paidAt: true,
          status: true,
          method: true,
          receiptNumber: true,
        },
      }),
      memberBalance(gymId, member.id),
      prisma.routine.findFirst({
        where: { gymId, assignedToId: member.id, status: 'ACTIVE', deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          updatedAt: true,
          startDate: true,
          instructor: { select: { user: { select: { fullName: true } } } },
          _count: { select: { days: true } },
        },
      }),
      prisma.paymentRecord.aggregate({
        where: {
          gymId,
          memberId: member.id,
          deletedAt: null,
          voidedAt: null,
          status: 'COMPLETED',
          paidAt: { gte: monthStart(gym.timezone, now) },
        },
        _sum: { amount: true },
      }),
    ]);

  const notices = buildNotices({
    now,
    preferences: gym.preferences,
    membership: snapshot && currentSubscription
      ? {
          id: snapshot.id,
          planName: snapshot.planName,
          endDate: snapshot.endDate,
          daysRemaining: daysUntil(snapshot.endDate, now),
          valid: snapshot.valid,
          cancelled: Boolean(currentSubscription.cancelledAt) || currentSubscription.status === 'CANCELLED',
        }
      : null,
    money: {
      currency: balance.currency || gym.currency,
      outstanding: balance.outstanding,
      overdue: balance.overdue,
    },
    routine: routine ? { id: routine.id, name: routine.name, updatedAt: routine.updatedAt } : null,
    gym: { name: gym.name, phone: gym.phone, email: gym.email },
  });

  res.json({
    data: {
      generatedAt: now.toISOString(),
      member: {
        id: member.id,
        fullName: profile.user.fullName,
        avatarUrl: profile.user.avatarUrl,
        status: profile.status,
        joinDate: member.joinDate,
      },
      gym: {
        id: gym.id,
        name: gym.name,
        logoUrl: gym.logoUrl,
        city: gym.city,
        province: gym.province,
        address: gym.address,
        phone: gym.phone,
        email: gym.email,
        timezone: gym.timezone,
        currency: gym.currency,
      },
      membership: snapshot && currentSubscription
        ? {
            id: snapshot.id,
            planName: snapshot.planName,
            status: currentSubscription.status,
            state,
            startDate: snapshot.startDate,
            endDate: snapshot.endDate,
            daysRemaining: Math.max(0, snapshot.daysRemaining),
            expiringSoon: state === 'EXPIRING_SOON',
            currency: currentSubscription.currencyAtPurchase,
          }
        : null,
      access: {
        allowed: decision.allowed,
        reasons: decision.reasons.map((reason) => ({ code: reason.code, message: reason.message })),
        policy: accessPolicyBrief(decision.policy),
      },
      attendance: {
        total: attendanceTotal,
        // Renamed for the UI: this is the count for the gym's current month.
        thisMonth: attendanceMonth,
        lastVisitAt: lastAttendance?.checkInTime ?? null,
        lastVisitMethod: lastAttendance?.method ?? null,
      },
      payments: {
        currency: balance.currency || gym.currency,
        outstandingTotal: balance.outstanding.toFixed(2),
        overdueTotal: balance.overdue.toFixed(2),
        openCount: balance.openCount,
        lastPayment,
        paidThisMonth: (paymentsThisMonth._sum.amount ?? 0).toString(),
      },
      routine: routine
        ? {
            id: routine.id,
            name: routine.name,
            description: routine.description,
            sessions: routine._count.days,
            instructor: routine.instructor?.user.fullName ?? null,
            startDate: routine.startDate,
            updatedAt: routine.updatedAt,
          }
        : null,
      notices,
    },
  });
}

/** Only the flags that explain a refused entry, never the whole gym config. */
function accessPolicyBrief(policy: { requireActiveMember: boolean; requireValidMembership: boolean }) {
  return {
    requiresActiveMember: policy.requireActiveMember,
    requiresValidMembership: policy.requireValidMembership,
  };
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export async function getPortalProfile(req: Request, res: Response) {
  const { gymId, member } = await resolvePortalMember(req);
  const gym = await prisma.gym.findUniqueOrThrow({
    where: { id: gymId },
    select: { id: true, name: true, logoUrl: true, city: true, province: true, phone: true, email: true, currency: true, timezone: true },
  });

  res.json({
    data: {
      id: member.id,
      fullName: member.user.fullName,
      email: member.user.email,
      phone: member.user.phone,
      birthDate: member.birthDate,
      joinDate: member.joinDate,
      // Administrative state, separate from the membership state.
      status: member.status,
      address: member.address,
      gym,
      editable: { fullName: true, phone: true, email: false },
      emailNote:
        'Your email is your sign-in identifier. Ask the gym administrator to update it: changing it requires verifying the new address.',
    },
  });
}

export async function updatePortalProfile(req: Request, res: Response) {
  const { gymId, member } = await resolvePortalMember(req);
  const input = parseOrThrow(portalProfileUpdateSchema, req.body);

  const updated = await prisma.user.update({
    where: { id: member.userId },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
    select: { fullName: true, email: true, phone: true },
  });

  await audit(req, gymId, 'MemberProfile', input as Prisma.InputJsonValue, {
    fullName: member.user.fullName,
    phone: member.user.phone,
  });

  res.json({ data: { ...updated, editable: { fullName: true, phone: true, email: false } } });
}

export async function changePortalPassword(req: Request, res: Response) {
  const { gymId, member } = await resolvePortalMember(req);
  const input = parseOrThrow(portalPasswordChangeSchema, req.body);

  const user = await prisma.user.findFirst({
    where: { id: member.userId, isActive: true },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new AppError('Account not found', 404);

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError('Current password is incorrect', 400, {
      currentPassword: ['Current password is incorrect'],
    });
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
  // The password itself is never written to the audit trail.
  await audit(req, gymId, 'MemberPassword', { passwordChanged: true });

  res.status(204).end();
}

/* ------------------------------------------------------------------ */
/* Routine (delegated to the routines module)                          */
/* ------------------------------------------------------------------ */

export async function getPortalRoutine(req: Request, res: Response) {
  // The routines module already resolves the member from the session and
  // returns only their own prescriptions.
  return myRoutines(req, res);
}

/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

export async function listPortalAttendances(req: Request, res: Response) {
  const { gymId, member } = await resolvePortalMember(req);
  const query = parseOrThrow(portalAttendanceQuerySchema, req.query);
  const gym = await prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { timezone: true } });

  const checkInTime: Prisma.DateTimeFilter = {};
  if (query.from) checkInTime.gte = startOfGymDate(query.from, gym.timezone);
  if (query.to) checkInTime.lte = endOfGymDate(query.to, gym.timezone);

  const where: Prisma.AttendanceWhereInput = {
    gymId,
    memberId: member.id,
    deletedAt: null,
    ...(query.method !== 'all' ? { method: query.method } : {}),
    ...(query.from || query.to ? { checkInTime } : {}),
  };

  const now = new Date();
  const [rows, total, monthCount, lastVisit] = await Promise.all([
    prisma.attendance.findMany({
      where,
      orderBy: { checkInTime: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: portalAttendanceSelect,
    }),
    prisma.attendance.count({ where }),
    prisma.attendance.count({
      where: { gymId, memberId: member.id, deletedAt: null, checkInTime: { gte: monthStart(gym.timezone, now) } },
    }),
    prisma.attendance.findFirst({
      where: { gymId, memberId: member.id, deletedAt: null },
      orderBy: { checkInTime: 'desc' },
      select: { checkInTime: true },
    }),
  ]);

  res.json({
    ...paged(rows, total, query.page, query.pageSize),
    summary: {
      thisMonth: monthCount,
      lastVisitAt: lastVisit?.checkInTime ?? null,
      timezone: gym.timezone,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Membership                                                          */
/* ------------------------------------------------------------------ */

export async function getPortalMembership(req: Request, res: Response) {
  const { gymId, member } = await resolvePortalMember(req);
  const gym = await loadGymPreferences(gymId);
  if (!gym) throw new AppError('Gym not found', 404);

  await refreshSubscriptionLifecycle(gymId);
  const now = new Date();
  const subscriptions = await prisma.memberSubscription.findMany({
    where: { gymId, memberId: member.id },
    orderBy: { startDate: 'desc' },
    select: {
      id: true,
      status: true,
      planNameAtPurchase: true,
      currencyAtPurchase: true,
      priceAtPurchase: true,
      discountAmount: true,
      finalPrice: true,
      startDate: true,
      endDate: true,
      cancelledAt: true,
      notes: true,
      createdAt: true,
      plan: { select: { id: true, name: true, description: true, durationValue: true, durationUnit: true } },
    },
  });

  // In force first, otherwise the most recent one.
  const current =
    subscriptions.find((row) => !row.cancelledAt && row.status !== 'CANCELLED' && row.startDate <= now && row.endDate >= now) ??
    subscriptions[0] ??
    null;

  const stateOf = (row: (typeof subscriptions)[number]) =>
    membershipStateOf(row, { now, warningDays: gym.preferences.membershipExpiryWarningDays });

  const state = current ? stateOf(current) : null;
  const valid = state === 'ACTIVE' || state === 'EXPIRING_SOON';

  res.json({
    data: {
      current: current
        ? {
            id: current.id,
            planName: current.planNameAtPurchase,
            planDescription: current.plan?.description ?? null,
            planDuration: current.plan ? `${current.plan.durationValue} ${current.plan.durationUnit.toLowerCase()}` : null,
            price: current.priceAtPurchase.toFixed(2),
            discount: current.discountAmount.toFixed(2),
            finalPrice: current.finalPrice.toFixed(2),
            currency: current.currencyAtPurchase,
            startDate: current.startDate,
            endDate: current.endDate,
            status: current.status,
            state,
            daysRemaining: Math.max(0, daysUntil(current.endDate, now)),
            expiringSoon: state === 'EXPIRING_SOON',
            cancelledAt: current.cancelledAt,
            notes: current.notes,
          }
        : null,
      // Renewals are registered at reception: the portal never charges anything.
      renewal: {
        required: !valid,
        contactPhone: gym.phone,
        contactEmail: gym.email,
        acceptedPaymentMethods: gym.preferences.acceptedPaymentMethods,
        note: 'Memberships are renewed at the gym. The front desk registers the payment; this portal does not process online payments.',
      },
      counts: {
        total: subscriptions.length,
        expired: subscriptions.filter((row) => stateOf(row) === 'EXPIRED').length,
        valid: subscriptions.filter((row) => ['ACTIVE', 'EXPIRING_SOON'].includes(String(stateOf(row)))).length,
      },
    },
  });
}

export async function getPortalMembershipHistory(req: Request, res: Response) {
  const { gymId, member } = await resolvePortalMember(req);
  const query = parseOrThrow(portalHistoryQuerySchema, req.query);
  const gym = await prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { settings: true, timezone: true } });
  const warningDays = preferencesFromSettings(gym.settings).membershipExpiryWarningDays;
  const now = new Date();

  const [rows, total] = await Promise.all([
    prisma.memberSubscription.findMany({
      where: { gymId, memberId: member.id },
      orderBy: { startDate: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        status: true,
        planNameAtPurchase: true,
        currencyAtPurchase: true,
        priceAtPurchase: true,
        discountAmount: true,
        finalPrice: true,
        startDate: true,
        endDate: true,
        cancelledAt: true,
        notes: true,
        createdAt: true,
      },
    }),
    prisma.memberSubscription.count({ where: { gymId, memberId: member.id } }),
  ]);

  const data = rows.map((row) => ({
    id: row.id,
    planName: row.planNameAtPurchase,
    currency: row.currencyAtPurchase,
    price: row.priceAtPurchase.toFixed(2),
    discount: row.discountAmount.toFixed(2),
    finalPrice: row.finalPrice.toFixed(2),
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    state: membershipStateOf(row, { now, warningDays }),
    cancelledAt: row.cancelledAt,
    notes: row.notes,
    assignedAt: row.createdAt,
    daysRemaining: Math.max(0, daysUntil(row.endDate, now)),
    timezone: gym.timezone,
  }));

  res.json(paged(data, total, query.page, query.pageSize));
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

export async function listPortalPayments(req: Request, res: Response) {
  const { gymId, member } = await resolvePortalMember(req);
  const query = parseOrThrow(portalPaymentQuerySchema, req.query);
  const gym = await prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { timezone: true, currency: true } });

  const paidAt: Prisma.DateTimeFilter = {};
  if (query.from) paidAt.gte = startOfGymDate(query.from, gym.timezone);
  if (query.to) paidAt.lte = endOfGymDate(query.to, gym.timezone);

  const where: Prisma.PaymentRecordWhereInput = {
    gymId,
    memberId: member.id,
    deletedAt: null,
    ...(query.status !== 'all' ? { status: query.status } : {}),
    ...(query.method !== 'all' ? { method: query.method } : {}),
    ...(query.from || query.to ? { paidAt } : {}),
  };

  // Only effective movements count towards the period total: a voided receipt
  // is still listed (history) but never summed.
  const effectiveWhere: Prisma.PaymentRecordWhereInput = {
    ...where,
    voidedAt: null,
    status: query.status === 'all' ? 'COMPLETED' : query.status,
  };

  const [rows, total, totals, balance] = await Promise.all([
    prisma.paymentRecord.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: portalPaymentSelect,
    }),
    prisma.paymentRecord.count({ where }),
    prisma.paymentRecord.aggregate({ where: effectiveWhere, _sum: { amount: true }, _count: { _all: true } }),
    memberBalance(gymId, member.id),
  ]);

  res.json({
    ...paged(rows, total, query.page, query.pageSize),
    summary: {
      currency: balance.currency || gym.currency,
      paidInPeriod: (totals._sum.amount ?? 0).toFixed(2),
      operationsInPeriod: totals._count._all,
      outstandingTotal: balance.outstanding.toFixed(2),
      overdueTotal: balance.overdue.toFixed(2),
      openObligations: balance.openCount,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Notices                                                             */
/* ------------------------------------------------------------------ */

export async function listPortalNotifications(req: Request, res: Response) {
  const { gymId, member } = await resolvePortalMember(req);
  const gym = await loadGymPreferences(gymId);
  if (!gym) throw new AppError('Gym not found', 404);

  await refreshSubscriptionLifecycle(gymId);
  const now = new Date();
  const profile = await loadMemberWithMemberships(gymId, member.id);
  const decision = evaluateAccess(profile, gym.preferences.attendancePolicy, now);
  const snapshot = decision.membership;
  const currentSubscription = snapshot ? profile.subscriptions.find((row) => row.id === snapshot.id) ?? null : null;

  const [balance, routine] = await Promise.all([
    memberBalance(gymId, member.id),
    prisma.routine.findFirst({
      where: { gymId, assignedToId: member.id, status: 'ACTIVE', deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, updatedAt: true },
    }),
  ]);

  const notices = buildNotices({
    now,
    preferences: gym.preferences,
    membership: snapshot && currentSubscription
      ? {
          id: snapshot.id,
          planName: snapshot.planName,
          endDate: snapshot.endDate,
          daysRemaining: daysUntil(snapshot.endDate, now),
          valid: snapshot.valid,
          cancelled: Boolean(currentSubscription.cancelledAt) || currentSubscription.status === 'CANCELLED',
        }
      : null,
    money: { currency: balance.currency || gym.currency, outstanding: balance.outstanding, overdue: balance.overdue },
    routine: routine ? { id: routine.id, name: routine.name, updatedAt: routine.updatedAt } : null,
    gym: { name: gym.name, phone: gym.phone, email: gym.email },
  });

  res.json({
    data: notices,
    meta: {
      generatedAt: now.toISOString(),
      // Honest about delivery: nothing is emailed yet. The list is derived from
      // real records and is ready to be consumed by a delivery provider later.
      channels: { inApp: true, email: false },
      note: 'Notices are generated from your real records. No email or push delivery is configured for this gym.',
    },
  });
}

