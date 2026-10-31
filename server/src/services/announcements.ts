import type { AnnouncementAudience, Prisma, UserRole } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';

export interface AnnouncementViewer {
  gymId: string;
  userId: string;
  role: UserRole;
}

/**
 * Announcements visible to a signed-in user.
 *
 * Only published, already-scheduled and non-expired rows qualify. A specific
 * announcement is visible exclusively to its target user; role audiences are
 * visible only to that role. Management endpoints use a separate query that is
 * restricted to GYM_ADMIN, so administrators can still see drafts.
 */
export function visibleAnnouncementWhere(viewer: AnnouncementViewer): Prisma.AnnouncementWhereInput {
  const now = new Date();
  const roleAudiences: AnnouncementAudience[] =
    viewer.role === 'MEMBER' ? ['MEMBERS'] : viewer.role === 'INSTRUCTOR' ? ['INSTRUCTORS'] : [];

  return {
    gymId: viewer.gymId,
    status: 'PUBLISHED',
    publishAt: { lte: now },
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      {
        OR: [
          { audience: 'ALL' },
          ...(roleAudiences.length > 0 ? [{ audience: { in: roleAudiences } }] : []),
          ...(viewer.role === 'MEMBER'
            ? [{ audience: 'SPECIFIC_MEMBER' as const, targetUserId: viewer.userId }]
            : []),
          ...(viewer.role === 'INSTRUCTOR'
            ? [{ audience: 'SPECIFIC_INSTRUCTOR' as const, targetUserId: viewer.userId }]
            : []),
        ],
      },
    ],
  };
}

/**
 * Resolves the audience of a new announcement against the *server-side* gym.
 *
 * Specific recipients must be active users of the same gym and their role must
 * match the requested audience. The target is cleared for non-specific
 * audiences so a stray value can never widen or leak a message.
 */
export async function resolveAnnouncementAudience(
  gymId: string,
  audience: AnnouncementAudience,
  targetUserId?: string | null,
): Promise<string | null> {
  if (audience !== 'SPECIFIC_MEMBER' && audience !== 'SPECIFIC_INSTRUCTOR') {
    return null;
  }
  if (!targetUserId) {
    throw new AppError('A target user is required for this audience', 400, {
      targetUserId: ['A target user is required for this audience'],
    });
  }

  const membership = await prisma.gymMembership.findUnique({
    where: { gymId_userId: { gymId, userId: targetUserId } },
    select: { isActive: true, role: true, user: { select: { isActive: true } } },
  });

  const expectedRole: UserRole = audience === 'SPECIFIC_MEMBER' ? 'MEMBER' : 'INSTRUCTOR';
  if (!membership || !membership.isActive || !membership.user.isActive || membership.role !== expectedRole) {
    throw new AppError('The target user does not belong to this gym with the required role', 400, {
      targetUserId: ['The target user does not belong to this gym with the required role'],
    });
  }
  return targetUserId;
}

/** Recipients of an announcement, always scoped to the announcement's gym. */
export function announcementRecipientsWhere(
  gymId: string,
  audience: AnnouncementAudience,
  targetUserId: string | null,
): Prisma.GymMembershipWhereInput {
  const base: Prisma.GymMembershipWhereInput = { gymId, isActive: true };
  switch (audience) {
    case 'MEMBERS':
      return { ...base, role: 'MEMBER' };
    case 'INSTRUCTORS':
      return { ...base, role: 'INSTRUCTOR' };
    case 'SPECIFIC_MEMBER':
    case 'SPECIFIC_INSTRUCTOR':
      return { ...base, userId: targetUserId ?? '__none__' };
    default:
      return base;
  }
}

/**
 * Creates the in-app notifications for a published announcement.
 *
 * `dedupeKey` is unique, so publishing twice (or several servers publishing at
 * once) cannot duplicate a notification for the same user and announcement.
 */
export async function createAnnouncementNotifications(announcement: {
  id: string;
  gymId: string;
  audience: AnnouncementAudience;
  targetUserId: string | null;
  title: string;
  content: string;
}) {
  const recipients = await prisma.gymMembership.findMany({
    where: announcementRecipientsWhere(announcement.gymId, announcement.audience, announcement.targetUserId),
    select: { userId: true, role: true },
  });
  if (recipients.length === 0) return 0;

  // Honour the personal preference: an explicit opt-out of general notices or
  // of in-app delivery means no new row is created for that user.
  const preferences = await prisma.notificationPreference.findMany({
    where: { userId: { in: recipients.map((recipient) => recipient.userId) } },
    select: { userId: true, inApp: true, generalAlerts: true },
  });
  const optedOut = new Set(
    preferences.filter((pref) => !pref.inApp || !pref.generalAlerts).map((pref) => pref.userId),
  );
  const allowed = recipients.filter((recipient) => !optedOut.has(recipient.userId));
  if (allowed.length === 0) return 0;

  const created = await prisma.notification.createMany({
    data: allowed.map((recipient) => ({
      gymId: announcement.gymId,
      userId: recipient.userId,
      type: 'ANNOUNCEMENT' as const,
      title: announcement.title,
      message: announcement.content,
      // Members have a personal notices page; staff use the shared centre.
      link: recipient.role === 'MEMBER' ? '/notifications' : '/notifications/center',
      dedupeKey: `announcement:${announcement.id}:${recipient.userId}`,
      metadata: { announcementId: announcement.id },
    })),
    skipDuplicates: true,
  });
  return created.count;
}
