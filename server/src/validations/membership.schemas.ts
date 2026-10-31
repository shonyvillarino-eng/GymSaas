import { z } from 'zod';
import { idParamSchema } from './schemas.js';

const durationUnits = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR'] as const;
const statusValues = ['PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED'] as const;
const priceSchema = z.union([
  z.number().finite().min(0).max(99_999_999.99),
  z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, 'Use a non-negative amount with at most two decimals').transform(Number),
]);
const optionalText = (max: number) => z.preprocess((v) => v === '' || v === undefined ? null : v, z.string().trim().max(max).nullable());
const optionalNullableText = (max: number) => z.preprocess((v) => v === '' || v === undefined ? null : v, z.string().trim().max(max).nullable().optional());
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Invalid calendar date');

const planFields = {
  name: z.string().trim().min(2).max(120),
  description: z.preprocess((v) => v === '' || v === undefined ? null : v, z.string().trim().max(2000).nullable()),
  price: priceSchema,
  durationValue: z.number().int().min(1).max(366),
  durationUnit: z.enum(durationUnits),
  conditions: z.preprocess((v) => v === '' || v === undefined ? null : v, z.string().trim().max(4000).nullable()),
};
function validateDuration(value: { durationValue: number; durationUnit: typeof durationUnits[number] }, ctx: z.RefinementCtx) {
  if (value.durationUnit !== 'DAY' && Number(value.durationValue) > 24) {
    ctx.addIssue({ code: 'custom', path: ['durationValue'], message: 'For non-day units, duration must be at most 24 units' });
  }
}
export const planCreateSchema = z.object({ ...planFields, isActive: z.boolean().default(true) }).strict().superRefine(validateDuration);
export const planUpdateSchema = z.object({
  name: planFields.name.optional(),
  description: optionalNullableText(2000),
  price: priceSchema.optional(),
  durationValue: planFields.durationValue.optional(),
  durationUnit: planFields.durationUnit.optional(),
  conditions: optionalNullableText(4000),
}).strict().superRefine((value, ctx) => {
  if (!Object.keys(value).length) ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  if (value.durationUnit && value.durationUnit !== 'DAY' && value.durationValue !== undefined && Number(value.durationValue) > 24) {
    ctx.addIssue({ code: 'custom', path: ['durationValue'], message: 'For non-day units, duration must be at most 24 units' });
  }
});
export const planStatusSchema = z.object({ isActive: z.boolean() }).strict();
export const planListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(), status: z.enum(['all', 'active', 'inactive']).default('all'),
}).strict();
export const subscriptionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(), status: z.enum(['all', ...statusValues]).default('all'),
  planId: z.string().trim().min(1).max(64).optional(), from: dateSchema.optional(), to: dateSchema.optional(),
}).strict().refine((v) => !v.from || !v.to || v.from <= v.to, { path: ['to'], message: 'End date must be on or after start date' });
const subscriptionFields = {
  memberId: idParamSchema,
  planId: idParamSchema,
  startDate: dateSchema.optional(),
  agreedPrice: priceSchema.optional(),
  discountAmount: priceSchema.default(0),
  notes: optionalNullableText(2000),
};
export const subscriptionCreateSchema = z.object(subscriptionFields).strict();
export const subscriptionRenewSchema = z.object({
  planId: idParamSchema,
  startDate: dateSchema.optional(),
  startsAfterCurrent: z.boolean().default(true),
  agreedPrice: priceSchema.optional(),
  discountAmount: priceSchema.default(0),
  notes: optionalNullableText(2000),
}).strict();
export const subscriptionCancelSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();
export const memberHistorySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).strict();
export const dashboardQuerySchema = z.object({
  planId: z.string().trim().min(1).max(64).optional(), status: z.enum(['all', ...statusValues]).default('all'),
  from: dateSchema.optional(), to: dateSchema.optional(),
}).strict();
export type PlanCreateInput = z.infer<typeof planCreateSchema>;
