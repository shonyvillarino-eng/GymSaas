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
      select: { id: true, name: true, logoUrl: true, currency: true },
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
      currency: gym?.currency ?? 'USD',
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

  // Previous period of identical length, used for the comparison metric.
  const span = toDate.getTime() - fromDate.getTime() + 1;
  const previousFrom = new Date(fromDate.getTime() - span);
  const previousTo = new Date(fromDate.getTime() - 1);

  const [byHour, previousCount] = await Promise.all([
    prisma.$queryRaw<Array<{ hour: number; count: number }>>`
      SELECT EXTRACT(HOUR FROM "checkInTime")::int AS hour, COUNT(*)::int AS count
      FROM "Attendance"
      WHERE "gymId" = ${gymId}
        AND "checkInTime" >= ${fromDate}
        AND "checkInTime" <= ${toDate}
        AND "deletedAt" IS NULL
      GROUP BY 1
      ORDER BY count DESC
    `,
    prisma.attendance.count({
      where: { gymId, deletedAt: null, checkInTime: { gte: previousFrom, lte: previousTo } },
    }),
  ]);

  const peakDay = byDay.reduce<{ day: string; count: number } | null>(
    (best, row) => (!best || row.count > best.count ? row : best),
    null,
  );
  const peakHour = byHour.length > 0 ? byHour[0] : null;

  return {
    period: {
      label: q.period === 'custom' ? 'Personalizado' : q.period,
      from: dbDateLiteral(fromDate),
      to: dbDateLiteral(toDate),
    },
    byDay: byDay.map((r) => ({ day: r.day, count: r.count })),
    // Alias consumed by the reports chart; keeps both contracts working.
    series: byDay.map((r) => ({ date: r.day, count: r.count })),
    byMethod: byMethod.map((r) => ({ method: r.method, count: r.count })),
    byHour: byHour.map((r) => ({ hour: r.hour, count: r.count })),
    peak: total > 0 ? { day: peakDay?.day ?? null, hour: peakHour?.hour ?? null, count: peakDay?.count ?? 0 } : null,
    comparison: {
      previousTotal: previousCount,
      changePct: previousCount === 0 ? null : Number((((total - previousCount) / previousCount) * 100).toFixed(1)),
      previousFrom: dbDateLiteral(previousFrom),
      previousTo: dbDateLiteral(previousTo),
    },
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

  const span = toDate.getTime() - fromDate.getTime() + 1;
  const previousFrom = new Date(fromDate.getTime() - span);
  const previousTo = new Date(fromDate.getTime() - 1);

  // Distribution by payment method: voided records are excluded, as they are
  // not valid income (they remain visible in the payments module, not here).
  const [byMethod, previous] = await Promise.all([
    prisma.$queryRaw<Array<{ method: string; amount: number; count: number }>>`
      SELECT "method", COALESCE(SUM("amount"), 0)::numeric(12,2) AS amount, COUNT(*)::int AS count
      FROM "PaymentRecord"
      WHERE "gymId" = ${gymId}
        AND "status" <> 'VOIDED'
        AND "deletedAt" IS NULL
        AND "paidAt" >= ${fromDate}
        AND "paidAt" <= ${toDate}
      GROUP BY "method"
      ORDER BY amount DESC
    `,
    prisma.paymentRecord.aggregate({
      where: {
        gymId,
        status: { not: 'VOIDED' },
        deletedAt: null,
        paidAt: { gte: previousFrom, lte: previousTo },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const previousTotal = Number(previous._sum.amount ?? 0);

  return {
    period: {
      label: q.period === 'custom' ? 'Personalizado' : q.period,
      from: dbDateLiteral(fromDate),
      to: dbDateLiteral(toDate),
    },
    byMonth: rows.map((r) => ({ month: r.month, amount: Number(r.amount), count: r.count })),
    series: rows.map((r) => ({ month: r.month, total: Number(r.amount), count: r.count })),
    byMethod: byMethod.map((r) => ({ method: r.method, total: Number(r.amount), count: r.count })),
    comparison: {
      previousTotal,
      previousCount: previous._count._all,
      changePct: previousTotal === 0 ? null : Number((((total - previousTotal) / previousTotal) * 100).toFixed(1)),
    },
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
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const warningEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + q.warningDays,
    23,
    59,
    59,
    999,
  );

  const [distributionRows, expiringSoon, newMembers, renewals, statusCounts] = await Promise.all([
    prisma.memberSubscription.groupBy({
      by: ['status'],
      where: { gymId },
      _count: { _all: true },
    }),
    prisma.memberSubscription.findMany({
      where: { gymId, status: 'ACTIVE', endDate: { gte: todayStart, lte: warningEnd } },
      orderBy: { endDate: 'asc' },
      take: 10,
      select: {
        id: true,
        endDate: true,
        status: true,
        member: { select: { id: true, user: { select: { fullName: true } } } },
      },
    }),
    prisma.$queryRaw<Array<{ month: string; count: number }>>`
      SELECT TO_CHAR(DATE_TRUNC('month', "joinDate"), 'YYYY-MM') AS month, COUNT(*)::int AS count
      FROM "MemberProfile"
      WHERE "gymId" = ${gymId}
        AND "joinDate" >= ${fromDate}
        AND "joinDate" <= ${toDate}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ month: string; count: number }>>`
      SELECT TO_CHAR(DATE_TRUNC('month', s."createdAt"), 'YYYY-MM') AS month, COUNT(*)::int AS count
      FROM "MemberSubscription" s
      WHERE s."gymId" = ${gymId}
        AND s."createdAt" >= ${fromDate}
        AND s."createdAt" <= ${toDate}
        AND EXISTS (
          SELECT 1 FROM "MemberSubscription" previous
          WHERE previous."memberId" = s."memberId"
            AND previous."gymId" = s."gymId"
            AND previous."createdAt" < s."createdAt"
        )
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.memberSubscription.count({
      where: { gymId, status: 'ACTIVE', endDate: { gte: todayStart, lte: warningEnd } },
    }),
  ]);

  const distribution = distributionRows.map((row) => ({ status: row.status, count: row._count._all }));

  return {
    period: {
      label: q.period === 'custom' ? 'Personalizado' : q.period,
      from: dbDateLiteral(fromDate),
      to: dbDateLiteral(toDate),
    },
    byStatus,
    total,
    // Current state, deliberately independent from the selected period.
    distribution,
    distributionTotal: distribution.reduce((acc, row) => acc + row.count, 0),
    expiringSoon: expiringSoon.map((row) => ({
      memberId: row.member.id,
      memberName: row.member.user.fullName,
      endDate: dbDateLiteral(row.endDate),
      status: row.status,
    })),
    newMembers: newMembers.map((row) => ({ month: row.month, count: row.count })),
    renewals: renewals.map((row) => ({ month: row.month, count: row.count })),
    expiringSoonCount: statusCounts,
  };
}

export { pageMeta, periodRange, dbDateLiteral };
