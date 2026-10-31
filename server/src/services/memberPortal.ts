import type { Request } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { obligationBalance } from './financial.js';
import type { Preferences } from './gymPreferences.js';

/**
 * Member portal rules.
 *
 * The signed-in member is always resolved from the session (user + gym of the
 * cookie), never from a `memberId` sent by the client: there is no parameter
 * that could point at somebody else's record.
 */

export interface PortalMember {
  id: string;
  gymId: string;
  userId: string;
  status: string;
  documentType: string | null;
  documentNumber: string | null;
  joinDate: Date;
  birthDate: Date | null;
  address: string | null;
  user: { fullName: string; email: string | null; phone: string | null; avatarUrl: string | null };
}

const portalMemberSelect = {
  id: true,
  gymId: true,
  userId: true,
  status: true,
  documentType: true,
  documentNumber: true,
  joinDate: true,
  birthDate: true,
  address: true,
  user: { select: { fullName: true, email: true, phone: true, avatarUrl: true } },
} as const;

export interface PortalSession {
  gymId: string;
  userId: string;
  member: PortalMember;
}

/**
 * Resolves the member profile of the authenticated session.
 *
 * - no session gym → 403 (a member always belongs to one gym);
 * - a user without a member profile in that gym → 404;
 * - a disabled administrative record does not block reading your own data
 *   (suspension blocks the gym, not the portal), but it is reported.
 */
export async function resolvePortalMember(req: Request): Promise<PortalSession> {
  const gymId = req.auth?.gymId;
  const userId = req.auth?.userId;
  if (!gymId || !userId) throw new AppError('Member session required', 403, { code: 'FORBIDDEN' });

  const member = await prisma.memberProfile.findFirst({
    where: { gymId, userId },
    select: portalMemberSelect,
  });
  if (!member) throw new AppError('Member profile not found in this gym', 404, { code: 'MEMBER_NOT_FOUND' });

  return { gymId, userId, member };
}

/** Member row plus its recent memberships, in the shape the access engine expects. */
export async function loadMemberWithMemberships(gymId: string, memberId: string) {
  const member = await prisma.memberProfile.findFirst({
    where: { id: memberId, gymId },
    select: {
      id: true,
      status: true,
      documentType: true,
      documentNumber: true,
      user: { select: { fullName: true, avatarUrl: true } },
      subscriptions: {
        orderBy: { startDate: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          cancelledAt: true,
          planNameAtPurchase: true,
          currencyAtPurchase: true,
          priceAtPurchase: true,
          discountAmount: true,
          finalPrice: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          plan: { select: { id: true, name: true, description: true, durationValue: true, durationUnit: true } },
        },
      },
    },
  });
  if (!member) throw new AppError('Member profile not found in this gym', 404);
  return member;
}

/* ------------------------------------------------------------------ */
/* Notices                                                             */
/* ------------------------------------------------------------------ */

export type NoticeKind = 'MEMBERSHIP' | 'PAYMENT' | 'ROUTINE' | 'GYM';
export type NoticeSeverity = 'info' | 'warning' | 'danger';

export interface PortalNotice {
  /** Stable identifier so the client can dismiss/mark-read later. */
  id: string;
  kind: NoticeKind;
  severity: NoticeSeverity;
  title: string;
  message: string;
  /** ISO date the notice refers to (expiry, due date, update…). */
  date: string | null;
}

export interface NoticeInput {
  now: Date;
  preferences: Preferences;
  membership: {
    id: string;
    planName: string;
    endDate: Date;
    daysRemaining: number;
    valid: boolean;
    cancelled: boolean;
  } | null;
  money: { currency: string; outstanding: Prisma.Decimal; overdue: Prisma.Decimal };
  routine: { id: string; name: string; updatedAt: Date } | null;
  gym: { name: string; phone: string | null; email: string | null };
}

/**
 * Builds the member's notices from real data.
 *
 * Deliberately a pure function over a snapshot: today it is rendered in the
 * portal, and a future delivery channel (email/push) or a stored
 * Notification table can consume the same list without touching the sources.
 * Nothing here claims that a message was sent.
 */
