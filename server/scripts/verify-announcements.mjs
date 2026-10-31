/**
 * Privacy verification for announcements and in-app notifications.
 *
 * Run from /server with the API on port 4000 and a migrated database:
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/gym_saas?schema=public" \
 *   node scripts/verify-announcements.mjs
 *
 * Creates two gyms, publishes every audience variant and checks that each
 * viewer only receives what it is allowed to see. Removes all fixtures.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4000/api/v1';
const SEED_GYM_ID = 'seed-gym-0001';
const PASSWORD = 'DevPass!2026';
const FOREIGN_GYM_ID = 'verify-ann-gym-b';
const PREFIX = 'verify-announcements';

const prisma = new PrismaClient();
const results = [];
const pass = (label) => {
  results.push(label);
  console.log(`  ✓ ${label}`);
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
  try { json = await response.json(); } catch { json = null; }
  return { response, json };
}

async function login(email) {
  const { response, json } = await req('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  assert.equal(response.status, 200, `login ${email}: ${JSON.stringify(json)}`);
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(cookie, 'session cookie required');
  return cookie;
}

const created = {
  announcementIds: [],
  notificationIds: [],
  userIds: [],
  gymId: FOREIGN_GYM_ID,
};

async function cleanup() {
  await prisma.notification.deleteMany({ where: { gymId: SEED_GYM_ID, title: { startsWith: PREFIX } } });
  await prisma.notification.deleteMany({ where: { gymId: created.gymId } });
  await prisma.announcement.deleteMany({ where: { OR: [{ gymId: created.gymId }, { title: { startsWith: PREFIX } }] } });
  await prisma.notificationLog.deleteMany({ where: { gymId: { in: [SEED_GYM_ID, created.gymId] }, type: { in: ['ANNOUNCEMENT', 'GENERAL'] } } });
  await prisma.notificationPreference.deleteMany({ where: { gymId: created.gymId } });
  await prisma.auditLog.deleteMany({ where: { gymId: created.gymId } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.gym.deleteMany({ where: { id: created.gymId } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
}

// Remove leftovers from an interrupted previous run.
await prisma.gym.deleteMany({ where: { id: FOREIGN_GYM_ID } });
await prisma.announcement.deleteMany({ where: { title: { startsWith: PREFIX } } });
await prisma.user.deleteMany({ where: { email: { in: [`${PREFIX}-member-a@test.local`, `${PREFIX}-member-b@test.local`, `${PREFIX}-admin-b@test.local`, `${PREFIX}-member-bgym@test.local`] } } });

const seedAdmin = await prisma.user.findFirst({ where: { email: 'admin@demo.local' }, select: { passwordHash: true } });
assert.ok(seedAdmin, 'seed gym admin is required (run prisma db seed)');
const memberBUser = await prisma.user.create({
  data: {
    email: `${PREFIX}-member-b@test.local`,
    fullName: 'Announcement Member B',
    role: 'MEMBER',
    passwordHash: seedAdmin.passwordHash,
    isActive: true,
    memberships: { create: { gymId: SEED_GYM_ID, role: 'MEMBER', isActive: true } },
    memberProfile: { create: { gymId: SEED_GYM_ID, joinDate: new Date() } },
  },
});
created.userIds.push(memberBUser.id);

// Foreign tenant with an admin and a member.
await prisma.gym.create({
  data: {
    id: FOREIGN_GYM_ID,
    name: 'Verification Other Gym',
    slug: 'verification-other-gym',
    timezone: 'UTC',
    language: 'es',
    locale: 'es-ES',
    isActive: true,
    memberships: {
      create: [
        {
          role: 'GYM_ADMIN',
          isActive: true,
          user: {
            create: {
              email: `${PREFIX}-admin-b@test.local`,
              fullName: 'Other Gym Admin',
              role: 'GYM_ADMIN',
              passwordHash: seedAdmin.passwordHash,
              isActive: true,
            },
          },
        },
        {
          role: 'MEMBER',
          isActive: true,
          user: {
            create: {
              email: `${PREFIX}-member-bgym@test.local`,
              fullName: 'Other Gym Member',
              role: 'MEMBER',
              passwordHash: seedAdmin.passwordHash,
              isActive: true,
            },
          },
        },
      ],
    },
  },
});
const foreignUsers = await prisma.user.findMany({
  where: { email: { in: [`${PREFIX}-admin-b@test.local`, `${PREFIX}-member-bgym@test.local`] } },
  select: { id: true },
});
created.userIds.push(...foreignUsers.map((user) => user.id));
const foreignMember = await prisma.user.findFirstOrThrow({ where: { email: `${PREFIX}-member-bgym@test.local` } });

const adminCookie = await login('admin@demo.local');
const adminBCookie = await login(`${PREFIX}-admin-b@test.local`);
const memberCookie = await login('member@demo.local');
const instructorCookie = await login('instructor@demo.local');
const memberBCookie = await login(`${PREFIX}-member-b@test.local`);
const foreignMemberCookie = await login(`${PREFIX}-member-bgym@test.local`);

const seedMember = await prisma.user.findFirstOrThrow({ where: { email: 'member@demo.local' } });

async function createAnnouncement(body, cookie = adminCookie) {
  const result = await req('/notifications/announcements', {
    method: 'POST',
    cookie,
    body: { title: `${PREFIX} ${body.audience}`, content: 'Verification content', ...body },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.json));
  created.announcementIds.push(result.json.data.id);
  return result.json.data;
}

async function publish(id, cookie = adminCookie) {
  const result = await req(`/notifications/announcements/${id}/publish`, { method: 'POST', cookie });
  assert.equal(result.response.status, 200, JSON.stringify(result.json));
  return result.json;
}

/* ------------------------------------------------------------------ */
/* 1. Unauthenticated                                                  */
/* ------------------------------------------------------------------ */

