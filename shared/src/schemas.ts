import { z } from 'zod';
import { USER_ROLES } from './enums.js';

export const emailSchema = z.string().trim().toLowerCase().email('Invalid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const gymSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Slug must be at least 3 characters')
  .max(60, 'Slug must be at most 60 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain only lowercase letters, numbers and hyphens');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  slug: gymSlugSchema.optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerGymSchema = z.object({
  gymName: z.string().trim().min(2, 'Gym name must be at least 2 characters').max(80),
  slug: gymSlugSchema,
  adminName: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterGymInput = z.infer<typeof registerGymSchema>;

export const roleSchema = z.enum(USER_ROLES);