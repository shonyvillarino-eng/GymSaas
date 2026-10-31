import type { Request, Response } from 'express';
import type { Prisma, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { clientIp, writeAudit } from '../services/audit.js';
import { idParamSchema, parseOrThrow } from '../validations/schemas.js';
import { ensureSubscriptionObligation } from '../services/financial.js';
import { refreshSubscriptionLifecycle } from '../services/subscriptions.js';
import { dashboardQuerySchema, memberHistorySchema, planCreateSchema, planListSchema, planStatusSchema, planUpdateSchema, subscriptionCancelSchema, subscriptionCreateSchema, subscriptionListSchema, subscriptionRenewSchema } from '../validations/membership.schemas.js';

function gymIdFromSession(req: Request) {
  if (req.auth?.role !== 'GYM_ADMIN' || !req.auth.gymId) throw new AppError('Gym administrator access required', 403);
  return req.auth.gymId;
}
function paramId(req: Request) { return parseOrThrow(idParamSchema, req.params.id); }
function startOfDate(date: string | undefined, timezone: string) {
  if (!date) return new Date();
  // Keep date-only inputs anchored to local midnight of the gym, including DST.
  const local = new Date(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(local);
  const offset = parts.find((p) => p.type === 'timeZoneName')?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!offset) return new Date(`${date}T00:00:00Z`);
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1);
  return new Date(local.getTime() - minutes * 60_000);
}
function calendarDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function addDuration(start: Date, value: number, unit: string, timezone = 'UTC') {
  const date = calendarDate(start, timezone);
  const [yearText = '1970', monthText = '01', dayText = '01'] = date.split('-');
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText);
  const result = new Date(Date.UTC(year, month - 1, day));
  if (unit === 'DAY') result.setUTCDate(result.getUTCDate() + value);
  else if (unit === 'WEEK') result.setUTCDate(result.getUTCDate() + value * 7);
  else {
    const months = unit === 'MONTH' ? value : unit === 'QUARTER' ? value * 3 : unit === 'HALF_YEAR' ? value * 6 : value * 12;
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
  }
  return startOfDate(result.toISOString().slice(0, 10), timezone);
}
function dayEnd(date: Date, timezone: string) {
  const dateOnly = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return new Date(addDuration(startOfDate(dateOnly, timezone), 1, 'DAY').getTime() - 1);
}
async function audit(req: Request, gymId: string, entityType: string, entityId: string, action: 'CREATE'|'UPDATE'|'ASSIGN'|'UNASSIGN', oldValues?: Prisma.InputJsonValue, newValues?: Prisma.InputJsonValue) {
  await writeAudit({ gymId, userId: req.auth?.userId ?? null, action, entityType, entityId, oldValues, newValues, ipAddress: clientIp(req), userAgent: req.get('user-agent') ?? null });
}
// Shared with the member portal so both read the same refreshed rows.
const expireSubscriptions = refreshSubscriptionLifecycle;
function subscriptionWhere(input: { status: string; planId?: string; from?: string; to?: string; search?: string }, gymId: string, timezone: string): Prisma.MemberSubscriptionWhereInput {
  return {
    gymId,
    ...(input.status !== 'all' ? { status: input.status as SubscriptionStatus } : {}),
    ...(input.planId ? { planId: input.planId } : {}),
    ...(input.from || input.to ? { startDate: { ...(input.from ? { gte: startOfDate(input.from, timezone) } : {}), ...(input.to ? { lte: dayEnd(startOfDate(input.to, timezone), timezone) } : {}) } } : {}),
    ...(input.search ? { member: { user: { fullName: { contains: input.search, mode: 'insensitive' } } } } : {}),
  };
}
const planSelect = { id: true, gymId: true, name: true, description: true, price: true, currency: true, billingDays: true, durationValue: true, durationUnit: true, conditions: true, features: true, isActive: true, createdAt: true, updatedAt: true, _count: { select: { subscriptions: true } } } as const;
const subscriptionSelect = { id: true, memberId: true, planId: true, planNameAtPurchase: true, currencyAtPurchase: true, status: true, startDate: true, endDate: true, priceAtPurchase: true, discountAmount: true, finalPrice: true, notes: true, cancelledAt: true, createdAt: true, updatedAt: true, assignedById: true, plan: { select: { id: true, name: true, currency: true, durationValue: true, durationUnit: true } }, member: { select: { id: true, user: { select: { fullName: true } } } }, assignedBy: { select: { fullName: true } } } as const;

