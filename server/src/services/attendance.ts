import { randomBytes } from 'node:crypto';
import { Prisma, type AttendanceMethod } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { gymCalendarDate, startOfGymDate } from './financial.js';
import { loadGymPreferences, type Preferences } from './gymPreferences.js';

/**
 * Attendance rules.
 *
 * Two invariants:
 *   1. An entry is only recorded after the *server* evaluated the gym policy —
 *      neither the QR payload nor the client decides whether access is granted.
 *   2. Concurrent requests for the same member are serialized with a
 *      transaction-scoped advisory lock, so repeated clicks/scans can never
 *      produce two entries inside the duplicate window.
 */

/* ------------------------------------------------------------------ */
/* Access policy                                                       */
/* ------------------------------------------------------------------ */

export type AccessReasonCode =
  | 'MEMBER_NOT_ACTIVE'
  | 'MEMBERSHIP_MISSING'
  | 'MEMBERSHIP_NOT_STARTED'
  | 'MEMBERSHIP_EXPIRED'
  | 'MEMBERSHIP_CANCELLED';

export interface AccessReason {
  code: AccessReasonCode;
  message: string;
}

export interface MembershipSnapshot {
  id: string;
  planName: string;
  status: string;
  startDate: Date;
  endDate: Date;
  daysRemaining: number;
  valid: boolean;
}

export interface MemberSnapshot {
  id: string;
  fullName: string;
  photoUrl: string | null;
  documentType: string | null;
  documentNumber: string | null;
  status: string;
}

export interface AccessDecision {
  allowed: boolean;
  reasons: AccessReason[];
  member: MemberSnapshot;
  membership: MembershipSnapshot | null;
  policy: Preferences['attendancePolicy'];
}

type MemberWithMembership = {
  id: string;
  status: string;
  documentType: string | null;
  documentNumber: string | null;
  user: { fullName: string; avatarUrl: string | null };
  subscriptions: Array<{
    id: string;
    status: string;
    startDate: Date;
    endDate: Date;
    cancelledAt: Date | null;
    planNameAtPurchase: string;
  }>;
};

/** Loads a member strictly inside the authenticated gym (404 otherwise). */
export async function findMemberForCheckIn(
  db: Prisma.TransactionClient,
  gymId: string,
  memberId: string,
): Promise<MemberWithMembership> {
  const member = await db.memberProfile.findFirst({
    where: { id: memberId, gymId },
    select: {
      id: true,
      status: true,
      documentType: true,
      documentNumber: true,
      user: { select: { fullName: true, avatarUrl: true } },
      subscriptions: {
        orderBy: { endDate: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          cancelledAt: true,
          planNameAtPurchase: true,
        },
      },
    },
  });
  if (!member) throw new AppError('Member not found', 404);
  return member as MemberWithMembership;
}

/** Most relevant subscription: the one that is in force, else the latest one. */
export function pickMembership(member: MemberWithMembership, now: Date) {
  const active = member.subscriptions.find(
    (subscription) =>
      !subscription.cancelledAt &&
      subscription.status !== 'CANCELLED' &&
      subscription.startDate <= now &&
      subscription.endDate >= now,
  );
  return active ?? member.subscriptions[0] ?? null;
}

function membershipSnapshot(
  subscription: MemberWithMembership['subscriptions'][number] | null,
  now: Date,
): MembershipSnapshot | null {
  if (!subscription) return null;
  const cancelled = Boolean(subscription.cancelledAt) || subscription.status === 'CANCELLED';
  const notStarted = subscription.startDate > now;
  const expired = subscription.endDate < now;
  return {
    id: subscription.id,
    planName: subscription.planNameAtPurchase,
    status: subscription.status,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    daysRemaining: cancelled || expired ? 0 : Math.ceil((subscription.endDate.getTime() - now.getTime()) / 86_400_000),
    valid: !cancelled && !notStarted && !expired,
  };
}

/**
 * Applies the gym access policy.
 *
 * Membership validity is derived from the dates as well as the stored status so
 * a check-in is never granted or denied by a stale lifecycle flag.
 */
