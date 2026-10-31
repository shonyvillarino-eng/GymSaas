/**
 * Integration verification for the member portal.
 *
 * Run from /server with the API on port 4000:
 *   node scripts/verify-member-portal.mjs
 *
 * Exercises the real REST API against PostgreSQL (dashboard, profile, notices,
 * attendances, membership, payments, permissions and tenant isolation) and
 * removes every row it created.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4000/api/v1';
const SEED_GYM_ID = 'seed-gym-0001';
const DEV_PASSWORD = 'DevPass!2026';
const PORTAL_PASSWORD = 'PortalPass!2026';
const MARKER = 'verify-member-portal';

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

const stamp = Date.now();
const uniqueDocument = () => String(Math.floor(20_000_000 + Math.random() * 9_000_000));
const today = () => new Intl.DateTimeFormat('en-CA').format(new Date());
const shift = (days) => new Intl.DateTimeFormat('en-CA').format(new Date(Date.now() + days * 86_400_000));

const created = {
  memberIds: [],
  userIds: [],
  planIds: [],
  routineIds: [],
  foreignGymId: null,
  foreignAdminEmail: null,
};

async function createMember(cookie, fullName, email) {
  const { response, json } = await req('/members', {
    method: 'POST',
    cookie,
    body: {
      fullName,
      documentType: 'DNI',
      documentNumber: uniqueDocument(),
      birthDate: null,
      gender: null,
      phone: '+1 555 0100',
      email,
      address: null,
      emergencyName: null,
      emergencyPhone: null,
      joinDate: '2026-01-15',
      notes: null,
      status: 'ACTIVE',
    },
  });
  assert.equal(response.status, 201, JSON.stringify(json));
  created.memberIds.push(json.data.id);
  return json.data;
}

/** Issues the one-time invitation and redeems it, returning a member session. */
async function openPortal(adminCookie, memberId, email) {
  const invite = await req(`/members/${memberId}/portal-access`, { method: 'POST', cookie: adminCookie });
  assert.equal(invite.response.status, 201, JSON.stringify(invite.json));
  assert.ok(invite.json.setupUrl.includes('#token='), 'the invitation carries a one-time token');

  const token = decodeURIComponent(invite.json.setupUrl.split('#token=')[1]);
  const redeemed = await req('/auth/complete-setup', { method: 'POST', body: { token, password: PORTAL_PASSWORD } });
  assert.equal(redeemed.response.status, 200, JSON.stringify(redeemed.json));

  const session = await login(email, PORTAL_PASSWORD);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) created.userIds.push(user.id);
  return session;
}

