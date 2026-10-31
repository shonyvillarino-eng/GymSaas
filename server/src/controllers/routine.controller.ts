import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { clientIp, writeAudit } from '../services/audit.js';
import { idParamSchema, parseOrThrow } from '../validations/schemas.js';
import { routineCreateSchema, routineListQuerySchema, routineUpdateSchema } from '../validations/routine.schemas.js';
import {
  assertCanAssignRoutineToMember,
  assertCanModifyRoutine,
  assertCanReadRoutine,
  applyActivation,
  instructorProfileOf,
  isAssignedToMember,
  memberProfileOf,
  recordRoutineVersion,
  statusData,
  type Actor,
} from '../services/routines.js';
import { startOfGymDate } from '../services/financial.js';
import { notifyRoutineEvent } from '../services/notifications.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function actor(req: Request): Actor {
  if (!req.auth?.gymId) throw new AppError('Gym access required', 403, { code: 'FORBIDDEN' });
  return { userId: req.auth.userId, role: req.auth.role, gymId: req.auth.gymId };
}

async function audit(
  req: Request,
  gymId: string,
  action: 'CREATE' | 'UPDATE' | 'ASSIGN' | 'UNASSIGN',
  entityId: string,
  newValues: Prisma.InputJsonValue,
  oldValues?: Prisma.InputJsonValue,
) {
  await writeAudit({
    gymId,
    userId: req.auth?.userId ?? null,
    action,
    entityType: 'Routine',
    entityId,
    newValues,
    ...(oldValues ? { oldValues } : {}),
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });
}

const routineRowSelect = {
  id: true,
  gymId: true,
  name: true,
  description: true,
  status: true,
  version: true,
  startDate: true,
  endDate: true,
  notes: true,
  isActive: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, user: { select: { fullName: true } } } },
  instructor: { select: { id: true, user: { select: { fullName: true } } } },
  creator: { select: { id: true, fullName: true } },
  _count: { select: { days: true } },
} as const;

type RoutineRow = Prisma.RoutineGetPayload<{ select: typeof routineRowSelect }>;

function publicRoutineRow(row: RoutineRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    version: row.version,
    startDate: row.startDate,
    endDate: row.endDate,
    notes: row.notes,
    isActive: row.isActive,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    member: row.assignee ? { id: row.assignee.id, fullName: row.assignee.user.fullName } : null,
    instructor: row.instructor ? { id: row.instructor.id, fullName: row.instructor.user.fullName } : null,
    author: row.creator?.fullName ?? null,
    dayCount: row._count.days,
  };
}

const routineDetailSelect = {
  ...routineRowSelect,
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
          id: true,
          exerciseOrder: true,
          sets: true,
          reps: true,
          restSeconds: true,
          weightKg: true,
          tempo: true,
          instructions: true,
          notes: true,
          exercise: {
            select: { id: true, name: true, muscleGroup: true, equipment: true, instructions: true, imageUrl: true, isActive: true },
          },
        },
      },
    },
  },
} as const;

/** Pure data used to build the nested create of a routine's sessions. */
function dayCreates(gymId: string, days: Array<{ name: string; description: string | null; restDay: boolean; exercises: Array<{ exerciseId: string; sets: number; reps: string; restSeconds: number; weightKg: number | null; tempo: string | null; instructions: string | null; notes: string | null }> }>) {
  return days.map((day, dayIndex) => ({
    gymId,
    name: day.name,
    description: day.description,
    dayOrder: dayIndex + 1,
    restDay: day.restDay,
    exercises: {
      create: day.exercises.map((entry, order) => ({
        gymId,
        exerciseId: entry.exerciseId,
        exerciseOrder: order + 1,
        sets: entry.sets,
        reps: entry.reps,
        restSeconds: entry.restSeconds,
        weightKg: entry.weightKg,
        tempo: entry.tempo,
        instructions: entry.instructions,
        notes: entry.notes,
      })),
    },
  }));
}

/** Every referenced exercise must exist in this gym and be active. */
async function assertExercisesUsable(gymId: string, exerciseIds: string[]) {
  const unique = Array.from(new Set(exerciseIds));
  if (unique.length === 0) return;
  const found = await prisma.exercise.findMany({
    where: { gymId, id: { in: unique } },
    select: { id: true, name: true, isActive: true },
  });
  if (found.length !== unique.length) {
    throw new AppError('One or more exercises do not belong to this gym.', 400, {
      exerciseId: ['Unknown exercise for this gym'],
    });
  }
  const inactive = found.find((row) => !row.isActive);
  if (inactive) {
    throw new AppError(`Exercise "${inactive.name}" is inactive and cannot be added to a routine.`, 400, {
      exerciseId: ['Inactive exercise'],
    });
  }
}

