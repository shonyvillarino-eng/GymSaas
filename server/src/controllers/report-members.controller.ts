import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { parseOrThrow } from '../validations/schemas.js';
import {
  pageMeta,
  periodRange,
  dbDateLiteral,
} from '../validations/dashboard.schemas.js';
import {
  ReportMembersQuery,
  ReportAttendanceQuery,
  ReportFinancialQuery,
  ReportExportQuery,
} from '../validations/report-members.schemas.js';

export async function getReportMembers(req: {
  auth: { gymId: string; userId?: string | null };
  query: Record<string, unknown>;
}) {
  const gymId = req.auth.gymId;
  const q = parseOrThrow(ReportMembersQuery, req.query) as ReportMembersQuery;

  const where: Prisma.MemberProfileWhereInput = {
    gymId,
    ...(q.status !== 'all' ? { status: q.status as any } : {}),
    ...(q.instructorId ? { instructorMembers: { some: { instructorId: q.instructorId, isActive: true } } } : {}),
    ...(q.membership === 'NONE' ? { subscriptions: { none: {} } } : {}),
  };

  const [members, total] = await Promise.all([
    (prisma as { memberProfile: { findMany: (args: any) => Promise<any[]> } }).memberProfile.findMany({
      where,
      orderBy: q.sort === 'fullName' ? { user: { fullName: q.order as any } } : q.sort === 'documentNumber' ? { documentNumber: q.order as any } : { joinDate: q.order as any },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        documentType: true,
        documentNumber: true,
        status: true,
        joinDate: true,
        user: {
          select: {
            fullName: true,
          },
        },
        subscriptions: {
          where: {
            gymId,
            ...(q.membership !== 'all' && q.membership !== 'NONE'
              ? {
                  status: q.membership as any,
                }
              : {}),
          },
          orderBy: { endDate: 'desc' },
          take: 1,
          select: {
            status: true,
            endDate: true,
          },
        },
        instructorMembers: {
          where: { isActive: true, isPrimary: true },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          select: {
            instructor: {
              select: {
                id: true,
                user: {
                  select: {
                    fullName: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            subscriptions: true,
            obligations: true,
          },
        },
      },
    }),
    (prisma as { memberProfile: { count: (args: any) => Promise<number> } }).memberProfile.count({ where }),
  ]);

  const membersWithMembershipInfo = members.map((member: any) => ({
    id: member.id,
    fullName: member.user?.fullName || null,
    documentType: member.documentType,
    documentNumber: member.documentNumber,
    status: member.status,
    joinDate: member.joinDate.toISOString().split('T')[0],
    membershipStatus: member.subscriptions?.[0]?.status || null,
    membershipEndDate: member.subscriptions?.[0]?.endDate?.toISOString().split('T')[0] || null,
    instructorId: member.instructorMembers?.[0]?.instructor?.id || null,
    instructorFullName: member.instructorMembers?.[0]?.instructor?.user?.fullName || null,
    membershipCount: member._count?.subscriptions || 0,
    obligationCount: member._count?.obligations || 0,
  }));

  return {
    rows: membersWithMembershipInfo,
    meta: pageMeta(q.page, q.pageSize, total),
    filters: {
      status: q.status,
      membership: q.membership,
      instructorId: q.instructorId,
      sort: q.sort,
      order: q.order,
    },
  };
}

export async function getReportAttendance(req: {
  auth: { gymId: string; userId?: string | null };
  query: Record<string, unknown>;
}) {
  const gymId = req.auth.gymId;
  const q = parseOrThrow(ReportAttendanceQuery, req.query) as ReportAttendanceQuery;

  const where: Prisma.AttendanceWhereInput = {
    gymId,
    ...(q.method !== 'all' ? { method: q.method as any } : {}),
    ...(q.search
      ? {
          member: {
            OR: [
              { user: { fullName: { contains: q.search, mode: 'insensitive' } } },
              { documentNumber: { contains: q.search, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };

  if (q.period !== 'custom') {
    const { from, to } = periodRange(q.period);
    where.checkInTime = { gte: from, lte: to };
  } else if ((q as any).from && (q as any).to) {
    where.checkInTime = { gte: new Date((q as any).from), lte: new Date((q as any).to) };
  }

  const [rows, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      orderBy: q.sort === 'fullName' ? { member: { user: { fullName: q.order } } } : q.sort === 'documentNumber' ? { member: { documentNumber: q.order } } : { checkInTime: q.order },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        checkInTime: true,
        method: true,
        member: {
          select: {
            user: {
              select: {
                fullName: true,
              },
            },
            documentType: true,
            documentNumber: true,
          },
        },
      },
    }),
    prisma.attendance.count({ where }),
  ]);

  let summary: { total: number; byMethod: Record<string, number>; byDay: Record<string, number> } = {
    total: 0,
    byMethod: {},
    byDay: {},
  };

  if (rows.length > 0 || total > 0) {
    const { from, to } = q.period !== 'custom'
      ? periodRange(q.period)
      : (q.from && q.to ? { from: new Date(q.from), to: new Date(q.to) } : { from: new Date(), to: new Date() });

    const raw = await prisma.$queryRaw<Array<{ total: bigint; method: string; day: string }>>`
      SELECT
        COUNT(*)::bigint AS total,
        COALESCE("method"::text, 'UNKNOWN') AS method,
        CAST("checkInTime" AS date) AS day
      FROM "Attendance"
      WHERE "gymId" = ${gymId}
        AND "deletedAt" IS NULL
        AND "checkInTime" >= ${from}
        AND "checkInTime" <= ${to}
      GROUP BY "method", CAST("checkInTime" AS date)
      ORDER BY day ASC, method ASC
    `;

    summary = raw.reduce(
      (acc, row) => {
        // Rows are grouped by method + day: the period total is the sum of all
        // rows, not the value of the last one.
        acc.total += Number(row.total);
        acc.byMethod[row.method] = (acc.byMethod[row.method] || 0) + Number(row.total);
        acc.byDay[row.day] = (acc.byDay[row.day] || 0) + Number(row.total);
        return acc;
      },
      { total: 0, byMethod: {} as Record<string, number>, byDay: {} as Record<string, number> },
    );
  }

  return {
    rows: rows.map((r: any) => ({
      id: r.id,
      checkInTime: r.checkInTime.toISOString().split('T')[0],
      checkInTimeFull: r.checkInTime.toISOString(),
      method: r.method,
      memberFullName: r.member?.user?.fullName || null,
      memberDocument: r.member ? `${r.member.documentType || ''} ${r.member.documentNumber || ''}`.trim() : null,
    })),
    meta: pageMeta(q.page, q.pageSize, total),
    summary,
  };
}

export async function getReportFinancial(req: {
  auth: { gymId: string; userId?: string | null };
  query: Record<string, unknown>;
}) {
  const gymId = req.auth.gymId;
  const q = parseOrThrow(ReportFinancialQuery, req.query) as ReportFinancialQuery;

  const where: Prisma.PaymentRecordWhereInput = {
    gymId,
    ...(q.status !== 'all' ? { status: q.status as any } : {}),
    ...(q.method !== 'all' ? { method: q.method as any } : {}),
    ...(q.search
      ? {
          OR: [
            { receiptNumber: { contains: q.search, mode: 'insensitive' } },
            {
              member: {
                OR: [
                  { user: { fullName: { contains: q.search, mode: 'insensitive' } } },
                  { documentNumber: { contains: q.search, mode: 'insensitive' } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  if (q.period !== 'custom') {
    const { from, to } = periodRange(q.period);
    where.paidAt = { gte: from, lte: to };
  } else if ((q as any).from && (q as any).to) {
    where.paidAt = { gte: new Date((q as any).from), lte: new Date((q as any).to) };
  }

  const [rows, total, byMethod, byStatus, summary] = await Promise.all([
    prisma.paymentRecord.findMany({
      where,
      orderBy: q.sort === 'amount' ? { amount: q.order } : q.sort === 'receiptNumber' ? { receiptNumber: q.order } : { paidAt: q.order },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        receiptNumber: true,
        amount: true,
        currency: true,
        concept: true,
        method: true,
        status: true,
        paidAt: true,
        voidedAt: true,
        voidReason: true,
        member: {
          select: {
            id: true,
            user: {
              select: {
                fullName: true,
              },
            },
            documentType: true,
            documentNumber: true,
          },
        },
      },
    }),
    prisma.paymentRecord.count({ where }),
    prisma.$queryRaw<Array<{ method: string; total: bigint; count: number }>>`
      SELECT
        COALESCE("method"::text, 'UNKNOWN') AS method,
        SUM("amount")::numeric(12,2) AS total,
        COUNT(*)::int AS count
      FROM "PaymentRecord"
      WHERE "gymId" = ${gymId}
        AND "status" <> 'VOIDED'
        AND "deletedAt" IS NULL
        AND "paidAt" >= ${q.period !== 'custom' ? periodRange(q.period).from : (q.from ? new Date(q.from) : new Date())}
        AND "paidAt" <= ${q.period !== 'custom' ? periodRange(q.period).to : (q.to ? new Date(q.to) : new Date())}
      GROUP BY "method"
      ORDER BY total DESC
    `,
    prisma.$queryRaw<Array<{ status: string; total: bigint; count: number }>>`
      SELECT
        COALESCE("status"::text, 'UNKNOWN') AS status,
        SUM("amount")::numeric(12,2) AS total,
        COUNT(*)::int AS count
      FROM "PaymentRecord"
      WHERE "gymId" = ${gymId}
        AND "deletedAt" IS NULL
        AND "status"::text = ${q.status !== 'all' ? q.status : 'COMPLETED'}
        AND "paidAt" >= ${q.period !== 'custom' ? periodRange(q.period).from : (q.from ? new Date(q.from) : new Date())}
        AND "paidAt" <= ${q.period !== 'custom' ? periodRange(q.period).to : (q.to ? new Date(q.to) : new Date())}
      GROUP BY "status"
      ORDER BY total DESC
    `,
    prisma.$queryRaw<Array<{ total: bigint; count: number; covered: bigint }>>`
      SELECT
        COALESCE(SUM("amount"), 0)::numeric(12,2) AS total,
        COUNT(*)::int AS count,
        COALESCE(SUM(CASE WHEN "status" = 'COMPLETED' THEN 1 ELSE 0 END), 0)::bigint AS covered
      FROM "PaymentRecord"
      WHERE "gymId" = ${gymId}
        AND "status" <> 'VOIDED'
        AND "deletedAt" IS NULL
        AND "paidAt" >= ${q.period !== 'custom' ? periodRange(q.period).from : (q.from ? new Date(q.from) : new Date())}
        AND "paidAt" <= ${q.period !== 'custom' ? periodRange(q.period).to : (q.to ? new Date(q.to) : new Date())}
    `,
  ]);

  const totalAmount = Number(summary[0]?.total || 0);
  const totalCount = Number(summary[0]?.count || 0);
  const coveredCount = Number(summary[0]?.covered || 0);

  const byMethodMap = byMethod.reduce(
    (acc, row) => {
      acc[row.method] = { total: Number(row.total), count: row.count };
      return acc;
    },
    {} as Record<string, { total: number; count: number }>,
  );

  const byStatusMap = byStatus.reduce(
    (acc, row) => {
      acc[row.status] = { total: Number(row.total), count: row.count };
      return acc;
    },
    {} as Record<string, { total: number; count: number }>,
  );

  // Outstanding obligations for the period: receivables still unpaid at period end.
  const obligationsWhere: Prisma.FinancialObligationWhereInput = {
    gymId,
    status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
  };
  if (q.period !== 'custom') {
    const { from, to } = periodRange(q.period);
    obligationsWhere.createdAt = { gte: from, lte: to };
  } else if (q.from && q.to) {
    obligationsWhere.createdAt = { gte: new Date(q.from), lte: new Date(q.to) };
  }

  const [obligations, obligationsTotal, expiringMemberships] = await Promise.all([
    prisma.financialObligation.findMany({
      where: obligationsWhere,
      orderBy: { dueDate: 'asc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        concept: true,
        originalAmount: true,
        paidAmount: true,
        currency: true,
        dueDate: true,
        status: true,
        member: {
          select: {
            id: true,
            user: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    }),
    prisma.financialObligation.count({ where: obligationsWhere }),
    (async () => {
      if (q.period !== 'custom') {
        const { from, to } = periodRange(q.period);
        return prisma.memberSubscription.count({
          where: {
            gymId,
            status: 'ACTIVE',
            endDate: { gte: from, lte: to },
          },
        });
      }
      return 0;
    })(),
  ]);

  const obligationsWithBalance = obligations.map((o: any) => ({
    id: o.id,
    concept: o.concept,
    originalAmount: Number(o.originalAmount),
    paidAmount: Number(o.paidAmount),
    balance: Number(o.originalAmount) - Number(o.paidAmount),
    currency: o.currency,
    dueDate: o.dueDate.toISOString().split('T')[0],
    status: o.status,
    memberFullName: o.member?.user?.fullName || null,
  }));

  return {
    rows: rows.map((r: any) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      amount: Number(r.amount),
      currency: r.currency,
      concept: r.concept,
      method: r.method,
      status: r.status,
      paidAt: r.paidAt?.toISOString().split('.')[0] || null,
      voidedAt: r.voidedAt?.toISOString().split('.')[0] || null,
      voidReason: r.voidReason,
      memberFullName: r.member?.user?.fullName || null,
      memberDocument: r.member ? `${r.member.documentType || ''} ${r.member.documentNumber || ''}`.trim() : null,
    })),
    obligations: obligationsWithBalance,
    meta: pageMeta(q.page, q.pageSize, total),
    obligationMeta: pageMeta(q.page, q.pageSize, obligationsTotal),
    summary: {
      totalAmount,
      totalCount,
      coveredCount,
      coveredAmount: totalAmount, // In this system, recorded = realized.
      byMethod: byMethodMap,
      byStatus: byStatusMap,
    },
    expiringMembershipsCount: expiringMemberships,
  };
}

export async function getReportExport(req: {
  auth: { gymId: string; userId?: string | null };
  query: Record<string, unknown>;
}) {
  const gymId = req.auth.gymId;
  const q = parseOrThrow(ReportExportQuery, req.query) as ReportExportQuery;

  const from = q.period !== 'custom'
    ? periodRange(q.period).from
    : q.from ? new Date(q.from) : new Date();
  const to = q.period !== 'custom'
    ? periodRange(q.period).to
    : q.to ? new Date(q.to) : new Date();

  if (q.report === 'members') {
    const where: Prisma.MemberProfileWhereInput = {
      gymId,
      ...(q.status !== 'all' ? { status: q.status as any } : {}),
      ...((q as any).instructorId ? { instructorMembers: { some: { instructorId: (q as any).instructorId, isActive: true } } } : {}),
    };

    const members = await prisma.memberProfile.findMany({
      where,
      orderBy: { joinDate: 'desc' },
      select: {
        id: true,
        user: { select: { fullName: true } },
        documentType: true,
        documentNumber: true,
        status: true,
        joinDate: true,
        subscriptions: {
          where: {
            gymId,
            ...((q as any).membershipStatus !== 'all'
              ? {
                  status: (q as any).membershipStatus === 'NONE'
                    ? { in: ['CANCELLED', 'FROZEN', 'PENDING'] }
                    : { in: [(q as any).membershipStatus] },
                }
              : {}),
          },
          orderBy: { endDate: 'desc' },
          take: 1,
          select: { status: true, endDate: true },
        },
        instructorMembers: {
          where: { isActive: true, isPrimary: true },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          select: { instructor: { select: { id: true, user: { select: { fullName: true } } } } },
        },
      },
    });

    const rows = members.map((m: any) => ({
      id: m.id,
      fullName: m.user?.fullName || null,
      documentType: m.documentType,
      documentNumber: m.documentNumber,
      status: m.status,
      joinDate: dbDateLiteral(m.joinDate),
      membershipStatus: m.subscriptions?.[0]?.status || null,
      membershipEndDate: m.subscriptions?.[0]?.endDate ? dbDateLiteral(m.subscriptions[0].endDate) : null,
      instructorFullName: m.instructorMembers?.[0]?.instructor?.user?.fullName || null,
    }));

    return {
      rows,
      meta: { page: 1, pageSize: rows.length, total: rows.length, totalPages: 1 },
      exportMeta: {
        report: 'members',
        period: q.period,
        from: q.period !== 'custom' ? from.toISOString() : q.from || null,
        to: q.period !== 'custom' ? to.toISOString() : q.to || null,
      },
    };
  }

  if (q.report === 'attendance') {
    const where: Prisma.AttendanceWhereInput = {
      gymId,
      ...((q as any).method !== 'all' ? { method: (q as any).method as any } : {}),
      ...((q as any).search
        ? {
            member: {
              OR: [
                { user: { fullName: { contains: (q as any).search, mode: 'insensitive' } } },
                { documentNumber: { contains: (q as any).search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    if (q.period !== 'custom') {
      const { from, to } = periodRange(q.period);
      where.checkInTime = { gte: from, lte: to };
    } else if ((q as any).from && (q as any).to) {
      where.checkInTime = { gte: new Date((q as any).from), lte: new Date((q as any).to) };
    }

    const rows = await prisma.attendance.findMany({
      where,
      orderBy: { checkInTime: 'desc' },
      select: {
        id: true,
        checkInTime: true,
        method: true,
        member: {
          select: { user: { select: { fullName: true } }, documentType: true, documentNumber: true },
        },
      },
    });

    const serialized = rows.map((r: any) => ({
      id: r.id,
      checkInTime: dbDateLiteral(r.checkInTime),
      checkInTimeFull: r.checkInTime.toISOString(),
      method: r.method,
      memberFullName: r.member?.user?.fullName || null,
      memberDocument: r.member ? `${r.member.documentType || ''} ${r.member.documentNumber || ''}`.trim() : null,
    }));

    const byDay: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    for (const r of serialized) {
      if (r.checkInTime) {
        byDay[r.checkInTime] = (byDay[r.checkInTime] || 0) + 1;
      }
      if (r.method) {
        byMethod[r.method] = (byMethod[r.method] || 0) + 1;
      }
    }

    return {
      rows: serialized,
      meta: { page: 1, pageSize: serialized.length, total: serialized.length, totalPages: 1 },
      summary: { total: serialized.length, byMethod: byMethod || {}, byDay: byDay || {} },
      exportMeta: {
        report: 'attendance',
        period: q.period,
        from: q.period !== 'custom' ? from.toISOString() : q.from || null,
        to: q.period !== 'custom' ? to.toISOString() : q.to || null,
      },
    };
  }

  // Financial export
  const where: Prisma.PaymentRecordWhereInput = {
    gymId,
    ...((q as any).financialStatus !== 'all' ? { status: (q as any).financialStatus as any } : {}),
    ...((q as any).financialMethod !== 'all' ? { method: (q as any).financialMethod as any } : {}),
    ...((q as any).search
      ? {
          OR: [
            { receiptNumber: { contains: (q as any).search, mode: 'insensitive' } },
            {
              member: {
                OR: [
                  { user: { fullName: { contains: (q as any).search, mode: 'insensitive' } } },
                  { documentNumber: { contains: (q as any).search, mode: 'insensitive' } },
                ],
              },
            },
          ],
        }
      : {}),
  };
  if (q.period !== 'custom') {
    const { from: f, to: t } = periodRange(q.period);
    where.paidAt = { gte: f, lte: t };
  } else if ((q as any).from && (q as any).to) {
    where.paidAt = { gte: new Date((q as any).from), lte: new Date((q as any).to) };
  }

  const rows = await prisma.paymentRecord.findMany({
    where,
    orderBy: { paidAt: 'desc' },
    select: {
      id: true,
      receiptNumber: true,
      amount: true,
      currency: true,
      concept: true,
      method: true,
      status: true,
      paidAt: true,
      voidedAt: true,
      voidReason: true,
      member: {
        select: { user: { select: { fullName: true } }, documentType: true, documentNumber: true },
      },
    },
  });

  const serialized = rows.map((r: any) => ({
    id: r.id,
    receiptNumber: r.receiptNumber,
    amount: Number(r.amount),
    currency: r.currency,
    concept: r.concept,
    method: r.method,
    status: r.status,
    paidAt: r.paidAt?.toISOString().split('.')[0] || null,
    voidedAt: r.voidedAt?.toISOString().split('.')[0] || null,
    voidReason: r.voidReason,
    memberFullName: r.member?.user?.fullName || null,
    memberDocument: r.member ? `${r.member.documentType || ''} ${r.member.documentNumber || ''}`.trim() : null,
  }));

  const byMethod: Record<string, { total: number; count: number }> = {};
  const byStatus: Record<string, { total: number; count: number }> = {};
  let totalAmount = 0;
  for (const r of serialized) {
    totalAmount += r.amount || 0;
    if (r.method) {
      const m = byMethod[r.method] || { total: 0, count: 0 };
      m.total += r.amount || 0;
      m.count += 1;
      byMethod[r.method] = m;
    }
    if (r.status) {
      const s = byStatus[r.status] || { total: 0, count: 0 };
      s.total += r.amount || 0;
      s.count += 1;
      byStatus[r.status] = s;
    }
  }

  return {
    rows: serialized,
    meta: { page: 1, pageSize: serialized.length, total: serialized.length, totalPages: 1 },
    summary: {
      totalAmount: totalAmount || 0,
      totalCount: serialized.length || 0,
      coveredCount: (serialized.filter((r: any) => r.status === 'COMPLETED') || []).length,
      coveredAmount: totalAmount || 0,
      byMethod,
      byStatus,
    },
    exportMeta: {
      report: 'financial',
      period: q.period,
      from: q.period !== 'custom' ? from.toISOString() : q.from || null,
      to: q.period !== 'custom' ? to.toISOString() : q.to || null,
    },
  };
}
