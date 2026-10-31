import { z } from 'zod';

import { AppError } from '../middlewares/errorHandler.js';

/**
 * Parses `data` with `schema`, throwing a 400 AppError with per-field details
 * (the format the central error handler already returns to clients).
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const details: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (details[key] ??= []).push(issue.message);
  }
  throw new AppError('Validation failed', 400, details);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Empty strings become null so optional columns never store ''. */
const nullableText = (max: number) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().max(max, `Must be at most ${max} characters`).nullable()
  );

const nullableEmail = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address')
    .nullable()
);

/** Route params accept Prisma uuids as well as seeded ids like `seed-gym-0001`. */
export const idParamSchema = z
  .string()
  .trim()
  .min(1, 'Identifier is required')
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier');

/* ------------------------------------------------------------------ */
/* Admin gym module                                                    */
/* ------------------------------------------------------------------ */

export const gymSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Identifier must be at least 3 characters')
  .max(60, 'Identifier must be at most 60 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Only lowercase letters, numbers and hyphens');

export const emailSchema = z.string().trim().toLowerCase().email('Invalid email address');

const gymFieldsSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  slug: gymSlugSchema,
  email: nullableEmail,
  phone: nullableText(40),
  address: nullableText(240),
  city: nullableText(80),
  province: nullableText(80),
  postalCode: nullableText(24),
  country: nullableText(80),
  timezone: nullableText(64),
});

export const createGymSchema = gymFieldsSchema.extend({
  adminFullName: z
    .string()
    .trim()
    .min(2, 'Administrator name must be at least 2 characters')
    .max(120),
  adminEmail: emailSchema,
});

export const updateGymSchema = gymFieldsSchema.partial();

export const suspendGymSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});

export type CreateGymInput = z.infer<typeof createGymSchema>;
export type UpdateGymInput = z.infer<typeof updateGymSchema>;

/* --------------------------- List query --------------------------- */

export const listGymsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'active', 'suspended']).default('all'),
  sort: z.enum(['createdAt', 'name']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListGymsQuery = z.infer<typeof listGymsQuerySchema>;

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
