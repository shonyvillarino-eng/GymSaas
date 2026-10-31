import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { parseOrThrow } from '../validations/schemas.js';
import {
  dashboardOverviewQuerySchema,
  dashboardAttendanceQuerySchema,
  dashboardRevenueQuerySchema,
  dashboardMembershipsQuerySchema,
  pageMeta,
  periodRange,
  dbDateLiteral,
} from '../validations/dashboard.schemas.js';

export async function getDashboardOverview(req: {
  auth: { gymId: string; userId?: string | null };
  query: Record<string, unknown>;
}) {
  const gymId = req.auth.gymId;
  const q = parseOrThrow(dashboardOverviewQuerySchema, req.query);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const expiryWindowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59, 999);

  const paidThisMonthWhere = { gymId, status: { not: 'VOIDED' as const }, paidAt: { gte: monthStart } };

  // One round-trip per metric family instead of 13 sequential awaits: the
  // dashboard is the landing page and every extra RTT is visible to the admin.
  const [
    members,
    membersActive,
    membersInactive,
    activeMemberships,
    expiredMemberships,
    pendingMemberships,
    frozenMemberships,
    expiringSoon,
    attendanceToday,
    attendanceMonth,
    paidThisMonth,
    paymentsThisMonthCount,
    openObligations,
    gym,
  ] = await Promise.all([
    prisma.memberProfile.count({ where: { gymId } }),
    prisma.memberProfile.count({ where: { gymId, status: 'ACTIVE' } }),
    prisma.memberProfile.count({ where: { gymId, status: { in: ['INACTIVE', 'SUSPENDED'] } } }),
    prisma.memberSubscription.count({ where: { gymId, status: 'ACTIVE' } }),
    prisma.memberSubscription.count({ where: { gymId, status: 'EXPIRED' } }),
    prisma.memberSubscription.count({ where: { gymId, status: 'PENDING' } }),
    prisma.memberSubscription.count({ where: { gymId, status: 'FROZEN' } }),
    prisma.memberSubscription.count({
      where: { gymId, status: 'ACTIVE', endDate: { gte: todayStart, lte: expiryWindowEnd } },
    }),
    prisma.attendance.count({ where: { gymId, checkInTime: { gte: todayStart } } }),
    prisma.attendance.count({ where: { gymId, checkInTime: { gte: monthStart } } }),
    prisma.paymentRecord.aggregate({ where: paidThisMonthWhere, _sum: { amount: true } }),
    prisma.paymentRecord.count({ where: paidThisMonthWhere }),
    // Outstanding debt is what is still owed (charge minus applied payments),
    // not the gross amount of the open charges.
    prisma.financialObligation.aggregate({
      where: { gymId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }, cancelledAt: null },
      _sum: { originalAmount: true, paidAmount: true },
    }),
    prisma.gym.findUnique({
      where: { id: gymId },
      select: { id: true, name: true, logoUrl: true },
    }),
  ]);

  const pendingOutstanding = openObligations._sum.originalAmount
    ? Math.max(0, Number(openObligations._sum.originalAmount) - Number(openObligations._sum.paidAmount ?? 0))
    : 0;

  const range = q.period && q.period !== 'custom'
    ? periodRange(q.period)
    : { from: now, to: now };

  return {
    gym: gym ?? { id: gymId, name: 'Gym', logoUrl: null },
    period: {
      label: q.period === 'custom' ? 'Personalizado' : q.period,
      from: dbDateLiteral(range.from),
      to: dbDateLiteral(range.to),
    },
    members: {
      total: members,
      active: membersActive,
      inactive: membersInactive,
    },
    memberships: {
      active: activeMemberships,
      expired: expiredMemberships,
      pending: pendingMemberships,
      frozen: frozenMemberships,
      expiringSoon,
    },
    attendance: {
      today: attendanceToday,
      thisMonth: attendanceMonth,
    },
    revenue: {
      currency: 'ARS',
      collectedThisMonth: Number(paidThisMonth._sum.amount || 0),
      collectedThisMonthCount: paymentsThisMonthCount,
      pendingObligations: pendingOutstanding,
    },
  };
}

