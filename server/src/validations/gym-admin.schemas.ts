import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM');
const currencySchema = z.enum(['ARS', 'USD', 'EUR', 'BRL', 'CLP', 'UYU', 'MXN']);
const timezoneSchema = z.string().trim().min(1).max(64).refine((timezone) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); return true; }
  catch { return false; }
}, 'Enter a valid IANA timezone');
const paymentMethods = ['CASH', 'TRANSFER', 'CARD', 'BANK_TRANSFER', 'CHECK', 'OTHER'] as const;

const gymProfileShape = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.preprocess((value) => value === '' ? null : value, z.string().trim().toLowerCase().email().max(160).nullable()).optional(),
  phone: optionalText(40),
  address: optionalText(240),
  city: optionalText(80),
  province: optionalText(80),
  postalCode: optionalText(24),
  country: optionalText(80),
  timezone: timezoneSchema.optional(),
  currency: currencySchema.optional(),
});

export const gymProfileUpdateSchema = gymProfileShape.strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const dayScheduleSchema = z.object({
  day: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  open: timeSchema,
  close: timeSchema,
  closed: z.boolean().default(false),
}).refine((value) => value.closed || value.close > value.open, {
  path: ['close'], message: 'Closing time must be after opening time',
});

export const gymPreferencesSchema = z.object({
  defaultMembershipDurationDays: z.number().int().min(1).max(366).default(30),
  attendanceDuplicateToleranceMinutes: z.number().int().min(0).max(1440).default(30),
  membershipExpiryWarningDays: z.number().int().min(1).max(60).default(7),
  schedule: z.array(dayScheduleSchema).length(7).refine((days) => new Set(days.map((day) => day.day)).size === 7, 'Provide exactly one schedule for each weekday'),
  acceptedPaymentMethods: z.array(z.enum(paymentMethods)).min(1).max(paymentMethods.length).refine((items) => new Set(items).size === items.length, 'Payment methods must not be duplicated'),
  receipt: z.object({
    businessName: z.string().trim().max(120).default(''),
    taxId: z.string().trim().max(40).default(''),
    address: z.string().trim().max(240).default(''),
    phone: z.string().trim().max(40).default(''),
    footer: z.string().trim().max(500).default(''),
  }).default({ businessName: '', taxId: '', address: '', phone: '', footer: '' }),
  notifications: z.object({
    membershipExpiry: z.boolean().default(true),
    attendance: z.boolean().default(false),
    administrativeActivity: z.boolean().default(true),
  }).default({ membershipExpiry: true, attendance: false, administrativeActivity: true }),
  // Access rules evaluated on every check-in (manual and QR alike).
  attendancePolicy: z.object({
    requireActiveMember: z.boolean().default(true),
    requireValidMembership: z.boolean().default(true),
    allowAdministrativeExceptions: z.boolean().default(true),
  }).default({ requireActiveMember: true, requireValidMembership: true, allowAdministrativeExceptions: true }),
}).strict();

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: optionalText(40),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
}).strict().refine((value) => value.currentPassword !== value.newPassword, {
  path: ['newPassword'], message: 'New password must differ from current password',
});

