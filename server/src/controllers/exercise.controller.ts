import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { clientIp, writeAudit } from '../services/audit.js';
import { idParamSchema, parseOrThrow } from '../validations/schemas.js';
import {
  exerciseCreateSchema,
  exerciseListQuerySchema,
  exerciseStatusSchema,
  exerciseUpdateSchema,
} from '../validations/routine.schemas.js';
import type { Actor } from '../services/routines.js';

/**
 * Exercise catalog, always scoped to the signed-in gym.
 *
 * The `(gymId, name)` unique constraint keeps names unique inside a gym, so two
 * gyms may use the same name and no gym can see the other's catalog.
 */

function actor(req: Request): Actor {
  if (!req.auth?.gymId) throw new AppError('Gym access required', 403, { code: 'FORBIDDEN' });
  return { userId: req.auth.userId, role: req.auth.role, gymId: req.auth.gymId };
}

async function audit(req: Request, gymId: string, action: 'CREATE' | 'UPDATE', entityId: string, newValues: Prisma.InputJsonValue, oldValues?: Prisma.InputJsonValue) {
  await writeAudit({
    gymId,
    userId: req.auth?.userId ?? null,
    action,
    entityType: 'Exercise',
    entityId,
    newValues,
    ...(oldValues ? { oldValues } : {}),
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });
}

const exerciseSelect = {
  id: true,
  name: true,
  muscleGroup: true,
  exerciseType: true,
  equipment: true,
  instructions: true,
  imageUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { usages: true } },
} as const;

function publicExercise(row: Prisma.ExerciseGetPayload<{ select: typeof exerciseSelect }>) {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscleGroup,
    exerciseType: row.exerciseType,
    equipment: row.equipment,
    instructions: row.instructions,
    imageUrl: row.imageUrl,
    isActive: row.isActive,
    usageCount: row._count.usages,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listExercises(req: Request, res: Response) {
  const { gymId } = actor(req);
  const query = parseOrThrow(exerciseListQuerySchema, req.query);

  const where: Prisma.ExerciseWhereInput = {
    gymId,
    ...(query.status === 'active' ? { isActive: true } : query.status === 'inactive' ? { isActive: false } : {}),
    ...(query.muscleGroup !== 'all' ? { muscleGroup: query.muscleGroup as Prisma.ExerciseWhereInput['muscleGroup'] } : {}),
    ...(query.equipment ? { equipment: { has: query.equipment } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { instructions: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows, equipmentFacets] = await Promise.all([
    prisma.exercise.count({ where }),
    prisma.exercise.findMany({
      where,
      orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: exerciseSelect,
    }),
    prisma.exercise.findMany({ where: { gymId, isActive: true }, select: { equipment: true } }),
  ]);

  res.json({
    data: rows.map(publicExercise),
    meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    equipment: Array.from(new Set(equipmentFacets.flatMap((row) => row.equipment))).sort(),
  });
}

export async function getExercise(req: Request, res: Response) {
  const { gymId } = actor(req);
  const id = parseOrThrow(idParamSchema, req.params.id);
  const row = await prisma.exercise.findFirst({ where: { id, gymId }, select: exerciseSelect });
  if (!row) throw new AppError('Exercise not found', 404);
  res.json({ data: publicExercise(row) });
}

export async function createExercise(req: Request, res: Response) {
  const { gymId } = actor(req);
  const input = parseOrThrow(exerciseCreateSchema, req.body);

  const clash = await prisma.exercise.findFirst({ where: { gymId, name: input.name }, select: { id: true, isActive: true } });
  if (clash) {
    throw new AppError(
      clash.isActive
        ? 'An exercise with this name already exists in the catalog.'
        : 'An inactive exercise with this name already exists. Reactivate it instead of creating a duplicate.',
      409,
      { name: ['Duplicate exercise name'] },
    );
  }

  const created = await prisma.exercise.create({
    data: {
      gymId,
      name: input.name,
      muscleGroup: input.muscleGroup as never,
      exerciseType: input.exerciseType as never,
      equipment: input.equipment,
      instructions: input.instructions,
      imageUrl: input.imageUrl,
      createdBy: req.auth?.userId ?? null,
    },
    select: exerciseSelect,
  });
  await audit(req, gymId, 'CREATE', created.id, { name: created.name, muscleGroup: created.muscleGroup });
  res.status(201).json({ data: publicExercise(created) });
}

export async function updateExercise(req: Request, res: Response) {
  const { gymId } = actor(req);
  const id = parseOrThrow(idParamSchema, req.params.id);
  const input = parseOrThrow(exerciseUpdateSchema, req.body);

  const current = await prisma.exercise.findFirst({ where: { id, gymId }, select: exerciseSelect });
  if (!current) throw new AppError('Exercise not found', 404);

  if (input.name && input.name !== current.name) {
    const clash = await prisma.exercise.findFirst({ where: { gymId, name: input.name, id: { not: id } }, select: { id: true } });
    if (clash) throw new AppError('Another exercise already uses this name.', 409, { name: ['Duplicate exercise name'] });
  }

  const { muscleGroup, exerciseType, ...rest } = input;
  const updated = await prisma.exercise.update({
    where: { id },
    data: {
      ...rest,
      ...(muscleGroup ? { muscleGroup: muscleGroup as never } : {}),
      ...(exerciseType ? { exerciseType: exerciseType as never } : {}),
    },
    select: exerciseSelect,
  });
  await audit(
    req,
    gymId,
    'UPDATE',
    id,
    { name: updated.name, muscleGroup: updated.muscleGroup, isActive: updated.isActive },
    { name: current.name, muscleGroup: current.muscleGroup, isActive: current.isActive },
  );
  res.json({ data: publicExercise(updated) });
}

/** Deactivation is soft: routines that already reference the exercise keep working. */
export async function updateExerciseStatus(req: Request, res: Response) {
  const { gymId } = actor(req);
  const id = parseOrThrow(idParamSchema, req.params.id);
  const input = parseOrThrow(exerciseStatusSchema, req.body);

  const current = await prisma.exercise.findFirst({ where: { id, gymId }, select: { id: true, isActive: true } });
  if (!current) throw new AppError('Exercise not found', 404);

  const updated = await prisma.exercise.update({ where: { id }, data: { isActive: input.isActive }, select: exerciseSelect });
  await audit(req, gymId, 'UPDATE', id, { isActive: input.isActive }, { isActive: current.isActive });
  res.json({ data: publicExercise(updated) });
}