export async function getDashboardAttendance(req: {
  auth: { gymId: string };
  query: Record<string, unknown>;
}) {
  const gymId = req.auth.gymId;
  const q = parseOrThrow(dashboardAttendanceQuerySchema, req.query);

  if (q.period === 'custom' && (!q.from || !q.to)) {
    throw new AppError('El período personalizado requiere from y to.', 400);
  }

  const fromDate = new Date(
    q.period && q.period !== 'custom'
      ? periodRange(q.period).from
      : (q.from && q.to ? q.from : periodRange('month').from),
  );
  const toDate = new Date(
    q.period && q.period !== 'custom'
      ? periodRange(q.period).to
      : (q.from && q.to ? q.to : periodRange('month').to),
  );

  // Prisma creates quoted PascalCase/camelCase identifiers (no @map), so raw
  // SQL must quote every table and column name.
  const byDay = await prisma.$queryRaw<Array<{ day: string; count: number }>>`
    SELECT
      CAST("checkInTime" AS date) AS day,
      COUNT(*)::int AS count
    FROM "Attendance"
    WHERE "gymId" = ${gymId}
      AND "checkInTime" >= ${fromDate}
      AND "checkInTime" <= ${toDate}
      AND "deletedAt" IS NULL
    GROUP BY CAST("checkInTime" AS date)
    ORDER BY day ASC
  `;

  const byMethod = await prisma.$queryRaw<Array<{ method: string; count: number }>>`
    SELECT
      "method",
      COUNT(*)::int AS count
    FROM "Attendance"
    WHERE "gymId" = ${gymId}
      AND "checkInTime" >= ${fromDate}
      AND "checkInTime" <= ${toDate}
      AND "deletedAt" IS NULL
    GROUP BY "method"
    ORDER BY count DESC
  `;

  const total = byDay.reduce((acc, row) => acc + row.count, 0);

  return {
    period: {
      label: q.period === 'custom' ? 'Personalizado' : q.period,
      from: dbDateLiteral(fromDate),
      to: dbDateLiteral(toDate),
    },
    byDay: byDay.map((r) => ({ day: r.day, count: r.count })),
    byMethod: byMethod.map((r) => ({ method: r.method, count: r.count })),
    total,
  };
}

export async function getDashboardRevenue(req: {
  auth: { gymId: string };
  query: Record<string, unknown>;
}) {
  const gymId = req.auth.gymId;
  const q = parseOrThrow(dashboardRevenueQuerySchema, req.query);

  if (q.period === 'custom' && (!q.from || !q.to)) {
    throw new AppError('El período personalizado requiere from y to.', 400);
  }

  const fromDate = new Date(
    q.period && q.period !== 'custom'
      ? periodRange(q.period).from
      : (q.from && q.to ? q.from : periodRange('month').from),
  );
  const toDate = new Date(
    q.period && q.period !== 'custom'
      ? periodRange(q.period).to
      : (q.from && q.to ? q.to : periodRange('month').to),
  );

  const rows = await prisma.$queryRaw<Array<{ month: string; amount: number; count: number }>>`
    SELECT
      DATE_TRUNC('month', "paidAt")::date AS month,
      COALESCE(SUM("amount"), 0)::numeric(12,2) AS amount,
      COUNT(*)::int AS count
    FROM "PaymentRecord"
    WHERE "gymId" = ${gymId}
      AND "status" <> 'VOIDED'
      AND "deletedAt" IS NULL
      AND "paidAt" >= ${fromDate}
      AND "paidAt" <= ${toDate}
    GROUP BY DATE_TRUNC('month', "paidAt")
    ORDER BY month ASC
  `;

  const total = rows.reduce((acc, r) => acc + Number(r.amount), 0);
  const count = rows.reduce((acc, r) => acc + r.count, 0);

  return {
    period: {
      label: q.period === 'custom' ? 'Personalizado' : q.period,
      from: dbDateLiteral(fromDate),
      to: dbDateLiteral(toDate),
    },
    byMonth: rows.map((r) => ({ month: r.month, amount: Number(r.amount), count: r.count })),
    total,
    count,
  };
}

export async function getDashboardMemberships(req: {
  auth: { gymId: string };
  query: Record<string, unknown>;
}) {
  const gymId = req.auth.gymId;
  const q = parseOrThrow(dashboardMembershipsQuerySchema, req.query);

  if (q.period === 'custom' && (!q.from || !q.to)) {
    throw new AppError('El período personalizado requiere from y to.', 400);
  }

  const fromDate = new Date(
    q.period && q.period !== 'custom'
      ? periodRange(q.period).from
      : (q.from && q.to ? q.from : periodRange('month').from),
  );
  const toDate = new Date(
    q.period && q.period !== 'custom'
      ? periodRange(q.period).to
      : (q.from && q.to ? q.to : periodRange('month').to),
  );

  const rows = await prisma.$queryRaw<Array<{ status: string; count: number }>>`
    SELECT
      "status",
      COUNT(*)::int AS count
    FROM "MemberSubscription"
    WHERE "gymId" = ${gymId}
      AND "startDate" >= ${fromDate}
      AND "startDate" <= ${toDate}
    GROUP BY "status"
    ORDER BY count DESC
  `;

  const byStatus = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + r.count;
      return acc;
    },
    {} as Record<string, number>,
  );

  const total = rows.reduce((acc, r) => acc + r.count, 0);

  const now = new Date();
  const warningEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59, 999);
  const expiringSoon = await prisma.memberSubscription.count({
    where: {
      gymId,
      status: 'ACTIVE',
      endDate: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()), lte: warningEnd },
    },
  });

  return {
    period: {
      label: q.period === 'custom' ? 'Personalizado' : q.period,
      from: dbDateLiteral(fromDate),
      to: dbDateLiteral(toDate),
    },
    byStatus,
    total,
    expiringSoonCount: expiringSoon,
  };
}

export { pageMeta, periodRange, dbDateLiteral };
