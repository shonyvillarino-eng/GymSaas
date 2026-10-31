/* ---------------- API shapes ---------------- */

export type AttendanceMethodValue = 'MANUAL' | 'QR';
export type AttendanceResultValue = 'ALLOWED' | 'EXCEPTION';

export interface AttendanceRow {
  id: string;
  gymId: string;
  memberId: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: string;
  method: AttendanceMethodValue;
  result: AttendanceResultValue;
  exceptionReason: string | null;
  membershipStatusAtCheckIn: string | null;
  notes: string | null;
  recordedById: string | null;
  member: {
    id: string;
    documentType: string | null;
    documentNumber: string | null;
    user: { fullName: string; avatarUrl: string | null };
  };
  recordedBy: { id: string; fullName: string } | null;
}

export interface AttendanceList {
  data: AttendanceRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AccessReason {
  code: string;
  message: string;
}

export interface MembershipSnapshot {
  id: string;
  planName: string;
  status: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  valid: boolean;
}

export interface Eligibility {
  allowed: boolean;
  reasons: AccessReason[];
  member: {
    id: string;
    fullName: string;
    photoUrl: string | null;
    documentType: string | null;
    documentNumber: string | null;
    status: string;
  };
  membership: MembershipSnapshot | null;
  policy: {
    requireActiveMember: boolean;
    requireValidMembership: boolean;
    allowAdministrativeExceptions: boolean;
  };
  lastAttendance: { id: string; checkInTime: string; method: AttendanceMethodValue; result: AttendanceResultValue } | null;
  todayCount: number;
  duplicateWindowMinutes: number;
  gym: { name: string; currency: string; timezone: string; logoUrl: string | null };
}

export interface CheckInResult {
  attendance: AttendanceRow;
  decision: {
    allowed: boolean;
    reasons: AccessReason[];
    membership: MembershipSnapshot | null;
  };
  duplicateWindowMinutes: number;
}

export interface AttendanceStats {
  today: number;
  todayManual: number;
  todayQr: number;
  last7Days: number;
  thisMonth: number;
  exceptionsToday: number;
  withoutValidMembership: number;
  series: Array<{ date: string; count: number }>;
  recent: AttendanceRow[];
  timezone: string;
}

export interface MemberAttendance {
  member: {
    id: string;
    fullName: string;
    photoUrl: string | null;
    status: string;
    joinDate: string;
    membership: { status: string; startDate: string; endDate: string; planNameAtPurchase: string } | null;
  };
  records: AttendanceRow[];
  stats: {
    total: number;
    thisMonth: number;
    lastVisitAt: string | null;
    averagePerWeek: number;
    weekly: Array<{ weekStart: string; count: number }>;
  };
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface QrCredential {
  memberId: string;
  fullName: string;
  token: string | null;
  payload: string | null;
  createdAt: string | null;
  revokedAt: string | null;
}

/* ---------------- Labels ---------------- */

export const METHOD_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  QR: 'QR code',
};

export const RESULT_LABELS: Record<string, string> = {
  ALLOWED: 'Allowed',
  EXCEPTION: 'Exception',
};

export const MEMBERSHIP_STATE_LABELS: Record<string, string> = {
  ACTIVE: 'Valid membership',
  NONE: 'No membership',
  PENDING: 'Pending',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  FROZEN: 'Frozen',
};

export function resultBadge(result: string): string {
  return result === 'EXCEPTION'
    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    : 'bg-primary/10 text-primary';
}

export function methodBadge(method: string): string {
  return method === 'QR' ? 'bg-accent/40 text-foreground' : 'bg-muted text-muted-foreground';
}

/**
 * Documents are partially masked in history listings so a shared screen does
 * not expose the full identifier. The full value stays available on the member
 * profile, which is a deliberate, permission-gated view.
 */
export function maskDocument(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function relativeDay(labels: { today: string; yesterday: string }, value: string): string {
  const date = new Date(value);
  const today = new Date();
  const isSameDay = date.toDateString() === today.toDateString();
  if (isSameDay) return labels.today;
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return labels.yesterday;
  return date.toLocaleDateString();
}
