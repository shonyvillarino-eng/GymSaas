import { z } from 'zod';
import { DOCUMENT_TYPES } from '@gym-saas/shared';

const optionalText = (max: number) => z.preprocess(
  (value) => value === '' || value === undefined ? null : value,
  z.string().trim().max(max).nullable(),
);
const optionalDate = z.preprocess(
  (value) => value === '' || value === undefined ? null : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
);
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email').max(160);
const nameSchema = z.string().trim().min(2).max(120);
const specializationSchema = z.array(z.string().trim().min(1).max(80)).max(20).default([]);

export const instructorCreateSchema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  phone: optionalText(40),
  documentType: z.preprocess((v) => v === '' || v === undefined ? null : v, z.enum(DOCUMENT_TYPES).nullable()),
  documentNumber: optionalText(30),
  birthDate: optionalDate,
  address: optionalText(240),
  specialization: specializationSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: optionalText(1000),
}).strict();

export const instructorUpdateSchema = z.object({
  fullName: nameSchema.optional(),
  phone: optionalText(40).optional(),
  documentType: z.preprocess((v) => v === '' || v === undefined ? null : v, z.enum(DOCUMENT_TYPES).nullable()).optional(),
  documentNumber: optionalText(30).optional(),
  birthDate: optionalDate.optional(),
  address: optionalText(240).optional(),
  specialization: specializationSchema.optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: optionalText(1000).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'At least one field is required');

export const instructorStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const instructorListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'ACTIVE', 'INACTIVE', 'SUSPENDED']).default('all'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const instructorMemberListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(120).optional(),
});

export const instructorAssignmentSchema = z.object({
  memberId: z.string().trim().min(1).max(64),
  primary: z.boolean().default(false),
}).strict();

export const instructorBulkAssignmentSchema = z.object({
  memberIds: z.array(z.string().trim().min(1).max(64)).min(1).max(100),
  primary: z.boolean().default(false),
}).strict().refine((v) => new Set(v.memberIds).size === v.memberIds.length, 'Duplicate member identifiers are not allowed');
