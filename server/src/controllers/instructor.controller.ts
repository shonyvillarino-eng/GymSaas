import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../middlewares/errorHandler.js';
import { hashPassword } from '../lib/password.js';
import { uploadInstructorPhoto } from '../lib/objectStorage.js';
import { generateRawToken, hashToken } from '../lib/tokens.js';
import { clientIp, writeAudit } from '../services/audit.js';
import { idParamSchema, parseOrThrow } from '../validations/schemas.js';
import {
  instructorAssignmentSchema,
  instructorBulkAssignmentSchema,
  instructorCreateSchema,
  instructorListQuerySchema,
  instructorMemberListQuerySchema,
  instructorStatusSchema,
  instructorUpdateSchema,
} from '../validations/instructor.schemas.js';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function gymAdminContext(req: Request) {
  if (req.auth?.role !== 'GYM_ADMIN' || !req.auth.gymId) throw new AppError('Gym administrator access required', 403);
  return { gymId: req.auth.gymId, userId: req.auth.userId };
}

function instructorContext(req: Request) {
  if (req.auth?.role !== 'INSTRUCTOR' || !req.auth.gymId) throw new AppError('Instructor access required', 403);
  return { gymId: req.auth.gymId, userId: req.auth.userId };
}

const idParam = (req: Request) => parseOrThrow(idParamSchema, req.params.id);

async function instructorInGym(gymId: string, id: string) {
  const profile = await prisma.instructorProfile.findFirst({
    where: { id, gymId },
    include: {
      user: { select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, isActive: true } },
      _count: { select: { members: { where: { isActive: true } } } },
    },
  });
  if (!profile) throw new AppError('Instructor not found', 404);
  return profile;
}

async function audit(req: Request, gymId: string, action: 'CREATE' | 'UPDATE' | 'ASSIGN' | 'UNASSIGN', entityType: string, entityId: string, newValues: Prisma.InputJsonValue, oldValues?: Prisma.InputJsonValue) {
  await writeAudit({ gymId, userId: req.auth?.userId ?? null, action, entityType, entityId, newValues, ...(oldValues ? { oldValues } : {}), ipAddress: clientIp(req), userAgent: req.get('user-agent') ?? null });
}

