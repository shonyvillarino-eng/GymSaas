import type { Request, Response } from 'express';
import type { Prisma, CashRegisterStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { clientIp, writeAudit } from '../services/audit.js';
import {
  cashRegisterSelect,
  endOfGymDate,
  money,
  paymentSelect,
  startOfGymDate,
} from '../services/financial.js';
import { idParamSchema, parseOrThrow } from '../validations/schemas.js';
import {
  cashRegisterCloseSchema,
  cashRegisterListSchema,
  cashRegisterOpenSchema,
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
 * Cash expectation of an open session: the declared opening balance plus the
 * CASH payments registered while it was open. Transfers, cards and cheques are
 * administrative movements and never inflate a cash count.
 */
async function registerTotals(registerId: string, gymId: string, openingBalance: Prisma.Decimal) {
  const groups = await prisma.paymentRecord.groupBy({
    by: ['method'],
    where: { gymId, cashRegisterId: registerId, voidedAt: null, deletedAt: null, status: 'COMPLETED' },
    _sum: { amount: true },
    _count: true,
  });

  const cash = groups
    .filter((group) => group.method === 'CASH')
    .reduce((sum, group) => sum.add(money(group._sum.amount ?? 0)), money(0));
  const total = groups.reduce((sum, group) => sum.add(money(group._sum.amount ?? 0)), money(0));

  return {
    cashMovements: cash,
    totalMovements: total,
    operationCount: groups.reduce((sum, group) => sum + group._count, 0),
    byMethod: groups
      .map((group) => ({ method: group.method, total: group._sum.amount ?? 0, count: group._count }))
      .sort((a, b) => Number(b.total) - Number(a.total)),
    expectedCash: money(openingBalance).add(cash),
  };
}

/* ------------------------------------------------------------------ */
/* List / current / detail                                             */
/* ------------------------------------------------------------------ */

export async function listCashRegisters(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  const q = parseOrThrow(cashRegisterListSchema, req.query);

  const where: Prisma.CashRegisterWhereInput = {
    gymId,
    ...(q.status !== 'all' ? { status: q.status as CashRegisterStatus } : {}),
    ...(q.from || q.to
      ? {
          openedAt: {
            ...(q.from ? { gte: startOfGymDate(q.from, gym.timezone) } : {}),
            ...(q.to ? { lte: endOfGymDate(q.to, gym.timezone) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.cashRegister.count({ where }),
    prisma.cashRegister.findMany({
      where,
      select: cashRegisterSelect,
      orderBy: { openedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  res.json({
    data: rows,
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  });
}

export async function getCurrentCashRegister(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const register = await prisma.cashRegister.findFirst({
    where: { gymId, status: 'OPEN' },
    select: cashRegisterSelect,
  });
  if (!register) {
    res.json({ data: null });
    return;
  }
  const totals = await registerTotals(register.id, gymId, register.openingBalance);
  res.json({ data: { ...register, totals } });
}

export async function getCashRegister(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const id = paramId(req);

  const register = await prisma.cashRegister.findFirst({ where: { id, gymId }, select: cashRegisterSelect });
  if (!register) throw new AppError('Cash register not found', 404);

  const [totals, payments] = await Promise.all([
    registerTotals(register.id, gymId, register.openingBalance),
    prisma.paymentRecord.findMany({
      where: { gymId, cashRegisterId: id, deletedAt: null },
      select: paymentSelect,
      orderBy: { paidAt: 'asc' },
      take: 500,
    }),
  ]);

  res.json({ data: { ...register, totals, payments } });
}

/* ------------------------------------------------------------------ */
/* Open                                                                */
/* ------------------------------------------------------------------ */

export async function openCashRegister(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const gym = await activeGym(gymId);
  const input = parseOrThrow(cashRegisterOpenSchema, req.body);

  const existing = await prisma.cashRegister.findFirst({
    where: { gymId, status: 'OPEN' },
    select: { id: true, openedAt: true },
  });
  if (existing) {
    throw new AppError('A cash register is already open for this gym', 409, { code: 'REGISTER_ALREADY_OPEN' });
  }

  let register;
  try {
    register = await prisma.cashRegister.create({
      data: {
        gymId,
        currency: gym.currency,
        openingBalance: money(input.openingBalance ?? 0),
        openedById: req.auth!.userId,
        notes: input.notes ?? null,
      },
      select: cashRegisterSelect,
    });
  } catch (error) {
    // The partial unique index is the final guard against double openings.
    if ((error as { code?: string }).code === 'P2002') {
      throw new AppError('A cash register is already open for this gym', 409, { code: 'REGISTER_ALREADY_OPEN' });
    }
    throw error;
  }

  await audit(req, gymId, 'CREATE', 'CashRegister', register.id, {
    openedAt: register.openedAt.toISOString(),
    openingBalance: String(register.openingBalance),
  });

  res.status(201).json({ data: register });
}

/* ------------------------------------------------------------------ */
/* Close — immutable once closed                                       */
/* ------------------------------------------------------------------ */

export async function closeCashRegister(req: Request, res: Response) {
  const gymId = gymIdFromSession(req);
  const id = paramId(req);
  const input = parseOrThrow(cashRegisterCloseSchema, req.body);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CashRegister" WHERE "id" = ${id} AND "gymId" = ${gymId} FOR UPDATE`;
    const register = await tx.cashRegister.findFirst({
      where: { id, gymId },
      select: { id: true, status: true, openingBalance: true, openedAt: true },
    });
    if (!register) throw new AppError('Cash register not found', 404);
    if (register.status === 'CLOSED') throw new AppError('This cash register is already closed', 409);

    const groups = await tx.paymentRecord.groupBy({
      by: ['method'],
      where: { gymId, cashRegisterId: id, voidedAt: null, deletedAt: null, status: 'COMPLETED' },
      _sum: { amount: true },
      _count: true,
    });
    const cash = groups
      .filter((group) => group.method === 'CASH')
      .reduce((sum, group) => sum.add(money(group._sum.amount ?? 0)), money(0));
    const expected = money(register.openingBalance).add(cash);
    const counted = money(input.countedAmount);

    const closed = await tx.cashRegister.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: req.auth!.userId,
        expectedAmount: expected,
        countedAmount: counted,
        difference: counted.minus(expected),
        ...(input.notes ? { notes: `${input.notes}` } : {}),
      },
      select: cashRegisterSelect,
    });

    return { closed, expected, counted };
  });

  await audit(req, gymId, 'UPDATE', 'CashRegister', id, {
    status: 'CLOSED',
    expectedAmount: String(result.expected),
    countedAmount: String(result.counted),
    difference: String(result.counted.minus(result.expected)),
  });

  res.json({ data: result.closed });
}
