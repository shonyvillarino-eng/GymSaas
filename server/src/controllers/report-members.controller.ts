import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { writeAudit, clientIp } from '../services/audit.js';
import { buildReportPdf, buildReportXlsx, type ReportColumn, type ReportDocument } from '../services/reportExport.js';
import { exportLabels } from '../services/reportLabels.js';
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

/* ------------------------------------------------------------------ */
/* File export (PDF / XLSX)                                            */
/* ------------------------------------------------------------------ */

function safeTimezone(timezone: string | null | undefined): string {
  if (!timezone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return 'UTC';
  }
}

function localeFor(language: string | null | undefined, locale: string | null | undefined): string {
  if (locale && /^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) return locale;
  switch ((language ?? 'es').slice(0, 2)) {
    case 'en':
      return 'en-US';
    case 'pt':
      return 'pt-BR';
    default:
      return 'es-ES';
  }
}

/**
 * Generates a real downloadable file for the selected report and filters.
 * The tenant always comes from the session; the query cannot change it.
 */
export async function exportReport(req: Request, res: Response) {
  const gymId = req.auth?.gymId;
  if (!gymId) throw new AppError('Gym session required', 403);

  const q = parseOrThrow(ReportExportQuery, req.query) as ReportExportQuery;
  const format = q.format ?? 'xlsx';

  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: { name: true, currency: true, timezone: true, language: true, locale: true },
  });
  if (!gym) throw new AppError('Gym not found', 404);

  // Reuse the same dataset builder as the JSON preview: filters, tenant scope
  // and payment rules stay in one place.
  const dataset = (await getReportExport({
    auth: { gymId, userId: req.auth?.userId ?? null },
    query: req.query as Record<string, unknown>,
  })) as { rows: Array<Record<string, unknown>>; exportMeta: Record<string, unknown> };

  const labels = exportLabels(gym.language);
  const locale = localeFor(gym.language, gym.locale);
  const timezone = safeTimezone(gym.timezone);
  const currency = gym.currency || 'USD';

  const from = q.period !== 'custom' ? periodRange(q.period).from : q.from ? new Date(q.from) : new Date();
  const to = q.period !== 'custom' ? periodRange(q.period).to : q.to ? new Date(q.to) : new Date();
  const generatedAt = new Date();

  const formatDate = (date: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: timezone }).format(date);
  const formatDateTime = (date: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(date);
  const formatMoney = (value: number, rowCurrency = currency) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: rowCurrency }).format(value);
    } catch {
      return `${value.toFixed(2)} ${rowCurrency}`;
    }
  };

  const filterPairs: Array<[string, string]> = [];
  if (q.report === 'members') {
    if (q.status !== 'all') filterPairs.push([labels.status, q.status]);
    if (q.membershipStatus !== 'all') filterPairs.push([labels.membership, q.membershipStatus]);
    if (q.instructorId) filterPairs.push([labels.instructor, q.instructorId]);
  } else if (q.report === 'attendance') {
    if (q.method !== 'all') filterPairs.push([labels.method, q.method]);
  } else {
    if (q.financialStatus !== 'all') filterPairs.push([labels.paymentStatus, q.financialStatus]);
    if (q.financialMethod !== 'all') filterPairs.push([labels.method, q.financialMethod]);
  }
  if (q.search) filterPairs.push(['Search', q.search]);
  if (filterPairs.length === 0) filterPairs.push([labels.filters, labels.all]);

  const periodLabel = `${labels.period}: ${formatDate(from)} – ${formatDate(to)}`;

  let title = labels.reportTitle;
  let columns: ReportColumn[] = [];
  let rows: Array<Record<string, unknown>> = [];
  const totals: Array<[string, string]> = [];

  if (q.report === 'members') {
    title = labels.membersTitle;
    columns = [
      { key: 'fullName', label: labels.name, width: 190 },
      { key: 'document', label: labels.document, width: 120 },
      { key: 'status', label: labels.status, width: 90 },
      { key: 'joinDate', label: labels.joinDate, width: 110 },
      { key: 'membership', label: labels.membership, width: 110 },
      { key: 'expiry', label: labels.expiry, width: 110 },
      { key: 'instructor', label: labels.instructor, width: 150 },
    ];
    rows = dataset.rows.map((row) => ({
      fullName: row.fullName ?? '',
      document: `${row.documentType ?? ''} ${row.documentNumber ?? ''}`.trim(),
      status: row.status ?? '',
      joinDate: row.joinDate ?? '',
      membership: row.membershipStatus ?? labels.none,
      expiry: row.membershipEndDate ?? '—',
      instructor: row.instructorFullName ?? '—',
    }));
    totals.push([labels.totalMembers, String(rows.length)]);
  } else if (q.report === 'attendance') {
    title = labels.attendanceTitle;
    columns = [
      { key: 'member', label: labels.name, width: 200 },
      { key: 'document', label: labels.document, width: 130 },
      { key: 'date', label: labels.date, width: 110 },
      { key: 'time', label: labels.time, width: 90 },
      { key: 'method', label: labels.method, width: 100 },
    ];
    rows = dataset.rows.map((row) => {
      const full = typeof row.checkInTimeFull === 'string' ? new Date(row.checkInTimeFull) : null;
      return {
        member: row.memberFullName ?? '',
        document: row.memberDocument ?? '',
        date: full && !Number.isNaN(full.getTime()) ? formatDate(full) : row.checkInTime ?? '',
        time: full && !Number.isNaN(full.getTime()) ? new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: timezone }).format(full) : '',
        method: row.method ?? '',
      };
    });
    const manual = rows.filter((row) => row.method === 'MANUAL').length;
    const qr = rows.filter((row) => row.method === 'QR').length;
    totals.push([labels.totalAttendances, String(rows.length)]);
    totals.push([labels.manualAttendances, String(manual)]);
    totals.push([labels.qrAttendances, String(qr)]);
  } else {
    title = labels.financialTitle;
    columns = [
      { key: 'receipt', label: labels.receipt, width: 110 },
      { key: 'member', label: labels.name, width: 160 },
      { key: 'concept', label: labels.concept, width: 170 },
      { key: 'method', label: labels.method, width: 100 },
      { key: 'status', label: labels.paymentStatus, width: 100 },
      { key: 'paidAt', label: labels.paidAt, width: 120 },
      { key: 'amount', label: labels.amount, width: 110, align: 'right' },
      { key: 'currency', label: labels.currency, width: 70 },
    ];
    rows = dataset.rows.map((row) => ({
      receipt: row.receiptNumber ?? '',
      member: row.memberFullName ?? '',
      concept: row.concept ?? '',
      method: row.method ?? '',
      status: row.status ?? '',
      paidAt: typeof row.paidAt === 'string' ? row.paidAt.slice(0, 16).replace('T', ' ') : '',
      amount: Number(row.amount ?? 0),
      currency: row.currency ?? currency,
    }));

    const valid = rows.filter((row) => row.status !== 'VOIDED');
    const voided = rows.filter((row) => row.status === 'VOIDED');
    const byCurrency = new Map<string, number>();
    const byMethod = new Map<string, number>();
    for (const row of valid) {
      const rowCurrency = String(row.currency || currency);
      byCurrency.set(rowCurrency, (byCurrency.get(rowCurrency) ?? 0) + Number(row.amount ?? 0));
      const method = String(row.method || 'OTHER');
      byMethod.set(method, (byMethod.get(method) ?? 0) + Number(row.amount ?? 0));
    }
    totals.push([
      labels.validIncome,
      [...byCurrency.entries()].map(([rowCurrency, value]) => formatMoney(value, rowCurrency)).join(' · ') || formatMoney(0),
    ]);
    totals.push([
      labels.voidedPayments,
      [...new Set(voided.map((row) => String(row.currency || currency)))]
        .map((rowCurrency) => formatMoney(voided.filter((row) => String(row.currency || currency) === rowCurrency).reduce((sum, row) => sum + Number(row.amount ?? 0), 0), rowCurrency))
        .join(' · ') || formatMoney(0),
    ]);
    totals.push([labels.voidedCount, String(voided.length)]);
    totals.push([
      labels.byMethod,
      [...byMethod.entries()].map(([method, value]) => `${method}: ${formatMoney(value)}`).join(' · ') || labels.none,
    ]);
  }

  const document: ReportDocument = {
    gymName: gym.name,
    title,
    periodLabel,
    generatedAt,
    filters: filterPairs,
    columns,
    rows,
    totals,
    locale,
    timezone,
  };

  const buffer = format === 'pdf' ? await buildReportPdf(document) : await buildReportXlsx(document);
  const filename = `${q.report}-${generatedAt.toISOString().slice(0, 10)}.${format}`;
  const contentType =
    format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  await writeAudit({
    gymId,
    userId: req.auth?.userId ?? null,
    action: 'EXPORT',
    entityType: 'Report',
    entityId: q.report,
    newValues: { format, rows: rows.length, period: q.period },
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });

  res.status(200);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(buffer);
}
