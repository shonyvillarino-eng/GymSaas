/**
 * Integration verification for the attendance module (manual + QR check-in).
 *
 * Run from /server with the API on port 4000:
 *   node scripts/verify-attendance.mjs
 *
 * Exercises the real REST API against PostgreSQL, then removes every row it
 * created. AuditLog rows written by the module are removed with their fixture
 * member; the audit trail itself stays append-only during normal operation.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4000/api/v1';
const SEED_GYM_ID = 'seed-gym-0001';
const DEV_PASSWORD = 'DevPass!2026';
const MARKER = 'verify-attendance';

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
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
const shift = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat('en-CA').format(date);
};
const daysAgo = (days) => new Date(Date.now() - days * 86_400_000);

async function createMember(cookie, overrides = {}) {
  const email = overrides.email ?? `attendance-${Date.now()}-${Math.floor(Math.random() * 1000)}@test.local`;
  const { response, json } = await req('/members', {
    method: 'POST',
    cookie,
    body: {
      fullName: overrides.fullName ?? 'Attendance Test Member',
      documentType: 'DNI',
      documentNumber: newDocument(),
      birthDate: '1993-05-20',
      gender: 'OTHER',
      phone: '+54-11-5555-1010',
      email,
      joinDate: today(),
      notes: MARKER,
      status: 'ACTIVE',
      ...overrides.body,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(json));
  const profile = await prisma.memberProfile.findUnique({ where: { id: json.data.id }, select: { userId: true } });
  return { id: json.data.id, userId: profile.userId, email };
}

let adminCookie = '';
const created = {
  memberIds: [],
  memberUserIds: [],
  planId: null,
  assignmentIds: [],
  foreignGym: null,
  foreignMemberId: null,
  foreignAdminEmail: null,
  previousPreferences: null,
};

try {
  console.log('\n[setup] Clean previous fixtures and authenticate');
  const leftovers = await prisma.memberProfile.findMany({
    where: { gymId: SEED_GYM_ID, notes: MARKER },
    select: { id: true, userId: true },
  });
  for (const profile of leftovers) {
    await prisma.attendance.deleteMany({ where: { memberId: profile.id } });
    await prisma.memberSubscription.deleteMany({ where: { memberId: profile.id } });
    await prisma.instructorMember.deleteMany({ where: { memberId: profile.id } });
    await prisma.memberProfile.delete({ where: { id: profile.id } });
    await prisma.gymMembership.deleteMany({ where: { userId: profile.userId } });
    await prisma.user.deleteMany({ where: { id: profile.userId } });
  }
  await prisma.membershipPlan.deleteMany({ where: { gymId: SEED_GYM_ID, name: { startsWith: 'Attendance Plan' } } });

  adminCookie = (await login('admin@demo.local', DEV_PASSWORD)).cookie;

  // Duplicate window is a gym preference; pin it for deterministic checks.
  const prefsResponse = await req('/gym/preferences', { cookie: adminCookie });
  created.previousPreferences = prefsResponse.json.data;
  const pinned = { ...prefsResponse.json.data, attendanceDuplicateToleranceMinutes: 30 };
  const saved = await req('/gym/preferences', { method: 'PUT', cookie: adminCookie, body: pinned });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.json));
  assert.equal(saved.json.data.attendanceDuplicateToleranceMinutes, 30);
  assert.equal(saved.json.data.attendancePolicy.requireActiveMember, true, 'default policy requires ACTIVE members');
  assert.equal(saved.json.data.attendancePolicy.requireValidMembership, true, 'default policy requires a valid membership');
  pass('0. gym preferences persist the access policy and the duplicate window (30 min)');

  const plan = await req('/membership-plans', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: `Attendance Plan ${Date.now()}`, price: 30000, durationValue: 1, durationUnit: 'MONTH', isActive: true },
  });
  assert.equal(plan.response.status, 201, JSON.stringify(plan.json));
  created.planId = plan.json.data.id;

  const valid = await createMember(adminCookie, { fullName: 'Attendance Valid Member', email: 'attendance-valid@test.local' });
  created.memberIds.push(valid.id);
  created.memberUserIds.push(valid.userId);
  const subscription = await req('/subscriptions', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: valid.id, planId: created.planId, startDate: today(), agreedPrice: 30000 },
  });
  assert.equal(subscription.response.status, 201, JSON.stringify(subscription.json));

  const suspended = await createMember(adminCookie, { fullName: 'Attendance Suspended Member', email: 'attendance-suspended@test.local' });
  created.memberIds.push(suspended.id);
  created.memberUserIds.push(suspended.userId);
  await req('/subscriptions', { method: 'POST', cookie: adminCookie, body: { memberId: suspended.id, planId: created.planId, startDate: today(), agreedPrice: 30000 } });
  const suspendedStatus = await req(`/members/${suspended.id}/status`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { status: 'SUSPENDED', reason: MARKER },
  });
  assert.equal(suspendedStatus.response.status, 200, JSON.stringify(suspendedStatus.json));

  const expired = await createMember(adminCookie, { fullName: 'Attendance Expired Member', email: 'attendance-expired@test.local' });
  created.memberIds.push(expired.id);
  created.memberUserIds.push(expired.userId);
  // Stored status stays ACTIVE on purpose: the decision must come from the dates.
  await prisma.memberSubscription.create({
    data: {
      gymId: SEED_GYM_ID,
      memberId: expired.id,
      planId: created.planId,
      planNameAtPurchase: 'Attendance Plan (expired fixture)',
      currencyAtPurchase: 'ARS',
      status: 'ACTIVE',
      startDate: daysAgo(60),
      endDate: daysAgo(10),
      priceAtPurchase: 30000,
      finalPrice: 30000,
    },
  });

  const race = await createMember(adminCookie, { fullName: 'Attendance Race Member', email: 'attendance-race@test.local' });
  created.memberIds.push(race.id);
  created.memberUserIds.push(race.userId);
  await req('/subscriptions', { method: 'POST', cookie: adminCookie, body: { memberId: race.id, planId: created.planId, startDate: today(), agreedPrice: 30000 } });

  console.log(`  members: valid=${valid.id} suspended=${suspended.id} expired=${expired.id} race=${race.id}`);

  console.log('\n[1] Manual check-in for an allowed member');
  const manual = await req('/attendance/manual', { method: 'POST', cookie: adminCookie, body: { memberId: valid.id } });
  assert.equal(manual.response.status, 201, JSON.stringify(manual.json));
  const manualAttendance = manual.json.data.attendance;
  assert.equal(manualAttendance.method, 'MANUAL');
  assert.equal(manualAttendance.result, 'ALLOWED');
  assert.equal(manualAttendance.membershipStatusAtCheckIn, 'ACTIVE');
  assert.equal(manualAttendance.recordedById, manual.json.data.attendance.recordedById);
  assert.ok(manualAttendance.recordedBy?.fullName, 'the operator is stored');
  const storedManual = await prisma.attendance.findUnique({ where: { id: manualAttendance.id } });
  assert.ok(storedManual, 'row persisted in PostgreSQL');
  assert.equal(storedManual.method, 'MANUAL');
  pass('1. manual check-in recorded (ALLOWED, method MANUAL, operator stored, row in PostgreSQL)');

  console.log('\n[2] QR credential and QR check-in');
  const credential = await req(`/attendance/members/${valid.id}/code`, { method: 'POST', cookie: adminCookie });
  assert.equal(credential.response.status, 201, JSON.stringify(credential.json));
  const token = credential.json.data.token;
  assert.ok(token && token.length >= 20, 'opaque token generated');
  assert.match(token, /^[A-Za-z0-9_-]+$/, 'token is URL-safe and random');
  assert.ok(!token.includes(valid.id), 'token does not embed the member id');
  assert.equal(credential.json.data.payload, `gym-saas:member:${token}`, 'printed payload carries only the token');

  // The duplicate window applies to QR too; move the previous entry outside it.
  await prisma.attendance.update({ where: { id: manualAttendance.id }, data: { checkInTime: new Date(Date.now() - 40 * 60_000) } });

  const qr = await req('/attendance/qr', { method: 'POST', cookie: adminCookie, body: { code: credential.json.data.payload } });
  assert.equal(qr.response.status, 201, JSON.stringify(qr.json));
  assert.equal(qr.json.data.attendance.method, 'QR');
  assert.equal(qr.json.data.attendance.result, 'ALLOWED');
  assert.equal(qr.json.data.attendance.memberId, valid.id);
  pass('2. QR credential issued (opaque, no personal data) and QR check-in recorded with method QR');

  console.log('\n[3] Invalid, revoked and rotated codes');
  const unknown = await req('/attendance/qr', { method: 'POST', cookie: adminCookie, body: { code: 'not-a-real-token-000000000000' } });
  assert.equal(unknown.response.status, 404, 'unknown token is rejected');
  assert.equal(unknown.json.details?.code, 'QR_NOT_FOUND');

  const revoked = await req(`/attendance/members/${valid.id}/code`, { method: 'DELETE', cookie: adminCookie });
  assert.equal(revoked.response.status, 200, JSON.stringify(revoked.json));
  assert.equal(revoked.json.data.token, null, 'revoked credential clears the token');

  await prisma.attendance.deleteMany({ where: { memberId: valid.id } });
  const afterRevoke = await req('/attendance/qr', { method: 'POST', cookie: adminCookie, body: { code: token } });
  assert.equal(afterRevoke.response.status, 404, 'a revoked code no longer resolves');

  const rotated = await req(`/attendance/members/${valid.id}/code`, { method: 'POST', cookie: adminCookie });
  assert.notEqual(rotated.json.data.token, token, 'regeneration issues a different token');
  const oldTokenAfterRotation = await req('/attendance/qr', { method: 'POST', cookie: adminCookie, body: { code: token } });
  assert.equal(oldTokenAfterRotation.response.status, 404, 'the previous code stops working after rotation');
  const newTokenWorks = await req('/attendance/eligibility?code=' + encodeURIComponent(rotated.json.data.payload), { cookie: adminCookie });
  assert.equal(newTokenWorks.response.status, 200, 'the new code resolves to the member');
  assert.equal(newTokenWorks.json.data.member.id, valid.id);
  pass('3. unknown, revoked and rotated codes are rejected; the new credential resolves to the member');

  console.log('\n[4] Unknown member and cross-tenant member');
  const ghost = await req('/attendance/manual', { method: 'POST', cookie: adminCookie, body: { memberId: 'does-not-exist-0001' } });
  assert.equal(ghost.response.status, 404, 'unknown member returns 404');

  created.foreignAdminEmail = `attendance-admin-${Date.now()}@test.local`;
  const gymResponse = await req('/admin/gyms', {
    method: 'POST',
    cookie: (await login('superadmin@demo.local', DEV_PASSWORD)).cookie,
    body: {
      name: 'Disposable Attendance Gym',
      slug: `attendance-test-${Date.now()}`,
      email: '', phone: '', address: '', city: '', province: '', postalCode: '', country: '',
      timezone: 'America/Argentina/Buenos_Aires',
      adminFullName: 'Disposable Attendance Admin',
      adminEmail: created.foreignAdminEmail,
    },
  });
  assert.equal(gymResponse.response.status, 201, JSON.stringify(gymResponse.json));
  created.foreignGym = gymResponse.json.data.id;
  await req('/auth/complete-setup', { method: 'POST', body: { token: gymResponse.json.setupToken, password: 'DisposablePass!2026' } });
  const foreignAdmin = await login(created.foreignAdminEmail, 'DisposablePass!2026');

  const foreignMember = await createMember(foreignAdmin.cookie, {
    fullName: 'Foreign Attendance Member',
    email: 'attendance-foreign@test.local',
  });
  created.foreignMemberId = foreignMember.id;

  const crossEligibility = await req(`/attendance/eligibility?memberId=${foreignMember.id}`, { cookie: adminCookie });
  assert.equal(crossEligibility.response.status, 404, 'another gym member is invisible');
  const crossManual = await req('/attendance/manual', { method: 'POST', cookie: adminCookie, body: { memberId: foreignMember.id } });
  assert.equal(crossManual.response.status, 404, 'cannot check in a member of another gym');
  const foreignQr = await req('/attendance/qr', { method: 'POST', cookie: foreignAdmin.cookie, body: { code: rotated.json.data.token } });
  assert.equal(foreignQr.response.status, 404, 'a credential only works inside its own gym');
  const foreignList = await req('/attendance', { cookie: foreignAdmin.cookie });
  assert.equal(foreignList.json.data.length, 0, 'the other gym list stays empty');
  pass('4. unknown members and members of other gyms return 404; credentials do not cross tenants');

  console.log('\n[5] Suspended member and expired membership');
  const suspendedDecision = await req(`/attendance/eligibility?memberId=${suspended.id}`, { cookie: adminCookie });
  assert.equal(suspendedDecision.response.status, 200);
  assert.equal(suspendedDecision.json.data.allowed, false);
  assert.equal(suspendedDecision.json.data.reasons[0].code, 'MEMBER_NOT_ACTIVE');

  const suspendedAttempt = await req('/attendance/manual', { method: 'POST', cookie: adminCookie, body: { memberId: suspended.id } });
  assert.equal(suspendedAttempt.response.status, 422, JSON.stringify(suspendedAttempt.json));
  assert.equal(suspendedAttempt.json.details.code, 'ACCESS_DENIED');
  assert.ok(suspendedAttempt.json.details.reasons.includes('MEMBER_NOT_ACTIVE'));
  assert.equal(await prisma.attendance.count({ where: { memberId: suspended.id } }), 0, 'a denied entry is not stored');

  const expiredDecision = await req(`/attendance/eligibility?memberId=${expired.id}`, { cookie: adminCookie });
  assert.equal(expiredDecision.json.data.allowed, false, 'the API derives expiry from the dates, not the stored status');
  assert.equal(expiredDecision.json.data.membership.status, 'ACTIVE', 'stored status is still ACTIVE (stale fixture)');
  assert.equal(expiredDecision.json.data.reasons[0].code, 'MEMBERSHIP_EXPIRED');
  const expiredAttempt = await req('/attendance/manual', { method: 'POST', cookie: adminCookie, body: { memberId: expired.id } });
  assert.equal(expiredAttempt.response.status, 422);
  assert.equal(await prisma.attendance.count({ where: { memberId: expired.id } }), 0);
  pass('5. suspended member and expired membership are denied with reasons and no row is written');

  console.log('\n[6] Duplicate prevention and legitimate re-entry');
  await prisma.attendance.deleteMany({ where: { memberId: valid.id } });
  const firstEntry = await req('/attendance/qr', { method: 'POST', cookie: adminCookie, body: { code: rotated.json.data.payload } });
  assert.equal(firstEntry.response.status, 201, JSON.stringify(firstEntry.json));
  const repeated = await req('/attendance/qr', { method: 'POST', cookie: adminCookie, body: { code: rotated.json.data.payload } });
  assert.equal(repeated.response.status, 409, 'a second entry inside the window is rejected');
  assert.equal(repeated.json.details.code, 'DUPLICATE_ATTENDANCE');
  assert.equal(await prisma.attendance.count({ where: { memberId: valid.id } }), 1, 'still exactly one row');

  const lastEntry = await prisma.attendance.findFirst({ where: { memberId: valid.id } });
  await prisma.attendance.update({ where: { id: lastEntry.id }, data: { checkInTime: new Date(Date.now() - 31 * 60_000) } });
  const afterWindow = await req('/attendance/manual', { method: 'POST', cookie: adminCookie, body: { memberId: valid.id } });
  assert.equal(afterWindow.response.status, 201, 'after the window a new legitimate entry is accepted');
  assert.equal(await prisma.attendance.count({ where: { memberId: valid.id } }), 2);
  pass('6. duplicate inside the window rejected (409); a new entry after the window is accepted');

  console.log('\n[7] Simultaneous requests for the same member');
  await prisma.attendance.deleteMany({ where: { memberId: race.id } });
  const attempts = await Promise.all(
    Array.from({ length: 6 }, () => req('/attendance/manual', { method: 'POST', cookie: adminCookie, body: { memberId: race.id } })),
  );
  const accepted = attempts.filter((attempt) => attempt.response.status === 201);
  const rejected = attempts.filter((attempt) => attempt.response.status === 409);
  assert.equal(accepted.length, 1, `exactly one of 6 concurrent entries may be stored, got ${accepted.length}`);
  assert.equal(rejected.length, 5, 'the other five are duplicates');
  assert.equal(await prisma.attendance.count({ where: { memberId: race.id } }), 1);
  pass('7. 6 simultaneous check-ins: exactly 1 stored, 5 rejected as duplicates');

  console.log('\n[8] Administrative exception (justified + audited)');
  const noReason = await req('/attendance/manual', { method: 'POST', cookie: adminCookie, body: { memberId: suspended.id } });
  assert.equal(noReason.response.status, 422, 'an exception without justification is refused');

  const exception = await req('/attendance/manual', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: suspended.id, exceptionReason: 'Member returned with a signed medical clearance.' },
  });
  assert.equal(exception.response.status, 201, JSON.stringify(exception.json));
  assert.equal(exception.json.data.attendance.result, 'EXCEPTION');
  assert.equal(exception.json.data.attendance.exceptionReason, 'Member returned with a signed medical clearance.');

  const audit = await prisma.auditLog.findFirst({
    where: { gymId: SEED_GYM_ID, entityType: 'AttendanceException', entityId: exception.json.data.attendance.id },
  });
  assert.ok(audit, 'the exception is written to AuditLog');
  assert.equal(audit.newValues.reason, 'Member returned with a signed medical clearance.');
  assert.ok(!JSON.stringify(audit.newValues).includes('password'), 'no credentials in the audit entry');

  // Policy can be switched off; the server then refuses every exception.
  const strict = await req('/gym/preferences', {
    method: 'PUT',
    cookie: adminCookie,
    body: { ...pinned, attendancePolicy: { ...pinned.attendancePolicy, allowAdministrativeExceptions: false } },
  });
  assert.equal(strict.response.status, 200);
  await prisma.attendance.deleteMany({ where: { memberId: expired.id } });
  const disabled = await req('/attendance/manual', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: expired.id, exceptionReason: 'Trying anyway with a justification.' },
  });
  assert.equal(disabled.response.status, 403, 'exceptions disabled by policy');
  assert.equal(disabled.json.details.code, 'EXCEPTIONS_DISABLED');
  await req('/gym/preferences', { method: 'PUT', cookie: adminCookie, body: pinned });
  pass('8. exceptions require a justification, are stored as EXCEPTION, audited, and can be disabled by policy');

  console.log('\n[9] History, filters, pagination and indicators');
  const all = await req('/attendance?page=1&pageSize=50', { cookie: adminCookie });
  assert.equal(all.response.status, 200, JSON.stringify(all.json));
  assert.ok(all.json.meta.total >= 4, `expected several entries, got ${all.json.meta.total}`);
  assert.ok(all.json.data.every((row) => row.member && row.member.user.fullName), 'rows include the member');

  const qrOnly = await req('/attendance?method=QR&page=1&pageSize=50', { cookie: adminCookie });
  assert.ok(qrOnly.json.data.length > 0);
  assert.ok(qrOnly.json.data.every((row) => row.method === 'QR'), 'method filter works');

  const exceptionsOnly = await req('/attendance?result=EXCEPTION&page=1&pageSize=50', { cookie: adminCookie });
  assert.ok(exceptionsOnly.json.data.length > 0);
  assert.ok(exceptionsOnly.json.data.every((row) => row.result === 'EXCEPTION'), 'result filter works');

  const search = await req('/attendance?search=Attendance%20Valid&page=1&pageSize=50', { cookie: adminCookie });
  assert.ok(search.json.data.every((row) => row.member.user.fullName.includes('Attendance Valid')), 'search filters by member name');

  const ranged = await req(`/attendance?from=${today()}&to=${today()}&page=1&pageSize=50`, { cookie: adminCookie });
  assert.ok(ranged.json.data.length > 0, 'same-day range returns entries');

  const paged = await req(`/attendance?memberId=${valid.id}&page=1&pageSize=1`, { cookie: adminCookie });
  assert.equal(paged.json.data.length, 1);
  assert.equal(paged.json.meta.pageSize, 1);
  assert.equal(paged.json.meta.total, 2);
  assert.equal(paged.json.meta.totalPages, 2);

  const stats = await req('/attendance/stats', { cookie: adminCookie });
  assert.equal(stats.response.status, 200, JSON.stringify(stats.json));
  assert.ok(stats.json.data.today >= 3, `today count expected, got ${stats.json.data.today}`);
  assert.ok(stats.json.data.exceptionsToday >= 1);
  assert.equal(stats.json.data.series.length, 14, '14-day series');
  assert.ok(stats.json.data.recent.length > 0, 'recent entries for the reception desk');
  assert.equal(stats.json.data.todayQr + stats.json.data.todayManual, stats.json.data.today, 'method split adds up');
  assert.ok(stats.json.data.withoutValidMembership >= 2, 'alert counts members without a membership in force');
  pass('9. history filters (member, method, result, search, date range), backend pagination and indicators');

  console.log('\n[10] Permissions per role');
  const instructorProfile = await prisma.instructorProfile.findFirst({
    where: { gymId: SEED_GYM_ID, user: { isActive: true } },
    select: { id: true, userId: true, user: { select: { email: true } } },
  });
  assert.ok(instructorProfile, 'seed instructor exists');
  // Assign the valid member to this instructor, then check scoping.
  const assign = await req(`/instructors/${instructorProfile.id}/members`, {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: valid.id, primary: true },
  });
  assert.ok([200, 201].includes(assign.response.status), JSON.stringify(assign.json));
  const assignment = await prisma.instructorMember.findFirst({
    where: { instructorId: instructorProfile.id, memberId: valid.id },
    select: { id: true },
  });
  if (assignment) created.assignmentIds.push(assignment.id);

  const instructor = await login(instructorProfile.user.email, DEV_PASSWORD);
  const assignedRead = await req(`/attendance/member/${valid.id}`, { cookie: instructor.cookie });
  assert.equal(assignedRead.response.status, 200, JSON.stringify(assignedRead.json));
  assert.ok(assignedRead.json.data.stats.total >= 2, 'instructor sees the assigned member stats');
  const notAssigned = await req(`/attendance/member/${race.id}`, { cookie: instructor.cookie });
  assert.equal(notAssigned.response.status, 403, 'instructor cannot read unassigned members');
  const instructorList = await req('/attendance', { cookie: instructor.cookie });
  assert.equal(instructorList.response.status, 403);
  const instructorCheckIn = await req('/attendance/manual', { method: 'POST', cookie: instructor.cookie, body: { memberId: valid.id } });
  assert.equal(instructorCheckIn.response.status, 403, 'instructors cannot record entries');
  const instructorStats = await req('/attendance/stats', { cookie: instructor.cookie });
  assert.equal(instructorStats.response.status, 403);

  const memberSession = await login('member@demo.local', DEV_PASSWORD);
  const ownHistory = await req('/attendance/me', { cookie: memberSession.cookie });
  assert.equal(ownHistory.response.status, 200, JSON.stringify(ownHistory.json));
  assert.ok(ownHistory.json.data.memberId, 'member sees their own profile');
  assert.ok(ownHistory.json.data.records.every((row) => row.memberId === ownHistory.json.data.memberId), 'only own entries');
  const ownCredential = await req('/attendance/me/code', { cookie: memberSession.cookie });
  assert.equal(ownCredential.response.status, 200);
  assert.equal(ownCredential.json.data.memberId, ownHistory.json.data.memberId);
  const memberList = await req('/attendance', { cookie: memberSession.cookie });
  assert.equal(memberList.response.status, 403, 'members cannot list the gym attendance');
  const memberCheckIn = await req('/attendance/manual', { method: 'POST', cookie: memberSession.cookie, body: { memberId: valid.id } });
  assert.equal(memberCheckIn.response.status, 403);
  const memberCredentialOfOther = await req(`/attendance/members/${valid.id}/code`, { cookie: memberSession.cookie });
  assert.equal(memberCredentialOfOther.response.status, 403, 'members cannot read other members credentials');

  const superAdmin = await login('superadmin@demo.local', DEV_PASSWORD);
  const superList = await req('/attendance', { cookie: superAdmin.cookie });
  assert.equal(superList.response.status, 403, 'SUPER_ADMIN has no access to daily attendance');
  const superCheckIn = await req('/attendance/manual', { method: 'POST', cookie: superAdmin.cookie, body: { memberId: valid.id } });
  assert.equal(superCheckIn.response.status, 403);
  pass('10. INSTRUCTOR scoped to assigned members, MEMBER limited to own data, SUPER_ADMIN blocked');

  console.log('\n[11] Suspended gym blocks administrative operations');
  const suspendGym = await req(`/admin/gyms/${SEED_GYM_ID}/suspend`, {
    method: 'POST',
    cookie: superAdmin.cookie,
    body: { reason: 'Attendance verification' },
  });
  assert.equal(suspendGym.response.status, 200, JSON.stringify(suspendGym.json));
  const duringSuspension = await req('/attendance/manual', { method: 'POST', cookie: adminCookie, body: { memberId: valid.id } });
  assert.equal(duringSuspension.response.status, 403, 'a suspended gym cannot record entries');
  const reactivate = await req(`/admin/gyms/${SEED_GYM_ID}/reactivate`, { method: 'POST', cookie: superAdmin.cookie });
  assert.equal(reactivate.response.status, 200, JSON.stringify(reactivate.json));
  pass('11. a suspended gym rejects check-ins (403) and works again after reactivation');

  console.log('\n[12] Persistence in PostgreSQL after a new session');
  const beforeLogout = await req(`/attendance/member/${valid.id}?page=1&pageSize=10`, { cookie: adminCookie });
  const totalBefore = beforeLogout.json.data.stats.total;
  await req('/auth/logout', { method: 'POST', cookie: adminCookie });
  adminCookie = (await login('admin@demo.local', DEV_PASSWORD)).cookie;
  const afterLogin = await req(`/attendance/member/${valid.id}?page=1&pageSize=10`, { cookie: adminCookie });
  assert.equal(afterLogin.response.status, 200);
  assert.equal(afterLogin.json.data.stats.total, totalBefore);
  assert.ok(afterLogin.json.data.stats.weekly.length === 8, 'weekly evolution returned');
  const persistedException = await prisma.attendance.findFirst({ where: { memberId: suspended.id, result: 'EXCEPTION' } });
  assert.ok(persistedException?.exceptionReason, 'the justified exception survives the session');
  const memberSummary = await req(`/members/${valid.id}/summary`, { cookie: adminCookie });
  assert.ok(memberSummary.json.data.attendance.total >= 2, 'member profile exposes real attendance');
  assert.ok(memberSummary.json.data.attendance.weekly.length === 8);
  assert.ok(memberSummary.json.data.attendance.lastVisitAt, 'last visit exposed');
  pass('12. entries, exceptions and member-profile indicators persist across sessions');

  console.log('\n[13] Browser scanner decoding pipeline');
  skip('13. physical camera capture requires a device; the decode pipeline (jsQR) is checked in the browser instead');
} catch (error) {
  console.error('\n✗ FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  console.log('\n[cleanup] Removing test fixtures');
  try {
    if (created.previousPreferences) {
      await req('/gym/preferences', { method: 'PUT', cookie: adminCookie, body: created.previousPreferences });
    }
    if (created.foreignGym) {
      const profiles = await prisma.memberProfile.findMany({ where: { gymId: created.foreignGym }, select: { id: true } });
      for (const profile of profiles) {
        await prisma.attendance.deleteMany({ where: { memberId: profile.id } });
        await prisma.memberSubscription.deleteMany({ where: { memberId: profile.id } });
        await prisma.instructorMember.deleteMany({ where: { memberId: profile.id } });
      }
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
    for (const memberId of created.memberIds) {
      await prisma.attendance.deleteMany({ where: { memberId } });
      await prisma.paymentRecord.deleteMany({ where: { memberId } });
      await prisma.financialObligation.deleteMany({ where: { memberId } });
      await prisma.memberSubscription.deleteMany({ where: { memberId } });
      await prisma.instructorMember.deleteMany({ where: { memberId } });
    }
    const fixtureIds = new Set(created.memberIds);
    const auditRows = await prisma.auditLog.findMany({
      where: { gymId: SEED_GYM_ID, entityType: { in: ['AttendanceException', 'MemberQrCredential'] } },
      select: { id: true, entityId: true, newValues: true },
    });
    for (const row of auditRows) {
      const values = row.newValues ?? {};
      if ((row.entityId && fixtureIds.has(row.entityId)) || (values.memberId && fixtureIds.has(values.memberId))) {
        await prisma.auditLog.delete({ where: { id: row.id } });
      }
    }
    await prisma.memberProfile.deleteMany({ where: { id: { in: created.memberIds } } });
    for (const userId of created.memberUserIds) {
      await prisma.auditLog.deleteMany({ where: { userId, gymId: SEED_GYM_ID } });
      await prisma.gymMembership.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (created.planId) {
      await prisma.memberSubscription.deleteMany({ where: { planId: created.planId } });
      await prisma.membershipPlan.deleteMany({ where: { id: created.planId } });
    }
    console.log('  members, attendance, memberships and plans removed');
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
