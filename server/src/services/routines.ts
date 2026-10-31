import { Prisma, type RoutineStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';

/**
 * Routine rules shared by the API layer.
 *
 * Three invariants:
 *   1. Authorization is re-checked in the database on every operation — the
 *      client never decides who may edit a routine.
 *   2. A routine is never overwritten silently: every accepted change appends
 *      an immutable RoutineVersion snapshot.
 *   3. Activation is transactional per member: archiving the previous routine
 *      and activating the new one happen together, under an advisory lock.
 */

export type Actor = {
  userId: string;
  role: string;
  gymId: string;
};

type RoutineRef = {
  id: string;
  gymId: string;
  assignedToId: string | null;
  createdBy: string | null;
  instructorId: string | null;
  status: RoutineStatus;
  version: number;
};

/* ------------------------------------------------------------------ */
/* Tenancy helpers                                                     */
/* ------------------------------------------------------------------ */

export function gymIdFromSession(actor: Actor): string {
  if (!actor.gymId) throw new AppError('Gym access required', 403, { code: 'FORBIDDEN' });
  return actor.gymId;
}

/** Instructor profile of the signed-in user, or null for other roles. */
export async function instructorProfileOf(db: Prisma.TransactionClient, actor: Actor) {
  if (actor.role !== 'INSTRUCTOR') return null;
  return db.instructorProfile.findFirst({
    where: { gymId: actor.gymId, userId: actor.userId },
    select: { id: true, status: true, isAvailable: true },
  });
}

/** Member profile of the signed-in member account, or null for other roles. */
export async function memberProfileOf(db: Prisma.TransactionClient, actor: Actor) {
  if (actor.role !== 'MEMBER') return null;
  return db.memberProfile.findFirst({
    where: { gymId: actor.gymId, userId: actor.userId },
    select: { id: true },
  });
}

/** True when this instructor is currently assigned to the member. */
export async function isAssignedToMember(
  db: Prisma.TransactionClient,
  gymId: string,
  instructorId: string,
  memberId: string,
) {
  const assignment = await db.instructorMember.findFirst({
    where: { gymId, instructorId, memberId, isActive: true },
    select: { id: true },
  });
  return Boolean(assignment);
}

/* ------------------------------------------------------------------ */
/* Read / modify permissions                                           */
/* ------------------------------------------------------------------ */

/**
 * Reading: the gym administrator, the member himself, or an instructor who is
 * responsible for the routine, authored it, or is currently assigned to the
 * member it belongs to.
 */
export async function assertCanReadRoutine(db: Prisma.TransactionClient, actor: Actor, routine: RoutineRef) {
  if (routine.gymId !== actor.gymId) throw new AppError('Routine not found', 404);
  if (actor.role === 'GYM_ADMIN') return;

  if (actor.role === 'MEMBER') {
    const member = await memberProfileOf(db, actor);
    if (!member || member.id !== routine.assignedToId) throw new AppError('Routine not found', 404);
    return;
  }

  if (actor.role === 'INSTRUCTOR') {
    const instructor = await instructorProfileOf(db, actor);
    if (!instructor) throw new AppError('Instructor access required', 403, { code: 'FORBIDDEN' });
    const owns = routine.createdBy === actor.userId || routine.instructorId === instructor.id;
    const assigned = routine.assignedToId
      ? await isAssignedToMember(db, actor.gymId, instructor.id, routine.assignedToId)
      : false;
    if (!owns && !assigned) throw new AppError('Routine not found', 404);
    return;
  }

  throw new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' });
}

/**
 * Writing: administrators manage their own gym; an instructor must still be
 * assigned to the member AND be the author or the responsible instructor.
 * Losing the assignment removes write access immediately.
 */
export async function assertCanModifyRoutine(db: Prisma.TransactionClient, actor: Actor, routine: RoutineRef) {
  if (routine.gymId !== actor.gymId) throw new AppError('Routine not found', 404);
  if (actor.role === 'GYM_ADMIN') return;
  if (actor.role !== 'INSTRUCTOR') {
    throw new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' });
  }

  const instructor = await instructorProfileOf(db, actor);
  if (!instructor || instructor.status !== 'ACTIVE' || !instructor.isAvailable) {
    throw new AppError('Instructor account is inactive or suspended', 403, { code: 'INSTRUCTOR_INACTIVE' });
  }
  if (!routine.assignedToId) throw new AppError('Routine is not assigned to a member', 400);

  const assigned = await isAssignedToMember(db, actor.gymId, instructor.id, routine.assignedToId);
  if (!assigned) {
    throw new AppError('You are no longer assigned to this member, so this routine is read-only for you.', 403, {
      code: 'NOT_ASSIGNED',
    });
  }
  if (routine.createdBy !== actor.userId && routine.instructorId !== instructor.id) {
    throw new AppError('Only the instructor responsible for this routine can modify it.', 403, {
      code: 'NOT_ROUTINE_OWNER',
    });
  }
}

/**
 * Creating a routine for a member requires an active assignment (instructors)
 * or an existing member of the same gym (administrators).
 */
export async function assertCanAssignRoutineToMember(actor: Actor, memberId: string) {
  const member = await prisma.memberProfile.findFirst({
    where: { id: memberId, gymId: actor.gymId },
    select: { id: true, status: true },
  });
  if (!member) throw new AppError('Member not found', 404);

  if (actor.role === 'GYM_ADMIN') return member;
  if (actor.role !== 'INSTRUCTOR') throw new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' });

  const instructor = await instructorProfileOf(prisma, actor);
  if (!instructor || instructor.status !== 'ACTIVE' || !instructor.isAvailable) {
    throw new AppError('Instructor account is inactive or suspended', 403, { code: 'INSTRUCTOR_INACTIVE' });
  }
  if (!(await isAssignedToMember(prisma, actor.gymId, instructor.id, memberId))) {
    throw new AppError('You can only create routines for members assigned to you.', 403, { code: 'NOT_ASSIGNED' });
  }
  return member;
}

/* ------------------------------------------------------------------ */
/* Snapshots                                                           */
/* ------------------------------------------------------------------ */

const snapshotSelect = {
  id: true,
  gymId: true,
  name: true,
  description: true,
  status: true,
  version: true,
  startDate: true,
  endDate: true,
  notes: true,
  assignee: { select: { id: true, user: { select: { fullName: true } } } },
  instructor: { select: { id: true, user: { select: { fullName: true } } } },
  days: {
    orderBy: { dayOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      dayOrder: true,
      restDay: true,
      exercises: {
        orderBy: { exerciseOrder: 'asc' },
        select: {
          exerciseOrder: true,
          sets: true,
          reps: true,
          restSeconds: true,
          weightKg: true,
          tempo: true,
          instructions: true,
          notes: true,
          exercise: { select: { id: true, name: true, muscleGroup: true, equipment: true } },
        },
      },
    },
  },
} as const;

type SnapshotRoutine = Prisma.RoutineGetPayload<{ select: typeof snapshotSelect }>;

/** Serialisable, self-contained description of a routine at one point in time. */
export function routineSnapshot(routine: SnapshotRoutine) {
  return {
    routineId: routine.id,
    name: routine.name,
    description: routine.description,
    status: routine.status,
    version: routine.version,
    startDate: routine.startDate?.toISOString() ?? null,
    endDate: routine.endDate?.toISOString() ?? null,
    notes: routine.notes,
    member: routine.assignee
      ? { id: routine.assignee.id, fullName: routine.assignee.user.fullName }
      : null,
    instructor: routine.instructor
      ? { id: routine.instructor.id, fullName: routine.instructor.user.fullName }
      : null,
    days: routine.days.map((day) => ({
      name: day.name,
      description: day.description,
      order: day.dayOrder,
      restDay: day.restDay,
      exercises: day.exercises.map((entry) => ({
        order: entry.exerciseOrder,
        exerciseId: entry.exercise.id,
        name: entry.exercise.name,
        muscleGroup: entry.exercise.muscleGroup,
        equipment: entry.exercise.equipment,
        sets: entry.sets,
        reps: entry.reps,
        restSeconds: entry.restSeconds,
        weightKg: entry.weightKg ? entry.weightKg.toString() : null,
        tempo: entry.tempo,
        instructions: entry.instructions,
        notes: entry.notes,
      })),
    })),
  };
}

/**
 * Appends an immutable version row for the routine's CURRENT version number.
 * Call it after the routine row was already updated in the same transaction.
 */
export async function recordRoutineVersion(
  tx: Prisma.TransactionClient,
  routineId: string,
  reason: string,
  actorUserId: string | null,
) {
  const routine = await tx.routine.findUniqueOrThrow({ where: { id: routineId }, select: snapshotSelect });
  const snapshot = routineSnapshot(routine);

  // The routine row already carries the new version; the snapshot is keyed by it.
  const existing = await tx.routineVersion.findUnique({
    where: { routineId_version: { routineId, version: routine.version } },
    select: { id: true },
  });
  if (existing) return existing;

  return tx.routineVersion.create({
    data: {
      gymId: routine.gymId,
      routineId,
      version: routine.version,
      status: routine.status,
      reason,
      createdById: actorUserId,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

/* ------------------------------------------------------------------ */
/* Status helpers                                                      */
/* ------------------------------------------------------------------ */

/** `isActive` mirrors `status` so modules written before the lifecycle keep working. */
export function statusData(status: RoutineStatus) {
  return {
    status,
    isActive: status === 'ACTIVE',
    archivedAt: status === 'ARCHIVED' ? new Date() : null,
  };
}

/**
 * Archives every other ACTIVE routine of the member and activates this one.
 * Must run inside the transaction that also snapshots the affected routines.
 */
export async function applyActivation(
  tx: Prisma.TransactionClient,
  routine: RoutineRef,
  actorUserId: string | null,
) {
  if (!routine.assignedToId) {
    throw new AppError('Assign the routine to a member before activating it.', 400);
  }

  // Serialize activations for the same member.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`routine:${routine.assignedToId}`}))`;

  const previous = await tx.routine.findMany({
    where: {
      gymId: routine.gymId,
      assignedToId: routine.assignedToId,
      status: 'ACTIVE',
      deletedAt: null,
      id: { not: routine.id },
    },
    select: { id: true, version: true },
  });

  for (const row of previous) {
    await tx.routine.update({
      where: { id: row.id },
      data: { status: 'ARCHIVED', isActive: false, archivedAt: new Date(), version: { increment: 1 } },
    });
    await recordRoutineVersion(tx, row.id, 'SUPERSEDED', actorUserId);
  }

  const updated = await tx.routine.update({
    where: { id: routine.id },
    data: {
      status: 'ACTIVE',
      isActive: true,
      archivedAt: null,
      version: { increment: 1 },
    },
    select: { version: true },
  });
  await recordRoutineVersion(tx, routine.id, 'ACTIVATE', actorUserId);

  return { version: updated.version, superseded: previous.map((row) => row.id) };
}

export const routineStatusValues = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
