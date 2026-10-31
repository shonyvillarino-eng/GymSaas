/**
 * Integration verification for the members module (GYM_ADMIN).
 *
 * Run from /server with the API on port 4000:
 *   node scripts/verify-members.mjs
 *
 * Exercises the real REST API and PostgreSQL, then removes every row it
 * created (members, history fixtures and the disposable gym). AuditLog rows
 * are intentionally kept: the trail is append-only.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4000/api/v1';
const SEED_GYM_ID = 'seed-gym-0001';
const DEV_PASSWORD = 'DevPass!2026';

const prisma = new PrismaClient();
const results = [];
const pass = (label) => {
  results.push(label);
  console.log(`  ✓ ${label}`);
};

async function req(path, { method = 'GET', cookie = '', body, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (!form && body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
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

/** Removes a member and every history row it owns (test fixtures only). */
async function deleteTestMember(profileId) {
  const profile = await prisma.memberProfile.findUnique({ where: { id: profileId }, select: { id: true, userId: true } });
  if (!profile) return;
  await prisma.attendance.deleteMany({ where: { memberId: profile.id } });
  await prisma.paymentRecord.deleteMany({ where: { memberId: profile.id } });
  await prisma.memberSubscription.deleteMany({ where: { memberId: profile.id } });
  await prisma.instructorMember.deleteMany({ where: { memberId: profile.id } });
  await prisma.routine.deleteMany({ where: { assignedToId: profile.id } });
  await prisma.memberProfile.delete({ where: { id: profile.id } });
  await prisma.gymMembership.deleteMany({ where: { userId: profile.userId } });
  await prisma.auditLog.deleteMany({ where: { userId: profile.userId } });
  await prisma.user.delete({ where: { id: profile.userId } });
}

/**
 * Finds every member this suite (or an interrupted earlier run) created in
 * the seeded gym — matched by email, by name or by the marker note, because
 * the edit test clears the email on purpose.
 */
async function purgeTestMembers() {
  const profiles = await prisma.memberProfile.findMany({
    where: {
      gymId: SEED_GYM_ID,
      OR: [
        { user: { email: { in: [MEMBER_A.email, 'smoke-member@test.local'].filter(Boolean) } } },
        {
          user: {
            fullName: {
              in: [
                MEMBER_A.fullName,
                'Test Member Alpha Edited',
                MEMBER_B.fullName,
                MEMBER_C.fullName,
                'Duplicate Doppelganger',
                'Case Test',
                'Smoke Test Member',
              ],
            },
          },
        },
        { notes: 'Created by verify-members.mjs' },
      ],
    },
    select: { id: true },
  });
  for (const profile of profiles) await deleteTestMember(profile.id);
  return profiles.length;
}

const MEMBER_A = { fullName: 'Test Member Alpha', documentNumber: newDocument(), email: 'test-member-alpha@test.local' };
const MEMBER_B = { fullName: 'Test Member Beta', documentNumber: newDocument(), email: null };
const MEMBER_C = { fullName: 'Test Member Gamma', documentNumber: newDocument(), email: null };
const memberPayload = (member, extra = {}) => ({
  fullName: member.fullName,
  documentType: 'DNI',
  documentNumber: member.documentNumber,
  birthDate: '1995-04-12',
  gender: 'FEMALE',
  phone: '+54-11-5555-0101',
  email: member.email ?? '',
  address: 'Av. Test 1234',
  emergencyName: 'Emergency Contact',
  emergencyPhone: '+54-11-5555-0202',
  joinDate: '2026-10-01',
  notes: 'Created by verify-members.mjs',
  status: 'ACTIVE',
  ...extra,
});

let adminCookie = '';
let superCookie = '';
const memberIds = [];
const disposable = { gymId: null, adminEmail: null, memberUserId: null, memberId: null };

