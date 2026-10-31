/* ---------------- API shapes ---------------- */

export type MembershipStateValue = 'ACTIVE' | 'EXPIRING_SOON' | 'PENDING' | 'EXPIRED' | 'CANCELLED';

export interface PortalNotice {
  id: string;
  kind: 'MEMBERSHIP' | 'PAYMENT' | 'ROUTINE' | 'GYM';
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  date: string | null;
}

export interface PortalGym {
  id: string;
  name: string;
  logoUrl: string | null;
  city: string | null;
  province: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  currency: string;
}

export interface PortalDashboard {
  generatedAt: string;
  member: { id: string; fullName: string; avatarUrl: string | null; status: string; joinDate: string };
  gym: PortalGym;
  membership: {
    id: string;
    planName: string;
    status: string;
    state: MembershipStateValue;
    startDate: string;
    endDate: string;
    daysRemaining: number;
    expiringSoon: boolean;
    currency: string;
  } | null;
  access: {
    allowed: boolean;
    reasons: Array<{ code: string; message: string }>;
    policy: { requiresActiveMember: boolean; requiresValidMembership: boolean };
  };
  attendance: { total: number; thisMonth: number; lastVisitAt: string | null; lastVisitMethod: string | null };
  payments: {
    currency: string;
    outstandingTotal: string;
    overdueTotal: string;
    openCount: number;
    lastPayment: {
      id: string;
      amount: string;
      currency: string;
      concept: string;
      paidAt: string;
      status: string;
      method: string;
      receiptNumber: string;
    } | null;
    paidThisMonth: string;
  };
  routine: {
    id: string;
    name: string;
    description: string | null;
    sessions: number;
    instructor: string | null;
    startDate: string | null;
    updatedAt: string;
  } | null;
  notices: PortalNotice[];
}

export interface PortalProfile {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  joinDate: string;
  status: string;
  address: string | null;
  gym: Omit<PortalGym, 'address' | 'province'> & { address?: string | null; province?: string | null };
  editable: { fullName: boolean; phone: boolean; email: boolean };
  emailNote: string;
}

export interface PortalMembership {
  current: {
    id: string;
    planName: string;
    planDescription: string | null;
    planDuration: string | null;
    price: string;
    discount: string;
    finalPrice: string;
    currency: string;
    startDate: string;
    endDate: string;
    status: string;
    state: MembershipStateValue;
    daysRemaining: number;
    expiringSoon: boolean;
    cancelledAt: string | null;
    notes: string | null;
  } | null;
  renewal: {
    required: boolean;
    contactPhone: string | null;
    contactEmail: string | null;
    acceptedPaymentMethods: string[];
    note: string;
  };
  counts: { total: number; expired: number; valid: number };
}

export interface PortalMembershipHistoryRow {
  id: string;
  planName: string;
  currency: string;
  price: string;
  discount: string;
  finalPrice: string;
  startDate: string;
  endDate: string;
  status: string;
  state: MembershipStateValue;
  cancelledAt: string | null;
  notes: string | null;
  assignedAt: string;
  daysRemaining: number;
  timezone: string;
}

export interface PortalAttendanceRow {
  id: string;
  checkInTime: string;
  method: 'MANUAL' | 'QR';
  status: string;
  result: 'ALLOWED' | 'EXCEPTION';
  notes: string | null;
}

export interface PortalPaymentRow {
  id: string;
  receiptNumber: string;
  concept: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  paidAt: string;
  reference: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  obligationId: string | null;
  subscriptionId: string | null;
  obligation: { id: string; concept: string; dueDate: string; status: string } | null;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PortalPage<T, S> {
  data: T[];
  meta: PageMeta;
  summary: S;
}

/* ---------------- Labels ---------------- */

export const MEMBERSHIP_STATE_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  EXPIRING_SOON: 'Expiring soon',
  PENDING: 'Not started',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

export function membershipStateBadge(state: string | null | undefined): string {
  switch (state) {
    case 'ACTIVE':
      return 'bg-primary/10 text-primary';
    case 'EXPIRING_SOON':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'EXPIRED':
      return 'bg-destructive/10 text-destructive';
    case 'CANCELLED':
      return 'bg-muted text-muted-foreground line-through';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export const MEMBER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
};

export const ATTENDANCE_METHOD_LABELS: Record<string, string> = {
  MANUAL: 'Manual (reception)',
  QR: 'QR code',
};

export const NOTICE_SEVERITY_STYLES: Record<string, string> = {
  info: 'border-primary/30 bg-primary/5',
  warning: 'border-amber-500/40 bg-amber-500/5',
  danger: 'border-destructive/30 bg-destructive/5',
};

export const NOTICE_KIND_LABELS: Record<string, string> = {
  MEMBERSHIP: 'Membership',
  PAYMENT: 'Payments',
  ROUTINE: 'Routine',
  GYM: 'Gym',
};