export async function listPlans(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); const q = parseOrThrow(planListSchema, req.query);
  const where: Prisma.MembershipPlanWhereInput = { gymId, ...(q.status === 'active' ? { isActive: true } : q.status === 'inactive' ? { isActive: false } : {}), ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}) };
  const [total, data] = await Promise.all([prisma.membershipPlan.count({ where }), prisma.membershipPlan.findMany({ where, select: planSelect, orderBy: [{ createdAt: 'desc' }, { name: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize })]);
  res.json({ data, meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } });
}
export async function createPlan(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); const input = parseOrThrow(planCreateSchema, req.body);
  const gym = await prisma.gym.findFirst({ where: { id: gymId, isActive: true }, select: { currency: true } });
  if (!gym) throw new AppError('Gym is suspended or unavailable', 403);
  const days = input.durationUnit === 'DAY' ? input.durationValue : input.durationUnit === 'WEEK' ? input.durationValue * 7 : input.durationUnit === 'MONTH' ? input.durationValue * 30 : input.durationUnit === 'QUARTER' ? input.durationValue * 91 : input.durationUnit === 'HALF_YEAR' ? input.durationValue * 182 : input.durationValue * 365;
  let data: Prisma.MembershipPlanGetPayload<{ select: typeof planSelect }>;
  try {
    data = await prisma.membershipPlan.create({ data: { gymId, name: input.name, description: input.description, price: Number(input.price), currency: gym.currency, durationValue: input.durationValue, durationUnit: input.durationUnit, billingDays: days, conditions: input.conditions }, select: planSelect });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new AppError('A plan with this name already exists in this gym', 409, { name: ['Already in use'] });
    throw error;
  }
  await audit(req, gymId, 'MembershipPlan', data.id, 'CREATE', undefined, { name: data.name, price: String(data.price), currency: data.currency, durationValue: data.durationValue, durationUnit: data.durationUnit });
  res.status(201).json({ data });
}
export async function getPlan(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); const id = paramId(req);
  const data = await prisma.membershipPlan.findFirst({ where: { id, gymId }, select: planSelect });
  if (!data) throw new AppError('Plan not found', 404); res.json({ data });
}
export async function updatePlan(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); const id = paramId(req); const input = parseOrThrow(planUpdateSchema, req.body);
  const current = await prisma.membershipPlan.findFirst({ where: { id, gymId }, select: planSelect }); if (!current) throw new AppError('Plan not found', 404);
  const unit = input.durationUnit ?? current.durationUnit; const value = Number(input.durationValue ?? current.durationValue);
  if (unit !== 'DAY' && value > 24) throw new AppError('Duration exceeds the maximum for this unit', 400, { durationValue: ['For non-day units, duration must be at most 24 units'] });
  const days = unit === 'DAY' ? value : unit === 'WEEK' ? value * 7 : unit === 'MONTH' ? value * 30 : unit === 'QUARTER' ? value * 91 : unit === 'HALF_YEAR' ? value * 182 : value * 365;
  const planData: Prisma.MembershipPlanUpdateInput = { billingDays: days };
  if (input.name !== undefined) planData.name = input.name;
  if (input.description !== undefined) planData.description = input.description;
  if (input.price !== undefined) planData.price = Number(input.price);
  if (input.durationValue !== undefined) planData.durationValue = value;
  if (input.durationUnit !== undefined) planData.durationUnit = input.durationUnit;
  if (input.conditions !== undefined) planData.conditions = input.conditions;
  let data: Prisma.MembershipPlanGetPayload<{ select: typeof planSelect }>;
  try { data = await prisma.membershipPlan.update({ where: { id }, data: planData, select: planSelect }); }
  catch (error) { if ((error as { code?: string }).code === 'P2002') throw new AppError('A plan with this name already exists in this gym', 409, { name: ['Already in use'] }); throw error; }
  await audit(req, gymId, 'MembershipPlan', id, 'UPDATE', { name: current.name, price: String(current.price), durationValue: current.durationValue, durationUnit: current.durationUnit }, { name: data.name, price: String(data.price), durationValue: data.durationValue, durationUnit: data.durationUnit }); res.json({ data });
}
export async function setPlanStatus(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); const id = paramId(req); const input = parseOrThrow(planStatusSchema, req.body);
  const current = await prisma.membershipPlan.findFirst({ where: { id, gymId }, select: { id: true, isActive: true } }); if (!current) throw new AppError('Plan not found', 404);
  const data = await prisma.membershipPlan.update({ where: { id }, data: { isActive: input.isActive }, select: planSelect });
  await audit(req, gymId, 'MembershipPlan', id, 'UPDATE', { isActive: current.isActive }, { isActive: data.isActive }); res.json({ data });
}
export async function listSubscriptions(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); await expireSubscriptions(gymId); const q = parseOrThrow(subscriptionListSchema, req.query);
  const gym = await prisma.gym.findFirst({ where: { id: gymId, isActive: true }, select: { timezone: true } });
  if (!gym) throw new AppError('Gym unavailable', 403);
  const where = subscriptionWhere(q, gymId, gym.timezone);
  const [total, data] = await Promise.all([prisma.memberSubscription.count({ where }), prisma.memberSubscription.findMany({ where, select: subscriptionSelect, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize })]);
  res.json({ data: data.map((row) => ({ ...row, plan: { ...row.plan, name: row.planNameAtPurchase, currency: row.currencyAtPurchase } })), meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } });
}
export async function getSubscription(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); await expireSubscriptions(gymId); const id = paramId(req);
  const data = await prisma.memberSubscription.findFirst({ where: { id, gymId }, select: subscriptionSelect });  if (!data) throw new AppError('Membership not found', 404); res.json({ data: { ...data, plan: { ...data.plan, name: data.planNameAtPurchase, currency: data.currencyAtPurchase } } });

}
async function createSubscription(tx: Prisma.TransactionClient, gymId: string, memberId: string, planId: string, actorId: string, startDate: Date, agreedPrice: number | undefined, discountAmount: number, notes: string | null) {
  // Serialize membership-period checks per member so concurrent assignments cannot overlap.
  // $executeRaw: pg_advisory_xact_lock returns void, which $queryRaw cannot deserialize.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${gymId}:${memberId}`}))`;
  const [member, plan] = await Promise.all([tx.memberProfile.findFirst({ where: { id: memberId, gymId, status: 'ACTIVE' }, select: { id: true } }), tx.membershipPlan.findFirst({ where: { id: planId, gymId, isActive: true }, select: { id: true, name: true, price: true, durationValue: true, durationUnit: true } })]);
  if (!member) throw new AppError('Active member not found in this gym', 404); if (!plan) throw new AppError('Active plan not found in this gym', 404);
  const price = agreedPrice ?? Number(plan.price); if (discountAmount > price) throw new AppError('Discount cannot exceed agreed price', 400, { discountAmount: ['Must be less than or equal to agreed price'] });
  const timezone = await tx.gym.findUniqueOrThrow({ where: { id: gymId }, select: { timezone: true, currency: true } });
  const endExclusive = addDuration(startDate, plan.durationValue, plan.durationUnit, timezone.timezone); const endDate = new Date(endExclusive.getTime() - 1); const now = new Date();
  const overlap = await tx.memberSubscription.findFirst({ where: { gymId, memberId, status: { in: ['ACTIVE', 'PENDING'] }, startDate: { lte: endDate }, endDate: { gte: startDate } }, select: { id: true, startDate: true, endDate: true } });
  if (overlap) throw new AppError('Membership period overlaps an existing pending or active membership', 409, { conflictingMembershipId: overlap.id });
  const subscription = await tx.memberSubscription.create({ data: { gymId, memberId, planId, planNameAtPurchase: plan.name, currencyAtPurchase: timezone.currency, assignedById: actorId, startDate, endDate, status: startDate <= now ? 'ACTIVE' : 'PENDING', priceAtPurchase: price, discountAmount, finalPrice: price - discountAmount, notes }, select: subscriptionSelect });

  // Every membership with a payable amount leaves an identifiable receivable.
  // The unique (gymId, subscriptionId, concept) key makes this idempotent.
  await ensureSubscriptionObligation(tx, {
    gymId,
    memberId,
    subscriptionId: subscription.id,
    concept: `Membership fee — ${plan.name}`,
    amount: subscription.finalPrice,
    currency: subscription.currencyAtPurchase,
    dueDate: startDate,
    createdById: actorId,
    notes: notes,
  });

  return subscription;
}
export async function assignSubscription(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); const input = parseOrThrow(subscriptionCreateSchema, req.body); const gym = await prisma.gym.findFirst({ where: { id: gymId, isActive: true }, select: { timezone: true } }); if (!gym) throw new AppError('Gym unavailable', 403);
  const startDate = startOfDate(input.startDate, gym.timezone);
  const created = await prisma.$transaction((tx) => createSubscription(tx, gymId, input.memberId, input.planId, req.auth!.userId, startDate, input.agreedPrice, input.discountAmount, input.notes ?? null));
  await audit(req, gymId, 'MemberSubscription', created.id, 'CREATE', undefined, { memberId: created.memberId, planId: created.planId, startDate: created.startDate.toISOString(), endDate: created.endDate.toISOString(), price: String(created.finalPrice) }); res.status(201).json({ data: created });
}
export async function renewSubscription(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); const id = paramId(req); const input = parseOrThrow(subscriptionRenewSchema, req.body); const gym = await prisma.gym.findFirst({ where: { id: gymId, isActive: true }, select: { timezone: true } }); if (!gym) throw new AppError('Gym unavailable', 403);
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.memberSubscription.findFirst({ where: { id, gymId }, select: { id: true, memberId: true, endDate: true, status: true } }); if (!current) throw new AppError('Membership not found', 404);
    if (current.status === 'CANCELLED') throw new AppError('A cancelled membership cannot be renewed', 409);
    const today = startOfDate(undefined, gym.timezone);
    let start = input.startsAfterCurrent
      ? (current.endDate >= today ? new Date(current.endDate.getTime() + 1) : today)
      : startOfDate(input.startDate, gym.timezone);
    if (!input.startsAfterCurrent && !input.startDate) start = today;
    const renewal = await createSubscription(tx, gymId, current.memberId, input.planId, req.auth!.userId, start, input.agreedPrice, input.discountAmount, input.notes ?? null);
    return { renewal, currentId: current.id };
  });
  await audit(req, gymId, 'MemberSubscription', result.renewal.id, 'CREATE', undefined, { renewedFromId: result.currentId, planId: result.renewal.planId, startDate: result.renewal.startDate.toISOString(), endDate: result.renewal.endDate.toISOString() }); res.status(201).json({ data: result.renewal });
}
export async function cancelSubscription(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); const id = paramId(req); const input = parseOrThrow(subscriptionCancelSchema, req.body);
  const current = await prisma.memberSubscription.findFirst({ where: { id, gymId }, select: { id: true, status: true, cancelledAt: true } }); if (!current) throw new AppError('Membership not found', 404);
  if (current.status === 'CANCELLED') throw new AppError('Membership is already cancelled', 409);
  const data = await prisma.$transaction(async (tx) => {
    const existing = await tx.memberSubscription.findFirst({ where: { id, gymId }, select: { notes: true } });
    const cancellationNotes = input.reason ? [existing?.notes, `Cancellation reason: ${input.reason}`].filter(Boolean).join('\n') : undefined;
    const updated = await tx.memberSubscription.updateMany({ where: { id, gymId, status: { in: ['ACTIVE', 'PENDING', 'EXPIRED'] } }, data: { status: 'CANCELLED', cancelledAt: new Date(), ...(cancellationNotes ? { notes: cancellationNotes } : {}) } });
    if (updated.count !== 1) throw new AppError('Membership cannot transition to cancelled', 409);
    return tx.memberSubscription.findFirstOrThrow({ where: { id, gymId }, select: subscriptionSelect });
  });
  await audit(req, gymId, 'MemberSubscription', id, 'UPDATE', { status: current.status }, { status: 'CANCELLED', reason: input.reason ?? null }); res.json({ data });
}
export async function memberSubscriptionHistory(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); const memberId = paramId(req); const q = parseOrThrow(memberHistorySchema, req.query); await expireSubscriptions(gymId);
  const member = await prisma.memberProfile.findFirst({ where: { id: memberId, gymId }, select: { id: true } }); if (!member) throw new AppError('Member not found', 404);
  const [total, rows] = await Promise.all([prisma.memberSubscription.count({ where: { gymId, memberId } }), prisma.memberSubscription.findMany({ where: { gymId, memberId }, select: subscriptionSelect, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize })]);
  const data = rows.map((row) => ({ ...row, plan: { ...row.plan, name: row.planNameAtPurchase, currency: row.currencyAtPurchase } }));
  res.json({ data, meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } });
}
export async function upcomingExpirations(req: Request, res: Response) {
  const gymId = gymIdFromSession(req); await expireSubscriptions(gymId); const q = parseOrThrow(dashboardQuerySchema, req.query); const gym = await prisma.gym.findFirst({ where: { id: gymId, isActive: true }, select: { timezone: true, settings: true } }); if (!gym) throw new AppError('Gym unavailable', 403);
  const settings = gym.settings && typeof gym.settings === 'object' && !Array.isArray(gym.settings) ? gym.settings as Record<string, unknown> : {};
  const preferences = settings.preferences && typeof settings.preferences === 'object' ? settings.preferences as Record<string, unknown> : {};
  const days = typeof preferences.membershipExpiryWarningDays === 'number' ? Math.min(Math.max(preferences.membershipExpiryWarningDays, 1), 60) : 7;
  const now = new Date(); const today = startOfDate(undefined, gym.timezone); const until = addDuration(today, days, 'DAY', gym.timezone); const scopedPlan = q.planId ? await prisma.membershipPlan.findFirst({ where: { id: q.planId, gymId }, select: { id: true } }) : null;
  if (q.planId && !scopedPlan) throw new AppError('Plan not found', 404);
  const baseWhere: Prisma.MemberSubscriptionWhereInput = { gymId, ...(q.planId ? { planId: q.planId } : {}) };
  const dateRange: Prisma.DateTimeFilter<'MemberSubscription'> = {
    ...(q.from ? { gte: startOfDate(q.from, gym.timezone) } : {}),
    ...(q.to ? { lte: dayEnd(startOfDate(q.to, gym.timezone), gym.timezone) } : {}),
  };
  const todayStart = q.from ? startOfDate(q.from, gym.timezone) : today;
  const periodFilter = q.from || q.to ? { startDate: dateRange } : {};
  const statusFilter = q.status === 'all' ? {} : { status: q.status as SubscriptionStatus };    const [active, expired, expiringSoon, pending, renewalsThisMonth, upcoming] = await Promise.all([

    prisma.memberSubscription.count({ where: { ...baseWhere, ...periodFilter, ...statusFilter, status: 'ACTIVE', startDate: { ...dateRange, lte: now }, endDate: { gte: todayStart } } }),
    prisma.memberSubscription.count({ where: { ...baseWhere, ...periodFilter, ...statusFilter, status: 'EXPIRED' } }),
    prisma.memberSubscription.count({ where: { ...baseWhere, ...periodFilter, ...statusFilter, status: 'ACTIVE', startDate: { ...dateRange, lte: now }, endDate: { gte: todayStart, lte: until } } }),
    prisma.memberSubscription.count({ where: { ...baseWhere, ...periodFilter, ...statusFilter, status: 'PENDING' } }),
    prisma.memberSubscription.count({ where: { ...baseWhere, ...(q.planId ? { planId: q.planId } : {}), createdAt: { gte: q.from ? startOfDate(q.from, gym.timezone) : startOfDate(calendarDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1), gym.timezone), gym.timezone), ...(q.to ? { lte: dayEnd(startOfDate(q.to, gym.timezone), gym.timezone) } : {}) } } }),
    prisma.memberSubscription.findMany({ where: { gymId, ...periodFilter, ...statusFilter, status: 'ACTIVE', startDate: { ...dateRange, lte: now }, endDate: { gte: todayStart, lte: until }, ...(q.planId ? { planId: q.planId } : {}) }, select: subscriptionSelect, orderBy: { endDate: 'asc' }, take: 100 }),
  ]);
  res.json({ data: { active, expired, expiringSoon, pending, renewalsThisMonth, expiryWindowDays: days, upcoming } });
}
export async function memberSelfSubscriptions(req: Request, res: Response) {
  const gymId = req.auth?.gymId; if (!gymId || !req.auth?.userId) throw new AppError('Member session required', 403); await expireSubscriptions(gymId);
  const member = await prisma.memberProfile.findFirst({ where: { gymId, userId: req.auth.userId }, select: { id: true } }); if (!member) throw new AppError('Member profile not found', 404);
  const data = await prisma.memberSubscription.findMany({ where: { gymId, memberId: member.id }, select: subscriptionSelect, orderBy: { startDate: 'desc' } }); res.json({ data: data.map((row) => ({ ...row, plan: { ...row.plan, name: row.planNameAtPurchase, currency: row.currencyAtPurchase } })) });
}