export function buildNotices(input: NoticeInput): PortalNotice[] {
  const notices: PortalNotice[] = [];
  const { membership, preferences, now } = input;

  if (preferences.notifications.membershipExpiry) {
    if (membership && !membership.cancelled && membership.valid && membership.daysRemaining <= preferences.membershipExpiryWarningDays) {
      notices.push({
        id: `membership-expiring-${membership.id}`,
        kind: 'MEMBERSHIP',
        severity: 'warning',
        title: membership.daysRemaining <= 0 ? 'Your membership ends today' : 'Your membership is about to expire',
        message:
          `Your ${membership.planName} membership ends on ${membership.endDate.toISOString().slice(0, 10)} ` +
          `(${Math.max(0, membership.daysRemaining)} day(s) left). Renew it at reception.`,
        date: membership.endDate.toISOString(),
      });
    }

    if (membership && !membership.cancelled && !membership.valid && membership.endDate < now) {
      notices.push({
        id: `membership-expired-${membership.id}`,
        kind: 'MEMBERSHIP',
        severity: 'danger',
        title: 'Your membership has expired',
        message:
          `Your ${membership.planName} membership expired on ${membership.endDate.toISOString().slice(0, 10)}. ` +
          `Renewals are registered by the front desk${input.gym.phone ? ` (${input.gym.phone})` : ''}.`,
        date: membership.endDate.toISOString(),
      });
    }

    if (!membership) {
      notices.push({
        id: 'membership-missing',
        kind: 'MEMBERSHIP',
        severity: 'info',
        title: 'No membership assigned yet',
        message: 'Your gym has not registered a membership for you. Ask at reception to get started.',
        date: null,
      });
    }
  }

  if (input.money.overdue.gt(0)) {
    notices.push({
      id: 'payment-overdue',
      kind: 'PAYMENT',
      severity: 'danger',
      title: 'You have an overdue balance',
      message: `A total of ${input.money.overdue.toFixed(2)} ${input.money.currency} is past its due date. Payments are registered at the gym.`,
      date: now.toISOString(),
    });
  } else if (input.money.outstanding.gt(0)) {
    notices.push({
      id: 'payment-pending',
      kind: 'PAYMENT',
      severity: 'warning',
      title: 'You have a pending balance',
      message: `${input.money.outstanding.toFixed(2)} ${input.money.currency} is still pending. You can settle it at the gym.`,
      date: now.toISOString(),
    });
  }

  if (input.routine) {
    const since = input.routine.updatedAt;
    const days = Math.floor((now.getTime() - since.getTime()) / 86_400_000);
    if (days <= 14) {
      notices.push({
        id: `routine-active-${input.routine.id}`,
        kind: 'ROUTINE',
        severity: 'info',
        title: 'A routine is assigned to you',
        message: `"${input.routine.name}" is your active routine. Open it to see every session and exercise.`,
        date: since.toISOString(),
      });
    }
  } else {
    notices.push({
      id: 'routine-missing',
      kind: 'ROUTINE',
      severity: 'info',
      title: 'You have no active routine',
      message: 'Your instructor has not assigned a routine yet. It will appear here once it is published.',
      date: null,
    });
  }

  const contact = [input.gym.phone, input.gym.email].filter(Boolean).join(' · ');
  if (contact) {
    notices.push({
      id: 'gym-contact',
      kind: 'GYM',
      severity: 'info',
      title: `Contact ${input.gym.name}`,
      message: `Questions about your plan or payments: ${contact}.`,
      date: null,
    });
  }

  return notices;
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */

export const portalPaymentSelect = {
  id: true,
  receiptNumber: true,
  concept: true,
  amount: true,
  currency: true,
  method: true,
  status: true,
  paidAt: true,
  reference: true,
  voidedAt: true,
  voidReason: true,
  obligationId: true,
  subscriptionId: true,
  obligation: { select: { id: true, concept: true, dueDate: true, status: true } },
} as const;

export const portalAttendanceSelect = {
  id: true,
  checkInTime: true,
  method: true,
  status: true,
  result: true,
  notes: true,
} as const;

/**
 * Outstanding balance of one member, derived from its obligations — never from
 * summing payments, so a voided movement cannot create a fake debt.
 */
export async function memberBalance(gymId: string, memberId: string) {
  const obligations = await prisma.financialObligation.findMany({
    where: { gymId, memberId, cancelledAt: null },
    select: { originalAmount: true, paidAmount: true, dueDate: true, status: true, currency: true },
  });

  let outstanding = new Prisma.Decimal(0);
  let overdue = new Prisma.Decimal(0);
  let currency = '';
  for (const obligation of obligations) {
    const balance = obligationBalance(obligation.originalAmount, obligation.paidAmount);
    if (balance.lte(0)) continue;
    outstanding = outstanding.plus(balance);
    if (obligation.status === 'OVERDUE') overdue = overdue.plus(balance);
    currency ||= obligation.currency;
  }

  return {
    outstanding,
    overdue,
    currency,
    openCount: obligations.filter((row) => obligationBalance(row.originalAmount, row.paidAmount).gt(0)).length,
  };
}