async function cleanup() {
  console.log('\n[cleanup] Removing test fixtures');
  if (created.memberIds.length > 0) {
    await prisma.paymentRecord.deleteMany({ where: { memberId: { in: created.memberIds } } });
    await prisma.financialObligation.deleteMany({ where: { memberId: { in: created.memberIds } } });
    await prisma.memberSubscription.deleteMany({ where: { memberId: { in: created.memberIds } } });
    await prisma.attendance.deleteMany({ where: { memberId: { in: created.memberIds } } });
    if (created.routineIds.length > 0) {
      await prisma.routineVersion.deleteMany({ where: { routineId: { in: created.routineIds } } });
      await prisma.routine.deleteMany({ where: { id: { in: created.routineIds } } });
    }
    await prisma.instructorMember.deleteMany({ where: { memberId: { in: created.memberIds } } });
    await prisma.memberProfile.deleteMany({ where: { id: { in: created.memberIds } } });
  }
  if (created.userIds.length > 0) {
    await prisma.authToken.deleteMany({ where: { userId: { in: created.userIds } } });
    await prisma.gymMembership.deleteMany({ where: { userId: { in: created.userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: created.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  }
  if (created.planIds.length > 0) {
    await prisma.membershipPlan.deleteMany({ where: { id: { in: created.planIds } } });
  }
  if (created.foreignGymId) {
    await prisma.auditLog.deleteMany({ where: { gymId: created.foreignGymId } });
    await prisma.gym.deleteMany({ where: { id: created.foreignGymId } });
  }
  console.log('  fixtures removed');
}

async function main() {
  console.log('\n[setup] Authenticate and prepare members');
  await prisma.auditLog.deleteMany({ where: { entityType: { in: ['MemberProfile', 'MemberPassword', 'MemberPortalAccess'] }, user: { email: { contains: MARKER } } } });

  const admin = await login('admin@demo.local', DEV_PASSWORD);
  const superAdmin = await login('superadmin@demo.local', DEV_PASSWORD);
  const instructor = await login('instructor@demo.local', DEV_PASSWORD);

  const memberA = await createMember(admin.cookie, 'MP Member A', `${MARKER}-a-${stamp}@test.local`);
  const memberB = await createMember(admin.cookie, 'MP Member B', `${MARKER}-b-${stamp}@test.local`);
  const memberEmpty = await createMember(admin.cookie, 'MP Empty Member', `${MARKER}-e-${stamp}@test.local`);

  const sessionA = await openPortal(admin.cookie, memberA.id, `${MARKER}-a-${stamp}@test.local`);
  const sessionB = await openPortal(admin.cookie, memberB.id, `${MARKER}-b-${stamp}@test.local`);
  const sessionEmpty = await openPortal(admin.cookie, memberEmpty.id, `${MARKER}-e-${stamp}@test.local`);

  assert.equal(sessionA.user.role, 'MEMBER', 'the invitation signs in as MEMBER');
  pass('setup. the administrator can grant portal access and the member sets their own password');

  console.log('\n[1] Dashboard');
  const dashboard = await req('/member-portal/dashboard', { cookie: sessionA.cookie });
  assert.equal(dashboard.response.status, 200, JSON.stringify(dashboard.json));
  const dash = dashboard.json.data;
  assert.equal(dash.member.id, memberA.id, 'the dashboard is the signed-in member');
  assert.equal(dash.gym.id, SEED_GYM_ID, 'the gym comes from the session');
  assert.equal(dash.membership, null, 'no membership yet');
  assert.equal(dash.attendance.thisMonth, 0);
  assert.equal(dash.payments.outstandingTotal, '0.00');
  assert.equal(dash.routine, null);
  assert.ok(dash.notices.some((notice) => notice.id === 'membership-missing'), 'missing membership is reported');
  assert.ok(Array.isArray(dash.access?.reasons), 'the access verdict explains itself');
  pass('1. the signed-in member reads their own dashboard with real (empty) data');

  console.log('\n[2] One member cannot read another');
  const spoofed = await req(`/member-portal/dashboard?memberId=${memberB.id}`, { cookie: sessionA.cookie });
  assert.equal(spoofed.response.status, 200);
  assert.equal(spoofed.json.data.member.id, memberA.id, 'a memberId in the query is ignored');

  const paymentForB = await req('/payments', {
    method: 'POST',
    cookie: admin.cookie,
    body: { memberId: memberB.id, concept: 'MP registration fee B', amount: 25, method: 'CASH' },
  });
  assert.equal(paymentForB.response.status, 201, JSON.stringify(paymentForB.json));
  const paymentB = paymentForB.json.data;

  const crossReceipt = await req(`/payments/me/${paymentB.id}/receipt`, { cookie: sessionA.cookie });
  assert.equal(crossReceipt.response.status, 404, "another member's receipt is invisible");

  const ownReceipt = await req(`/payments/me/${paymentB.id}/receipt`, { cookie: sessionB.cookie });
  assert.equal(ownReceipt.response.status, 200);
  assert.match(ownReceipt.response.headers.get('content-type') ?? '', /application\/pdf/);

  const listA = await req('/member-portal/payments', { cookie: sessionA.cookie });
  const listB = await req('/member-portal/payments', { cookie: sessionB.cookie });
  assert.equal(listA.json.meta.total, 0, "member A does not see member B's payments");
  assert.equal(listB.json.meta.total, 1);
  pass('2. members only ever read their own records; foreign receipts resolve to 404');

  console.log('\n[3] Tenant isolation');
  created.foreignAdminEmail = `${MARKER}-admin-${stamp}@test.local`;
  const gymResponse = await req('/admin/gyms', {
    method: 'POST',
    cookie: superAdmin.cookie,
    body: {
      name: 'Disposable Portal Gym',
      slug: `${MARKER}-${stamp}`,
      email: '',
      phone: '',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      timezone: 'America/Argentina/Buenos_Aires',
      adminFullName: 'Disposable Portal Admin',
      adminEmail: created.foreignAdminEmail,
    },
  });
  assert.equal(gymResponse.response.status, 201, JSON.stringify(gymResponse.json));
  created.foreignGymId = gymResponse.json.data.id;
  await req('/auth/complete-setup', { method: 'POST', body: { token: gymResponse.json.setupToken, password: 'DisposablePass!2026' } });
  const foreignAdmin = await login(created.foreignAdminEmail, 'DisposablePass!2026');

  const foreignMember = await createMember(foreignAdmin.cookie, 'MP Foreign Member', `${MARKER}-f-${stamp}@test.local`);
  const foreignSession = await openPortal(foreignAdmin.cookie, foreignMember.id, `${MARKER}-f-${stamp}@test.local`);

  const foreignDashboard = await req('/member-portal/dashboard', { cookie: foreignSession.cookie });
  assert.equal(foreignDashboard.json.data.gym.id, created.foreignGymId, 'each member sees only their own gym');
  assert.notEqual(foreignDashboard.json.data.gym.id, SEED_GYM_ID);

  const stolenReceipt = await req(`/payments/me/${paymentB.id}/receipt`, { cookie: foreignSession.cookie });
  assert.equal(stolenReceipt.response.status, 404, "a member of another gym cannot read this receipt");
  const foreignPortalPayments = await req('/member-portal/payments', { cookie: foreignSession.cookie });
  assert.equal(foreignPortalPayments.json.meta.total, 0);
  pass('3. the portal is scoped to the session gym; another gym sees nothing of this tenant');

  console.log('\n[4] Role and administrative status are not self-service');
  const roleAttempt = await req('/member-portal/profile', {
    method: 'PATCH',
    cookie: sessionA.cookie,
    body: { fullName: 'MP Member A', role: 'SUPER_ADMIN' },
  });
  assert.equal(roleAttempt.response.status, 400, 'role is rejected');
  const statusAttempt = await req('/member-portal/profile', {
    method: 'PATCH',
    cookie: sessionA.cookie,
    body: { status: 'SUSPENDED' },
  });
  assert.equal(statusAttempt.response.status, 400, 'administrative status is rejected');
  const gymAttempt = await req('/member-portal/profile', {
    method: 'PATCH',
    cookie: sessionA.cookie,
    body: { gymId: created.foreignGymId },
  });
  assert.equal(gymAttempt.response.status, 400, 'the gym cannot be changed');
  const emailAttempt = await req('/member-portal/profile', {
    method: 'PATCH',
    cookie: sessionA.cookie,
    body: { email: 'someone-else@test.local' },
  });
  assert.equal(emailAttempt.response.status, 400, 'the sign-in email is not self-service');

  const stored = await prisma.user.findUniqueOrThrow({
    where: { id: sessionA.user.id },
    select: { role: true, memberProfile: { select: { status: true, gymId: true } } },
  });
  assert.equal(stored.role, 'MEMBER');
  assert.equal(stored.memberProfile.status, 'ACTIVE');
  assert.equal(stored.memberProfile.gymId, SEED_GYM_ID);
  pass('4. a member cannot change their role, status, email or gym (rejected, and unchanged in PostgreSQL)');

  console.log('\n[5] Profile edit and password change are the only member mutations');
  const profilePatch = await req('/member-portal/profile', {
    method: 'PATCH',
    cookie: sessionA.cookie,
    body: { fullName: 'MP Member A Updated', phone: '+1 555 0199' },
  });
  assert.equal(profilePatch.response.status, 200, JSON.stringify(profilePatch.json));
  assert.equal(profilePatch.json.data.fullName, 'MP Member A Updated');
  const profileRead = await req('/member-portal/profile', { cookie: sessionA.cookie });
  assert.equal(profileRead.json.data.phone, '+1 555 0199', 'the change persists');

  const auditRow = await prisma.auditLog.findFirst({
    where: { userId: sessionA.user.id, entityType: 'MemberProfile' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(auditRow, 'the profile change is audited');

  const wrongPassword = await req('/member-portal/password', {
    method: 'PATCH',
    cookie: sessionA.cookie,
    body: { currentPassword: 'definitely-wrong', newPassword: 'AnotherPass!2026' },
  });
  assert.equal(wrongPassword.response.status, 400, 'the current password is verified');
  const weakPassword = await req('/member-portal/password', {
    method: 'PATCH',
    cookie: sessionA.cookie,
    body: { currentPassword: PORTAL_PASSWORD, newPassword: 'short' },
  });
  assert.equal(weakPassword.response.status, 400, 'the password policy is enforced');
  const passwordChange = await req('/member-portal/password', {
    method: 'PATCH',
    cookie: sessionA.cookie,
    body: { currentPassword: PORTAL_PASSWORD, newPassword: 'AnotherPass!2026' },
  });
  assert.equal(passwordChange.response.status, 204);
  await login(`${MARKER}-a-${stamp}@test.local`, 'AnotherPass!2026');
  pass('5. name/phone and password are editable; the current password and the policy are enforced; changes are audited');

  console.log('\n[6] Memberships and payments are read-only');
  const planResponse = await req('/membership-plans', {
    method: 'POST',
    cookie: admin.cookie,
    body: { name: `MP Plan ${stamp}`, description: null, price: 100, durationValue: 1, durationUnit: 'MONTH', conditions: null },
  });
  assert.equal(planResponse.response.status, 201, JSON.stringify(planResponse.json));
  const plan = planResponse.json.data;
  created.planIds.push(plan.id);

  const subscriptionResponse = await req('/subscriptions', {
    method: 'POST',
    cookie: admin.cookie,
    body: { memberId: memberA.id, planId: plan.id, startDate: today(), agreedPrice: 100, discountAmount: 0 },
  });
  assert.equal(subscriptionResponse.response.status, 201, JSON.stringify(subscriptionResponse.json));
  const subscription = subscriptionResponse.json.data;

  const memberWrites = [
    ['POST /subscriptions', '/subscriptions', 'POST', { memberId: memberA.id, planId: plan.id }],
    ['PATCH /subscriptions/:id', `/subscriptions/${subscription.id}`, 'PATCH', { status: 'CANCELLED' }],
    ['POST /payments', '/payments', 'POST', { memberId: memberA.id, concept: 'x', amount: 5, method: 'CASH' }],
    ['POST /financial-obligations', '/financial-obligations', 'POST', { memberId: memberA.id, concept: 'x', originalAmount: 5, dueDate: today() }],
    ['POST /membership-plans', '/membership-plans', 'POST', { name: 'x', price: 5, durationValue: 1, durationUnit: 'MONTH' }],
  ];
  for (const [label, path, method, body] of memberWrites) {
    const attempt = await req(path, { method, cookie: sessionA.cookie, body });
    assert.equal(attempt.response.status, 403, `${label} must be refused for a member`);
  }

  const portalMutations = [
    ['POST', '/member-portal/membership'],
    ['PATCH', '/member-portal/membership'],
    ['POST', '/member-portal/payments'],
    ['PATCH', '/member-portal/payments'],
    ['POST', '/member-portal/attendances'],
    ['POST', '/member-portal/notifications'],
  ];
  for (const [method, path] of portalMutations) {
    const attempt = await req(path, { method, cookie: sessionA.cookie, body: {} });
    assert.ok([404, 405].includes(attempt.response.status), `${method} ${path} has no handler (got ${attempt.response.status})`);
  }

  const membershipView = await req('/member-portal/membership', { cookie: sessionA.cookie });
  assert.equal(membershipView.response.status, 200);
  assert.equal(membershipView.json.data.current.planName, plan.name);
  assert.equal(membershipView.json.data.current.finalPrice, '100.00');
  assert.equal(membershipView.json.data.renewal.required, false);
  pass('6. members cannot create or change memberships, plans or payments, and the portal exposes no write route for them');

  console.log('\n[7] Attendance and routines stay read-only');
  const attendanceWrites = [
    ['POST /attendance/manual', '/attendance/manual', { memberId: memberA.id }],
    ['POST /attendance/qr', '/attendance/qr', { code: 'gym-saas:member:whatever' }],
  ];
  for (const [label, path, body] of attendanceWrites) {
    const attempt = await req(path, { method: 'POST', cookie: sessionA.cookie, body });
    assert.equal(attempt.response.status, 403, `${label} is reserved for the reception desk`);
  }

  const exercise = await prisma.exercise.findFirst({ where: { gymId: SEED_GYM_ID }, select: { id: true } });
  const routineResponse = await req('/routines', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      name: `MP Routine ${stamp}`,
      memberId: memberA.id,
      startDate: today(),
      days: [{ name: 'Day 1', exercises: [{ exerciseId: exercise.id, sets: 3, reps: '10' }] }],
      activate: true,
    },
  });
  assert.equal(routineResponse.response.status, 201, JSON.stringify(routineResponse.json));
  const routine = routineResponse.json.data;
  created.routineIds.push(routine.id);

  const routineWrites = [
    ['POST /routines', '/routines', 'POST', { name: 'x', memberId: memberA.id, startDate: today(), days: [{ name: 'D', exercises: [{ exerciseId: exercise.id, reps: '10' }] }] }],
    ['PATCH /routines/:id', `/routines/${routine.id}`, 'PATCH', { name: 'Hijacked' }],
    ['POST /routines/:id/activate', `/routines/${routine.id}/activate`, 'POST', {}],
    ['POST /routines/:id/archive', `/routines/${routine.id}/archive`, 'POST', {}],
  ];
  for (const [label, path, method, body] of routineWrites) {
    const attempt = await req(path, { method, cookie: sessionA.cookie, body });
    assert.equal(attempt.response.status, 403, `${label} must be refused for a member`);
  }

  const portalRoutine = await req('/member-portal/routine', { cookie: sessionA.cookie });
  assert.equal(portalRoutine.response.status, 200);
  assert.equal(portalRoutine.json.data.length, 1);
  assert.equal(portalRoutine.json.data[0].id, routine.id);
  assert.equal(portalRoutine.json.data[0].status, 'ACTIVE');
  assert.ok(Array.isArray(portalRoutine.json.data[0].days), 'the member reads the full prescription');
  pass('7. members read their routines only: no create, edit, activate or archive, and no attendance writes');

  console.log('\n[8] Filters and server-side pagination');
  // Historical fixtures: 12 entries, one per day, so filters have something real to slice.
  for (let index = 0; index < 12; index += 1) {
    await prisma.attendance.create({
      data: {
        gymId: SEED_GYM_ID,
        memberId: memberA.id,
        checkInTime: new Date(Date.now() - (index + 1) * 86_400_000),
        method: index % 4 === 0 ? 'QR' : 'MANUAL',
        status: 'PRESENT',
        result: 'ALLOWED',
        membershipStatusAtCheckIn: 'ACTIVE',
      },
    });
  }

  const firstPage = await req('/member-portal/attendances?page=1&pageSize=5', { cookie: sessionA.cookie });
  assert.equal(firstPage.response.status, 200);
  assert.equal(firstPage.json.data.length, 5, 'the page size is honoured');
  assert.equal(firstPage.json.meta.total, 12);
  assert.equal(firstPage.json.meta.totalPages, 3);
  assert.ok(
    new Date(firstPage.json.data[0].checkInTime) > new Date(firstPage.json.data[4].checkInTime),
    'newest first',
  );

  const lastPage = await req('/member-portal/attendances?page=3&pageSize=5', { cookie: sessionA.cookie });
  assert.equal(lastPage.json.data.length, 2);
  assert.equal(new Set([...firstPage.json.data, ...lastPage.json.data].map((row) => row.id)).size, 7, 'pages do not overlap');

  const range = await req(`/member-portal/attendances?from=${shift(-5)}&to=${shift(-1)}&pageSize=50`, { cookie: sessionA.cookie });
  assert.equal(range.json.meta.total, 5, 'the date range is applied in the gym timezone');

  const qrOnly = await req('/member-portal/attendances?method=QR&pageSize=50', { cookie: sessionA.cookie });
  assert.equal(qrOnly.json.meta.total, 3);
  assert.ok(qrOnly.json.data.every((row) => row.method === 'QR'));

  const badRange = await req(`/member-portal/attendances?from=${shift(-1)}&to=${shift(-5)}`, { cookie: sessionA.cookie });
  assert.equal(badRange.response.status, 400, 'an inverted range is rejected');
  pass('8. filters (date range, method) and pagination run on the server, newest first and without overlap');

  console.log('\n[9] Money matches the financial module');
  const obligations = await req(`/financial-obligations?memberId=${memberA.id}&pageSize=50`, { cookie: admin.cookie });
  assert.equal(obligations.response.status, 200);
  const obligation = obligations.json.data[0];
  assert.ok(obligation, 'assigning a membership created a receivable');
  assert.equal(Number(obligation.originalAmount), 100);

  const partial = await req('/payments', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      memberId: memberA.id,
      obligationId: obligation.id,
      subscriptionId: subscription.id,
      concept: 'Partial membership payment',
      amount: 40,
      method: 'CASH',
      paidAt: new Date().toISOString(),
    },
  });
  assert.equal(partial.response.status, 201, JSON.stringify(partial.json));
  const paymentA = partial.json.data;

  const afterPartial = await req('/member-portal/payments', { cookie: sessionA.cookie });
  assert.equal(afterPartial.json.summary.paidInPeriod, '40.00');
  assert.equal(afterPartial.json.summary.outstandingTotal, '60.00');
  assert.equal(afterPartial.json.summary.openObligations, 1);

  const storedObligation = await prisma.financialObligation.findUniqueOrThrow({ where: { id: obligation.id } });
  assert.equal(
    Number(storedObligation.originalAmount) - Number(storedObligation.paidAmount),
    Number(afterPartial.json.summary.outstandingTotal),
    'the portal balance equals original minus paid',
  );

  const voided = await req(`/payments/${paymentA.id}/void`, {
    method: 'POST',
    cookie: admin.cookie,
    body: { reason: 'verify-member-portal: annulment test' },
  });
  assert.equal(voided.response.status, 200, JSON.stringify(voided.json));

  const afterVoid = await req('/member-portal/payments', { cookie: sessionA.cookie });
  assert.equal(afterVoid.response.status, 200, JSON.stringify(afterVoid.json));
  console.log('DEBUG keys:', Object.keys(afterVoid.json ?? {}), JSON.stringify(afterVoid.json).slice(0, 400));
  assert.equal(afterVoid.json.summary.paidInPeriod, '0.00', 'a voided movement is not collected');
  assert.equal(afterVoid.json.summary.outstandingTotal, '100.00', 'the debt comes back');
  assert.equal(afterVoid.json.meta.total, 1, 'the movement stays in the history');
  assert.equal(afterVoid.json.data[0].status, 'VOIDED');

  const threeMore = [];
  for (const [amount, days] of [[10, 1], [20, 2], [30, 3]]) {
    const response = await req('/payments', {
      method: 'POST',
      cookie: admin.cookie,
      body: { memberId: memberA.id, concept: 'MP extra', amount, method: 'TRANSFER', paidAt: new Date(Date.now() - days * 86_400_000).toISOString() },
    });
    assert.equal(response.response.status, 201, JSON.stringify(response.json));
    threeMore.push(response.json.data);
  }

  const pagedPayments = await req('/member-portal/payments?page=1&pageSize=2', { cookie: sessionA.cookie });
  assert.equal(pagedPayments.json.data.length, 2);
  assert.equal(pagedPayments.json.meta.total, 4);
  assert.equal(pagedPayments.json.meta.totalPages, 2);
  assert.equal(pagedPayments.json.summary.paidInPeriod, '60.00', 'only effective movements are summed');

  const transferOnly = await req('/member-portal/payments?method=TRANSFER&pageSize=50', { cookie: sessionA.cookie });
  assert.equal(transferOnly.json.meta.total, 3);
  assert.equal(transferOnly.json.summary.paidInPeriod, '60.00');

  const dateFiltered = await req(`/member-portal/payments?from=${shift(-2)}&to=${shift(-2)}&pageSize=50`, { cookie: sessionA.cookie });
  assert.equal(dateFiltered.json.meta.total, 1);
  assert.equal(dateFiltered.json.summary.paidInPeriod, '20.00');

  const voidedOnly = await req('/member-portal/payments?status=VOIDED&pageSize=50', { cookie: sessionA.cookie });
  assert.equal(voidedOnly.json.meta.total, 1);
  pass('9. partial payments, balances and period totals come from the financial movements (annulments excluded)');

  console.log('\n[10] Membership history and preserved prices');
  const renewal = await req(`/subscriptions/${subscription.id}/renew`, {
    method: 'POST',
    cookie: admin.cookie,
    body: { planId: plan.id, startDate: shift(30), agreedPrice: 100, discountAmount: 0, startsAfterCurrent: true },
  });
  assert.equal(renewal.response.status, 201, JSON.stringify(renewal.json));

  const planPriceChange = await req(`/membership-plans/${plan.id}`, { method: 'PATCH', cookie: admin.cookie, body: { price: 150 } });
  assert.equal(planPriceChange.response.status, 200, JSON.stringify(planPriceChange.json));

  const history = await req('/member-portal/membership/history?page=1&pageSize=10', { cookie: sessionA.cookie });
  assert.equal(history.response.status, 200);
  assert.equal(history.json.meta.total, 2);
  assert.ok(
    new Date(history.json.data[0].startDate) >= new Date(history.json.data[1].startDate),
    'the history is newest first',
  );
  assert.ok(history.json.data.every((row) => row.finalPrice === '100.00'), 'later plan price changes do not rewrite history');
  assert.ok(history.json.data.every((row) => ['ACTIVE', 'EXPIRING_SOON', 'PENDING', 'EXPIRED', 'CANCELLED'].includes(row.state)));

  const membershipPage = await req('/member-portal/membership', { cookie: sessionA.cookie });
  assert.ok(membershipPage.json.data.current, 'there is a current membership to show');
  assert.equal(membershipPage.json.data.counts.total, 2);
  pass('10. the membership history keeps every period and its agreed price after the plan changed');

  console.log('\n[11] Authorization for every role');
  const paths = [
    '/member-portal/dashboard',
    '/member-portal/profile',
    '/member-portal/routine',
    '/member-portal/attendances',
    '/member-portal/membership',
    '/member-portal/membership/history',
    '/member-portal/payments',
    '/member-portal/notifications',
  ];
  for (const path of paths) {
    const anonymous = await req(path);
    assert.equal(anonymous.response.status, 401, `${path} requires a session`);
    const asAdmin = await req(path, { cookie: admin.cookie });
    assert.equal(asAdmin.response.status, 403, `${path} is member-only (admin)`);
    const asInstructor = await req(path, { cookie: instructor.cookie });
    assert.equal(asInstructor.response.status, 403, `${path} is member-only (instructor)`);
  }
  pass('11. anonymous, gym administrators and instructors are all refused by the portal');

  console.log('\n[12] A member with no routine, payments or attendances');
  const emptyDash = await req('/member-portal/dashboard', { cookie: sessionEmpty.cookie });
  assert.equal(emptyDash.response.status, 200);
  assert.equal(emptyDash.json.data.membership, null);
  assert.equal(emptyDash.json.data.routine, null);
  assert.equal(emptyDash.json.data.payments.lastPayment, null);
  assert.equal(emptyDash.json.data.attendance.total, 0);

  const emptyAttendances = await req('/member-portal/attendances', { cookie: sessionEmpty.cookie });
  assert.equal(emptyAttendances.json.data.length, 0);
  assert.equal(emptyAttendances.json.meta.total, 0);

  const emptyPayments = await req('/member-portal/payments', { cookie: sessionEmpty.cookie });
  assert.equal(emptyPayments.json.data.length, 0);
  assert.equal(emptyPayments.json.summary.paidInPeriod, '0.00');
  assert.equal(emptyPayments.json.summary.outstandingTotal, '0.00');

  const emptyRoutine = await req('/member-portal/routine', { cookie: sessionEmpty.cookie });
  assert.equal(emptyRoutine.json.data.length, 0);

  const emptyMembership = await req('/member-portal/membership', { cookie: sessionEmpty.cookie });
  assert.equal(emptyMembership.json.data.current, null);
  assert.equal(emptyMembership.json.data.renewal.required, true);

  const emptyNotices = await req('/member-portal/notifications', { cookie: sessionEmpty.cookie });
  assert.equal(emptyNotices.response.status, 200);
  assert.ok(emptyNotices.json.data.some((notice) => notice.kind === 'MEMBERSHIP'));
  assert.equal(emptyNotices.json.meta.channels.email, false, 'no delivery channel is claimed');
  pass('12. a member without routine, payments or attendances gets coherent empty states, not fake data');

  console.log('\n[13] Portal access is refused where it could not work');
  const noEmail = await prisma.memberProfile.findFirst({ where: { id: memberEmpty.id }, select: { userId: true } });
  await prisma.user.update({ where: { id: noEmail.userId }, data: { email: null } });
  const inviteWithoutEmail = await req(`/members/${memberEmpty.id}/portal-access`, { method: 'POST', cookie: admin.cookie });
  assert.equal(inviteWithoutEmail.response.status, 400, 'an account without email cannot receive an invitation');
  await prisma.user.update({ where: { id: noEmail.userId }, data: { email: `${MARKER}-e-${stamp}@test.local` } });

  await prisma.memberProfile.update({ where: { id: memberB.id }, data: { status: 'SUSPENDED' } });
  const inviteSuspended = await req(`/members/${memberB.id}/portal-access`, { method: 'POST', cookie: admin.cookie });
  assert.equal(inviteSuspended.response.status, 409, 'a suspended member is not granted new access');
  pass('13. invitations require an email and are refused for suspended members');

  console.log(`\nRESULT: ${results.length} checks passed, ${skipped.length} skipped`);
  for (const label of results) console.log(`- ${label}`);
  for (const label of skipped) console.log(`- SKIPPED: ${label}`);
}

try {
  await main();
} catch (error) {
  console.error(`\n✗ FAILED: ${error instanceof Error ? error.message : String(error)}`);
  await cleanup();
  await prisma.$disconnect();
  process.exit(1);
}

await cleanup();
await prisma.$disconnect();
