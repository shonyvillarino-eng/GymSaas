/**
 * Integration verification for the routines module (catalog, builder, versions,
 * permissions and tenant isolation).
 *
 * Run from /server with the API on port 4000:
 *   node scripts/verify-routines.mjs
 *
 * Exercises the real REST API against PostgreSQL, then removes every row it
 * created (routines, versions, exercises, members and the disposable gym).
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4000/api/v1';
const SEED_GYM_ID = 'seed-gym-0001';
const DEV_PASSWORD = 'DevPass!2026';
const MARKER = 'verify-routines';

const prisma = new PrismaClient();
const results = [];
const skipped = [];
const pass = (label) => {
  results.push(label);
  console.log(`  ✓ ${label}`);
};
const skip = (label) => {
  skipped.push(label);
  console.log(`  ⚠ SKIPPED: ${label}`);
};

async function req(path, { method = 'GET', cookie = '', body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { response, json };
}

async function login(email, password) {
  const { response, json } = await req('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200, `login ${email}: ${JSON.stringify(json)}`);
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(cookie, 'session cookie required');
  return { cookie, user: json.user };
}

const newDocument = () => String(Math.floor(10000000 + Math.random() * 89999999));
const today = () => new Intl.DateTimeFormat('en-CA').format(new Date());
const shift = (days) => new Intl.DateTimeFormat('en-CA').format(new Date(Date.now() + days * 86_400_000));

const created = { exerciseIds: [], routineIds: [], memberIds: [], memberUserIds: [], assignmentIds: [], foreignGym: null, foreignAdminEmail: null, instructorId: null };

async function createMember(cookie, fullName, email) {
  const { response, json } = await req('/members', {
    method: 'POST',
    cookie,
    body: { fullName, documentType: 'DNI', documentNumber: newDocument(), phone: '+54-11-2222-3030', email, joinDate: today(), status: 'ACTIVE', notes: MARKER },
  });
  assert.equal(response.status, 201, JSON.stringify(json));
  const profile = await prisma.memberProfile.findUnique({ where: { id: json.data.id }, select: { userId: true } });
  created.memberIds.push(json.data.id);
  created.memberUserIds.push(profile.userId);
  return json.data.id;
}

async function createExercise(cookie, body) {
  const { response, json } = await req('/exercises', { method: 'POST', cookie, body: { muscleGroup: 'OTHER', equipment: [], ...body } });
  assert.equal(response.status, 201, JSON.stringify(json));
  created.exerciseIds.push(json.data.id);
  return json.data;
}

let adminCookie = '';
let allExercises = {};

try {
  console.log('\n[setup] Clean previous fixtures and authenticate');
  const leftoverMembers = await prisma.memberProfile.findMany({ where: { gymId: SEED_GYM_ID, notes: MARKER }, select: { id: true, userId: true } });
  for (const profile of leftoverMembers) {
    await prisma.routine.deleteMany({ where: { assignedToId: profile.id } });
    await prisma.instructorMember.deleteMany({ where: { memberId: profile.id } });
    await prisma.memberProfile.delete({ where: { id: profile.id } });
    await prisma.gymMembership.deleteMany({ where: { userId: profile.userId } });
    await prisma.user.deleteMany({ where: { id: profile.userId } });
  }
  await prisma.exercise.deleteMany({ where: { gymId: SEED_GYM_ID, name: { startsWith: 'VR ' } } });

  adminCookie = (await login('admin@demo.local', DEV_PASSWORD)).cookie;
  const instructorSession = await login('instructor@demo.local', DEV_PASSWORD);
  const memberSession = await login('member@demo.local', DEV_PASSWORD);
  const superAdminCookie = (await login('superadmin@demo.local', DEV_PASSWORD)).cookie;

  const instructorProfile = await prisma.instructorProfile.findFirst({
    where: { gymId: SEED_GYM_ID, user: { email: 'instructor@demo.local' } },
    select: { id: true },
  });
  assert.ok(instructorProfile, 'seed instructor profile exists');
  created.instructorId = instructorProfile.id;

  const memberProfile = await prisma.memberProfile.findFirst({
    where: { gymId: SEED_GYM_ID, user: { email: 'member@demo.local' } },
    select: { id: true },
  });
  assert.ok(memberProfile, 'seed member profile exists');

  const assignedMemberId = await createMember(adminCookie, 'VR Assigned Member', `vr-assigned-${Date.now()}@test.local`);
  const unassignedMemberId = await createMember(adminCookie, 'VR Unassigned Member', `vr-unassigned-${Date.now()}@test.local`);

  // Only the first member is assigned to the instructor.
  const assignment = await req(`/instructors/${created.instructorId}/members`, {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: assignedMemberId, primary: true },
  });
  assert.ok([200, 201].includes(assignment.response.status), JSON.stringify(assignment.json));
  const assignmentRow = await prisma.instructorMember.findFirst({ where: { instructorId: created.instructorId, memberId: assignedMemberId, isActive: true }, select: { id: true } });
  if (assignmentRow) created.assignmentIds.push(assignmentRow.id);

  console.log('\n[1] Exercise catalog');
  allExercises.bench = await createExercise(adminCookie, { name: `VR Bench Press ${Date.now()}`, muscleGroup: 'CHEST', equipment: ['Barbell', 'Bench'], instructions: 'Lower to the chest and press.' });
  allExercises.squat = await createExercise(instructorSession.cookie, { name: `VR Squat ${Date.now()}`, muscleGroup: 'LEGS', equipment: ['Barbell'], instructions: 'Break at the hips and knees.' });
  allExercises.row = await createExercise(adminCookie, { name: `VR Row ${Date.now()}`, muscleGroup: 'BACK', equipment: ['Barbell'] });
  allExercises.plank = await createExercise(adminCookie, { name: `VR Plank ${Date.now()}`, muscleGroup: 'CORE', equipment: [] });

  const duplicate = await req('/exercises', { method: 'POST', cookie: adminCookie, body: { name: allExercises.bench.name, muscleGroup: 'CHEST' } });
  assert.equal(duplicate.response.status, 409, 'duplicate name inside one gym is rejected');

  const search = await req(`/exercises?search=${encodeURIComponent('VR Bench')}`, { cookie: adminCookie });
  assert.ok(search.json.data.some((row) => row.id === allExercises.bench.id), 'search by name works');

  const byMuscle = await req('/exercises?muscleGroup=LEGS', { cookie: adminCookie });
  assert.ok(byMuscle.json.data.every((row) => row.muscleGroup === 'LEGS'));
  assert.ok(byMuscle.json.data.some((row) => row.id === allExercises.squat.id), 'filter by muscle group works');

  const byEquipment = await req('/exercises?equipment=Bench', { cookie: adminCookie });
  assert.ok(byEquipment.json.data.every((row) => row.equipment.includes('Bench')), 'filter by equipment works');
  assert.ok(byEquipment.json.data.some((row) => row.id === allExercises.bench.id));

  const deactivated = await req(`/exercises/${allExercises.plank.id}/status`, { method: 'PATCH', cookie: adminCookie, body: { isActive: false } });
  assert.equal(deactivated.response.status, 200);
  assert.equal(deactivated.json.data.isActive, false, 'deactivation keeps the exercise row');
  pass('1. catalog: create, duplicate rejection, name search, muscle/equipment filters and soft deactivation');
  pass('1b. an instructor can also create catalog exercises for their own gym');

  console.log('\n[2] Routine builder (sessions and ordered exercises)');
  const routineBody = {
    name: 'VR Full Body 4 weeks',
    description: 'Three sessions per week.',
    memberId: assignedMemberId,
    startDate: today(),
    endDate: shift(28),
    notes: 'Progression: add 2.5 kg per week.',
    days: [
      {
        name: 'Day 1 — Chest and triceps',
        description: 'Push day',
        exercises: [
          { exerciseId: allExercises.bench.id, sets: 4, reps: '8-12', restSeconds: 90, weightKg: 60, tempo: '3-1-2', instructions: 'Keep the shoulder blades retracted.' },
          { exerciseId: allExercises.row.id, sets: 3, reps: '10', restSeconds: 60 },
        ],
      },
      { name: 'Day 2 — Legs', exercises: [{ exerciseId: allExercises.squat.id, sets: 5, reps: '5', restSeconds: 120 }] },
    ],
  };

  const routineResponse = await req('/routines', { method: 'POST', cookie: instructorSession.cookie, body: routineBody });
  assert.equal(routineResponse.response.status, 201, JSON.stringify(routineResponse.json));
  const routine = routineResponse.json.data;
  created.routineIds.push(routine.id);
  assert.equal(routine.status, 'DRAFT', 'new routines start as draft');
  assert.equal(routine.days.length, 2);
  assert.deepEqual(routine.days.map((day) => day.dayOrder), [1, 2], 'sessions keep the order sent');
  assert.deepEqual(routine.days[0].exercises.map((entry) => entry.exerciseOrder), [1, 2], 'exercises keep their order');
  assert.equal(routine.days[0].exercises[0].exerciseId, undefined, 'relation is exposed, not the raw id');
  assert.equal(routine.days[0].exercises[0].exercise.id, allExercises.bench.id);
  assert.equal(routine.days[0].exercises[0].reps, '8-12');
  assert.equal(routine.days[0].exercises[0].tempo, '3-1-2');
  assert.equal(Number(routine.days[0].exercises[0].weightKg), 60);
  assert.equal(routine.instructor.id, created.instructorId, 'the instructor is the responsible one');
  pass('2. instructor builds a routine for an assigned member: sessions and exercises keep the defined order');

  console.log('\n[3] Validation rules');
  const invalid = [
    ['empty session list', { ...routineBody, days: [] }],
    ['no sessions at all', { ...routineBody, days: undefined }],
    ['invalid repetitions', { ...routineBody, days: [{ name: 'X', exercises: [{ exerciseId: allExercises.bench.id, reps: 'muchas' }] }] }],
    ['zero sets', { ...routineBody, days: [{ name: 'X', exercises: [{ exerciseId: allExercises.bench.id, reps: '10', sets: 0 }] }] }],
    ['end before start', { ...routineBody, startDate: shift(10), endDate: shift(2) }],
    ['missing start date', { ...routineBody, startDate: undefined }],
    ['duplicate session names', { ...routineBody, days: [{ name: 'Same', exercises: [] }, { name: 'same', exercises: [] }] }],
    ['inactive exercise', { ...routineBody, days: [{ name: 'X', exercises: [{ exerciseId: allExercises.plank.id, reps: '10' }] }] }],
    ['name too short', { ...routineBody, name: 'VR' }],
  ];
  for (const [label, body] of invalid) {
    const attempt = await req('/routines', { method: 'POST', cookie: instructorSession.cookie, body });
    assert.equal(attempt.response.status, 400, `${label} must be rejected, got ${attempt.response.status}`);
  }
  const unknownMember = await req('/routines', { method: 'POST', cookie: instructorSession.cookie, body: { ...routineBody, memberId: 'does-not-exist' } });
  assert.equal(unknownMember.response.status, 404, 'unknown member is rejected');
  pass('3. validations reject empty or malformed routines, bad repetitions, zero sets, inverted dates, duplicate names, inactive exercises and unknown members');

  console.log('\n[4] Activation archives the previous routine and keeps the history');
  const activateFirst = await req(`/routines/${routine.id}/activate`, { method: 'POST', cookie: instructorSession.cookie });
  assert.equal(activateFirst.response.status, 200, JSON.stringify(activateFirst.json));
  assert.equal(activateFirst.json.data.status, 'ACTIVE');
  assert.equal(activateFirst.json.data.isActive, true);

  const secondBody = { ...routineBody, name: 'VR Full Body — second cycle', days: [{ name: 'Day 1 — Legs', exercises: [{ exerciseId: allExercises.squat.id, sets: 5, reps: '5', restSeconds: 120 }] }] };
  const secondResponse = await req('/routines', { method: 'POST', cookie: instructorSession.cookie, body: { ...secondBody, activate: true } });
  assert.equal(secondResponse.response.status, 201, JSON.stringify(secondResponse.json));
  const second = secondResponse.json.data;
  created.routineIds.push(second.id);
  assert.equal(second.status, 'ACTIVE', 'activate:true works in the creation transaction');

  const firstAfter = await req(`/routines/${routine.id}`, { cookie: instructorSession.cookie });
  assert.equal(firstAfter.json.data.status, 'ARCHIVED', 'the previous routine is archived');
  assert.ok(firstAfter.json.data.archivedAt, 'archived routines record the date');

  const activeCount = await prisma.routine.count({ where: { gymId: SEED_GYM_ID, assignedToId: assignedMemberId, status: 'ACTIVE' } });
  assert.equal(activeCount, 1, 'exactly one active routine per member');
  const supersededSkip = await req(`/routines/${routine.id}/activate`, { method: 'POST', cookie: instructorSession.cookie });
  assert.equal(supersededSkip.response.status, 200, 'an archived routine can be activated again');

  const historyFirst = await req(`/routines/${routine.id}/history`, { cookie: instructorSession.cookie });
  assert.equal(historyFirst.response.status, 200, JSON.stringify(historyFirst.json));
  const reasons = historyFirst.json.data.map((row) => row.reason);
  assert.ok(reasons.includes('CREATE'), 'creation version stored');
  assert.ok(reasons.includes('SUPERSEDED'), 'superseded version stored');
  assert.ok(reasons.includes('ACTIVATE'), 'activation version stored');
  const versions = historyFirst.json.data.map((row) => row.version);
  assert.equal(new Set(versions).size, versions.length, 'version numbers are unique per routine');
  const ordered = [...versions].sort((a, b) => a - b);
  assert.deepEqual(versions, ordered.reverse(), 'history is returned newest first');
  pass('4. activation archives the previous routine, keeps one active per member and records CREATE/SUPERSEDED/ACTIVATE versions');

  console.log('\n[5] Older versions stay queryable after a modification');
  const originalName = routine.name;
  const update = await req(`/routines/${routine.id}`, {
    method: 'PATCH',
    cookie: instructorSession.cookie,
    body: { name: 'VR Full Body 4 weeks (updated)', days: [{ name: 'Day 1 — Push', exercises: [{ exerciseId: allExercises.bench.id, sets: 4, reps: '6-8', restSeconds: 120 }] }] },
  });
  assert.equal(update.response.status, 200, JSON.stringify(update.json));
  assert.equal(update.json.data.name, 'VR Full Body 4 weeks (updated)');
  assert.equal(update.json.data.days.length, 1, 'the new document replaced the old sessions');
  assert.equal(update.json.data.days[0].exercises[0].reps, '6-8');

  const historyAfter = await req(`/routines/${routine.id}/history`, { cookie: instructorSession.cookie });
  const firstVersion = historyAfter.json.data.find((row) => row.version === 1);
  assert.ok(firstVersion, 'version 1 is still stored');
  assert.equal(firstVersion.snapshot.name, originalName, 'the historical name is preserved');
  assert.equal(firstVersion.snapshot.days.length, 2, 'the historical sessions are preserved');
  assert.equal(firstVersion.snapshot.days[0].exercises[0].reps, '8-12', 'the historical prescription is preserved');
  assert.ok(historyAfter.json.data.length > historyFirst.json.data.length, 'the update appended a new version');
  assert.ok(historyAfter.json.data.every((row) => row.author), 'each version records the responsible user');
  pass('5. modifying a routine appends a version and the previous configuration stays queryable');

  console.log('\n[6] Permissions of the instructor');
  const unassignedCreate = await req('/routines', { method: 'POST', cookie: instructorSession.cookie, body: { ...routineBody, memberId: unassignedMemberId } });
  assert.equal(unassignedCreate.response.status, 403, 'cannot create routines for a member that is not assigned');

  const adminRoutine = await req('/routines', { method: 'POST', cookie: adminCookie, body: { ...routineBody, memberId: unassignedMemberId, name: 'VR Admin routine' } });
  assert.equal(adminRoutine.response.status, 201, JSON.stringify(adminRoutine.json));
  created.routineIds.push(adminRoutine.json.data.id);

  const instructorOnUnassigned = await req(`/routines/${adminRoutine.json.data.id}`, { method: 'PATCH', cookie: instructorSession.cookie, body: { name: 'Hijacked' } });
  assert.equal(instructorOnUnassigned.response.status, 403, 'cannot modify a routine of an unassigned member');
  const instructorReadUnassigned = await req(`/routines/${adminRoutine.json.data.id}`, { cookie: instructorSession.cookie });
  assert.equal(instructorReadUnassigned.response.status, 404, 'unassigned member routines are not readable either');

  // Losing the assignment removes write access to routines already built.
  await req(`/instructors/${created.instructorId}/members/${assignedMemberId}`, { method: 'DELETE', cookie: adminCookie });
  const afterUnassign = await req(`/routines/${routine.id}`, { method: 'PATCH', cookie: instructorSession.cookie, body: { name: 'Should not pass' } });
  assert.equal(afterUnassign.response.status, 403, 'an instructor that lost the assignment cannot keep editing');
  const activateAfterUnassign = await req(`/routines/${routine.id}/activate`, { method: 'POST', cookie: instructorSession.cookie });
  assert.equal(activateAfterUnassign.response.status, 403, 'nor activate');
  pass('6. instructor: creates only for assigned members, blocked from unassigned ones, and loses write access when unassigned');

  // Restore the assignment for the remaining checks.
  await req(`/instructors/${created.instructorId}/members`, { method: 'POST', cookie: adminCookie, body: { memberId: assignedMemberId, primary: true } });

  console.log('\n[7] Member can only read their own routines');
  const memberRoutine = await req('/routines', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'VR Member routine', memberId: memberProfile.id, startDate: today(), activate: true, days: [{ name: 'Week 1', exercises: [{ exerciseId: allExercises.row.id, sets: 3, reps: '10', restSeconds: 60 }] }] },
  });
  assert.equal(memberRoutine.response.status, 201, JSON.stringify(memberRoutine.json));
  created.routineIds.push(memberRoutine.json.data.id);

  const own = await req('/routines/me', { cookie: memberSession.cookie });
  assert.equal(own.response.status, 200, JSON.stringify(own.json));
  assert.ok(own.json.data.length >= 1, 'member sees own routines');
  assert.ok(own.json.data.every((row) => row.member.id === memberProfile.id), 'only own routines');
  assert.ok(own.json.data.some((row) => row.days.length > 0), 'the member view includes sessions and exercises');

  const viaMembersPath = await req(`/members/${memberProfile.id}/routines`, { cookie: memberSession.cookie });
  assert.equal(viaMembersPath.response.status, 200, JSON.stringify(viaMembersPath.json));
  assert.equal(viaMembersPath.json.data.length, own.json.data.length, 'both member routes agree');

  const otherMemberRoutines = await req(`/members/${assignedMemberId}/routines`, { cookie: memberSession.cookie });
  assert.equal(otherMemberRoutines.response.status, 404, 'a member cannot read another member routines');
  const otherRoutineDetail = await req(`/routines/${routine.id}`, { cookie: memberSession.cookie });
  assert.equal(otherRoutineDetail.response.status, 404, 'nor a routine that is not theirs');

  const memberWrites = [
    ['PATCH', `/routines/${memberRoutine.json.data.id}`, { name: 'Member edit' }],
    ['PATCH', `/routines/${memberRoutine.json.data.id}`, { days: [] }],
    ['POST', `/routines/${memberRoutine.json.data.id}/activate`, undefined],
    ['POST', `/routines/${memberRoutine.json.data.id}/archive`, undefined],
    ['DELETE', `/routines/${memberRoutine.json.data.id}`, undefined],
    ['POST', '/routines', { ...routineBody, memberId: memberProfile.id }],
    ['POST', '/exercises', { name: 'VR Member made exercise' }],
  ];
  for (const [method, path, body] of memberWrites) {
    const attempt = await req(path, { method, cookie: memberSession.cookie, ...(body ? { body } : {}) });
    assert.equal(attempt.response.status, 403, `MEMBER ${method} ${path} must be 403, got ${attempt.response.status}`);
  }
  pass('7. the member reads only their own routines (both routes) and can never create, edit, activate or archive');

  console.log('\n[8] Suspended instructor');
  const instructorUserId = (await prisma.instructorProfile.findUnique({ where: { id: created.instructorId }, select: { userId: true } })).userId;
  await prisma.user.update({ where: { id: instructorUserId }, data: { isActive: false } });
  const suspendedAttempt = await req('/routines', { method: 'POST', cookie: instructorSession.cookie, body: routineBody });
  assert.ok([401, 403].includes(suspendedAttempt.response.status), `suspended instructor blocked, got ${suspendedAttempt.response.status}`);
  await prisma.user.update({ where: { id: instructorUserId }, data: { isActive: true } });
  const restored = await login('instructor@demo.local', DEV_PASSWORD);
  assert.ok(restored.cookie, 'instructor works again once reactivated');
  pass('8. a suspended instructor account is blocked from the API and works again when reactivated');

  console.log('\n[9] Tenant isolation');
  created.foreignAdminEmail = `vr-admin-${Date.now()}@test.local`;
  const gymResponse = await req('/admin/gyms', {
    method: 'POST',
    cookie: superAdminCookie,
    body: {
      name: 'Disposable Routines Gym', slug: `routines-test-${Date.now()}`, email: '', phone: '', address: '', city: '', province: '', postalCode: '', country: '',
      timezone: 'America/Argentina/Buenos_Aires', adminFullName: 'Disposable Routines Admin', adminEmail: created.foreignAdminEmail,
    },
  });
  assert.equal(gymResponse.response.status, 201, JSON.stringify(gymResponse.json));
  created.foreignGym = gymResponse.json.data.id;
  await req('/auth/complete-setup', { method: 'POST', body: { token: gymResponse.json.setupToken, password: 'DisposablePass!2026' } });
  const foreignAdmin = await login(created.foreignAdminEmail, 'DisposablePass!2026');

  const foreignMemberId = await createMember(foreignAdmin.cookie, 'VR Foreign Member', `vr-foreign-${Date.now()}@test.local`);
  const foreignExercise = await createExercise(foreignAdmin.cookie, { name: `VR Foreign Exercise ${Date.now()}`, muscleGroup: 'BACK' });

  const foreignRead = await req(`/routines/${routine.id}`, { cookie: foreignAdmin.cookie });
  assert.equal(foreignRead.response.status, 404, 'another gym cannot read the routine');
  const foreignHistory = await req(`/routines/${routine.id}/history`, { cookie: foreignAdmin.cookie });
  assert.equal(foreignHistory.response.status, 404, 'nor its history');
  const foreignPatch = await req(`/routines/${routine.id}`, { method: 'PATCH', cookie: foreignAdmin.cookie, body: { name: 'Cross tenant' } });
  assert.equal(foreignPatch.response.status, 404, 'nor modify it');
  const foreignActivate = await req(`/routines/${routine.id}/activate`, { method: 'POST', cookie: foreignAdmin.cookie });
  assert.equal(foreignActivate.response.status, 404, 'nor activate it');
  const foreignExerciseUse = await req('/routines', {
    method: 'POST',
    cookie: foreignAdmin.cookie,
    body: { name: 'VR Cross exercise routine', memberId: foreignMemberId, startDate: today(), days: [{ name: 'D1', exercises: [{ exerciseId: allExercises.bench.id, reps: '10' }] }] },
  });
  assert.equal(foreignExerciseUse.response.status, 400, 'an exercise from another gym cannot be referenced');
  const foreignCatalogRead = await req(`/exercises/${allExercises.bench.id}`, { cookie: foreignAdmin.cookie });
  assert.equal(foreignCatalogRead.response.status, 404, 'the catalog of another gym is invisible');
  const foreignOwnExercise = await req('/routines', {
    method: 'POST',
    cookie: foreignAdmin.cookie,
    body: { name: 'VR Foreign routine', memberId: foreignMemberId, startDate: today(), days: [{ name: 'D1', exercises: [{ exerciseId: foreignExercise.id, reps: '10' }] }] },
  });
  assert.equal(foreignOwnExercise.response.status, 201, 'each gym uses its own catalog');

  const demoList = await req('/routines?page=1&pageSize=50', { cookie: adminCookie });
  assert.ok(demoList.json.data.every((row) => row.id !== foreignOwnExercise.json.data.id), 'gym lists stay tenant-scoped');
  pass('9. cross-gym reads, writes, activations and catalog references are all blocked (404/400)');

  console.log('\n[10] Administrator supervision');
  const listAll = await req(`/routines?memberId=${assignedMemberId}&page=1&pageSize=20`, { cookie: adminCookie });
  assert.equal(listAll.response.status, 200);
  assert.ok(listAll.json.data.length >= 2, 'admin sees routines created by instructors');
  const byStatus = await req('/routines?status=ARCHIVED&page=1&pageSize=20', { cookie: adminCookie });
  assert.ok(byStatus.json.data.every((row) => row.status === 'ARCHIVED'), 'status filter works');
  const byInstructor = await req(`/routines?instructorId=${created.instructorId}&page=1&pageSize=20`, { cookie: adminCookie });
  assert.ok(byInstructor.json.data.length >= 1, 'instructor filter works');
  const byDate = await req(`/routines?from=${today()}&to=${today()}&page=1&pageSize=20`, { cookie: adminCookie });
  assert.ok(byDate.json.data.length >= 1, 'date filter works');
  const searchFilter = await req('/routines?search=VR%20Member', { cookie: adminCookie });
  assert.ok(searchFilter.json.data.every((row) => row.name.includes('VR Member')), 'search filter works');

  const adminArchive = await req(`/routines/${adminRoutine.json.data.id}/archive`, { method: 'POST', cookie: adminCookie });
  assert.equal(adminArchive.response.status, 200, JSON.stringify(adminArchive.json));
  const archivedRow = await prisma.routine.findUnique({ where: { id: adminRoutine.json.data.id }, select: { status: true, createdBy: true, deletedAt: true } });
  assert.equal(archivedRow.status, 'ARCHIVED');
  assert.equal(archivedRow.deletedAt, null, 'archiving never physically deletes');
  assert.equal(archivedRow.createdBy, (await prisma.user.findFirst({ where: { email: 'admin@demo.local' }, select: { id: true } })).id, 'authorship is not rewritten');

  const superAdminList = await req('/routines', { cookie: superAdminCookie });
  assert.equal(superAdminList.response.status, 403, 'SUPER_ADMIN has no implicit access to daily routines');
  pass('10. admin lists, filters (member, instructor, status, date, search) and archives without deleting or rewriting authorship');

  console.log('\n[11] Concurrent activations stay consistent');
  const raceA = await req('/routines', { method: 'POST', cookie: adminCookie, body: { ...routineBody, name: 'VR Race A', memberId: assignedMemberId } });
  const raceB = await req('/routines', { method: 'POST', cookie: adminCookie, body: { ...routineBody, name: 'VR Race B', memberId: assignedMemberId } });
  assert.equal(raceA.response.status, 201, JSON.stringify(raceA.json));
  assert.equal(raceB.response.status, 201, JSON.stringify(raceB.json));
  created.routineIds.push(raceA.json.data.id, raceB.json.data.id);

  const both = await Promise.all([
    req(`/routines/${raceA.json.data.id}/activate`, { method: 'POST', cookie: adminCookie }),
    req(`/routines/${raceB.json.data.id}/activate`, { method: 'POST', cookie: adminCookie }),
  ]);
  assert.ok(both.every((attempt) => [200, 409].includes(attempt.response.status)), 'concurrent activations succeed or report a conflict, never a crash');
  const activeAfterRace = await prisma.routine.findMany({ where: { gymId: SEED_GYM_ID, assignedToId: assignedMemberId, status: 'ACTIVE' }, select: { id: true } });
  assert.equal(activeAfterRace.length, 1, `exactly one active routine after the race, got ${activeAfterRace.length}`);
  // Exactly one activation is the last one: the other must end archived.
  const archivedAfterRace = await prisma.routine.count({ where: { gymId: SEED_GYM_ID, id: { in: [raceA.json.data.id, raceB.json.data.id] }, status: 'ARCHIVED' } });
  assert.equal(archivedAfterRace, 1);

  const failedActivation = await req('/routines/does-not-exist/activate', { method: 'POST', cookie: adminCookie });
  assert.equal(failedActivation.response.status, 404, 'activating a missing routine fails cleanly');
  const stateAfterFailure = await prisma.routine.count({ where: { gymId: SEED_GYM_ID, assignedToId: assignedMemberId, status: 'ACTIVE' } });
  assert.equal(stateAfterFailure, 1, 'the failed activation left the previous state untouched');
  pass('11. parallel activations leave exactly one active routine and a failed activation changes nothing');

  console.log('\n[12] Persistence in PostgreSQL');
  await req('/auth/logout', { method: 'POST', cookie: adminCookie });
  adminCookie = (await login('admin@demo.local', DEV_PASSWORD)).cookie;
  const persisted = await req(`/routines/${routine.id}`, { cookie: adminCookie });
  assert.equal(persisted.response.status, 200);
  assert.equal(persisted.json.data.name, 'VR Full Body 4 weeks (updated)');
  const persistedHistory = await req(`/routines/${routine.id}/history`, { cookie: adminCookie });
  assert.ok(persistedHistory.json.data.length >= 4, 'version history survives a new session');
  const versionRows = await prisma.routineVersion.count({ where: { routineId: routine.id } });
  assert.equal(versionRows, persistedHistory.json.data.length, 'versions are the same rows read from PostgreSQL');
  const dayCount = await prisma.routineDay.count({ where: { routineId: routine.id } });
  assert.equal(dayCount, 1, 'sessions stored in the database match the current document');
  const exerciseOrder = await prisma.routineExercise.findMany({ where: { routineDay: { routineId: second.id } }, select: { exerciseOrder: true } });
  assert.ok(exerciseOrder.every((row) => typeof row.exerciseOrder === 'number'), 'exercise order persisted');
  pass('12. routines, sessions, exercise order and every version persist across sessions in PostgreSQL');

  console.log('\n[13] Member prescriptions are read-only everywhere');
  skip('13. covered by check 7: the member API surface exposes no mutation endpoint for routines');
} catch (error) {
  console.error('\n✗ FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  console.log('\n[cleanup] Removing test fixtures');
  try {
    if (created.foreignGym) {
      const gymRoutines = await prisma.routine.findMany({ where: { gymId: created.foreignGym }, select: { id: true } });
      await prisma.routineVersion.deleteMany({ where: { routineId: { in: gymRoutines.map((row) => row.id) } } });
      await prisma.routine.deleteMany({ where: { gymId: created.foreignGym } });
      await prisma.exercise.deleteMany({ where: { gymId: created.foreignGym } });
      const profiles = await prisma.memberProfile.findMany({ where: { gymId: created.foreignGym }, select: { id: true, userId: true } });
      await prisma.instructorMember.deleteMany({ where: { gymId: created.foreignGym } });
      await prisma.memberProfile.deleteMany({ where: { gymId: created.foreignGym } });
      const memberships = await prisma.gymMembership.findMany({ where: { gymId: created.foreignGym }, select: { userId: true } });
      await prisma.gymMembership.deleteMany({ where: { gymId: created.foreignGym } });
      for (const membership of memberships) {
        await prisma.authToken.deleteMany({ where: { userId: membership.userId } });
        await prisma.auditLog.deleteMany({ where: { userId: membership.userId, gymId: created.foreignGym } });
        await prisma.user.deleteMany({ where: { id: membership.userId } });
      }
      await prisma.auditLog.deleteMany({ where: { gymId: created.foreignGym } });
      await prisma.gym.deleteMany({ where: { id: created.foreignGym } });
      console.log('  disposable gym removed');
    }
    for (const routineId of created.routineIds) {
      await prisma.routineVersion.deleteMany({ where: { routineId } });
      await prisma.routine.deleteMany({ where: { id: routineId } });
    }
    // Routines created by a failed assertion are not tracked yet: remove by fixture name.
    const strayRoutines = await prisma.routine.findMany({ where: { gymId: SEED_GYM_ID, name: { startsWith: 'VR ' } }, select: { id: true } });
    for (const routineRow of strayRoutines) {
      await prisma.routineVersion.deleteMany({ where: { routineId: routineRow.id } });
      await prisma.routine.deleteMany({ where: { id: routineRow.id } });
    }
    await prisma.exercise.deleteMany({ where: { id: { in: created.exerciseIds } } });
    for (const memberId of created.memberIds) {
      await prisma.routine.deleteMany({ where: { assignedToId: memberId } });
      await prisma.instructorMember.deleteMany({ where: { memberId } });
    }
    await prisma.memberProfile.deleteMany({ where: { id: { in: created.memberIds } } });
    for (const userId of created.memberUserIds) {
      await prisma.gymMembership.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    console.log('  routines, versions, exercises and members removed');
  } catch (cleanupError) {
    console.error('  CLEANUP FAILED:', cleanupError instanceof Error ? cleanupError.message : cleanupError);
    process.exitCode = 2;
  }
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${results.length} checks passed${skipped.length ? `, ${skipped.length} skipped` : ''}`);
for (const label of results) console.log(`- ${label}`);
for (const label of skipped) console.log(`- SKIPPED: ${label}`);
if (process.exitCode && process.exitCode !== 0) process.exit(process.exitCode);