{
  const result = await req('/notifications/announcements');
  assert.equal(result.response.status, 401);
  pass('unauthenticated feed is rejected with 401');
}

/* ------------------------------------------------------------------ */
/* 2. Creation validation                                              */
/* ------------------------------------------------------------------ */

{
  const missingTarget = await req('/notifications/announcements', {
    method: 'POST',
    cookie: adminCookie,
    body: { title: `${PREFIX} invalid`, content: 'x', audience: 'SPECIFIC_MEMBER' },
  });
  assert.equal(missingTarget.response.status, 400);
  pass('specific audience without target is rejected');

  const foreignTarget = await req('/notifications/announcements', {
    method: 'POST',
    cookie: adminCookie,
    body: { title: `${PREFIX} invalid`, content: 'x', audience: 'SPECIFIC_MEMBER', targetUserId: foreignMember.id },
  });
  assert.equal(foreignTarget.response.status, 400);
  pass('target user from another gym is rejected');

  const expired = await req('/notifications/announcements', {
    method: 'POST',
    cookie: adminCookie,
    body: { title: `${PREFIX} expired`, content: 'x', expiresAt: '2020-01-01T00:00:00.000Z' },
  });
  assert.equal(expired.response.status, 400);
  pass('expiry in the past is rejected');
}

/* ------------------------------------------------------------------ */
/* 3. Audience matrix                                                 */
/* ------------------------------------------------------------------ */

const all = await createAnnouncement({ audience: 'ALL' });
const members = await createAnnouncement({ audience: 'MEMBERS' });
const instructors = await createAnnouncement({ audience: 'INSTRUCTORS' });
const specificA = await createAnnouncement({ audience: 'SPECIFIC_MEMBER', targetUserId: seedMember.id });
const specificB = await createAnnouncement({ audience: 'SPECIFIC_MEMBER', targetUserId: memberBUser.id });
const draft = await createAnnouncement({ audience: 'ALL', title: `${PREFIX} draft` });

