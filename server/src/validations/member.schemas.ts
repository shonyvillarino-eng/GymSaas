import { z } from 'zod';
import { DOCUMENT_TYPES, MEMBER_STATUSES } from '@gym-saas/shared';

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;

/** ISO date (YYYY-MM-DD) that cannot be in the future. */
const pastDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => new Date(`${value}T00:00:00`).getTime() <= Date.now(), 'Date cannot be in the future');

/** '' / undefined / null all normalize to null (clears the value). */
const nullableDate = z.preprocess((value) => (value === '' || value === undefined ? null : value), pastDate.nullable());
const nullableGender = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.enum(GENDERS).nullable()
);
const nullableText = (max: number) =>
  z.preprocess((value) => (value === '' || value === undefined ? null : value), z.string().trim().max(max).nullable());
const nullableEmail = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.string().trim().toLowerCase().email('Enter a valid email').max(160).nullable()
);

/** Normalized document identity: trimmed and uppercased before storage. */
const documentNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(4, 'Document must be at least 4 characters')
  .max(20, 'Document must be at most 20 characters')
  .regex(/^[A-Z0-9-]+$/, 'Only letters, numbers and hyphens');

const memberShape = {
  fullName: z.string().trim().min(2, 'Enter at least 2 characters').max(120, 'Must be at most 120 characters'),
  documentType: z.enum(DOCUMENT_TYPES, { error: 'Choose a document type' }),
  documentNumber: documentNumberSchema,
  birthDate: nullableDate,
  gender: nullableGender,
  phone: z.string().trim().min(4, 'Enter a valid phone number').max(40, 'Must be at most 40 characters'),
  email: nullableEmail,
  address: nullableText(240),
  emergencyName: nullableText(120),
  emergencyPhone: nullableText(40),
  joinDate: nullableDate.refine((value) => value !== null, 'Join date is required'),
  notes: nullableText(1000),
  status: z.enum(MEMBER_STATUSES).default('ACTIVE'),
};

/** Registration. The gym and member identity always come from the session/DB. */
export const memberCreateSchema = z.object(memberShape).strict();

/**
 * Editing: everything optional, and `status` deliberately excluded —
 * state changes go through PATCH /:id/status so they are audited as such.
 * The photograph is never accepted here; it is uploaded to object storage
 * through POST /:id/photo.
 */
const { status: _status, ...editableShape } = memberShape;
export const memberUpdateSchema = z
  .object(editableShape)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const memberStatusSchema = z
  .object({
    status: z.enum(MEMBER_STATUSES),
    reason: z.string().trim().max(500, 'Reason must be at most 500 characters').optional(),
  })
  .strict();

export const memberInstructorSchema = z
  .object({
    // null clears the assignment; an id must belong to this gym (verified server-side).
    instructorId: z.string().trim().min(1).max(64).nullable(),
  })
  .strict();

export const memberListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['all', ...MEMBER_STATUSES]).default('all'),
  membership: z.enum(['all', 'ACTIVE', 'PAST_DUE', 'NONE']).default('all'),
  instructor: z.string().trim().max(64).optional(), // 'all' | 'none' | instructor profile id
  sort: z.enum(['joinDate']).default('joinDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;
