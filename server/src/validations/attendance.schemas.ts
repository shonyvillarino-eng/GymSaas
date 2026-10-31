import { z } from 'zod';

/** ISO calendar date (YYYY-MM-DD), interpreted in the gym's timezone. */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().max(max).nullable(),
  );

const exceptionReason = z
  .string()
  .trim()
  .min(5, 'Justify the exception with at least 5 characters')
  .max(500, 'Justification must be at most 500 characters');

const checkInShape = {
  notes: optionalText(500).optional(),
  /** Present only when an administrator authorizes an exception. */
  exceptionReason: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    exceptionReason.nullable(),
  ).optional(),
};

export const manualCheckInSchema = z
  .object({
    memberId: z.string().trim().min(1, 'Select a member').max(64),
    ...checkInShape,
  })
  .strict();

export const qrCheckInSchema = z
  .object({
    code: z.string().trim().min(1, 'The scanned code is required').max(256),
    ...checkInShape,
  })
  .strict();

/** Either a member id (search) or a scanned code (QR) resolves the member. */
export const eligibilityQuerySchema = z
  .object({
    memberId: z.string().trim().min(1).max(64).optional(),
    code: z.string().trim().min(1).max(256).optional(),
  })
  .refine((value) => Boolean(value.memberId) !== Boolean(value.code), 'Provide either memberId or code');

export const attendanceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
  search: z.string().trim().max(120).optional(),
  memberId: z.string().trim().max(64).optional(),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  method: z.enum(['all', 'MANUAL', 'QR']).default('all'),
  result: z.enum(['all', 'ALLOWED', 'EXCEPTION']).default('all'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const memberAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
});

export type ManualCheckInInput = z.infer<typeof manualCheckInSchema>;
export type QrCheckInInput = z.infer<typeof qrCheckInSchema>;
export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;
export type MemberAttendanceQuery = z.infer<typeof memberAttendanceQuerySchema>;
