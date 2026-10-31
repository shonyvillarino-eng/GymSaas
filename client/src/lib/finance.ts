/* ---------------- API shapes ---------------- */

export interface Obligation {
  id: string;
  gymId: string;
  memberId: string;
  subscriptionId: string | null;
  concept: string;
  originalAmount: string;
  paidAmount: string;
  balance?: string;
  currency: string;
  issuedAt: string;
  dueDate: string;
  status: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  member?: { id: string; user: { fullName: string; phone: string | null; email: string | null } };
  subscription?: { id: string; planNameAtPurchase: string; startDate: string; endDate: string; status: string } | null;
}

export interface Payment {
  id: string;
  gymId: string;
  memberId: string | null;
  subscriptionId: string | null;
  obligationId: string | null;
  cashRegisterId: string | null;
  receiptNumber: string;
  amount: string;
  currency: string;
  concept: string;
  method: string;
  status: string;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  recordedById: string | null;
  voidedAt: string | null;
  voidedById: string | null;
  voidReason: string | null;
  createdAt: string;
  member?: { id: string; user: { fullName: string; phone: string | null } } | null;
  obligation?: {
    id: string;
    concept: string;
    originalAmount: string;
    paidAmount: string;
    status: string;
    dueDate: string;
  } | null;
  recordedBy?: { id: string; fullName: string } | null;
  voidedBy?: { id: string; fullName: string } | null;
}

export interface CashRegister {
  id: string;
  gymId: string;
  status: string;
  currency: string;
  openedAt: string;
  openedById: string;
  openingBalance: string;
  closedAt: string | null;
  closedById: string | null;
  expectedAmount: string | null;
  countedAmount: string | null;
  difference: string | null;
  notes: string | null;
  openedBy?: { id: string; fullName: string } | null;
  closedBy?: { id: string; fullName: string } | null;
  totals?: {
    cashMovements: string;
    totalMovements: string;
    operationCount: number;
    expectedCash: string;
    byMethod: Array<{ method: string; total: string; count: number }>;
  };
  payments?: Payment[];
}

export interface FinancialDashboard {
  currency: string;
  timezone: string;
  generatedAt: string;
  period: { from: string; to: string };
  collectedToday: string;
  collectedTodayCount: number;
  collectedThisMonth: string;
  collectedMonthCount: number;
  collectedInPeriod: string;
  operationsInPeriod: number;
  voidedInPeriod: string;
  voidedCountInPeriod: number;
  outstandingTotal: string;
  outstandingCount: number;
  overdueTotal: string;
  overdueCount: number;
  partialCount: number;
  byMethod: Array<{ method: string; total: string; count: number }>;
  note: string;
}

export interface CashSummary {
  currency: string;
  from: string;
  to: string;
  totalCollected: string;
  operationCount: number;
  voidedCount: number;
  voidedTotal: string;
  netRecorded: string;
  cashDeclared: string;
  byMethod: Array<{ method: string; total: string; count: number }>;
}

export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

/* ---------------- Labels ---------------- */

// TRANSFER and BANK_TRANSFER are distinct values in the database enum, so they
// must be distinguishable in the UI instead of sharing one label.
export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  TRANSFER: 'Transfer',
  BANK_TRANSFER: 'Bank transfer',
  CARD: 'Card (declared)',
  CHECK: 'Cheque',
  OTHER: 'Other',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Registered',
  PARTIAL: 'Partial',
  PENDING: 'Pending',
  VOIDED: 'Voided',
  REFUNDED: 'Refunded',
  FAILED: 'Failed',
};

export const OBLIGATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PARTIAL: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
};

export function obligationBadge(status: string): string {
  if (status === 'PAID') return 'bg-primary/10 text-primary';
  if (status === 'OVERDUE') return 'bg-destructive/10 text-destructive';
  if (status === 'PARTIAL') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  if (status === 'CANCELLED') return 'bg-muted text-muted-foreground';
  return 'bg-muted text-muted-foreground';
}

export function paymentBadge(status: string): string {
  if (status === 'COMPLETED') return 'bg-primary/10 text-primary';
  if (status === 'VOIDED') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
}

/* ---------------- Formatting ---------------- */

export function formatMoney(amount: string | number | null | undefined, currency?: string | null): string {
  if (amount === null || amount === undefined) return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  return `${value.toFixed(2)}${currency ? ` ${currency}` : ''}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

/** Local YYYY-MM-DD for date inputs. */
export function todayInput(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

export function firstOfMonthInput(): string {
  return `${todayInput().slice(0, 7)}-01`;
}