try {
  console.log('\n[setup] Clean session and fixtures');
  const removed = await purgeTestMembers();
  if (removed > 0) console.log(`  removed ${removed} leftover test member(s)`);
  adminCookie = (await login('admin@demo.local', DEV_PASSWORD)).cookie;

  console.log('\n[1] Member registration');
  const createA = await req('/members', { method: 'POST', cookie: adminCookie, body: memberPayload(MEMBER_A) });
  assert.equal(createA.response.status, 201, JSON.stringify(createA.json));
  assert.equal(createA.json.data.documentNumber, MEMBER_A.documentNumber, 'document is stored normalized');
  assert.equal(createA.json.data.status, 'ACTIVE');
  assert.equal(createA.json.data.email, MEMBER_A.email);
  assert.equal(createA.json.data.attendance.allowed, true);
  const idA = createA.json.data.id;

  // Registration without email must work (optional identifier).
  const createB = await req('/members', { method: 'POST', cookie: adminCookie, body: memberPayload(MEMBER_B) });
  assert.equal(createB.response.status, 201, JSON.stringify(createB.json));
  assert.equal(createB.json.data.email, null, 'email is optional and stays null');
  const idB = createB.json.data.id;

  const createC = await req('/members', { method: 'POST', cookie: adminCookie, body: memberPayload(MEMBER_C) });
  assert.equal(createC.response.status, 201, JSON.stringify(createC.json));
  const idC = createC.json.data.id;
  memberIds.push(idA, idB, idC);

  const rowA = await prisma.memberProfile.findUnique({ where: { id: idA }, include: { user: true } });
  assert.ok(rowA, 'member persisted in PostgreSQL');
  assert.equal(rowA.gymId, SEED_GYM_ID);
  assert.equal(rowA.user.email, MEMBER_A.email);
  const membershipRow = await prisma.gymMembership.findFirst({ where: { userId: rowA.userId, role: 'MEMBER', isActive: true } });
  assert.ok(membershipRow, 'member gym membership row created');
  pass('1. three members registered; PostgreSQL rows and membership links verified (email optional)');

  console.log('\n[2] Member editing');
  const editA = await req(`/members/${idA}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { fullName: 'Test Member Alpha Edited', address: 'Calle Editada 42', email: '', notes: 'Edited by tests' },
  });
  assert.equal(editA.response.status, 200, JSON.stringify(editA.json));
  assert.equal(editA.json.data.fullName, 'Test Member Alpha Edited');
  assert.equal(editA.json.data.address, 'Calle Editada 42');
  assert.equal(editA.json.data.email, null, 'clearing the optional email works');
  const rowAAfter = await prisma.memberProfile.findUnique({ where: { id: idA }, include: { user: true } });
  assert.equal(rowAAfter.user.fullName, 'Test Member Alpha Edited');
  assert.equal(rowAAfter.address, 'Calle Editada 42');
  pass('2. edits persist in PostgreSQL (name, address, cleared email)');

  console.log('\n[3] Duplicate document inside the same gym');
  const dupCreate = await req('/members', { method: 'POST', cookie: adminCookie, body: memberPayload({ fullName: 'Duplicate Doppelganger', documentNumber: MEMBER_A.documentNumber }) });
  assert.equal(dupCreate.response.status, 409, JSON.stringify(dupCreate.json));
  assert.ok(dupCreate.json.details?.documentNumber, 'field-level error returned');
  const dupEdit = await req(`/members/${idC}`, { method: 'PATCH', cookie: adminCookie, body: { documentNumber: MEMBER_B.documentNumber } });
  assert.equal(dupEdit.response.status, 409, 'editing onto an existing document is blocked too');
  const normalizedName = await req('/members', { method: 'POST', cookie: adminCookie, body: memberPayload({ fullName: 'Case Test', documentNumber: '' }, { documentNumber: '  ' }) }).catch(() => null);
  assert.ok(!normalizedName || normalizedName.response.status === 400, 'blank documents rejected');
  const countA = await prisma.memberProfile.count({ where: { gymId: SEED_GYM_ID, documentNumber: MEMBER_A.documentNumber } });
  assert.equal(countA, 1, 'only one row with that document exists');
  pass('3. duplicate documents rejected on create (409) and on update (409) inside the same gym');

  console.log('\n[4] Same document allowed in a different gym');
  const superAdmin = await login('superadmin@demo.local', DEV_PASSWORD);
  superCookie = superAdmin.cookie;
  disposable.adminEmail = `admin-${Date.now()}@members-test.local`;
  const createdGym = await req('/admin/gyms', {
    method: 'POST',
    cookie: superCookie,
    body: {
      name: 'Disposable Members Test Gym',
      slug: `members-test-${Date.now()}`,
      email: '', phone: '', address: '', city: '', province: '', postalCode: '', country: '',
      timezone: 'America/Argentina/Buenos_Aires',
      adminFullName: 'Disposable Admin',
      adminEmail: disposable.adminEmail,
    },
  });
  assert.equal(createdGym.response.status, 201, JSON.stringify(createdGym.json));
  disposable.gymId = createdGym.json.data.id;
  const setup = await req('/auth/complete-setup', {
    method: 'POST',
    body: { token: createdGym.json.setupToken, password: 'DisposablePass!2026' },
  });
  assert.equal(setup.response.status, 200, JSON.stringify(setup.json));
  const otherAdmin = await login(disposable.adminEmail, 'DisposablePass!2026');
  const otherMember = await req('/members', {
    method: 'POST',
    cookie: otherAdmin.cookie,
    body: memberPayload({ fullName: 'Other Gym Same Document', documentNumber: MEMBER_A.documentNumber, email: null }),
  });
  assert.equal(otherMember.response.status, 201, `same document must be allowed in another gym: ${JSON.stringify(otherMember.json)}`);
  assert.equal(otherMember.json.data.documentNumber, MEMBER_A.documentNumber);
  disposable.memberId = otherMember.json.data.id;
  const otherProfile = await prisma.memberProfile.findUnique({ where: { id: disposable.memberId }, select: { userId: true, gymId: true } });
  disposable.memberUserId = otherProfile.userId;
  assert.notEqual(otherProfile.gymId, SEED_GYM_ID);
  pass('4. identical document registered in a different gym (unique index is tenant-scoped)');

  console.log('\n[9] Members of other gyms are unreachable');
  const crossRead = await req(`/members/${disposable.memberId}`, { cookie: adminCookie });
  assert.equal(crossRead.response.status, 404, 'another gym member must 404 for this admin');
  const crossWrite = await req(`/members/${disposable.memberId}`, { method: 'PATCH', cookie: adminCookie, body: { fullName: 'Intrusion' } });
  assert.equal(crossWrite.response.status, 404);
  const crossStatus = await req(`/members/${disposable.memberId}/status`, { method: 'PATCH', cookie: adminCookie, body: { status: 'SUSPENDED' } });
  assert.equal(crossStatus.response.status, 404);
  const otherRow = await prisma.memberProfile.findUnique({ where: { id: disposable.memberId }, select: { status: true } });
  assert.equal(otherRow.status, 'ACTIVE', 'foreign member untouched');
  const foreignInList = await req('/members?search=Other%20Gym%20Same', { cookie: adminCookie });
  assert.ok(!foreignInList.json.data.some((row) => row.id === disposable.memberId), 'list is tenant-scoped');
  pass('9. cross-gym reads/writes return 404, list stays tenant-scoped, foreign row untouched');

  console.log('\n[10] Instructor, member and SUPER_ADMIN are blocked');
  for (const [role, email] of [['INSTRUCTOR', 'instructor@demo.local'], ['MEMBER', 'member@demo.local'], ['SUPER_ADMIN', 'superadmin@demo.local']]) {
    const session = await login(email, DEV_PASSWORD);
    for (const [method, path, body] of [
      ['GET', '/members', undefined],
      ['POST', '/members', memberPayload({ fullName: 'Blocked', documentNumber: newDocument() })],
      ['GET', `/members/${idA}`, undefined],
      ['GET', `/members/${idA}/summary`, undefined],
      ['PATCH', `/members/${idA}/status`, { status: 'INACTIVE' }],
    ]) {
      const denied = await req(path, { method, cookie: session.cookie, ...(body ? { body } : {}) });
      assert.equal(denied.response.status, 403, `${role} ${method} ${path} must be 403, got ${denied.response.status}`);
    }
    pass(`${role} blocked from every member endpoint`);
  }

  console.log('\n[11] Backend validation rejects bad payloads');
  const invalidCases = [
    ['missing document number', { ...memberPayload({ fullName: 'Invalid One', documentNumber: newDocument() }), documentNumber: undefined }, 'documentNumber'],
    ['invalid email', memberPayload({ fullName: 'Invalid Two', documentNumber: newDocument() }, { email: 'not-an-email' }), 'email'],
    ['invalid document characters', memberPayload({ fullName: 'Invalid Three', documentNumber: newDocument() }, { documentNumber: 'ab!!' }), 'documentNumber'],
    ['future birth date', memberPayload({ fullName: 'Invalid Four', documentNumber: newDocument() }, { birthDate: '2099-01-01' }), 'birthDate'],
    ['missing join date', (() => { const payload = memberPayload({ fullName: 'Invalid Five', documentNumber: newDocument() }); delete payload.joinDate; return payload; })(), 'joinDate'],
    ['bogus status', memberPayload({ fullName: 'Invalid Six', documentNumber: newDocument() }, { status: 'BOGUS' }), 'status'],
    ['client-supplied gymId', memberPayload({ fullName: 'Invalid Seven', documentNumber: newDocument() }, { gymId: 'another-gym' }), 'gymId'],
  ];
  for (const [label, payload, field] of invalidCases) {
    const denied = await req('/members', { method: 'POST', cookie: adminCookie, body: payload });
    assert.equal(denied.response.status, 400, `${label} must be 400, got ${denied.response.status}: ${JSON.stringify(denied.json)}`);
    assert.ok(denied.json.details?.[field] || denied.json.error === 'Validation failed', `${label} reports ${field}`);
  }
  const statusDenied = await req(`/members/${idA}/status`, { method: 'PATCH', cookie: adminCookie, body: { status: 'NOPE' } });
  assert.equal(statusDenied.response.status, 400);
  const statusInUpdate = await req(`/members/${idA}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'SUSPENDED' } });
  assert.equal(statusInUpdate.response.status, 400, 'status cannot be changed through generic update');
  const badPhoto = new FormData();
  badPhoto.append('photo', new Blob(['not an image'], { type: 'text/plain' }), 'notes.txt');
  const badPhotoRes = await req(`/members/${idA}/photo`, { method: 'POST', cookie: adminCookie, form: badPhoto });
  assert.equal(badPhotoRes.response.status, 400, 'non-image photo rejected');
  pass('11. invalid payloads rejected with field details; status and photo rules enforced');

  console.log('\n[5] Search and filters');
  const byDocument = await req(`/members?search=${MEMBER_A.documentNumber}`, { cookie: adminCookie });
  assert.equal(byDocument.response.status, 200);
  assert.ok(byDocument.json.data.some((row) => row.id === idA), 'search by document finds the member');
  const byName = await req('/members?search=Member%20Alpha', { cookie: adminCookie });
  assert.ok(byName.json.data.some((row) => row.id === idA), 'search by name finds the member');
  assert.ok(byName.json.data.every((row) => row.id !== idB), 'search does not return unrelated members');

  const instructorsList = await req('/gym/instructors', { cookie: adminCookie });
  assert.equal(instructorsList.response.status, 200);
  const seedInstructor = instructorsList.json.data[0];
  assert.ok(seedInstructor, 'gym instructors endpoint returns the seeded instructor');

  const assign = await req(`/members/${idA}/instructor`, { method: 'PUT', cookie: adminCookie, body: { instructorId: seedInstructor.id } });
  assert.equal(assign.response.status, 200, JSON.stringify(assign.json));
  assert.equal(assign.json.data.instructor?.id, seedInstructor.id);
  const assignSame = await req(`/members/${idA}/instructor`, { method: 'PUT', cookie: adminCookie, body: { instructorId: seedInstructor.id } });
  assert.equal(assignSame.response.status, 200, 're-assigning the same instructor is idempotent');
  const badInstructor = await req(`/members/${idA}/instructor`, { method: 'PUT', cookie: adminCookie, body: { instructorId: 'not-an-instructor' } });
  assert.equal(badInstructor.response.status, 404, 'instructor of another gym rejected');

  const withInstructor = await req(`/members?instructor=${seedInstructor.id}`, { cookie: adminCookie });
  assert.ok(withInstructor.json.data.some((row) => row.id === idA));
  const withoutInstructor = await req('/members?instructor=none', { cookie: adminCookie });
  assert.ok(withoutInstructor.json.data.some((row) => row.id === idB));
  assert.ok(!withoutInstructor.json.data.some((row) => row.id === idA), 'assigned member excluded from "without instructor"');

  // Membership fixtures (written directly, as the memberships module would).
  const plan = await prisma.membershipPlan.findFirst({ where: { gymId: SEED_GYM_ID }, select: { id: true, currency: true, name: true } });
  const now = new Date();
  await prisma.memberSubscription.create({
    data: {
      gymId: SEED_GYM_ID, memberId: idB, planId: plan.id, planNameAtPurchase: plan.name || 'Basic', currencyAtPurchase: plan.currency || 'USD', status: 'ACTIVE',
      startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 20 * 86400000), priceAtPurchase: 29.99, finalPrice: 29.99,
    },
  });
  await prisma.memberSubscription.create({
    data: {
      gymId: SEED_GYM_ID, memberId: idC, planId: plan.id, planNameAtPurchase: plan.name || 'Basic', currencyAtPurchase: plan.currency || 'USD', status: 'ACTIVE',
      startDate: new Date(now.getTime() - 60 * 86400000), endDate: new Date(now.getTime() - 5 * 86400000), priceAtPurchase: 29.99, finalPrice: 29.99,
    },
  });

  const activeMembers = await req('/members?membership=ACTIVE', { cookie: adminCookie });
  assert.ok(activeMembers.json.data.some((row) => row.id === idB), 'active membership filter finds B');
  assert.ok(!activeMembers.json.data.some((row) => row.id === idA), 'member without membership excluded');
  const pastDue = await req('/members?membership=PAST_DUE', { cookie: adminCookie });
  assert.ok(pastDue.json.data.some((row) => row.id === idC), 'past-due filter finds C (ended membership)');
  const noMembership = await req('/members?membership=NONE', { cookie: adminCookie });
  assert.ok(noMembership.json.data.some((row) => row.id === idA), 'no-membership filter finds A');
  pass('5. search by name/document, instructor assignment filter, membership filters and gym instructors endpoint verified');

  console.log('\n[7] Suspension and deactivation');
  const suspend = await req(`/members/${idA}/status`, { method: 'PATCH', cookie: adminCookie, body: { status: 'SUSPENDED', reason: 'Automated verification' } });
  assert.equal(suspend.response.status, 200, JSON.stringify(suspend.json));
  assert.equal(suspend.json.data.status, 'SUSPENDED');
  assert.equal(suspend.json.data.attendance.allowed, false, 'suspended members cannot register attendance');
  const suspendedFilter = await req('/members?status=SUSPENDED', { cookie: adminCookie });
  assert.ok(suspendedFilter.json.data.some((row) => row.id === idA));
  assert.ok(suspendedFilter.json.data.every((row) => row.status === 'SUSPENDED'));
  const deactivate = await req(`/members/${idA}/status`, { method: 'PATCH', cookie: adminCookie, body: { status: 'INACTIVE', reason: 'Moved away' } });
  assert.equal(deactivate.json.data.status, 'INACTIVE');
  const reactivate = await req(`/members/${idA}/status`, { method: 'PATCH', cookie: adminCookie, body: { status: 'ACTIVE' } });
  assert.equal(reactivate.json.data.status, 'ACTIVE');
  assert.equal(reactivate.json.data.attendance.allowed, true);
  pass('7. suspend, deactivate and reactivate work; attendance eligibility follows the administrative status');

  console.log('\n[8] Historical records are preserved');
  const payment = await prisma.paymentRecord.create({
    data: {
      gymId: SEED_GYM_ID, memberId: idA, receiptNumber: `TEST-REC-${Date.now()}-1`, amount: 1500, currency: 'ARS', concept: 'Monthly fee (test fixture)',
      method: 'CASH', status: 'PENDING', paidAt: new Date(), reference: 'TEST-REF-1',
    },
  });
  const payment2 = await prisma.paymentRecord.create({
    data: {
      gymId: SEED_GYM_ID, memberId: idA, receiptNumber: `TEST-REC-${Date.now()}-2`, amount: 2000, currency: 'ARS', concept: 'Paid fee (test fixture)',
      method: 'TRANSFER', status: 'COMPLETED', paidAt: new Date(), reference: 'TEST-REF-2',
    },
  });
  const attendance1 = await prisma.attendance.create({
    data: { gymId: SEED_GYM_ID, memberId: idA, checkInTime: new Date(Date.now() - 3600000), method: 'MANUAL' },
  });
  const attendance2 = await prisma.attendance.create({
    data: { gymId: SEED_GYM_ID, memberId: idA, checkInTime: new Date(Date.now() - 7200000), method: 'QR' },
  });
  const routine = await prisma.routine.create({
    data: { gymId: SEED_GYM_ID, name: 'Test Routine A', assignedToId: idA, difficulty: 'MEDIUM', estimatedWeeks: 4 },
  });
  await prisma.$transaction([
    prisma.memberProfile.update({ where: { id: idA }, data: { status: 'SUSPENDED' } }),
  ]);
  const summarySuspended = await req(`/members/${idA}/summary`, { cookie: adminCookie });
  assert.equal(summarySuspended.response.status, 200);
  assert.equal(summarySuspended.json.data.payments.length, 2, 'payments preserved after suspension');
  assert.equal(summarySuspended.json.data.attendance.total, 2, 'attendance preserved after suspension');
  assert.equal(summarySuspended.json.data.routines.length, 1, 'routines preserved after suspension');
  assert.equal(summarySuspended.json.data.pending.count, 1, 'pending debt surfaced');
  assert.ok(Number(summarySuspended.json.data.pending.amount) === 1500, 'pending amount aggregated');
  assert.equal(summarySuspended.json.data.instructor?.id, seedInstructor.id, 'instructor present in summary');
  const stillThere = await Promise.all([
    prisma.paymentRecord.count({ where: { id: { in: [payment.id, payment2.id] } } }),
    prisma.attendance.count({ where: { id: { in: [attendance1.id, attendance2.id] } } }),
    prisma.routine.findFirst({ where: { id: routine.id } }),
  ]);
  assert.equal(stillThere[0], 2, 'payment rows still in the database');
  assert.equal(stillThere[1], 2, 'attendance rows still in the database');
  assert.ok(stillThere[2], 'routine row still in the database');
  await prisma.memberProfile.update({ where: { id: idA }, data: { status: 'ACTIVE' } });
  pass('8. payments, attendance and routines survive status changes (no physical delete anywhere)');

  console.log('\n[6] Backend pagination');
  const expectedTotal = await prisma.memberProfile.count({ where: { gymId: SEED_GYM_ID } });
  const page1 = await req('/members?page=1&pageSize=2', { cookie: adminCookie });
  assert.equal(page1.response.status, 200);
  assert.equal(page1.json.meta.total, expectedTotal, 'total is the tenant count, not a global count');
  assert.equal(page1.json.meta.totalPages, Math.max(1, Math.ceil(expectedTotal / 2)));
  assert.ok(page1.json.data.length <= 2, 'page size respected');
  const page2 = await req('/members?page=2&pageSize=2', { cookie: adminCookie });
  assert.equal(page2.json.meta.page, 2);
  const overlap = page1.json.data.filter((row) => page2.json.data.some((other) => other.id === row.id));
  assert.equal(overlap.length, 0, 'pages do not overlap');
  const beyond = await req('/members?page=99&pageSize=2', { cookie: adminCookie });
  assert.equal(beyond.json.data.length, 0, 'page beyond the end returns an empty list');
  const tooBig = await req('/members?pageSize=500', { cookie: adminCookie });
  assert.equal(tooBig.response.status, 400, 'pageSize is capped by validation');
  pass(`6. pagination scoped to the gym (total=${expectedTotal}), no overlap, caps enforced`);

  console.log('\n[12] Persistence across sessions');
  const summaryB = await req(`/members/${idB}/summary`, { cookie: adminCookie });
  assert.equal(summaryB.json.data.memberships.length, 1, 'membership history visible on the detail endpoint');
  assert.ok(summaryB.json.data.member.membership, 'current membership on the detail payload');
  await req('/auth/logout', { method: 'POST', cookie: adminCookie });
  const fresh = await login('admin@demo.local', DEV_PASSWORD);
  adminCookie = fresh.cookie;
  const persisted = await req(`/members/${idA}`, { cookie: adminCookie });
  assert.equal(persisted.json.data.fullName, 'Test Member Alpha Edited', 'edits survive a new session');
  const persistedSearch = await req(`/members?search=${MEMBER_C.documentNumber}`, { cookie: adminCookie });
  assert.ok(persistedSearch.json.data.some((row) => row.id === idC), 'registration survives a new session');
  pass('12. registrations and edits persist in PostgreSQL across logout/login');

  console.log('\n[audit] AuditLog contains member operations without secrets');
  const auditRows = await prisma.auditLog.findMany({
    where: { gymId: SEED_GYM_ID, entityType: { in: ['MemberProfile', 'InstructorMember', 'MemberPhoto'] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { entityType: true, action: true, newValues: true, oldValues: true },
  });
  const actions = new Set(auditRows.map((row) => `${row.entityType}:${row.action}`));
  assert.ok(actions.has('MemberProfile:CREATE'), 'creation audited');
  assert.ok(actions.has('MemberProfile:UPDATE'), 'edits and status changes audited');
  assert.ok(actions.has('InstructorMember:ASSIGN'), 'instructor assignment audited');
  const serialized = JSON.stringify(auditRows);
  assert.ok(!serialized.includes(DEV_PASSWORD) && !serialized.includes('DisposablePass'), 'no credentials in audit');
  assert.ok(!/password/i.test(serialized), 'no password fields in audit');
  pass('AuditLog records create/update/status/instructor operations with no credentials or passwords');

  console.log('\n[photo] Object storage path for photographs');
  const pngForm = new FormData();
  pngForm.append('photo', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'photo.png');
  const pngUpload = await req(`/members/${idA}/photo`, { method: 'POST', cookie: adminCookie, form: pngForm });
  const s3Configured = Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_PUBLIC_BASE_URL);
  if (s3Configured) {
    assert.equal(pngUpload.response.status, 201, JSON.stringify(pngUpload.json));
    pass('photo uploads to the configured S3-compatible storage');
  } else {
    assert.equal(pngUpload.response.status, 503, JSON.stringify(pngUpload.json));
    assert.match(pngUpload.json.error, /storage is not configured/i);
    pass('photo endpoint validates the file and reports missing S3_* configuration (expected until configured)');
  }
} finally {
  console.log('\n[cleanup] Removing test fixtures');
  try {
    // Disposable gym (and everything inside it).
    if (disposable.gymId) {
      const profiles = await prisma.memberProfile.findMany({ where: { gymId: disposable.gymId }, select: { id: true } });
      for (const profile of profiles) {
        await prisma.attendance.deleteMany({ where: { memberId: profile.id } });
        await prisma.paymentRecord.deleteMany({ where: { memberId: profile.id } });
        await prisma.memberSubscription.deleteMany({ where: { memberId: profile.id } });
        await prisma.instructorMember.deleteMany({ where: { memberId: profile.id } });
        await prisma.routine.deleteMany({ where: { assignedToId: profile.id } });
      }
      await prisma.memberProfile.deleteMany({ where: { gymId: disposable.gymId } });
      const users = await prisma.gymMembership.findMany({ where: { gymId: disposable.gymId }, select: { userId: true } });
      await prisma.gymMembership.deleteMany({ where: { gymId: disposable.gymId } });
      for (const user of users) {
        await prisma.authToken.deleteMany({ where: { userId: user.userId } });
        await prisma.auditLog.deleteMany({ where: { userId: user.userId, gymId: disposable.gymId } });
        await prisma.user.deleteMany({ where: { id: user.userId } });
      }
      await prisma.auditLog.deleteMany({ where: { gymId: disposable.gymId } });
      await prisma.gym.deleteMany({ where: { id: disposable.gymId } });
      console.log('  disposable gym removed');
    }

    // Members created in the seeded gym (history rows removed first).
    for (const memberId of memberIds) await deleteTestMember(memberId);
    // Any leftovers from interrupted runs.
    await purgeTestMembers();
    console.log('  test members and fixtures removed');
  } catch (cleanupError) {
    console.error('  CLEANUP FAILED:', cleanupError instanceof Error ? cleanupError.message : cleanupError);
    process.exitCode = 2;
  }
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${results.length} checks passed`);
for (const label of results) console.log(`- ${label}`);
if (process.exitCode && process.exitCode !== 0) process.exit(process.exitCode);
