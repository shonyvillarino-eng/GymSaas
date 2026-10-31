import { z } from 'zod';

import { MUSCLE_GROUPS } from '@gym-saas/shared';

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().max(max).nullable(),
  );

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .nullable()
  .optional();

/** The start date is mandatory; only the end date is optional. */
const requiredCalendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

const nullableNumber = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? null : value),
    z.coerce.number().min(min, `Must be at least ${min}`).max(max, `Must be at most ${max}`).nullable(),
  );

/** Repetitions accept a number, a range, or AMRAP. */
const repsSchema = z
  .string()
  .trim()
  .min(1, 'Repetitions are required')
  .max(50)
  .regex(/^(\d{1,3})(\s*-\s*\d{1,3})?$|^AMRAP$/i, 'Use a number, a range like 8-12, or AMRAP');

/* ------------------------------------------------------------------ */
/* Exercises                                                           */
/* ------------------------------------------------------------------ */

const exerciseShape = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(140),
  muscleGroup: z.enum(MUSCLE_GROUPS).default('OTHER'),
  exerciseType: z
    .enum(['STRENGTH', 'CARDIO', 'FLEXIBILITY', 'BALANCE', 'PLYOMETRICS', 'OTHER'])
    .default('STRENGTH'),
  equipment: z
    .array(z.string().trim().min(1).max(40))
    .max(10, 'At most 10 equipment items')
    .default([])
    .refine((items) => new Set(items.map((item) => item.toLowerCase())).size === items.length, 'Equipment must not repeat'),
  instructions: optionalText(2000),
  imageUrl: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().url('Enter a valid image URL').max(500).nullable(),
  ),
};

export const exerciseCreateSchema = z.object(exerciseShape).strict();

export const exerciseUpdateSchema = z
  .object({ ...exerciseShape, isActive: z.boolean() })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const exerciseStatusSchema = z.object({ isActive: z.boolean() }).strict();

export const exerciseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(140).optional(),
  muscleGroup: z.enum(['all', ...MUSCLE_GROUPS]).default('all'),
  equipment: z.string().trim().max(40).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  sort: z.enum(['name', 'createdAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

/* ------------------------------------------------------------------ */
/* Routines                                                            */
/* ------------------------------------------------------------------ */

const routineExerciseSchema = z
  .object({
    exerciseId: z.string().trim().min(1, 'Choose an exercise').max(64),
    sets: z.coerce.number().int().min(1, 'At least 1 set').max(30, 'At most 30 sets').default(3),
    reps: repsSchema,
    restSeconds: z.coerce.number().int().min(0).max(3600).default(60),
    weightKg: nullableNumber(0, 999.99),
    tempo: optionalText(20),
    instructions: optionalText(500),
    notes: optionalText(500),
  })
  .strict();

const routineDaySchema = z
  .object({
    name: z.string().trim().min(1, 'Name the session').max(140),
    description: optionalText(500),
    restDay: z.boolean().default(false),
    exercises: z.array(routineExerciseSchema).max(30, 'At most 30 exercises per session').default([]),
  })
  .strict();

const routineShape = {
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(140),
  description: optionalText(1000),
  memberId: z.string().trim().min(1, 'Choose the member').max(64),
  startDate: calendarDate,
  endDate: calendarDate,
  notes: optionalText(1000),
  days: z.array(routineDaySchema).min(1, 'Add at least one session').max(14, 'At most 14 sessions'),
};

function validateDates(value: { startDate?: string | null; endDate?: string | null }) {
  if (value.startDate && value.endDate && value.endDate < value.startDate) return false;
  return true;
}

export const routineCreateSchema = z
  .object({ ...routineShape, startDate: requiredCalendarDate, activate: z.boolean().default(false) })
  .strict()
  .refine(validateDates, { path: ['endDate'], message: 'End date cannot be before the start date' })
  .refine(
    (value) => new Set(value.days.map((day) => day.name.trim().toLowerCase())).size === value.days.length,
    { path: ['days'], message: 'Session names must be unique within the routine' },
  )
  .refine((value) => value.days.some((day) => day.exercises.length > 0), {
    path: ['days'],
    message: 'Add at least one exercise to the routine',
  });

export const routineUpdateSchema = z
  .object({
    ...routineShape,
    startDate: requiredCalendarDate.optional(),
    activate: z.boolean().optional(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .refine(validateDates, { path: ['endDate'], message: 'End date cannot be before the start date' })
  .refine((value) => !value.days || value.days.some((day) => day.exercises.length > 0), {
    path: ['days'],
    message: 'Add at least one exercise to the routine',
  });

export const routineListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(140).optional(),
  memberId: z.string().trim().max(64).optional(),
  instructorId: z.string().trim().max(64).optional(),
  status: z.enum(['all', 'DRAFT', 'ACTIVE', 'ARCHIVED']).default('all'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(['updatedAt', 'createdAt', 'startDate']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const routineActivateSchema = z.object({}).strict();

export type ExerciseCreateInput = z.infer<typeof exerciseCreateSchema>;
export type RoutineCreateInput = z.infer<typeof routineCreateSchema>;
export type RoutineListQuery = z.infer<typeof routineListQuerySchema>;
