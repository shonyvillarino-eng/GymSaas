import { z } from 'zod';

import { idParamSchema } from './schemas.js';

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

/** Decimal amount with at most two decimals; never negative. */
const amountSchema = z.union([
  z.number().finite().min(0).max(99_999_999.99),
  z
    .string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, 'Use a non-negative amount with at most two decimals')
    .transform(Number),
]);

/** Payments are always strictly positive. */
const positiveAmountSchema = amountSchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero');

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date');

/** ISO timestamp from the client; empty means "now". */
const optionalTimestampSchema = z.preprocess(
  (value) => (value === '' || value === undefined || value === null ? undefined : value),
  z
    .string()
    .trim()
    .refine((value) => Number.isFinite(new Date(value).getTime()), 'Use a valid ISO date and time')
    .transform((value) => new Date(value))
    .optional(),
);

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().max(max).nullable(),
  );

const optionalNullableText = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

/** Cash, transfer, card (declared), and other administrative categories. */
export const PAYMENT_METHODS = ['CASH', 'TRANSFER', 'BANK_TRANSFER', 'CARD', 'CHECK', 'OTHER'] as const;
export const OBLIGATION_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
export const PAYMENT_STATUSES = ['COMPLETED', 'PARTIAL', 'PENDING', 'VOIDED', 'REFUNDED'] as const;

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

export const paymentCreateSchema = z
  .object({
    memberId: idParamSchema,
    // Optional links; both are verified against the tenant when present.
    subscriptionId: idParamSchema.optional(),
    obligationId: idParamSchema.optional(),
    concept: z.string().trim().min(2, 'Describe the payment concept').max(200),
    amount: positiveAmountSchema,
    method: z.enum(PAYMENT_METHODS),
    paidAt: optionalTimestampSchema,
    reference: optionalNullableText(120),
    notes: optionalNullableText(1000),
  })
  .strict();

export const paymentListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional(),
    status: z.enum(['all', ...PAYMENT_STATUSES]).default('all'),
    method: z.enum(['all', ...PAYMENT_METHODS]).default('all'),
    memberId: z.string().trim().min(1).max(64).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    sort: z.enum(['paidAt', 'amount', 'receiptNumber']).default('paidAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'End date must be on or after start date',
  });

export const paymentVoidSchema = z
  .object({
    reason: z.string().trim().min(3, 'Explain why this payment is voided').max(500),
  })
  .strict();

export const periodQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'End date must be on or after start date',
  });

/* ------------------------------------------------------------------ */
/* Financial obligations                                               */
/* ------------------------------------------------------------------ */

export const obligationCreateSchema = z
  .object({
    memberId: idParamSchema,
    subscriptionId: idParamSchema.optional(),
    concept: z.string().trim().min(2, 'Describe the charge concept').max(200),
    originalAmount: positiveAmountSchema,
    dueDate: dateOnlySchema,
    notes: optionalNullableText(1000),
  })
  .strict();

export const obligationListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional(),
    status: z.enum(['all', ...OBLIGATION_STATUSES]).default('all'),
    memberId: z.string().trim().min(1).max(64).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    // Only receivables that still owe money (used by the receivables screen).
    outstanding: z.coerce.boolean().default(false),
    sort: z.enum(['dueDate', 'issuedAt', 'originalAmount']).default('dueDate'),
    order: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'End date must be on or after start date',
  });

export const obligationCancelSchema = z
  .object({
    reason: z.string().trim().min(3, 'Explain why this charge is cancelled').max(500),
  })
  .strict();

/** Generates the missing membership-fee obligations; safe to run repeatedly. */
export const obligationGenerateSchema = z
  .object({
    subscriptionId: idParamSchema.optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Cash registers                                                      */
/* ------------------------------------------------------------------ */

export const cashRegisterOpenSchema = z
  .object({
    openingBalance: amountSchema.default(0),
    notes: optionalNullableText(1000),
  })
  .strict();

export const cashRegisterCloseSchema = z
  .object({
    // Money the operator declares having counted; it is NOT verified cash.
    countedAmount: amountSchema,
    notes: optionalNullableText(1000),
  })
  .strict();

export const cashRegisterListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['all', 'OPEN', 'CLOSED']).default('all'),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'End date must be on or after start date',
  });

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
export type ObligationCreateInput = z.infer<typeof obligationCreateSchema>;
