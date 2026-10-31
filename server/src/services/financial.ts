import { Prisma, type CashRegisterStatus, type ObligationStatus, type PaymentStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

/**
 * Shared finance rules.
 *
 * Two invariants drive this module:
 *   1. A movement is never edited or deleted — corrections are new, explicit
 *      operations (void with a reason), and only non-voided movements count.
 *   2. Balances are always derived from the movements themselves, recalculated
 *      inside the transaction that writes the movement, so a retry or a
 *      concurrent request can never double-count.
 */

/** Movements that count towards collected amounts and obligation balances. */
export const EFFECTIVE_PAYMENT_STATUSES: PaymentStatus[] = ['COMPLETED'];

export function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

export function money(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/* ------------------------------------------------------------------ */
/* Tenant-local calendar helpers                                       */
/* ------------------------------------------------------------------ */

function calendarParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Midnight of the gym's local day, independent of the server timezone. */
export function startOfGymDate(date: string | undefined, timezone: string): Date {
  const target = date ?? calendarParts(new Date(), timezone);
  const local = new Date(`${target}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(local);
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!offset) return local;
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1);
  return new Date(local.getTime() - minutes * 60_000);
}

/** Last millisecond of the gym's local day. */
export function endOfGymDate(date: string | undefined, timezone: string): Date {
  const start = startOfGymDate(date, timezone);
  return new Date(start.getTime() + 86_400_000 - 1);
}

/** Local calendar day (as YYYY-MM-DD) for a gym, used for overdue comparisons. */
export function gymCalendarDate(date: Date, timezone: string): string {
  return calendarParts(date, timezone);
}

/* ------------------------------------------------------------------ */
/* Receipt numbering                                                   */
/* ------------------------------------------------------------------ */

/**
 * Allocates the next internal receipt number for a gym.
 *
 * The counter is advanced by a single atomic upsert, so simultaneous requests
 * can never receive the same number; the unique index on
 * (gymId, receiptNumber) is the final guarantee.
 */
export async function allocateReceiptNumber(tx: Prisma.TransactionClient, gymId: string): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "ReceiptCounter" ("gymId", "nextValue")
    VALUES (${gymId}, 2)
    ON CONFLICT ("gymId") DO UPDATE SET "nextValue" = "ReceiptCounter"."nextValue" + 1
    RETURNING "nextValue" - 1 AS value
  `;
  const value = Number(rows[0]?.value ?? 1);
  return `R-${String(value).padStart(6, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Obligation balances                                                 */
/* ------------------------------------------------------------------ */

export interface ObligationBalanceInput {
  cancelledAt: Date | null;
  originalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  dueDate: Date;
  today: Date;
}

/**
 * Financial state of a receivable.
 *
 * The due date is what makes a debt overdue — never the state of the related
 * membership or of the member's administrative record.
 */
export function deriveObligationStatus(input: ObligationBalanceInput): ObligationStatus {
  if (input.cancelledAt) return 'CANCELLED';
  if (input.paidAmount.gte(input.originalAmount)) return 'PAID';
  if (input.dueDate < input.today) return 'OVERDUE';
  if (input.paidAmount.gt(0)) return 'PARTIAL';
  return 'PENDING';
}

export function obligationBalance(originalAmount: Prisma.Decimal, paidAmount: Prisma.Decimal): Prisma.Decimal {
  const balance = originalAmount.minus(paidAmount);
  return balance.gt(0) ? balance : zero();
}

/** Locks an obligation row for the duration of a transaction (serializes writers). */
export async function lockObligation(tx: Prisma.TransactionClient, gymId: string, obligationId: string) {
  await tx.$queryRaw`SELECT "id" FROM "FinancialObligation" WHERE "id" = ${obligationId} AND "gymId" = ${gymId} FOR UPDATE`;
}

/**
 * Recomputes paidAmount AND status from the effective movements of an
 * obligation. Must be called inside the transaction that wrote the movement.
 */
export async function recalculateObligation(
  tx: Prisma.TransactionClient,
  obligationId: string,
  today: Date,
) {
  const obligation = await tx.financialObligation.findUniqueOrThrow({
    where: { id: obligationId },
    select: { id: true, cancelledAt: true, originalAmount: true, dueDate: true },
  });

  const aggregate = await tx.paymentRecord.aggregate({
    where: {
      obligationId,
      voidedAt: null,
      deletedAt: null,
      status: { in: EFFECTIVE_PAYMENT_STATUSES },
    },
    _sum: { amount: true },
  });

  const paidAmount = money(aggregate._sum.amount ?? 0);
  const status = deriveObligationStatus({
    cancelledAt: obligation.cancelledAt,
    originalAmount: obligation.originalAmount,
    paidAmount,
    dueDate: obligation.dueDate,
    today,
  });

  return tx.financialObligation.update({
    where: { id: obligationId },
    data: { paidAmount, status },
  });
}

/* ------------------------------------------------------------------ */
/* Selection shapes (kept explicit so responses never leak columns)    */
/* ------------------------------------------------------------------ */

export const obligationSelect = {
  id: true,
  gymId: true,
  memberId: true,
  subscriptionId: true,
  concept: true,
  originalAmount: true,
  paidAmount: true,
  currency: true,
  issuedAt: true,
  dueDate: true,
  status: true,
  cancelledAt: true,
  cancellationReason: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  member: { select: { id: true, user: { select: { fullName: true, phone: true, email: true } } } },
  subscription: { select: { id: true, planNameAtPurchase: true, startDate: true, endDate: true, status: true } },
} as const;

export const paymentSelect = {
  id: true,
  gymId: true,
  memberId: true,
  subscriptionId: true,
  obligationId: true,
  cashRegisterId: true,
  receiptNumber: true,
  amount: true,
  currency: true,
  concept: true,
  method: true,
  status: true,
  paidAt: true,
  reference: true,
  notes: true,
  recordedById: true,
  voidedAt: true,
  voidedById: true,
  voidReason: true,
  createdAt: true,
  member: { select: { id: true, user: { select: { fullName: true, phone: true } } } },
  obligation: { select: { id: true, concept: true, originalAmount: true, paidAmount: true, status: true, dueDate: true } },
  recordedBy: { select: { id: true, fullName: true } },
  voidedBy: { select: { id: true, fullName: true } },
} as const;

export const cashRegisterSelect = {
  id: true,
  gymId: true,
  status: true,
  currency: true,
  openedAt: true,
  openedById: true,
  openingBalance: true,
  closedAt: true,
  closedById: true,
  expectedAmount: true,
  countedAmount: true,
  difference: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  openedBy: { select: { id: true, fullName: true } },
  closedBy: { select: { id: true, fullName: true } },
} as const;

/** Administrative (non-cash) methods never inflate a declared cash count. */
export const NON_CASH_METHODS = ['TRANSFER', 'BANK_TRANSFER', 'CHECK', 'OTHER', 'CARD'] as const;

export type ObligationStatusValue = ObligationStatus;
export type CashRegisterStatusValue = CashRegisterStatus;

/**
 * Shortcut used by the membership module so assigning or renewing a membership
 * always leaves an identifiable, idempotent receivable behind.
 */
export async function ensureSubscriptionObligation(
  tx: Prisma.TransactionClient,
  input: {
    gymId: string;
    memberId: string;
    subscriptionId: string;
    concept: string;
    amount: Prisma.Decimal | number;
    currency: string;
    dueDate: Date;
    createdById: string | null;
    notes?: string | null;
  },
) {
  const originalAmount = money(input.amount);
  if (originalAmount.lte(0)) return null;

  const today = await subscriptionToday(tx, input.gymId);

  return tx.financialObligation.upsert({
    where: {
      gymId_subscriptionId_concept: {
        gymId: input.gymId,
        subscriptionId: input.subscriptionId,
        concept: input.concept,
      },
    },
    // Never rewrites an existing obligation: totals and history stay intact.
    update: {},
    create: {
      gymId: input.gymId,
      memberId: input.memberId,
      subscriptionId: input.subscriptionId,
      concept: input.concept,
      originalAmount,
      currency: input.currency,
      dueDate: input.dueDate,
      status: input.dueDate < today ? 'OVERDUE' : 'PENDING',
      createdById: input.createdById,
      notes: input.notes ?? null,
    },
    select: obligationSelect,
  });
}

async function subscriptionToday(tx: Prisma.TransactionClient, gymId: string): Promise<Date> {
  const gym = await tx.gym.findUniqueOrThrow({ where: { id: gymId }, select: { timezone: true } });
  return startOfGymDate(undefined, gym.timezone);
}

export { prisma };
