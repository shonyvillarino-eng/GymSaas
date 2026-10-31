import type { Request, Response } from 'express';
import { Prisma, type PaymentMethod, type PaymentStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { clientIp, writeAudit } from '../services/audit.js';
import { buildReceiptPdf } from '../services/receipt.js';
import {
  allocateReceiptNumber,
  lockObligation,
  money,
  obligationBalance,
  paymentSelect,
  recalculateObligation,
  startOfGymDate,
  endOfGymDate,
  gymCalendarDate,
} from '../services/financial.js';
import { idParamSchema, parseOrThrow } from '../validations/schemas.js';
import {
  paymentCreateSchema,
  paymentListSchema,
  paymentVoidSchema,
  periodQuerySchema,
} from '../validations/financial.schemas.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** The gym always comes from the authenticated session, never from input. */
function gymIdFromSession(req: Request) {
  if (req.auth?.role !== 'GYM_ADMIN' || !req.auth.gymId) {
    throw new AppError('Gym administrator access required', 403, { code: 'FORBIDDEN' });
  }
  return req.auth.gymId;
}

function paramId(req: Request) {
  return parseOrThrow(idParamSchema, req.params.id);
}

/** Active tenant context (timezone/currency drive every date and amount). */
async function activeGym(gymId: string) {
  const gym = await prisma.gym.findFirst({
    where: { id: gymId, isActive: true },
    select: { id: true, name: true, timezone: true, currency: true, email: true, phone: true, address: true, city: true },
  });
  if (!gym) throw new AppError('Gym is suspended or unavailable', 403, { code: 'GYM_SUSPENDED' });
  return gym;
}

async function audit(
  req: Request,
  gymId: string,
  action: 'CREATE' | 'UPDATE' | 'PAYMENT_REGISTERED',
  entityType: string,
  entityId: string,
  newValues: Prisma.InputJsonValue,
  oldValues?: Prisma.InputJsonValue,
) {
  await writeAudit({
    gymId,
    userId: req.auth?.userId ?? null,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });
}

/** Payments that count: not voided, not soft-deleted, completed. */
const effectivePaymentWhere = {
  voidedAt: null,
  deletedAt: null,
  status: 'COMPLETED',
} satisfies Prisma.PaymentRecordWhereInput;

async function paymentInGym(gymId: string, paymentId: string) {
  const payment = await prisma.paymentRecord.findFirst({
    where: { id: paymentId, gymId },
    select: paymentSelect,
  });
  // Foreign payments are indistinguishable from missing ones.
  if (!payment) throw new AppError('Payment not found', 404);
  return payment;
}

/* ------------------------------------------------------------------ */
/* List / detail                                                       */
/* ------------------------------------------------------------------ */

export async function listPayments(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  const q = parseOrThrow(paymentListSchema, req.query);

  const where: Prisma.PaymentRecordWhereInput = {
    gymId,
    deletedAt: null,
    ...(q.status !== 'all' ? { status: q.status as PaymentStatus } : {}),
    ...(q.method !== 'all' ? { method: q.method as PaymentMethod } : {}),
    ...(q.memberId ? { memberId: q.memberId } : {}),
    ...(q.from || q.to
      ? {
          paidAt: {
            ...(q.from ? { gte: startOfGymDate(q.from, gym.timezone) } : {}),
            ...(q.to ? { lte: endOfGymDate(q.to, gym.timezone) } : {}),
          },
        }
      : {}),
    ...(q.search
      ? {
          OR: [
            { receiptNumber: { contains: q.search, mode: 'insensitive' } },
            { concept: { contains: q.search, mode: 'insensitive' } },
            { reference: { contains: q.search, mode: 'insensitive' } },
            { member: { user: { fullName: { contains: q.search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.paymentRecord.count({ where }),
    prisma.paymentRecord.findMany({
      where,
      select: paymentSelect,
      orderBy: [{ [q.sort]: q.order }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  res.json({
    data: rows,
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  });
}

export async function getPayment(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  res.json({ data: await paymentInGym(gymId, paramId(req)) });
}

/* ------------------------------------------------------------------ */
/* Register a payment                                                  */
/* ------------------------------------------------------------------ */

export async function createPayment(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  const input = parseOrThrow(paymentCreateSchema, req.body);
  const actorId = req.auth!.userId;

  const created = await prisma.$transaction(async (tx) => {
    const member = await tx.memberProfile.findFirst({
      where: { id: input.memberId, gymId },
      select: { id: true },
    });
    if (!member) throw new AppError('Member not found in this gym', 404);

    let obligationId: string | null = null;
    let subscriptionId: string | null = input.subscriptionId ?? null;

    if (input.obligationId) {
      // Serializes concurrent payments so a balance can never be exceeded twice.
      await lockObligation(tx, gymId, input.obligationId);
      const obligation = await tx.financialObligation.findFirst({
        where: { id: input.obligationId, gymId },
        select: { id: true, memberId: true, subscriptionId: true, cancelledAt: true, originalAmount: true, paidAmount: true, concept: true, dueDate: true },
      });
      if (!obligation) throw new AppError('Charge not found in this gym', 404);
      if (obligation.memberId !== input.memberId) {
        throw new AppError('The charge belongs to a different member', 409);
      }
      if (obligation.cancelledAt) throw new AppError('This charge is cancelled and cannot receive payments', 409);

      const balance = obligationBalance(obligation.originalAmount, obligation.paidAmount);
      if (balance.lte(0)) throw new AppError('This charge is already settled', 409);

      if (money(input.amount).gt(balance)) {
        throw new AppError('The payment exceeds the outstanding balance of the charge', 400, {
          amount: [`Maximum payable is ${balance.toFixed(2)}`],
        });
      }
      obligationId = obligation.id;
      subscriptionId = obligation.subscriptionId ?? subscriptionId;
    }

    if (subscriptionId) {
      const subscription = await tx.memberSubscription.findFirst({
        where: { id: subscriptionId, gymId, memberId: input.memberId },
        select: { id: true },
      });
      if (!subscription) throw new AppError('Membership not found for this member', 404);
    }

    // Attach to the currently open register when there is one, so the daily
    // cash session reflects exactly what was registered while it was open.
    const openRegister = await tx.cashRegister.findFirst({
      where: { gymId, status: 'OPEN' },
      select: { id: true },
    });

    const receiptNumber = await allocateReceiptNumber(tx, gymId);
    const payment = await tx.paymentRecord.create({
      data: {
        gymId,
        memberId: input.memberId,
        subscriptionId,
        obligationId,
        cashRegisterId: openRegister?.id ?? null,
        receiptNumber,
        amount: money(input.amount),
        currency: gym.currency,
        concept: input.concept,
        method: input.method as PaymentMethod,
        status: 'COMPLETED',
        paidAt: input.paidAt ?? new Date(),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        recordedById: actorId,
      },
      select: paymentSelect,
    });

    if (obligationId) {
      const today = startOfGymDate(undefined, gym.timezone);
      await recalculateObligation(tx, obligationId, today);
    }

    return payment;
  });

  await audit(req, gymId, 'PAYMENT_REGISTERED', 'PaymentRecord', created.id, {
    receiptNumber: created.receiptNumber,
    amount: String(created.amount),
    currency: created.currency,
    method: created.method,
    memberId: created.memberId,
    obligationId: created.obligationId,
  });

  res.status(201).json({ data: created });
}

/* ------------------------------------------------------------------ */
/* Void (annulment) — never a physical delete                          */
/* ------------------------------------------------------------------ */

export async function voidPayment(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  const id = paramId(req);
  const input = parseOrThrow(paymentVoidSchema, req.body);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PaymentRecord" WHERE "id" = ${id} AND "gymId" = ${gymId} FOR UPDATE`;
    const payment = await tx.paymentRecord.findFirst({
      where: { id, gymId },
      select: { id: true, voidedAt: true, obligationId: true, status: true, amount: true, receiptNumber: true },
    });
    if (!payment) throw new AppError('Payment not found', 404);
    if (payment.voidedAt) throw new AppError('This payment was already voided', 409, { code: 'ALREADY_VOIDED' });

    const voided = await tx.paymentRecord.update({
      where: { id },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedById: req.auth!.userId,
        voidReason: input.reason,
      },
      select: paymentSelect,
    });

    if (payment.obligationId) {
      const today = startOfGymDate(undefined, gym.timezone);
      await recalculateObligation(tx, payment.obligationId, today);
    }

    return { voided, previousStatus: payment.status };
  });

  await audit(
    req,
    gymId,
    'UPDATE',
    'PaymentRecord',
    id,
    { status: 'VOIDED', reason: input.reason, receiptNumber: result.voided.receiptNumber },
    { status: result.previousStatus },
  );

  res.json({ data: result.voided });
}

/* ------------------------------------------------------------------ */
/* Internal receipt (PDF)                                              */
/* ------------------------------------------------------------------ */

export async function downloadReceipt(req: Request, res: Response) {
  return sendReceipt(res, gymIdFromSession(req), paramId(req));
}

/**
 * GET /payments/me/:id/receipt — the signed-in member's own receipt.
 * The member id comes from the session, so a guessed payment id belonging to
 * somebody else resolves to nothing (404), never to their document.
 */
export async function downloadMyReceipt(req: Request, res: Response) {
  const gymId = req.auth?.gymId;
  const userId = req.auth?.userId;
  if (!gymId || !userId) throw new AppError('Member session required', 403);

  const member = await prisma.memberProfile.findFirst({ where: { gymId, userId }, select: { id: true } });
  if (!member) throw new AppError('Member profile not found', 404);

  return sendReceipt(res, gymId, paramId(req), member.id);
}

async function sendReceipt(res: Response, gymId: string, paymentId: string, memberId?: string) {
  const gym = await activeGym(gymId);
  const payment = await prisma.paymentRecord.findFirst({
    where: { id: paymentId, gymId, ...(memberId ? { memberId } : {}) },
    select: {
      id: true,
      receiptNumber: true,
      amount: true,
      currency: true,
      concept: true,
      method: true,
      status: true,
      paidAt: true,
      reference: true,
      voidedAt: true,
      notes: true,
      member: { select: { user: { select: { fullName: true } }, documentType: true, documentNumber: true } },
      obligation: { select: { id: true, concept: true, originalAmount: true, paidAmount: true, status: true, dueDate: true } },
      recordedBy: { select: { fullName: true } },
    },
  });
  if (!payment) throw new AppError('Payment not found', 404);

  const pdf = await buildReceiptPdf({
    gym,
    receiptNumber: payment.receiptNumber,
    memberName: payment.member?.user.fullName ?? 'Member',
    memberDocument: payment.member?.documentNumber
      ? `${payment.member.documentType ?? ''} ${payment.member.documentNumber}`.trim()
      : null,
    concept: payment.concept,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    paidAt: payment.paidAt,
    reference: payment.reference,
    recordedBy: payment.recordedBy?.fullName ?? null,
    voidedAt: payment.voidedAt,
    notes: payment.notes,
    obligation: payment.obligation
      ? {
          concept: payment.obligation.concept,
          originalAmount: payment.obligation.originalAmount,
          balance: obligationBalance(payment.obligation.originalAmount, payment.obligation.paidAmount),
          dueDate: payment.obligation.dueDate,
        }
      : null,
  });

  // Generating the document never touches financial records.
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="receipt-${payment.receiptNumber}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdf);
}

/* ------------------------------------------------------------------ */
/* Financial dashboard and period summary                              */
/* ------------------------------------------------------------------ */

export async function financialDashboard(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  const q = parseOrThrow(periodQuerySchema, req.query);

  const now = new Date();
  const todayStart = startOfGymDate(undefined, gym.timezone);
  const todayEnd = endOfGymDate(undefined, gym.timezone);
  const todayKey = gymCalendarDate(now, gym.timezone);
  const monthStart = startOfGymDate(`${todayKey.slice(0, 7)}-01`, gym.timezone);
  const periodStart = q.from ? startOfGymDate(q.from, gym.timezone) : monthStart;
  const periodEnd = q.to ? endOfGymDate(q.to, gym.timezone) : todayEnd;

  const effective = { gymId, ...effectivePaymentWhere } satisfies Prisma.PaymentRecordWhereInput;

  const [
    todayAggregate,
    monthAggregate,
    periodAggregate,
    methodGroups,
    pendingObligations,
    overdueObligations,
    partialObligations,
    voidedAggregate,
  ] = await Promise.all([
    prisma.paymentRecord.aggregate({
      where: { ...effective, paidAt: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.paymentRecord.aggregate({
      where: { ...effective, paidAt: { gte: monthStart, lte: todayEnd } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.paymentRecord.aggregate({
      where: { ...effective, paidAt: { gte: periodStart, lte: periodEnd } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.paymentRecord.groupBy({
      by: ['method'],
      where: { ...effective, paidAt: { gte: periodStart, lte: periodEnd } },
      _sum: { amount: true },
      _count: true,
    }),
    // Outstanding debt: everything not cancelled and not fully paid.
    prisma.financialObligation.aggregate({
      where: { gymId, cancelledAt: null, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      _sum: { originalAmount: true, paidAmount: true },
      _count: true,
    }),
    prisma.financialObligation.aggregate({
      where: { gymId, cancelledAt: null, status: 'OVERDUE' },
      _sum: { originalAmount: true, paidAmount: true },
      _count: true,
    }),
    prisma.financialObligation.count({ where: { gymId, cancelledAt: null, status: 'PARTIAL' } }),
    prisma.paymentRecord.aggregate({
      where: { gymId, voidedAt: { not: null }, paidAt: { gte: periodStart, lte: periodEnd } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const outstandingTotal = money(pendingObligations._sum.originalAmount ?? 0).minus(
    money(pendingObligations._sum.paidAmount ?? 0),
  );
  const overdueTotal = money(overdueObligations._sum.originalAmount ?? 0).minus(
    money(overdueObligations._sum.paidAmount ?? 0),
  );

  res.json({
    data: {
      currency: gym.currency,
      timezone: gym.timezone,
      generatedAt: now,
      period: { from: periodStart, to: periodEnd },
      collectedToday: todayAggregate._sum.amount ?? 0,
      collectedTodayCount: todayAggregate._count,
      collectedThisMonth: monthAggregate._sum.amount ?? 0,
      collectedMonthCount: monthAggregate._count,
      collectedInPeriod: periodAggregate._sum.amount ?? 0,
      operationsInPeriod: periodAggregate._count,
      voidedInPeriod: voidedAggregate._sum.amount ?? 0,
      voidedCountInPeriod: voidedAggregate._count,
      outstandingTotal: outstandingTotal.gt(0) ? outstandingTotal : 0,
      outstandingCount: pendingObligations._count,
      overdueTotal: overdueTotal.gt(0) ? overdueTotal : 0,
      overdueCount: overdueObligations._count,
      partialCount: partialObligations,
      byMethod: methodGroups
        .map((group) => ({ method: group.method, total: group._sum.amount ?? 0, count: group._count }))
        .sort((a, b) => Number(b.total) - Number(a.total)),
      // Recorded income, not profit: operational expenses are out of scope here.
      note: 'Recorded administrative income. Voided movements are excluded; this is not a profit figure.',
    },
  });
}

/** Daily cash totals for a period (the "caja diaria" report). */
export async function cashSummary(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  const q = parseOrThrow(periodQuerySchema, req.query);

  const from = q.from ? startOfGymDate(q.from, gym.timezone) : startOfGymDate(undefined, gym.timezone);
  const to = q.to ? endOfGymDate(q.to, gym.timezone) : endOfGymDate(undefined, gym.timezone);

  const [effectiveGroups, voided, totalVoided, operations] = await Promise.all([
    prisma.paymentRecord.groupBy({
      by: ['method'],
      where: { gymId, ...effectivePaymentWhere, paidAt: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.paymentRecord.count({ where: { gymId, voidedAt: { not: null }, paidAt: { gte: from, lte: to } } }),
    prisma.paymentRecord.aggregate({
      where: { gymId, voidedAt: { not: null }, paidAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.paymentRecord.count({ where: { gymId, ...effectivePaymentWhere, paidAt: { gte: from, lte: to } } }),
  ]);

  const total = effectiveGroups.reduce((sum, group) => sum.add(money(group._sum.amount ?? 0)), money(0));
  const cashTotal = effectiveGroups
    .filter((group) => group.method === 'CASH')
    .reduce((sum, group) => sum.add(money(group._sum.amount ?? 0)), money(0));

  res.json({
    data: {
      currency: gym.currency,
      from,
      to,
      totalCollected: total,
      operationCount: operations,
      voidedCount: voided,
      voidedTotal: totalVoided._sum.amount ?? 0,
      netRecorded: total,
      cashDeclared: cashTotal,
      byMethod: effectiveGroups
        .map((group) => ({ method: group.method, total: group._sum.amount ?? 0, count: group._count }))
        .sort((a, b) => Number(b.total) - Number(a.total)),
    },
  });
}

/* ------------------------------------------------------------------ */
/* Member self-service (read-only)                                     */
/* ------------------------------------------------------------------ */

export async function myPayments(req: Request, res: Response) {
  const gymId = req.auth?.gymId;
  if (!gymId || !req.auth?.userId) throw new AppError('Member session required', 403);

  const member = await prisma.memberProfile.findFirst({
    where: { gymId, userId: req.auth.userId },
    select: { id: true },
  });
  if (!member) throw new AppError('Member profile not found', 404);

  const rows = await prisma.paymentRecord.findMany({
    where: { gymId, memberId: member.id, deletedAt: null },
    select: paymentSelect,
    orderBy: { paidAt: 'desc' },
    take: 100,
  });
  res.json({ data: rows });
}

