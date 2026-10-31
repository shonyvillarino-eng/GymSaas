import { z } from 'zod';

export const dashboardPeriodSchema = z.object({}).strict();

export const dashboardAttendanceQuerySchema = z
  .object({
    period: z.enum(['today', '7d', '30d', 'month', 'previous_month', 'year', 'custom']).default('7d'),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

export const dashboardRevenueQuerySchema = z
  .object({
    period: z.enum(['today', '7d', '30d', 'month', 'previous_month', 'year', 'custom']).default('month'),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

export const dashboardMembershipsQuerySchema = z
  .object({
    period: z.enum(['today', '7d', '30d', 'month', 'previous_month', 'year', 'custom']).default('month'),
    warningDays: z.coerce.number().int().min(1).max(60).default(7),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

export const dashboardOverviewQuerySchema = z
  .object({
    period: z.enum(['today', '7d', '30d', 'month', 'previous_month', 'year', 'custom']).default('month'),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

export const reportMembersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(120).optional(),
    status: z
      .enum(['all', 'ACTIVE', 'INACTIVE', 'SUSPENDED'])
      .default('all'),
    membership: z
      .enum(['all', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING', 'FROZEN'])
      .default('all'),
    instructorId: z.string().trim().max(64).optional(),
    sort: z.enum(['joinDate', 'fullName', 'documentNumber']).default('joinDate'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const reportAttendanceQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(120).optional(),
    period: z
      .enum(['today', '7d', '30d', 'month', 'previous_month', 'year', 'custom'])
      .default('month'),
    method: z.enum(['all', 'MANUAL', 'QR']).default('all'),
    sort: z.enum(['checkInTime', 'fullName', 'documentNumber']).default('checkInTime'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine((value) => {
    if (value.period !== 'custom') return true;
    const { from, to } = value as { from?: string; to?: string };
    if (!from || !to) return false;
    return from <= to;
  }, { path: ['to'], message: 'End date must be on or after start date.' });

export const reportFinancialQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(120).optional(),
    period: z
      .enum(['today', '7d', '30d', 'month', 'previous_month', 'year', 'custom'])
      .default('month'),
    status: z
      .enum(['all', 'COMPLETED', 'PARTIAL', 'PENDING', 'VOIDED', 'REFUNDED', 'FAILED'])
      .default('all'),
    method: z
      .enum(['all', 'CASH', 'TRANSFER', 'BANK_TRANSFER', 'CARD', 'CHECK', 'OTHER'])
      .default('all'),
    sort: z.enum(['paidAt', 'amount', 'receiptNumber']).default('paidAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine((value) => {
    if (value.period !== 'custom') return true;
    const { from, to } = value as { from?: string; to?: string };
    if (!from || !to) return false;
    return from <= to;
  }, { path: ['to'], message: 'End date must be on or after start date.' });

export const reportExportQuerySchema = z
  .object({
    report: z.enum(['members', 'attendance', 'financial']),
    format: z.enum(['pdf', 'xlsx']),
    period: z
      .enum(['today', '7d', '30d', 'month', 'previous_month', 'year', 'custom'])
      .default('month'),
    method: z
      .enum(['all', 'MANUAL', 'QR'])
      .default('all'),
    status: z
      .enum(['all', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING', 'FROZEN'])
      .default('all'),
    membershipStatus: z
      .enum(['all', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING', 'FROZEN', 'NONE'])
      .default('all'),
    financialStatus: z
      .enum(['all', 'COMPLETED', 'PARTIAL', 'PENDING', 'VOIDED', 'REFUNDED', 'FAILED'])
      .default('all'),
    financialMethod: z
      .enum(['all', 'CASH', 'TRANSFER', 'BANK_TRANSFER', 'CARD', 'CHECK', 'OTHER'])
      .default('all'),
  })
  .strict()
  .refine((value) => {
    if (value.period !== 'custom') return true;
    const { from, to } = value as { from?: string; to?: string };
    if (!from || !to) return false;
    return from <= to;
  }, { path: ['to'], message: 'End date must be on or after start date.' });

export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;
export type DashboardAttendanceQuery = z.infer<typeof dashboardAttendanceQuerySchema>;
export type DashboardRevenueQuery = z.infer<typeof dashboardRevenueQuerySchema>;
export type DashboardMembershipsQuery = z.infer<typeof dashboardMembershipsQuerySchema>;
export type DashboardOverviewQuery = z.infer<typeof dashboardOverviewQuerySchema>;
export type ReportMembersQuery = z.infer<typeof reportMembersQuerySchema>;
export type ReportAttendanceQuery = z.infer<typeof reportAttendanceQuerySchema>;
export type ReportFinancialQuery = z.infer<typeof reportFinancialQuerySchema>;
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;

/** Shared query helpers reused by dashboard and reports controllers. */
export function pageMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function periodRange(period: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  switch (period) {
    case 'today':
      return {
        from: new Date(y, m, d, 0, 0, 0, 0),
        to: new Date(y, m, d, 23, 59, 59, 999),
      };
    case '7d':
      return {
        from: new Date(y, m, d - 6, 0, 0, 0, 0),
        to: new Date(y, m, d, 23, 59, 59, 999),
      };
    case '30d':
      return {
        from: new Date(y, m, d - 29, 0, 0, 0, 0),
        to: new Date(y, m, d, 23, 59, 59, 999),
      };
    case 'month':
      return {
        from: new Date(y, m, 1, 0, 0, 0, 0),
        to: new Date(y, m + 1, 0, 23, 59, 59, 999),
      };
    case 'previous_month':
      return {
        from: new Date(y, m, 0, 0, 0, 0, 0),
        to: new Date(y, m, 0, 23, 59, 59, 999),
      };
    case 'year':
      return {
        from: new Date(y, 0, 1, 0, 0, 0, 0),
        to: new Date(y, 11, 31, 23, 59, 59, 999),
      };
    default:
      throw new Error(`Período desconocido: ${period}`);
  }
}

export function dbDateLiteral(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
