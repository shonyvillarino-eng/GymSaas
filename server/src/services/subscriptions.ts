import type { SubscriptionStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

/**
 * Membership lifecycle rules.
 *
 * Two invariants, shared by the administrative module and the member portal so
 * both always report the same condition for the same row:
 *
 *   1. The stored `status` is refreshed with conditional bulk updates, which
 *      are safe to repeat: running them twice can never activate an expired
 *      membership nor expire a cancelled one.
 *   2. The *displayed* state is derived from the dates. A row still marked
 *      ACTIVE whose `endDate` has passed is reported as expired even before
 *      the refresh runs.
 */

/** Flips overdue memberships and activates those whose window is in force. */
export async function refreshSubscriptionLifecycle(gymId: string, now: Date = new Date()): Promise<void> {
  await prisma.memberSubscription.updateMany({
    where: { gymId, status: { in: ['ACTIVE', 'PENDING'] }, endDate: { lt: now } },
    data: { status: 'EXPIRED' },
  });
  await prisma.memberSubscription.updateMany({
    where: { gymId, status: 'PENDING', startDate: { lte: now }, endDate: { gte: now } },
    data: { status: 'ACTIVE' },
  });
}

export type MembershipState = 'ACTIVE' | 'EXPIRING_SOON' | 'PENDING' | 'EXPIRED' | 'CANCELLED';

export interface MembershipLifecycleInput {
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  cancelledAt: Date | null;
}

const DAY_MS = 86_400_000;

/** Whole days between now and a date; negative once the date has passed. */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Human-facing condition of a membership.
 *
 * `EXPIRING_SOON` is not a stored state: it is ACTIVE plus the gym's warning
 * window (`membershipExpiryWarningDays`), so the badge matches the notices.
 */
export function membershipStateOf(
  subscription: MembershipLifecycleInput,
  options: { now?: Date; warningDays?: number } = {},
): MembershipState {
  const now = options.now ?? new Date();
  const warningDays = options.warningDays ?? 7;

  if (subscription.cancelledAt || subscription.status === 'CANCELLED') return 'CANCELLED';
  if (subscription.endDate < now) return 'EXPIRED';
  if (subscription.startDate > now) return 'PENDING';

  const remaining = daysUntil(subscription.endDate, now);
  return remaining <= warningDays ? 'EXPIRING_SOON' : 'ACTIVE';
}

/** True when the dates (not only the flag) place the membership in force. */
export function isMembershipInForce(subscription: MembershipLifecycleInput, now: Date = new Date()): boolean {
  if (subscription.cancelledAt || subscription.status === 'CANCELLED') return false;
  return subscription.startDate <= now && subscription.endDate >= now;
}
