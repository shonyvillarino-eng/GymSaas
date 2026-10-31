export const USER_ROLES = ['SUPER_ADMIN', 'GYM_ADMIN', 'INSTRUCTOR', 'MEMBER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'FROZEN'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Administrative state of a member (distinct from membership state). */
export const MEMBER_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Document types accepted when registering a member. */
export const DOCUMENT_TYPES = ['DNI', 'CUIL', 'CUIT', 'PASSPORT', 'NATIONAL_ID', 'DRIVER_LICENSE', 'OTHER'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const RILEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type FitnessLevel = (typeof RILEVELS)[number];

/** Muscle groups of the exercise catalog (mirrors the Prisma enum). */
export const MUSCLE_GROUPS = [
  'CHEST',
  'BACK',
  'LEGS',
  'SHOULDERS',
  'ARMS',
  'CORE',
  'GLUTES',
  'FULL_BODY',
  'CARDIO',
  'OTHER',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** Lifecycle of a training routine. */
export const ROUTINE_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type RoutineStatus = (typeof ROUTINE_STATUSES)[number];