import { z } from 'zod';

/** Portal query/body schemas. Every list is paginated on the server. */

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .optional();

const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
};

export const portalAttendanceQuerySchema = z
  .object({
    ...pageFields,
    from: calendarDate,
    to: calendarDate,
    method: z.enum(['all', 'MANUAL', 'QR']).default('all'),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'The end date cannot be before the start date',
  });

export const portalPaymentQuerySchema = z.object({
  ...pageFields,
  from: calendarDate,
  to: calendarDate,
  // VOIDED is included so the member can filter annulled movements in their history.
  status: z.enum(['all', 'COMPLETED', 'PARTIAL', 'PENDING', 'VOIDED', 'REFUNDED', 'FAILED']).default('all'),
  method: z.enum(['all', 'CASH', 'TRANSFER', 'BANK_TRANSFER', 'CARD', 'CHECK', 'OTHER']).default('all'),
});

export const portalHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * Fields a member may change on their own profile.
 *
 * `.strict()` is what blocks role, status, membership or gym changes: any
 * extra key is a validation error instead of a silent no-op.
 */
export const portalProfileUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(120).optional(),
    phone: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.string().trim().max(40).nullable(),
    ).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const portalPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(72),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(72)
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'The new password must differ from the current one',
  });

export type PortalAttendanceQuery = z.infer<typeof portalAttendanceQuerySchema>;
export type PortalPaymentQuery = z.infer<typeof portalPaymentQuerySchema>;
export type PortalProfileUpdate = z.infer<typeof portalProfileUpdateSchema>;