async function loadRoutine(gymId: string, id: string, db: Prisma.TransactionClient = prisma) {
  const routine = await db.routine.findFirst({
    where: { id, gymId, deletedAt: null },
    select: { id: true, gymId: true, assignedToId: true, createdBy: true, instructorId: true, status: true, version: true, name: true },
  });
  if (!routine) throw new AppError('Routine not found', 404);
  return routine;
}

/** Primary instructor of a member, used as the responsible instructor of admin-created routines. */
async function primaryInstructorId(gymId: string, memberId: string) {
  const assignment = await prisma.instructorMember.findFirst({
    where: { gymId, memberId, isActive: true, isPrimary: true },
    select: { instructorId: true },
  });
  return assignment?.instructorId ?? null;
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export async function listRoutines(req: Request, res: Response) {
  const current = actor(req);
  const query = parseOrThrow(routineListQuerySchema, req.query);
  const gym = await prisma.gym.findUniqueOrThrow({ where: { id: current.gymId }, select: { timezone: true } });

  const where: Prisma.RoutineWhereInput = {
    gymId: current.gymId,
    deletedAt: null,
    ...(query.status !== 'all' ? { status: query.status } : {}),
    ...(query.memberId ? { assignedToId: query.memberId } : {}),
    ...(query.instructorId ? { instructorId: query.instructorId } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    ...(query.from || query.to
      ? {
          updatedAt: {
            ...(query.from ? { gte: startOfGymDate(query.from, gym.timezone) } : {}),
            ...(query.to ? { lte: new Date(startOfGymDate(query.to, gym.timezone).getTime() + 86_400_000 - 1) } : {}),
          },
        }
      : {}),
  };

  if (current.role === 'MEMBER') {
    const member = await memberProfileOf(prisma, current);
    if (!member) throw new AppError('Member profile not found', 404);
    where.assignedToId = member.id;
  } else if (current.role === 'INSTRUCTOR') {
    const instructor = await instructorProfileOf(prisma, current);
    if (!instructor) throw new AppError('Instructor access required', 403, { code: 'FORBIDDEN' });
    const assignments = await prisma.instructorMember.findMany({
      where: { gymId: current.gymId, instructorId: instructor.id, isActive: true },
      select: { memberId: true },
    });
    const memberIds = assignments.map((row) => row.memberId);
    where.AND = [
      {
        OR: [
          { createdBy: current.userId },
          { instructorId: instructor.id },
          ...(memberIds.length ? [{ assignedToId: { in: memberIds } }] : []),
        ],
      },
    ];
  } else if (current.role !== 'GYM_ADMIN') {
    throw new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' });
  }

  const [total, rows] = await prisma.$transaction([
    prisma.routine.count({ where }),
    prisma.routine.findMany({
      where,
      orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: routineRowSelect,
    }),
  ]);

  res.json({
    data: rows.map(publicRoutineRow),
    meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
  });
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export async function getRoutine(req: Request, res: Response) {
  const current = actor(req);
  const id = parseOrThrow(idParamSchema, req.params.id);
  const ref = await loadRoutine(current.gymId, id);
  await assertCanReadRoutine(prisma, current, ref);

  const routine = await prisma.routine.findFirstOrThrow({ where: { id, gymId: current.gymId }, select: routineDetailSelect });

  // Report the real capability so the UI never offers an action the API rejects.
  let canModify = false;
  if (current.role === 'GYM_ADMIN') {
    canModify = true;
  } else if (current.role === 'INSTRUCTOR') {
    try {
      await assertCanModifyRoutine(prisma, current, ref);
      canModify = true;
    } catch {
      canModify = false;
    }
  }

  res.json({
    data: {
      ...publicRoutineRow(routine as unknown as RoutineRow),
      days: routine.days,
      canModify,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export async function createRoutine(req: Request, res: Response) {
  const current = actor(req);
  if (!['GYM_ADMIN', 'INSTRUCTOR'].includes(current.role)) {
    throw new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' });
  }
  const input = parseOrThrow(routineCreateSchema, req.body);
  await assertCanAssignRoutineToMember(current, input.memberId);
  await assertExercisesUsable(current.gymId, input.days.flatMap((day) => day.exercises.map((entry) => entry.exerciseId)));

  const instructorProfile = await instructorProfileOf(prisma, current);
  const instructorId = instructorProfile?.id ?? (await primaryInstructorId(current.gymId, input.memberId));

  const created = await prisma.$transaction(async (tx) => {
    const routine = await tx.routine.create({
      data: {
        gymId: current.gymId,
        name: input.name,
        description: input.description,
        assignedToId: input.memberId,
        instructorId,
        createdBy: current.userId,
        startDate: input.startDate ? new Date(`${input.startDate}T00:00:00`) : null,
        endDate: input.endDate ? new Date(`${input.endDate}T00:00:00`) : null,
        notes: input.notes,
        status: 'DRAFT',
        isActive: false,
        version: 1,
        days: { create: dayCreates(current.gymId, input.days) },
      },
      select: { id: true, version: true },
    });
    await recordRoutineVersion(tx, routine.id, 'CREATE', current.userId);

    if (input.activate) {
      await applyActivation(tx, { ...routine, gymId: current.gymId, assignedToId: input.memberId, createdBy: current.userId, instructorId, status: 'DRAFT' }, current.userId);
    }
    return routine;
  });

  await audit(req, current.gymId, 'CREATE', created.id, { name: input.name, memberId: input.memberId, activate: input.activate });
  void notifyRoutineEvent(created.id, 'assigned').catch(() => undefined);
  const detail = await prisma.routine.findFirstOrThrow({ where: { id: created.id }, select: routineDetailSelect });
  res.status(201).json({ data: { ...publicRoutineRow(detail as unknown as RoutineRow), days: detail.days } });
}

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

export async function updateRoutine(req: Request, res: Response) {
  const current = actor(req);
  const id = parseOrThrow(idParamSchema, req.params.id);
  const input = parseOrThrow(routineUpdateSchema, req.body);

  const ref = await loadRoutine(current.gymId, id);
  await assertCanModifyRoutine(prisma, current, ref);
  if (ref.status === 'ARCHIVED') {
    throw new AppError('Archived routines are read-only. Activate it again or create a new routine.', 409, {
      code: 'ROUTINE_ARCHIVED',
    });
  }

  if (input.memberId && input.memberId !== ref.assignedToId) {
    await assertCanAssignRoutineToMember(current, input.memberId);
  }
  if (input.days) {
    await assertExercisesUsable(current.gymId, input.days.flatMap((day) => day.exercises.map((entry) => entry.exerciseId)));
  }

  await prisma.$transaction(async (tx) => {
    const { days, activate, memberId, ...rest } = input;
    await tx.routine.update({
      where: { id },
      data: {
        ...rest,
        ...(memberId ? { assignedToId: memberId } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(`${input.startDate}T00:00:00`) : null } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(`${input.endDate}T00:00:00`) : null } : {}),
        version: { increment: 1 },
      },
      select: { id: true },
    });

    if (days) {
      await tx.routineDay.deleteMany({ where: { routineId: id } });
      for (const day of dayCreates(current.gymId, days)) {
        const { exercises, ...dayData } = day;
        await tx.routineDay.create({ data: { ...dayData, routineId: id, exercises } });
      }
    }
    await recordRoutineVersion(tx, id, 'UPDATE', current.userId);

    if (activate) {
      const refreshed = await loadRoutine(current.gymId, id, tx);
      await applyActivation(tx, refreshed, current.userId);
    }
  });

  await audit(req, current.gymId, 'UPDATE', id, { fields: Object.keys(input) });
  void notifyRoutineEvent(id, 'updated').catch(() => undefined);
  const detail = await prisma.routine.findFirstOrThrow({ where: { id }, select: routineDetailSelect });
  res.json({ data: { ...publicRoutineRow(detail as unknown as RoutineRow), days: detail.days } });
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

export async function activateRoutine(req: Request, res: Response) {
  const current = actor(req);
  const id = parseOrThrow(idParamSchema, req.params.id);
  const ref = await loadRoutine(current.gymId, id);
  await assertCanModifyRoutine(prisma, current, ref);

  if (ref.status === 'ACTIVE') {
    const detail = await prisma.routine.findFirstOrThrow({ where: { id }, select: routineDetailSelect });
    res.json({ data: { ...publicRoutineRow(detail as unknown as RoutineRow), days: detail.days, superseded: [], alreadyActive: true } });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const activation = await applyActivation(tx, ref, current.userId);
      return activation;
    });
    await audit(req, current.gymId, 'UPDATE', id, { action: 'ACTIVATE', superseded: result.superseded });
    void notifyRoutineEvent(id, 'assigned').catch(() => undefined);
    const detail = await prisma.routine.findFirstOrThrow({ where: { id }, select: routineDetailSelect });
    res.json({
      data: {
        ...publicRoutineRow(detail as unknown as RoutineRow),
        days: detail.days,
        superseded: result.superseded,
        alreadyActive: false,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      throw new AppError('Another routine became active for this member. Reload and try again.', 409, {
        code: 'CONFLICTING_ACTIVATION',
      });
    }
    throw error;
  }
}

export async function archiveRoutine(req: Request, res: Response) {
  const current = actor(req);
  const id = parseOrThrow(idParamSchema, req.params.id);
  const ref = await loadRoutine(current.gymId, id);
  await assertCanModifyRoutine(prisma, current, ref);

  if (ref.status === 'ARCHIVED') {
    res.status(200).json({ data: { id, alreadyArchived: true } });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.routine.update({ where: { id }, data: { ...statusData('ARCHIVED'), version: { increment: 1 } } });
    await recordRoutineVersion(tx, id, 'ARCHIVE', current.userId);
  });
  await audit(req, current.gymId, 'UPDATE', id, { action: 'ARCHIVE' });
  res.json({ data: { id, archivedAt: new Date().toISOString(), alreadyArchived: false } });
}

/** DELETE is a soft archive: history and routines are never physically removed. */
export async function deleteRoutine(req: Request, res: Response) {
  return archiveRoutine(req, res);
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export async function routineHistory(req: Request, res: Response) {
  const current = actor(req);
  const id = parseOrThrow(idParamSchema, req.params.id);
  const ref = await loadRoutine(current.gymId, id);
  await assertCanReadRoutine(prisma, current, ref);

  const versions = await prisma.routineVersion.findMany({
    where: { routineId: id, gymId: current.gymId },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      status: true,
      reason: true,
      createdAt: true,
      createdBy: { select: { id: true, fullName: true } },
      snapshot: true,
    },
  });

  res.json({
    data: versions.map((row) => ({
      id: row.id,
      version: row.version,
      status: row.status,
      reason: row.reason,
      createdAt: row.createdAt,
      author: row.createdBy?.fullName ?? 'System',
      snapshot: row.snapshot,
    })),
  });
}

/* ------------------------------------------------------------------ */
/* Routines of one member                                              */
/* ------------------------------------------------------------------ */

/**
 * Member routine list used by `/members/:memberId/routines` and
 * `/routines/member/:memberId`. A member can only read their own set.
 */
export async function memberRoutines(req: Request, res: Response, explicitMemberId?: string) {
  const current = actor(req);
  const memberId = explicitMemberId ?? parseOrThrow(idParamSchema, req.params.memberId);

  if (current.role === 'MEMBER') {
    const member = await memberProfileOf(prisma, current);
    if (!member || member.id !== memberId) throw new AppError('Member not found', 404);
  } else if (current.role === 'INSTRUCTOR') {
    const instructor = await instructorProfileOf(prisma, current);
    if (!instructor) throw new AppError('Instructor access required', 403, { code: 'FORBIDDEN' });
    if (!(await isAssignedToMember(prisma, current.gymId, instructor.id, memberId))) {
      throw new AppError('You can only consult members assigned to you', 403, { code: 'NOT_ASSIGNED' });
    }
  } else if (current.role !== 'GYM_ADMIN') {
    throw new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' });
  }

  const member = await prisma.memberProfile.findFirst({
    where: { id: memberId, gymId: current.gymId },
    select: { id: true, status: true, user: { select: { fullName: true } } },
  });
  if (!member) throw new AppError('Member not found', 404);

  const rows = await prisma.routine.findMany({
    where: {
      gymId: current.gymId,
      assignedToId: memberId,
      deletedAt: null,
      // A member never sees an unfinished draft: only what is in force or was.
      ...(current.role === 'MEMBER' ? { status: { in: ['ACTIVE', 'ARCHIVED'] } } : {}),
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    select: routineDetailSelect,
  });

  res.json({
    data: rows.map((row) => ({ ...publicRoutineRow(row as unknown as RoutineRow), days: row.days })),
    meta: { memberId: member.id, memberName: member.user.fullName, memberStatus: member.status, total: rows.length },
  });
}

/** GET /routines/me — the signed-in member's own routines, read-only. */
export async function myRoutines(req: Request, res: Response) {
  const current = actor(req);
  const member = await memberProfileOf(prisma, current);
  if (!member) throw new AppError('Member profile not found', 404);
  return memberRoutines(req, res, member.id);
}
