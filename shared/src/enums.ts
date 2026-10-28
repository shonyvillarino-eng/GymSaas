export const USER_ROLES = ['SUPER_ADMIN', 'GYM_ADMIN', 'INSTRUCTOR', 'MEMBER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'FROZEN'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const RILEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type FitnessLevel = (typeof RILEVELS)[number];