export function evaluateAccess(
  member: MemberWithMembership,
  policy: Preferences['attendancePolicy'],
  now: Date,
): AccessDecision {
  const reasons: AccessReason[] = [];
  const subscription = pickMembership(member, now);
  const membership = membershipSnapshot(subscription, now);

  if (policy.requireActiveMember && member.status !== 'ACTIVE') {
    reasons.push({
      code: 'MEMBER_NOT_ACTIVE',
      message: `The member's administrative status is ${member.status}; only ACTIVE members may enter unless an administrator authorizes an exception.`,
    });
  }

  if (policy.requireValidMembership) {
    if (!subscription || !membership) {
      reasons.push({
        code: 'MEMBERSHIP_MISSING',
        message: 'The member has no membership assigned.',
      });
    } else if (subscription.cancelledAt || subscription.status === 'CANCELLED') {
      reasons.push({ code: 'MEMBERSHIP_CANCELLED', message: 'The current membership was cancelled.' });
    } else if (subscription.startDate > now) {
      reasons.push({
        code: 'MEMBERSHIP_NOT_STARTED',
        message: `The membership starts on ${subscription.startDate.toISOString().slice(0, 10)}.`,
      });
    } else if (subscription.endDate < now) {
      reasons.push({
        code: 'MEMBERSHIP_EXPIRED',
        message: `The membership expired on ${subscription.endDate.toISOString().slice(0, 10)}.`,
      });
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    policy,
    member: {
      id: member.id,
      fullName: member.user.fullName,
      photoUrl: member.user.avatarUrl,
      documentType: member.documentType,
      documentNumber: member.documentNumber,
      status: member.status,
    },
    membership,
  };
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export interface RegisterCheckInInput {
  gymId: string;
  memberId: string;
  method: AttendanceMethod;
  userId: string | null;
  notes?: string | null;
  /** Justification supplied by an administrator to record an exception. */
  exceptionReason?: string | null;
  now?: Date;
}

export const attendanceSelect = {
  id: true,
  gymId: true,
  memberId: true,
  checkInTime: true,
  checkOutTime: true,
  status: true,
  method: true,
  result: true,
  exceptionReason: true,
  membershipStatusAtCheckIn: true,
  notes: true,
  recordedById: true,
  createdAt: true,
  member: {
    select: {
      id: true,
      documentType: true,
      documentNumber: true,
      user: { select: { fullName: true, avatarUrl: true } },
    },
  },
  recordedBy: { select: { id: true, fullName: true } },
} as const;

function clockIn(timezone: string, date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export interface RegisterCheckInResult {
  attendance: Prisma.AttendanceGetPayload<{ select: typeof attendanceSelect }>;
  decision: AccessDecision;
  duplicateWindowMinutes: number;
}

/**
 * Records one entry inside a transaction:
 *   lock member → evaluate policy → duplicate window → insert.
 */
export async function registerCheckIn(input: RegisterCheckInInput): Promise<RegisterCheckInResult> {
  const gym = await loadGymPreferences(input.gymId);
  if (!gym) throw new AppError('Gym not found', 404);
  if (!gym.isActive) throw new AppError('This gym has been suspended', 403, { code: 'GYM_SUSPENDED' });

  const now = input.now ?? new Date();
  const tolerance = gym.preferences.attendanceDuplicateToleranceMinutes;
  const policy = gym.preferences.attendancePolicy;

  const result = await prisma.$transaction(async (tx) => {
    // One writer per member: concurrent clicks/scans queue here instead of
    // racing the duplicate check.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.gymId}:${input.memberId}`}))`;

    const member = await findMemberForCheckIn(tx, input.gymId, input.memberId);
    const decision = evaluateAccess(member, policy, now);

    if (tolerance > 0) {
      const existing = await tx.attendance.findFirst({
        where: {
          gymId: input.gymId,
          memberId: input.memberId,
          deletedAt: null,
          checkInTime: { gte: new Date(now.getTime() - tolerance * 60_000) },
        },
        orderBy: { checkInTime: 'desc' },
        select: { id: true, checkInTime: true },
      });
      if (existing) {
        throw new AppError(
          `Already registered at ${clockIn(gym.timezone, existing.checkInTime)}. A new entry can be recorded ${tolerance} minutes after the previous one.`,
          409,
          { code: 'DUPLICATE_ATTENDANCE', attendanceId: existing.id },
        );
      }
    }

    if (!decision.allowed) {
      if (!input.exceptionReason) {
        throw new AppError(`Access denied: ${decision.reasons.map((reason) => reason.message).join(' ')}`, 422, {
          code: 'ACCESS_DENIED',
          reasons: decision.reasons.map((reason) => reason.code),
        });
      }
      if (!policy.allowAdministrativeExceptions) {
        throw new AppError('This gym does not allow administrative access exceptions.', 403, {
          code: 'EXCEPTIONS_DISABLED',
        });
      }
    }

    const attendance = await tx.attendance.create({
      data: {
        gymId: input.gymId,
        memberId: input.memberId,
        checkInTime: now,
        method: input.method,
        status: 'PRESENT',
        result: decision.allowed ? 'ALLOWED' : 'EXCEPTION',
        exceptionReason: decision.allowed ? null : (input.exceptionReason ?? null),
        membershipStatusAtCheckIn: decision.membership?.valid ? 'ACTIVE' : (decision.membership?.status ?? 'NONE'),
        notes: input.notes ?? null,
        recordedById: input.userId,
      },
      select: attendanceSelect,
    });

    return { attendance, decision };
  });

  return { ...result, duplicateWindowMinutes: tolerance };
}

/* ------------------------------------------------------------------ */
/* QR credentials                                                      */
/* ------------------------------------------------------------------ */

const QR_PREFIXES = [/^gym-saas:member:/i, /^gm:/i];

/** 24 random bytes → 32 URL-safe characters, no personal data inside. */
export function generateQrToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Accepts the bare token or the printed `gym-saas:member:<token>` form. */
export function normalizeQrPayload(raw: string): string {
  let value = raw.trim();
  for (const prefix of QR_PREFIXES) value = value.replace(prefix, '');
  return value.trim();
}

export function qrPayload(token: string) {
  return `gym-saas:member:${token}`;
}

/** Resolves a scanned token to a member of this gym only. */
export async function memberFromQrToken(gymId: string, rawToken: string) {
  const token = normalizeQrPayload(rawToken);
  if (!token || token.length < 16 || token.length > 64) {
    throw new AppError('The scanned code is not a valid member credential.', 400, { code: 'INVALID_QR' });
  }
  const member = await prisma.memberProfile.findFirst({
    where: { gymId, qrToken: token },
    select: { id: true, qrRevokedAt: true },
  });
  if (!member) {
    // Unknown and revoked tokens are indistinguishable to the caller.
    throw new AppError('This code is not valid or has been revoked.', 404, { code: 'QR_NOT_FOUND' });
  }
  return member;
}

/* ------------------------------------------------------------------ */
/* Query helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Weekly buckets (oldest first) used by the attendance evolution chart.
 * `times` may contain entries older than the window; they are ignored.
 */
export function weeklyBuckets(times: Date[], timezone: string, weeks: number) {
  const today = startOfGymDate(undefined, timezone);
  const buckets: Array<{ weekStart: string; count: number }> = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = new Date(today.getTime() - index * 7 * 86_400_000);
    buckets.push({ weekStart: gymCalendarDate(start, timezone), count: 0 });
  }
  const oldest = new Date(today.getTime() - (weeks - 1) * 7 * 86_400_000);
  for (const time of times) {
    if (time < oldest) continue;
    const dayKey = gymCalendarDate(time, timezone);
    // Bucket by the week that starts on or before the entry.
    for (let index = buckets.length - 1; index >= 0; index -= 1) {
      const bucket = buckets[index];
      if (bucket && bucket.weekStart <= dayKey) {
        bucket.count += 1;
        break;
      }
    }
  }
  return buckets;
}

/** Local day boundaries of the gym, used by the dashboard indicators. */
export async function gymDayRange(gymId: string, date?: string) {
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { timezone: true } });
  const timezone = gym?.timezone ?? 'UTC';
  const start = startOfGymDate(date, timezone);
  return { start, end: new Date(start.getTime() + 86_400_000 - 1), timezone };
}
