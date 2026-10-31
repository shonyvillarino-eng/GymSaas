/* ---------------- API shapes ---------------- */

export interface DashboardOverview {
  gym: { id: string; name: string; logoUrl: string | null };
  period: { label: string; from: string; to: string };
  members: { total: number; active: number; inactive: number };
  memberships: { active: number; expired: number; pending: number; frozen: number; expiringSoon: number };
  attendance: { today: number; thisMonth: number };
  revenue: { currency: string; collectedThisMonth: string; collectedThisMonthCount: number; pendingObligations: string };
}

export interface DashboardAttendance {
  period: { label: string; from: string; to: string };
  byDay: Array<{ day: string; count: number }>;
  byMethod: Array<{ method: string; count: number }>;
  total: number;
}

export interface DashboardRevenue {
  period: { label: string; from: string; to: string };
  byMonth: Array<{ month: string; amount: number; count: number }>;
  total: number;
  count: number;
}

export interface DashboardMemberships {
  period: { label: string; from: string; to: string };
  byStatus: Record<string, number>;
  total: number;
  expiringSoonCount: number;
}

export interface ReportMembersRow {
  id: string;
  fullName: string;
  documentType: string | null;
  documentNumber: string | null;
  status: string;
  joinDate: string;
  membershipStatus: string | null;
  membershipEndDate: string | null;
  instructorId: string | null;
  instructorFullName: string | null;
  membershipCount: number;
  obligationCount: number;
}

export interface ReportMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ReportMembersResponse {
  rows: ReportMembersRow[];
  meta: ReportMeta;
  filters: {
    status: string;
    membership: string;
    instructorId: string | null;
    sort: string;
    order: string;
  };
}

export interface AttendanceRow {
  id: string;
  checkInTime: string;
  checkInTimeFull: string | null;
  method: string;
  memberFullName: string;
  memberDocument: string;
}

export interface AttendanceSummary {
  total: number;
  byMethod: Record<string, number>;
  byDay: Record<string, number>;
}

export interface ReportAttendanceResponse {
  rows: AttendanceRow[];
  meta: ReportMeta;
  summary: AttendanceSummary;
}

export interface FinancialRow {
  id: string;
  receiptNumber: string;
  amount: number;
  currency: string;
  concept: string;
  method: string;
  status: string;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  memberFullName: string | null;
  memberDocument: string | null;
}

export interface ObligationRow {
  id: string;
  concept: string;
  originalAmount: number;
  paidAmount: number;
  balance: number;
  currency: string;
  dueDate: string;
  status: string;
  memberFullName: string | null;
}

export interface MethodSummary {
  total: number;
  count: number;
}

export interface StatusSummary {
  total: number;
  count: number;
}

export interface FinancialSummary {
  totalAmount: number;
  totalCount: number;
  coveredCount: number;
  coveredAmount: number;
  byMethod: Record<string, MethodSummary>;
  byStatus: Record<string, StatusSummary>;
}

export interface FinancialResponse {
  rows: FinancialRow[];
  obligations: ObligationRow[];
  meta: ReportMeta;
  obligationMeta: ReportMeta;
  summary: FinancialSummary;
  expiringMembershipsCount: number;
}

export type ExportReport = 'members' | 'attendance' | 'financial';
export type ExportFormat = 'pdf' | 'xlsx';

/* ---------------- Labels ---------------- */

export const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Vigente',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
  PENDING: 'Pendiente',
  FROZEN: 'Congelada',
};

export const MEMBER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  SUSPENDED: 'Suspendido',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Registrado',
  PARTIAL: 'Parcial',
  PENDING: 'Pendiente',
  VOIDED: 'Anulado',
  REFUNDED: 'Reembolsado',
  FAILED: 'Fallido',
};

export const OBLIGATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcialmente pagado',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
  CANCELLED: 'Cancelado',
};

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  BANK_TRANSFER: 'Transferencia bancaria',
  CARD: 'Tarjeta (declarada)',
  CHECK: 'Cheque',
  OTHER: 'Otro',
};

/** Membership status options including NONE for the report filter. */
export const MEMBERSHIP_REPORT_OPTIONS = [
  { value: 'all', label: 'Cualquier membresía' },
  { value: 'ACTIVE', label: 'Vigente' },
  { value: 'EXPIRED', label: 'Vencida' },
  { value: 'CANCELLED', label: 'Cancelada' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'FROZEN', label: 'Congelada' },
  { value: 'NONE', label: 'Sin membresía' },
] as const;

export const MEMBER_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'INACTIVE', label: 'Inactivo' },
  { value: 'SUSPENDED', label: 'Suspendido' },
] as const;

export const PAYMENT_STATUS_OPTIONS = [
  { value: 'all', label: 'Cualquier estado' },
  { value: 'COMPLETED', label: 'Registrado' },
  { value: 'PARTIAL', label: 'Parcial' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'VOIDED', label: 'Anulado' },
  { value: 'REFUNDED', label: 'Reembolsado' },
  { value: 'FAILED', label: 'Fallido' },
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'all', label: 'Cualquier método' },
  { value: 'CASH', label: 'Efectivo' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'BANK_TRANSFER', label: 'Transferencia bancaria' },
  { value: 'CARD', label: 'Tarjeta (declarada)' },
  { value: 'CHECK', label: 'Cheque' },
  { value: 'OTHER', label: 'Otro' },
] as const;

export const OBLIGATION_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'PARTIAL', label: 'Parcialmente pagado' },
  { value: 'OVERDUE', label: 'Vencido' },
] as const;

export const ATTENDANCE_METHOD_OPTIONS = [
  { value: 'all', label: 'Cualquier método' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'QR', label: 'QR' },
] as const;

export function formattedMoney(value: number, currency?: string): string {
  return `${value.toFixed(2)}${currency ? ` ${currency}` : ''}`;
}

export function formatDateForDisplay(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export function formatDateTimeForDisplay(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function statusBadge(status: string): string {
  if (status === 'ACTIVE' || status === 'COMPLETED') return 'bg-primary/10 text-primary';
  if (status === 'EXPIRED' || status === 'VOIDED' || status === 'OVERDUE') return 'bg-destructive/10 text-destructive';
  if (status === 'PENDING' || status === 'PARTIAL') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  if (status === 'CANCELLED' || status === 'PAID') return 'bg-muted text-muted-foreground';
  return 'bg-muted text-muted-foreground';
}
