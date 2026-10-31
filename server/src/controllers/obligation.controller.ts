import type { Request, Response } from 'express';
import type { Prisma, ObligationStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { clientIp, writeAudit } from '../services/audit.js';
import {
  ensureSubscriptionObligation,
  money,
  obligationBalance,
  obligationSelect,
  startOfGymDate,
  endOfGymDate,
  paymentSelect,
} from '../services/financial.js';
import { idParamSchema, parseOrThrow } from '../validations/schemas.js';
import {
  obligationCancelSchema,
  obligationCreateSchema,
  obligationListSchema,
} from '../validations/financial.schemas.js';

function gymIdFromSession(req: Request) {
  if (req.auth?.role !== 'GYM_ADMIN' || !req.auth.gymId) {
    throw new AppError('Gym administrator access required', 403, { code: 'FORBIDDEN' });
  }
  return req.auth.gymId;
}

function paramId(req: Request) {
  return parseOrThrow(idParamSchema, req.params.id);
}

async function activeGym(gymId: string) {
  const gym = await prisma.gym.findFirst({
    where: { id: gymId, isActive: true },
    select: { id: true, timezone: true, currency: true },
  });
  if (!gym) throw new AppError('Gym is suspended or unavailable', 403, { code: 'GYM_SUSPENDED' });
  return gym;
}

async function audit(
  req: Request,
  gymId: string,
  action: 'CREATE' | 'UPDATE',
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

/**
 * Flips PENDING/PARTIAL receivables whose due date has passed to OVERDUE.
 * Conditional bulk update, so repeated runs are harmless.
 */
async function markOverdue(gymId: string, timezone: string) {
  const today = startOfGymDate(undefined, timezone);
  await prisma.financialObligation.updateMany({
    where: { gymId, cancelledAt: null, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: today } },
    data: { status: 'OVERDUE' },
  });
}

/** Adds the derived balance to each row (never stored, always computed). */
function withBalance<T extends { originalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }>(row: T) {
  return { ...row, balance: obligationBalance(row.originalAmount, row.paidAmount) };
}

/* ------------------------------------------------------------------ */
/* List / detail                                                       */
/* ------------------------------------------------------------------ */

export async function listObligations(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  const q = parseOrThrow(obligationListSchema, req.query);
  await markOverdue(gymId, gym.timezone);

  const where: Prisma.FinancialObligationWhereInput = {
    gymId,
    ...(q.status !== 'all' ? { status: q.status as ObligationStatus } : {}),
    ...(q.outstanding ? { cancelledAt: null, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } : {}),
    ...(q.memberId ? { memberId: q.memberId } : {}),
    ...(q.from || q.to
      ? {
          dueDate: {
            ...(q.from ? { gte: startOfGymDate(q.from, gym.timezone) } : {}),
            ...(q.to ? { lte: endOfGymDate(q.to, gym.timezone) } : {}),
          },
        }
      : {}),
    ...(q.search
      ? {
          OR: [
            { concept: { contains: q.search, mode: 'insensitive' } },
            { member: { user: { fullName: { contains: q.search, mode: 'insensitive' } } } },
            { member: { documentNumber: { contains: q.search.toUpperCase() } } },
          ],
        }
      : {}),
  };

  const [total, rows, totals] = await Promise.all([
    prisma.financialObligation.count({ where }),
    prisma.financialObligation.findMany({
      where,
      select: obligationSelect,
      orderBy: [{ [q.sort]: q.order }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.financialObligation.aggregate({
      where,
      _sum: { originalAmount: true, paidAmount: true },
    }),
  ]);

  res.json({
    data: rows.map(withBalance),
    totals: {
      original: totals._sum.originalAmount ?? 0,
      paid: totals._sum.paidAmount ?? 0,
      outstanding: obligationBalance(
        money(totals._sum.originalAmount ?? 0),
        money(totals._sum.paidAmount ?? 0),
      ),
      currency: gym.currency,
    },
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  });
}

export async function getObligation(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  await markOverdue(gymId, gym.timezone);
  const id = paramId(req);

  const obligation = await prisma.financialObligation.findFirst({ where: { id, gymId }, select: obligationSelect });
  if (!obligation) throw new AppError('Charge not found', 404);

  const payments = await prisma.paymentRecord.findMany({
    where: { gymId, obligationId: id, deletedAt: null },
    select: paymentSelect,
    orderBy: { paidAt: 'desc' },
  });

  res.json({ data: { ...withBalance(obligation), payments } });
}

/* ------------------------------------------------------------------ */
/* Create (manual charge)                                              */
/* ------------------------------------------------------------------ */

export async function createObligation(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  const input = parseOrThrow(obligationCreateSchema, req.body);
  const today = startOfGymDate(undefined, gym.timezone);

  const member = await prisma.memberProfile.findFirst({
    where: { id: input.memberId, gymId },
    select: { id: true },
  });
  if (!member) throw new AppError('Member not found in this gym', 404);

  if (input.subscriptionId) {
    const subscription = await prisma.memberSubscription.findFirst({
      where: { id: input.subscriptionId, gymId, memberId: input.memberId },
      select: { id: true },
    });
    if (!subscription) throw new AppError('Membership not found for this member', 404);
  }

  const dueDate = startOfGymDate(input.dueDate, gym.timezone);

  let created;
  try {
    created = await prisma.financialObligation.create({
      data: {
        gymId,
        memberId: input.memberId,
        subscriptionId: input.subscriptionId ?? null,
        concept: input.concept,
        originalAmount: input.originalAmount,
        currency: gym.currency,
        dueDate,
        status: dueDate < today ? 'OVERDUE' : 'PENDING',
        notes: input.notes ?? null,
        createdById: req.auth!.userId,
      },
      select: obligationSelect,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      throw new AppError('An identical charge already exists for this membership', 409, {
        concept: ['A charge with this concept already exists for the membership'],
      });
    }
    throw error;
  }

  await audit(req, gymId, 'CREATE', 'FinancialObligation', created.id, {
    concept: created.concept,
    originalAmount: String(created.originalAmount),
    memberId: created.memberId,
    dueDate: created.dueDate.toISOString(),
  });

  res.status(201).json({ data: withBalance(created) });
}

/* ------------------------------------------------------------------ */
/* Generate from memberships (idempotent)                              */
/* ------------------------------------------------------------------ */

export async function generateObligations(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  const subscriptionId = typeof req.body?.subscriptionId === 'string' ? req.body.subscriptionId : undefined;

  const subscriptions = await prisma.memberSubscription.findMany({
    where: {
      gymId,
      ...(subscriptionId ? { id: subscriptionId } : {}),
      status: { notIn: ['CANCELLED'] },
      finalPrice: { gt: 0 },
    },
    select: {
      id: true,
      memberId: true,
      planNameAtPurchase: true,
      finalPrice: true,
      currencyAtPurchase: true,
      startDate: true,
    },
    take: 500,
  });

  if (subscriptionId && subscriptions.length === 0) {
    throw new AppError('Membership not found or has no amount to charge', 404);
  }

  // Prefetch which subscriptions already have a charge instead of one lookup
  // per subscription inside the loop.
  const alreadyChargedRows = subscriptions.length
    ? await prisma.financialObligation.findMany({
        where: { gymId, subscriptionId: { in: subscriptions.map((row) => row.id) } },
        select: { subscriptionId: true },
      })
    : [];
  const alreadyCharged = new Set(alreadyChargedRows.map((row) => row.subscriptionId));

  let created = 0;
  for (const subscription of subscriptions) {
    if (alreadyCharged.has(subscription.id)) continue;

    const result = await ensureSubscriptionObligation(prisma, {
      gymId,
      memberId: subscription.memberId,
      subscriptionId: subscription.id,
      concept: `Membership fee — ${subscription.planNameAtPurchase}`,
      amount: subscription.finalPrice,
      currency: subscription.currencyAtPurchase,
      dueDate: subscription.startDate,
      createdById: req.auth!.userId,
    });
    if (result) created += 1;
  }

  if (created > 0) {
    await audit(req, gymId, 'CREATE', 'FinancialObligationBatch', gymId, { generated: created, subscriptionId: subscriptionId ?? null });
  }

  res.json({ data: { examined: subscriptions.length, created } });
}

/* ------------------------------------------------------------------ */
/* Cancel                                                              */
/* ------------------------------------------------------------------ */

export async function cancelObligation(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const input = parseOrThrow(obligationCancelSchema, req.body);
  const id = paramId(req);

  const current = await prisma.financialObligation.findFirst({
    where: { id, gymId },
    select: { id: true, status: true, cancelledAt: true, paidAmount: true, concept: true },
  });
  if (!current) throw new AppError('Charge not found', 404);
  if (current.cancelledAt) throw new AppError('This charge was already cancelled', 409);
  if (Number(current.paidAmount) > 0) {
    throw new AppError('Charges with registered payments cannot be cancelled; void the payments first', 409);
  }

  const updated = await prisma.financialObligation.update({
    where: { id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: input.reason },
    select: obligationSelect,
  });

  await audit(
    req,
    gymId,
    'UPDATE',
    'FinancialObligation',
    id,
    { status: 'CANCELLED', reason: input.reason },
    { status: current.status },
  );

  res.json({ data: withBalance(updated) });
}

/* ------------------------------------------------------------------ */
/* Member self-service (read-only)                                     */
/* ------------------------------------------------------------------ */

export async function myObligations(req: Request, res: Response) {
  const gymId = req.auth?.gymId;
  if (!gymId || !req.auth?.userId) throw new AppError('Member session required', 403);

  const member = await prisma.memberProfile.findFirst({
    where: { gymId, userId: req.auth.userId },
    select: { id: true },
  });
  if (!member) throw new AppError('Member profile not found', 404);

  const gym = await prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { timezone: true } });
  await markOverdue(gymId, gym.timezone);

  const rows = await prisma.financialObligation.findMany({
    where: { gymId, memberId: member.id },
    select: obligationSelect,
    orderBy: [{ status: 'asc' }, { dueDate: 'desc' }],
  });

  res.json({ data: rows.map(withBalance) });
}