function publicInstructor(p: Awaited<ReturnType<typeof instructorInGym>>) {
  return {
    id: p.id,
    fullName: p.user.fullName,
    email: p.user.email,
    phone: p.user.phone,
    photoUrl: p.user.avatarUrl,
    documentType: p.documentType,
    documentNumber: p.documentNumber,
    birthDate: p.birthDate,
    address: p.address,
    specializations: p.specialization,
    startDate: p.startDate,
    notes: p.notes,
    status: p.status,
    isAvailable: p.isAvailable,
    assignedMembersCount: p._count.members,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function listInstructors(req: Request, res: Response) {
  const { gymId } = gymAdminContext(req);
  const q = parseOrThrow(instructorListQuerySchema, req.query);
  const where: Prisma.InstructorProfileWhereInput = {
    gymId,
    ...(q.status !== 'all' ? { status: q.status } : {}),
    ...(q.search ? { user: { OR: [
      { fullName: { contains: q.search, mode: 'insensitive' } },
      { email: { contains: q.search, mode: 'insensitive' } },
    ] } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.instructorProfile.count({ where }),
    prisma.instructorProfile.findMany({
      where, orderBy: [{ startDate: q.order }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      select: { id: true, specialization: true, startDate: true, status: true, isAvailable: true,
        user: { select: { fullName: true, email: true, phone: true } },
        _count: { select: { members: { where: { isActive: true } } } } },
    }),
  ]);
  res.json({ data: rows.map((p) => ({ id: p.id, fullName: p.user.fullName, email: p.user.email, phone: p.user.phone, specializations: p.specialization, assignedMembersCount: p._count.members, startDate: p.startDate, status: p.status, isAvailable: p.isAvailable })), meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } });
}

export async function createInstructor(req: Request, res: Response) {
  const { gymId, userId: actorId } = gymAdminContext(req);
  const input = parseOrThrow(instructorCreateSchema, req.body);
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    throw new AppError('This email already belongs to an account. To protect that account, automatic association by email is disabled; the account holder must authenticate and request an authorized link.', 409, { email: ['Existing accounts cannot be claimed by email alone'] });
  }

  // New instructor accounts remain disabled until the one-time setup token is redeemed.
  const rawToken = generateRawToken();
  const placeholderHash = await hashPassword(generateRawToken());
  const tokenHash = hashToken(rawToken);
  const startDate = input.startDate ? new Date(`${input.startDate}T00:00:00`) : new Date();
  let profileId: string;
  try {
    profileId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: input.email, fullName: input.fullName, phone: input.phone, role: 'INSTRUCTOR', passwordHash: placeholderHash, isActive: false } });
      const userId = user.id;
      const membership = await tx.gymMembership.findUnique({ where: { gymId_userId: { gymId, userId } } });
      if (membership && membership.role !== 'INSTRUCTOR') throw new AppError('Existing gym role is incompatible', 409);
      await tx.gymMembership.upsert({
        where: { gymId_userId: { gymId, userId } },
        create: { gymId, userId, role: 'INSTRUCTOR', isActive: true },
        update: { role: 'INSTRUCTOR', isActive: true, leftAt: null },
      });
      const profile = await tx.instructorProfile.create({ data: {
        gymId, userId,
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00`) : null,
        address: input.address,
        specialization: input.specialization,
        startDate,
        notes: input.notes,
        status: 'ACTIVE', isAvailable: true,
      } });
      await tx.authToken.create({ data: { userId, tokenHash, type: 'INSTRUCTOR_INVITE', expiresAt: new Date(Date.now() + INVITE_TTL_MS) } });
      return profile.id;
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new AppError('An account with this email already exists', 409, { email: ['Already in use'] });
    throw error;
  }
  const created = await instructorInGym(gymId, profileId);
  await audit(req, gymId, 'CREATE', 'InstructorProfile', profileId, { email: created.user.email, fullName: created.user.fullName, status: created.status, specializations: created.specialization });
  const setupOrigin = env.CORS_ORIGIN.split(',')[0]?.trim() || 'http://localhost:5173';
  const setupUrl = `${new URL(setupOrigin).origin}/complete-setup#token=${encodeURIComponent(rawToken)}`;
  res.status(201).json({ data: publicInstructor(created), setupUrl, setupExpiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString() });
}

export async function getInstructor(req: Request, res: Response) {
  const { gymId } = gymAdminContext(req);
  const instructorId = idParam(req);
  const profile = await instructorInGym(gymId, instructorId);
  // The assignment ids are needed to build the activity filter, so this lookup
  // starts before Promise.all instead of stalling the other two queries.
  const assignmentIds = prisma.instructorMember
    .findMany({ where: { gymId, instructorId }, select: { memberId: true } })
    .then((rows) => rows.map((r) => r.memberId));
  const [assignments, routines, activity] = await Promise.all([
    prisma.instructorMember.findMany({ where: { gymId, instructorId, isActive: true }, orderBy: { assignedAt: 'desc' }, take: 100, select: { id: true, isPrimary: true, assignedAt: true, member: { select: { id: true, status: true, joinDate: true, user: { select: { fullName: true, phone: true, email: true } } } } } }),
    prisma.routine.findMany({ where: { gymId, createdBy: profile.userId, deletedAt: null }, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true, assignedToId: true, assignee: { select: { user: { select: { fullName: true } } } } } }),
    assignmentIds.then((memberIds) => prisma.auditLog.findMany({ where: { gymId, OR: [{ userId: profile.userId }, { entityType: 'InstructorMember', entityId: { in: memberIds } }] }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, entityType: true, entityId: true, newValues: true, createdAt: true } })),
  ]);
  res.json({ data: { instructor: publicInstructor(profile), members: assignments.map((a) => ({ assignmentId: a.id, isPrimary: a.isPrimary, assignedAt: a.assignedAt, id: a.member.id, fullName: a.member.user.fullName, email: a.member.user.email, phone: a.member.user.phone, status: a.member.status, joinDate: a.member.joinDate })), routines, activity } });
}

export async function updateInstructor(req: Request, res: Response) {
  const { gymId } = gymAdminContext(req);
  const profileId = idParam(req);
  const input = parseOrThrow(instructorUpdateSchema, req.body);
  const current = await instructorInGym(gymId, profileId);
  const userData: Prisma.UserUpdateInput = {};
  if (input.fullName !== undefined) userData.fullName = input.fullName;
  if ('phone' in input) userData.phone = input.phone;
  const profileData: Prisma.InstructorProfileUpdateInput = {};
  if ('documentType' in input) profileData.documentType = input.documentType;
  if ('documentNumber' in input) profileData.documentNumber = input.documentNumber;
  if ('birthDate' in input) profileData.birthDate = input.birthDate ? new Date(`${input.birthDate}T00:00:00`) : null;
  if ('address' in input) profileData.address = input.address;
  if (input.specialization !== undefined) profileData.specialization = input.specialization;
  if (input.startDate) profileData.startDate = new Date(`${input.startDate}T00:00:00`);
  if ('notes' in input) profileData.notes = input.notes;
  await prisma.$transaction(async (tx) => {
    if (Object.keys(userData).length) await tx.user.update({ where: { id: current.userId }, data: userData });
    if (Object.keys(profileData).length) await tx.instructorProfile.update({ where: { id: profileId }, data: profileData });
  });
  const updated = await instructorInGym(gymId, profileId);
  await audit(req, gymId, 'UPDATE', 'InstructorProfile', profileId, input as Prisma.InputJsonValue, { fullName: current.user.fullName, phone: current.user.phone, status: current.status });
  res.json({ data: publicInstructor(updated) });
}

export async function updateInstructorStatus(req: Request, res: Response) {
  const { gymId } = gymAdminContext(req);
  const profileId = idParam(req);
  const input = parseOrThrow(instructorStatusSchema, req.body);
  const current = await instructorInGym(gymId, profileId);
  const releasedAssignments = input.status !== 'ACTIVE'
    ? await prisma.instructorMember.findMany({ where: { gymId, instructorId: profileId, isActive: true }, select: { memberId: true, isPrimary: true } })
    : [];
  await prisma.$transaction(async (tx) => {
    await tx.instructorProfile.update({ where: { id: profileId }, data: { status: input.status, isAvailable: input.status === 'ACTIVE', endDate: input.status === 'ACTIVE' ? null : new Date() } });
    await tx.gymMembership.updateMany({ where: { gymId, userId: current.userId, role: 'INSTRUCTOR' }, data: { isActive: input.status === 'ACTIVE', leftAt: input.status === 'ACTIVE' ? null : new Date() } });
    if (input.status !== 'ACTIVE') {
      await tx.instructorMember.updateMany({ where: { gymId, instructorId: profileId, isActive: true }, data: { isActive: false, isPrimary: false } });
    }
  });
  await audit(req, gymId, 'UPDATE', 'InstructorProfile', profileId, { status: input.status, reason: input.reason }, { status: current.status });
  for (const assignment of releasedAssignments) {
    await audit(req, gymId, 'UNASSIGN', 'InstructorMember', assignment.memberId, { instructorId: profileId, reason: `Instructor ${input.status.toLowerCase()}`, wasPrimary: assignment.isPrimary });
  }
  const updated = await instructorInGym(gymId, profileId);
  res.json({ data: publicInstructor(updated) });
}

async function listAssignments(req: Request, res: Response, instructorId: string, isSelf: boolean) {
  const { gymId } = isSelf ? instructorContext(req) : gymAdminContext(req);
  const q = parseOrThrow(instructorMemberListQuerySchema, req.query);
  const instructor = await prisma.instructorProfile.findFirst({ where: { id: instructorId, gymId, ...(isSelf ? { userId: req.auth!.userId, status: 'ACTIVE' as const, isAvailable: true } : {}) }, select: { id: true } });
  if (!instructor) throw new AppError('Instructor not found', 404);
  const where: Prisma.InstructorMemberWhereInput = { gymId, instructorId, isActive: true, member: { ...(q.search ? { user: { fullName: { contains: q.search, mode: 'insensitive' } } } : {}) } };
  const [total, rows] = await Promise.all([
    prisma.instructorMember.count({ where }),
    prisma.instructorMember.findMany({ where, orderBy: [{ assignedAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, isPrimary: true, assignedAt: true, member: { select: { id: true, status: true, joinDate: true, user: { select: { fullName: true, phone: true } } } } } }),
  ]);
  res.json({ data: rows.map((a) => ({ assignmentId: a.id, isPrimary: a.isPrimary, assignedAt: a.assignedAt, id: a.member.id, fullName: a.member.user.fullName, phone: a.member.user.phone, status: a.member.status, joinDate: a.member.joinDate })), meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } });
}

export async function getInstructorMembers(req: Request, res: Response) { const { gymId } = gymAdminContext(req); const profile = await instructorInGym(gymId, idParam(req)); await listAssignments(req, res, profile.id, false); }

async function assignMembers(req: Request, memberIds: string[], primary: boolean) {
  const { gymId, userId } = gymAdminContext(req);
  const instructorId = idParam(req);
  const instructor = await prisma.instructorProfile.findFirst({ where: { id: instructorId, gymId, status: 'ACTIVE', isAvailable: true }, select: { id: true } });
  if (!instructor) throw new AppError('Active instructor not found in this gym', 404);
  const members = await prisma.memberProfile.findMany({ where: { id: { in: memberIds }, gymId }, select: { id: true } });
  if (members.length !== memberIds.length) throw new AppError('One or more members were not found in this gym', 404);
  try {
    await prisma.$transaction(async (tx) => {
    if (primary) await tx.instructorMember.updateMany({ where: { gymId, memberId: { in: memberIds }, isPrimary: true, isActive: true, instructorId: { not: instructorId } }, data: { isPrimary: false, isActive: false } });
    // One read for the whole batch instead of one per member.
    const existing = await tx.instructorMember.findMany({ where: { gymId, instructorId, memberId: { in: memberIds }, isActive: true }, select: { id: true, memberId: true } });
    const byMember = new Map(existing.map((row) => [row.memberId, row.id]));
    for (const memberId of memberIds) {
      const previousId = byMember.get(memberId);
      if (previousId) {
        if (primary) await tx.instructorMember.update({ where: { id: previousId }, data: { isPrimary: true, assignedAt: new Date(), assignedBy: userId } });
      } else {
        await tx.instructorMember.create({ data: { gymId, instructorId, memberId, isPrimary: primary, assignedBy: userId } });
      }
    }
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new AppError('A concurrent assignment changed this member. Refresh and try again.', 409);
    throw error;
  }
  for (const memberId of memberIds) await audit(req, gymId, 'ASSIGN', 'InstructorMember', memberId, { instructorId, isPrimary: primary });
}

export async function assignInstructorMember(req: Request, res: Response) {
  const input = parseOrThrow(instructorAssignmentSchema, req.body);
  await assignMembers(req, [input.memberId], input.primary);
  res.status(201).json({ data: { assigned: [input.memberId] } });
}

export async function assignInstructorMembersBulk(req: Request, res: Response) {
  const input = parseOrThrow(instructorBulkAssignmentSchema, req.body);
  await assignMembers(req, input.memberIds, input.primary);
  res.status(201).json({ data: { assigned: input.memberIds } });
}

export async function removeInstructorMember(req: Request, res: Response) {
  const { gymId } = gymAdminContext(req);
  const instructorId = idParam(req);
  const memberId = parseOrThrow(idParamSchema, req.params.memberId);
  const row = await prisma.instructorMember.findFirst({ where: { gymId, instructorId, memberId, isActive: true } });
  if (!row) throw new AppError('Active assignment not found', 404);
  await prisma.instructorMember.update({ where: { id: row.id }, data: { isActive: false, isPrimary: false } });
  await audit(req, gymId, 'UNASSIGN', 'InstructorMember', memberId, { instructorId });
  res.status(204).end();
}

export async function listUnassignedMembers(req: Request, res: Response) {
  const { gymId } = gymAdminContext(req);
  const q = parseOrThrow(instructorMemberListQuerySchema, req.query);
  const where: Prisma.MemberProfileWhereInput = { gymId, status: 'ACTIVE', instructorMembers: { none: { isActive: true, isPrimary: true } }, ...(q.search ? { user: { fullName: { contains: q.search, mode: 'insensitive' } } } : {}) };
  const [total, rows] = await Promise.all([prisma.memberProfile.count({ where }), prisma.memberProfile.findMany({ where, orderBy: [{ joinDate: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, joinDate: true, user: { select: { fullName: true, phone: true } } } })]);
  res.json({ data: rows.map((m) => ({ id: m.id, fullName: m.user.fullName, phone: m.user.phone, joinDate: m.joinDate })), meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } });
}

async function requireActiveInstructor(req: Request) {
  const { gymId, userId } = instructorContext(req);
  const profile = await prisma.instructorProfile.findFirst({ where: { gymId, userId, status: 'ACTIVE', isAvailable: true }, select: { id: true } });
  if (!profile) throw new AppError('Instructor account is inactive or suspended', 403);
  return { gymId, userId, instructorId: profile.id };
}

export async function instructorDashboard(req: Request, res: Response) {
  const { gymId, userId, instructorId } = await requireActiveInstructor(req);
  const assignments = await prisma.instructorMember.findMany({ where: { gymId, instructorId, isActive: true }, select: { memberId: true } });
  const memberIds = assignments.map((assignment) => assignment.memberId);
  const [routinesCreated, activeRoutines, membersWithRoutine] = await Promise.all([
    prisma.routine.count({ where: { gymId, createdBy: userId, deletedAt: null } }),
    prisma.routine.count({ where: { gymId, createdBy: userId, isActive: true, deletedAt: null } }),
    memberIds.length ? prisma.routine.findMany({ where: { gymId, assignedToId: { in: memberIds }, isActive: true, deletedAt: null }, distinct: ['assignedToId'], select: { assignedToId: true } }) : Promise.resolve([]),
  ]);
  res.json({ data: { assignedMembers: memberIds.length, routinesCreated, activeRoutines, membersWithoutRoutine: Math.max(0, memberIds.length - membersWithRoutine.length) } });
}

export async function instructorSelfMembers(req: Request, res: Response) {
  const { instructorId } = await requireActiveInstructor(req);
  await listAssignments(req, res, instructorId, true);
}

export async function instructorSelfMemberTraining(req: Request, res: Response) {
  const { gymId, instructorId } = await requireActiveInstructor(req);
  const memberId = parseOrThrow(idParamSchema, req.params.memberId);
  const assignment = await prisma.instructorMember.findFirst({
    where: { gymId, instructorId, memberId, isActive: true },
    select: {
      member: {
        select: {
          id: true, status: true, goals: true, fitnessLevel: true, heightCm: true, weightKg: true,
          birthDate: true, gender: true,
          user: { select: { fullName: true } },
          progressRecords: {
            orderBy: { measuredAt: 'desc' }, take: 50,
            select: { metric: true, value: true, unit: true, notes: true, measuredAt: true },
          },
        },
      },
    },
  });
  if (!assignment) throw new AppError('Assigned member not found', 404);
  const routines = await prisma.routine.findMany({ where: { gymId, assignedToId: memberId, deletedAt: null }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, name: true, description: true, difficulty: true, estimatedWeeks: true, isActive: true, createdAt: true, updatedAt: true } });
  res.json({ data: { member: assignment.member, routines } });
}

export async function instructorSelfRoutines(req: Request, res: Response) {
  const { gymId, userId } = await requireActiveInstructor(req);
  const routines = await prisma.routine.findMany({ where: { gymId, createdBy: userId, deletedAt: null }, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true, assignee: { select: { id: true, user: { select: { fullName: true } } } } } });
  res.json({ data: routines });
}

export async function instructorSelfProfile(req: Request, res: Response) {
  const { gymId, instructorId } = await requireActiveInstructor(req);
  res.json({ data: publicInstructor(await instructorInGym(gymId, instructorId)) });
}

export async function uploadInstructorPhotoHandler(req: Request, res: Response) {
  const { gymId } = gymAdminContext(req);
  const instructorId = idParam(req);
  const profile = await instructorInGym(gymId, instructorId);
  if (!req.file) throw new AppError('Choose an image file to upload.', 400);
  const result = await uploadInstructorPhoto(gymId, instructorId, req.file);
  await prisma.user.update({ where: { id: profile.userId }, data: { avatarUrl: result.url } });
  await audit(req, gymId, 'UPDATE', 'InstructorPhoto', instructorId, { objectKey: result.key });
  res.status(201).json({ data: { ...publicInstructor(await instructorInGym(gymId, instructorId)), photoUrl: result.url } });
}