await publish(all.id);
await publish(members.id);
await publish(instructors.id);
await publish(specificA.id);
await publish(specificB.id);
// Published then expired: must disappear from every feed.
const expiredAnnouncement = await createAnnouncement({ audience: 'ALL', title: `${PREFIX} expired published` });
await publish(expiredAnnouncement.id);
await prisma.announcement.update({ where: { id: expiredAnnouncement.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

async function feed(cookie) {
  const result = await req('/notifications/announcements', { cookie });
  assert.equal(result.response.status, 200);
  return result.json.data.map((row) => row.id);
}

{
  const ids = await feed(memberCookie);
  assert.ok(ids.includes(all.id), 'member sees ALL');
  assert.ok(ids.includes(members.id), 'member sees MEMBERS');
  assert.ok(ids.includes(specificA.id), 'member sees their specific announcement');
  assert.ok(!ids.includes(instructors.id), 'member cannot see INSTRUCTORS');
  assert.ok(!ids.includes(specificB.id), 'member cannot see another member specific announcement');
  assert.ok(!ids.includes(draft.id), 'member cannot see drafts');
  assert.ok(!ids.includes(expiredAnnouncement.id), 'member cannot see expired announcements');
  pass('member sees only ALL, MEMBERS, own specific and non-expired rows');
}

{
  const ids = await feed(instructorCookie);
  assert.ok(ids.includes(all.id));
  assert.ok(ids.includes(instructors.id));
  assert.ok(!ids.includes(members.id));
  assert.ok(!ids.includes(specificA.id));
  pass('instructor sees only ALL and INSTRUCTORS');
}

{
  const ids = await feed(foreignMemberCookie);
  assert.equal(ids.length, 0, 'other gym member sees no announcements');
  pass('another gym member sees no announcements');
}

{
  const ids = await feed(memberBCookie);
  assert.ok(!ids.includes(specificA.id));
  assert.ok(ids.includes(specificB.id));
  pass('second member sees only their own specific announcement');
}

{
  const result = await req(`/notifications/announcements/${all.id}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'ARCHIVED' } });
  assert.ok([404, 405].includes(result.response.status));
  const manage = await req('/notifications/announcements/manage', { cookie: memberCookie });
  assert.equal(manage.response.status, 403);
  const manageB = await req('/notifications/announcements/manage', { cookie: adminBCookie });
  assert.equal(manageB.response.status, 200);
  assert.equal(manageB.json.data.length, 0);
  pass('management endpoint rejects members and isolates gyms');
}

/* ------------------------------------------------------------------ */
/* 4. Publish idempotency and notification privacy                    */
/* ------------------------------------------------------------------ */

{
  const first = await req(`/notifications/announcements/${all.id}/publish`, { method: 'POST', cookie: adminCookie });
  assert.equal(first.response.status, 200);
  const countAll = await prisma.notification.count({ where: { dedupeKey: { startsWith: `announcement:${all.id}:` } } });
  assert.ok(countAll >= 4, `ALL should notify active gym users, got ${countAll}`);

  await req(`/notifications/announcements/${all.id}/publish`, { method: 'POST', cookie: adminCookie });
  const afterSecond = await prisma.notification.count({ where: { dedupeKey: { startsWith: `announcement:${all.id}:` } } });
  assert.equal(afterSecond, countAll, 'publishing twice must not duplicate notifications');
  pass('re-publishing is idempotent');

  const specificCountA = await prisma.notification.count({ where: { dedupeKey: { startsWith: `announcement:${specificA.id}:` } } });
  const specificCountB = await prisma.notification.count({ where: { dedupeKey: { startsWith: `announcement:${specificB.id}:` } } });
  assert.equal(specificCountA, 1);
  assert.equal(specificCountB, 1);
  pass('specific announcements notify exactly one recipient');
}

{
  const list = await req('/notifications?page=1&pageSize=50', { cookie: memberCookie });
  assert.equal(list.response.status, 200);
  assert.ok(list.json.data.every((row) => !row.title.includes('SPECIFIC_MEMBER') || row.title.includes('verify-announcements')));
  const other = await prisma.notification.findFirst({ where: { gymId: SEED_GYM_ID, userId: { not: seedMember.id } } });
  assert.ok(other);
  const attempt = await req(`/notifications/${other.id}/read`, { method: 'PATCH', cookie: memberCookie });
  assert.equal(attempt.response.status, 404);
  pass('a user cannot read another user notification');
}

{
  const unread = await req('/notifications/unread-count', { cookie: memberCookie });
  assert.equal(unread.response.status, 200);
  const firstRow = await prisma.notification.findFirst({ where: { gymId: SEED_GYM_ID, userId: seedMember.id, isRead: false } });
  assert.ok(firstRow);
  const read = await req(`/notifications/${firstRow.id}/read`, { method: 'PATCH', cookie: memberCookie });
  assert.equal(read.response.status, 200);
  assert.equal(read.json.data.isRead, true);
  const readAll = await req('/notifications/read-all', { method: 'PATCH', cookie: memberCookie });
  assert.equal(readAll.response.status, 200);
  const after = await req('/notifications/unread-count', { cookie: memberCookie });
  assert.equal(after.json.data.count, 0);
  pass('read and read-all update the unread counter');
}

await cleanup();
console.log(`\n✅ ${results.length} announcements/notifications checks passed.`);
await prisma.$disconnect();
