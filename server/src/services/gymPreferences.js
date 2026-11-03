import { prisma } from '../lib/prisma.js';
import { gymPreferencesSchema } from '../validations/gym-admin.schemas.js';
export const DEFAULT_PREFERENCES = {
    defaultMembershipDurationDays: 30,
    attendanceDuplicateToleranceMinutes: 30,
    membershipExpiryWarningDays: 7,
    schedule: [
        { day: 'MONDAY', open: '06:00', close: '22:00', closed: false },
        { day: 'TUESDAY', open: '06:00', close: '22:00', closed: false },
        { day: 'WEDNESDAY', open: '06:00', close: '22:00', closed: false },
        { day: 'THURSDAY', open: '06:00', close: '22:00', closed: false },
        { day: 'FRIDAY', open: '06:00', close: '21:00', closed: false },
        { day: 'SATURDAY', open: '08:00', close: '14:00', closed: false },
        { day: 'SUNDAY', open: '09:00', close: '13:00', closed: true },
    ],
    acceptedPaymentMethods: ['CASH', 'TRANSFER', 'CARD'],
    receipt: { businessName: '', taxId: '', address: '', phone: '', footer: '' },
    notifications: { membershipExpiry: true, attendance: false, administrativeActivity: true },
    attendancePolicy: {
        requireActiveMember: true,
        requireValidMembership: true,
        allowAdministrativeExceptions: true,
    },
};
/** Reads preferences from the stored JSON, filling missing keys with defaults. */
export function preferencesFromSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
        return DEFAULT_PREFERENCES;
    const stored = settings.preferences;
    const parsed = gymPreferencesSchema.safeParse(stored);
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}
/** Preferences + tenant calendar fields needed by attendance rules. */
export async function loadGymPreferences(gymId) {
    const gym = await prisma.gym.findUnique({
        where: { id: gymId },
        select: {
            id: true,
            name: true,
            timezone: true,
            currency: true,
            language: true,
            locale: true,
            isActive: true,
            logoUrl: true,
            settings: true,
            // Public contact details, used by the member portal.
            phone: true,
            email: true,
            address: true,
            city: true,
            province: true,
        },
    });
    if (!gym)
        return null;
    return { ...gym, preferences: preferencesFromSettings(gym.settings) };
}
