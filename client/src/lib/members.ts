import { MEMBER_STATUSES, type MemberStatus } from '@gym-saas/shared';

/* ---------------- API shapes ---------------- */

export interface MemberMembership {
  planName: string;
  status: string;
  endDate: string;
  expired?: boolean;
}

export interface MemberRow {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  documentType: string | null;
  documentNumber: string | null;
  joinDate: string;
  status: MemberStatus;
  instructor: { id: string; fullName: string; isPrimary?: boolean } | null;
  membership: MemberMembership | null;
}

export interface MemberDetail extends MemberRow {
  birthDate: string | null;
  gender: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  attendance: { allowed: boolean; rule: string };
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRecord {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  priceAtPurchase: string;
  discountAmount: string;
  finalPrice: string;
  notes: string | null;
  cancelledAt: string | null;
  plan: { name: string; currency: string };
}

export interface PaymentRecord {
  id: string;
  receiptNumber: string;
  amount: string;
  currency: string;
  concept: string;
  method: string;
  status: string;
  paidAt: string;
  reference: string | null;
}

export interface AttendanceRecord {
  id: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: string;
  method: string;
  result: string;
  exceptionReason: string | null;
  notes: string | null;
}

export interface RoutineRecord {
  id: string;
  name: string;
  difficulty: string;
  estimatedWeeks: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  creator: { fullName: string } | null;
}

export interface InstructorOption {
  id: string;
  fullName: string;
  email: string | null;
}

export interface MemberObligation {
  id: string;
  concept: string;
  originalAmount: string;
  paidAmount: string;
  balance: string;
  currency: string;
  issuedAt: string;
  dueDate: string;
  status: string;
  subscriptionId: string | null;
  cancelledAt: string | null;
}

export interface MemberFinancial {
  currency: string | null;
  obligations: MemberObligation[];
  outstandingTotal: string;
  outstandingCount: number;
  lastPaymentAt: string | null;
}

export interface MemberSummary {
  member: MemberDetail;
  memberships: MembershipRecord[];
  payments: PaymentRecord[];
  pending: { amount: string; count: number };
  attendance: {
    total: number;
    last30Days: number;
    last7Days: number;
    thisMonth: number;
    lastVisitAt: string | null;
    averagePerWeek: number;
    weekly: Array<{ weekStart: string; count: number }>;
    recent: AttendanceRecord[];
  };
  routines: RoutineRecord[];
  instructor: InstructorOption | null;
  availableInstructors: InstructorOption[];
  financial: MemberFinancial;
}

export interface PagedMembers {
  data: MemberRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

/* ---------------- Labels and formatting ---------------- */

export const STATUS_LABELS: Record<MemberStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
};

export const DOCUMENT_LABELS: Record<string, string> = {
  DNI: 'DNI',
  CUIL: 'CUIL',
  CUIT: 'CUIT',
  PASSPORT: 'Passport',
  NATIONAL_ID: 'National ID',
  DRIVER_LICENSE: "Driver's license",
  OTHER: 'Other',
};

export const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

export const SUBSCRIPTION_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  PENDING: 'Pending',
  FROZEN: 'Frozen',
};

/** Badge classes per administrative status (used across list and detail). */
export function statusBadge(status: MemberStatus): string {
  if (status === 'ACTIVE') return 'bg-primary/10 text-primary';
  if (status === 'SUSPENDED') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
}

export function statusLabel(status: MemberStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Date-only values are stored at local midnight; format without UTC shifting. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function formatDocument(row: { documentType: string | null; documentNumber: string | null }): string {
  if (!row.documentNumber) return '—';
  const type = row.documentType ? `${DOCUMENT_LABELS[row.documentType] ?? row.documentType}: ` : '';
  return `${type}${row.documentNumber}`;
}

export function formatMoney(amount: string | number, currency?: string | null): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return String(amount);
  return currency ? `${value.toFixed(2)} ${currency}` : value.toFixed(2);
}

export { MEMBER_STATUSES };
