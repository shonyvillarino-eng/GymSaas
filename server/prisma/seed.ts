/**
 * Development-only seed data.
 *
 * Run: npx prisma db seed   (from /server)
 *
 * Creates:
 *   - 1 demo gym
 *   - 1 SUPER_ADMIN (platform-level, no gym)
 *   - 1 GYM_ADMIN for the demo gym
 *   - 1 INSTRUCTOR for the demo gym
 *   - 1 MEMBER for the demo gym (with MemberProfile)
 *   - 1 MembershipPlan for the demo gym
 *
 * Idempotent: safe to run multiple times (ON CONFLICT DO NOTHING).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GYM_ID = 'seed-gym-0001';
const GYM_SLUG = 'demo-gym';

const USERS = {
  superAdmin: {
    id: 'seed-user-superadmin',
    email: 'superadmin@demo.local',
    fullName: 'Platform Super Admin',
    role: 'SUPER_ADMIN' as const,
  },
  gymAdmin: {
    id: 'seed-user-gymadmin',
    email: 'admin@demo.local',
    fullName: 'Gym Admin',
    role: 'GYM_ADMIN' as const,
  },
  instructor: {
    id: 'seed-user-instructor',
    email: 'instructor@demo.local',
    fullName: 'Demo Instructor',
    role: 'INSTRUCTOR' as const,
  },
  member: {
    id: 'seed-user-member',
    email: 'member@demo.local',
    fullName: 'Demo Member',
    role: 'MEMBER' as const,
  },
};

async function main() {
  console.log('🌱 Seeding development data...');

  // 1. Gym
  await prisma.gym.upsert({
    where: { id: GYM_ID },
    update: {},
    create: {
      id: GYM_ID,
      name: 'Demo Gym',
      slug: GYM_SLUG,
      email: 'contact@demo.local',
      phone: '+1-555-0100',
      city: 'San Francisco',
      country: 'US',
      timezone: 'America/Los_Angeles',
      isActive: true,
    },
  });
  console.log('  ✓ Gym:', GYM_SLUG);

  // 2. Users
  for (const u of Object.values(USERS)) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        passwordHash: 'dev-only-not-a-real-hash',
        isActive: true,
      },
    });
  }
  console.log('  ✓ Users: superadmin, gymadmin, instructor, member');

  // 3. Gym memberships (enforces one active GYM_ADMIN per gym via partial index)
  const memberships = [
    { userId: USERS.gymAdmin.id, role: 'GYM_ADMIN' as const },
    { userId: USERS.instructor.id, role: 'INSTRUCTOR' as const },
    { userId: USERS.member.id, role: 'MEMBER' as const },
  ];
  for (const m of memberships) {
    await prisma.gymMembership.upsert({
      where: { gymId_userId: { gymId: GYM_ID, userId: m.userId } },
      update: {},
      create: {
        gymId: GYM_ID,
        userId: m.userId,
        role: m.role,
        isActive: true,
      },
    });
  }
  console.log('  ✓ GymMemberships: 1 admin, 1 instructor, 1 member');

  // 4. InstructorProfile
  await prisma.instructorProfile.upsert({
    where: { userId: USERS.instructor.id },
    update: {},
    create: {
      gymId: GYM_ID,
      userId: USERS.instructor.id,
      specialization: ['Strength', 'HIIT'],
      certifications: ['NASM-CPT'],
      bio: 'Certified trainer with 5 years of experience.',
      maxMembers: 20,
      isAvailable: true,
    },
  });
  console.log('  ✓ InstructorProfile');

  // 5. MemberProfile
  await prisma.memberProfile.upsert({
    where: { userId: USERS.member.id },
    update: {},
    create: {
      gymId: GYM_ID,
      userId: USERS.member.id,
      fitnessLevel: 'BEGINNER',
      gender: 'PREFER_NOT_TO_SAY',
      goals: ['Lose weight', 'Build endurance'],
      notes: 'Seed data for development.',
    },
  });
  console.log('  ✓ MemberProfile');

  // 6. MembershipPlan
  await prisma.membershipPlan.upsert({
    where: { id: 'seed-plan-basic' },
    update: {},
    create: {
      id: 'seed-plan-basic',
      gymId: GYM_ID,
      name: 'Basic',
      description: 'Access to gym floor and locker rooms.',
      price: 29.99,
      currency: 'USD',
      billingDays: 30,
      maxMembers: 0,
      features: ['Gym access', 'Locker room', 'Free WiFi'],
      isActive: true,
    },
  });
  console.log('  ✓ MembershipPlan: Basic ($29.99/30d)');

  console.log('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });