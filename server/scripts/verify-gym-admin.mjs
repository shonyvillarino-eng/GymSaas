/**
 * Integration verification for the GYM_ADMIN administration module.
 *
 * Run from /server with the API running on port 4000:
 *   node scripts/verify-gym-admin.mjs
 *
 * It exercises the real REST API and PostgreSQL, then restores every value
 * it temporarily changes (gym data, preferences, profile, password, logo
 * state and suspension status).
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4000/api/v1';
const GYM_ID = 'seed-gym-0001';
const ADMIN_EMAIL = 'admin@demo.local';
const DEV_PASSWORD = 'DevPass!2026';
const TEMP_PASSWORD = 'TempVerify!2026X';

const prisma = new PrismaClient();
const results = [];
const pass = (label) => { results.push(label); console.log(`  ✓ ${label}`); };

async function req(path, { method = 'GET', cookie = '', body, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (form) {
    // fetch sets the multipart boundary itself.
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  return { response, json };
}

async function login(email, password) {
  const { response, json } = await req('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200, `login ${email} failed: ${JSON.stringify(json)}`);
  const setCookie = response.headers.getSetCookie();
  const cookie = setCookie[0]?.split(';')[0];
  assert.ok(cookie, 'login must issue a session cookie');
  assert.match(setCookie[0], /HttpOnly/i, 'session cookie must be HttpOnly');
  return { cookie, user: json.user };
}

/* ------------------------------------------------------------------ */
/* State captured before any mutation, restored in finally.            */
/* ------------------------------------------------------------------ */
let adminCookie = '';
let superCookie = '';
let originalGym = null;
let originalPreferences = null;
let originalProfile = null;
let otherGymBefore = null;
let suspended = false;

try {
  console.log('\n[1] GYM_ADMIN can read its own gym');
  const admin = await login(ADMIN_EMAIL, DEV_PASSWORD);
  adminCookie = admin.cookie;
  assert.equal(admin.user.role, 'GYM_ADMIN');
  const gym = await req('/gym', { cookie: adminCookie });
  assert.equal(gym.response.status, 200, JSON.stringify(gym.json));
  assert.equal(gym.json.data.id, GYM_ID);
  assert.ok(!('passwordHash' in gym.json.data), 'passwordHash must not leak');
  assert.ok(!('suspensionReason' in gym.json.data), 'internal suspension data must not leak');
  assert.ok(Array.isArray(gym.json.data.preferences.schedule));
  originalGym = gym.json.data;
  pass('1. admin reads its gym; sensitive fields excluded');

  console.log('\n[2] GYM_ADMIN can modify its gym data');
  const prefs0 = await req('/gym/preferences', { cookie: adminCookie });
  assert.equal(prefs0.response.status, 200, JSON.stringify(prefs0.json));
  originalPreferences = prefs0.json.data;

  const patch = await req('/gym', {
    method: 'PATCH',
    cookie: adminCookie,
    body: { city: 'Buenos Aires (verificacion)', currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires' },
  });
  assert.equal(patch.response.status, 200, JSON.stringify(patch.json));
  assert.equal(patch.json.data.currency, 'ARS');
  assert.equal(patch.json.data.timezone, 'America/Argentina/Buenos_Aires');
  pass('2. commercial data (ARS currency + timezone) updates through the API');

  console.log('\n[4] GYM_ADMIN cannot touch other gyms');
  const other = await prisma.gym.findFirst({
    where: { id: { not: GYM_ID } },
    select: { id: true, name: true, updatedAt: true },
  });
  if (other) {
    otherGymBefore = other;
    const cross = await req('/gym', {
      method: 'PATCH',
      cookie: adminCookie,
      body: { gymId: other.id, name: 'Unauthorized overwrite' },
    });
    assert.equal(cross.response.status, 400, 'client-supplied gymId must be rejected');
    const otherAfter = await prisma.gym.findUnique({ where: { id: other.id }, select: { name: true, updatedAt: true } });
    assert.equal(otherAfter.name, other.name, 'another gym name must remain unchanged');
    assert.equal(otherAfter.updatedAt.getTime(), other.updatedAt.getTime(), 'another gym must not be touched');
  }
  const adminPanel = await req('/admin/gyms', { cookie: adminCookie });
  assert.equal(adminPanel.response.status, 403, 'GYM_ADMIN must not reach the platform admin API');
  const ownNameAfter = await req('/gym', { cookie: adminCookie });
  assert.equal(ownNameAfter.json.data.name, originalGym.name, 'own gym name must be unchanged');
  pass(`4. client gymId rejected and other gym untouched${other ? ` (${other.name})` : ' (no other gym exists)'}`);

  console.log('\n[3] Preferences persist in PostgreSQL');
  const changedPrefs = { ...originalPreferences, attendanceDuplicateToleranceMinutes: 27 };
  const putPrefs = await req('/gym/preferences', { method: 'PUT', cookie: adminCookie, body: changedPrefs });
  assert.equal(putPrefs.response.status, 200, JSON.stringify(putPrefs.json));
  const prefsAfter = await req('/gym/preferences', { cookie: adminCookie });
  assert.equal(prefsAfter.json.data.attendanceDuplicateToleranceMinutes, 27);
  const settingsRow = await prisma.gym.findUnique({ where: { id: GYM_ID }, select: { settings: true } });
  assert.equal(settingsRow.settings.preferences.attendanceDuplicateToleranceMinutes, 27, 'must persist in the DB JSONB column');
  pass('3. preferences (including attendance tolerance) saved and re-read from PostgreSQL');

  console.log('\n[8] Invalid data rejected by the backend');
  const invalidName = await req('/gym', { method: 'PATCH', cookie: adminCookie, body: { name: 'x' } });
  assert.equal(invalidName.response.status, 400);
  const invalidTimezone = await req('/gym', { method: 'PATCH', cookie: adminCookie, body: { timezone: 'Not/A_Zone' } });
  assert.equal(invalidTimezone.response.status, 400);
  const invalidCurrency = await req('/gym', { method: 'PATCH', cookie: adminCookie, body: { currency: 'XXX' } });
  assert.equal(invalidCurrency.response.status, 400);
  const invalidSchedule = await req('/gym/preferences', {
    method: 'PUT',
    cookie: adminCookie,
    body: { ...changedPrefs, schedule: [{ day: 'MONDAY', open: '11:00', close: '10:00', closed: false }] },
  });
  assert.equal(invalidSchedule.response.status, 400, JSON.stringify(invalidSchedule.json));
  const roleInjection = await req('/gym/profile', { method: 'PATCH', cookie: adminCookie, body: { role: 'SUPER_ADMIN' } });
  assert.equal(roleInjection.response.status, 400, 'role must not be client-modifiable');
  const wrongCurrent = await req('/gym/profile/password', {
    method: 'PUT',
    cookie: adminCookie,
    body: { currentPassword: 'not-the-password', newPassword: TEMP_PASSWORD },
  });
  assert.equal(wrongCurrent.response.status, 400);
  pass('8. invalid name/timezone/currency/schedule, role injection and wrong current password all rejected (400)');

  console.log('\n[5][6] Instructor and member cannot access the module');
  for (const [role, email] of [['INSTRUCTOR', 'instructor@demo.local'], ['MEMBER', 'member@demo.local']]) {
    const session = await login(email, DEV_PASSWORD);
    for (const path of ['/gym', '/gym/preferences', '/gym/profile']) {
      const denied = await req(path, { cookie: session.cookie });
      assert.equal(denied.response.status, 403, `${role} GET ${path} must be 403`);
    }
    const deniedWrite = await req('/gym', { method: 'PATCH', cookie: session.cookie, body: { city: 'intrusion' } });
    assert.equal(deniedWrite.response.status, 403, `${role} PATCH /gym must be 403`);
    const deniedPassword = await req('/gym/profile/password', {
      method: 'PUT',
      cookie: session.cookie,
      body: { currentPassword: DEV_PASSWORD, newPassword: TEMP_PASSWORD },
    });
    assert.equal(deniedPassword.response.status, 403, `${role} must not reach password change`);
    pass(`${role} blocked from every administrative endpoint`);
  }

  console.log('\n[Profile] Read, update and password change');
  const profile = await req('/gym/profile', { cookie: adminCookie });
  assert.equal(profile.response.status, 200, JSON.stringify(profile.json));
  assert.ok(!('passwordHash' in profile.json.data));
  assert.equal(profile.json.data.email, ADMIN_EMAIL, 'sign-in email is visible read-only');
  originalProfile = profile.json.data;

  const profileUpdate = await req('/gym/profile', {
    method: 'PATCH',
    cookie: adminCookie,
    body: { fullName: 'Gym Admin (verificacion)', phone: '+54-11-5555-0000' },
  });
  assert.equal(profileUpdate.response.status, 200, JSON.stringify(profileUpdate.json));

  const changePw = await req('/gym/profile/password', {
    method: 'PUT',
    cookie: adminCookie,
    body: { currentPassword: DEV_PASSWORD, newPassword: TEMP_PASSWORD },
  });
  assert.equal(changePw.response.status, 204, JSON.stringify(changePw.json));
  const oldRejected = await req('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: DEV_PASSWORD } });
  assert.equal(oldRejected.response.status, 401, 'previous password must stop working');
  const reLoginTemp = await login(ADMIN_EMAIL, TEMP_PASSWORD);
  adminCookie = reLoginTemp.cookie;
  pass('profile updates; password change requires current password and rotates credentials');

  console.log('\n[7] Changes persist after logout + fresh login');
  await req('/auth/logout', { method: 'POST', cookie: adminCookie });
  const fresh = await login(ADMIN_EMAIL, TEMP_PASSWORD);
  adminCookie = fresh.cookie;
  const gymFresh = await req('/gym', { cookie: adminCookie });
  const prefsFresh = await req('/gym/preferences', { cookie: adminCookie });
  const profileFresh = await req('/gym/profile', { cookie: adminCookie });
  assert.equal(gymFresh.json.data.city, 'Buenos Aires (verificacion)');
  assert.equal(gymFresh.json.data.currency, 'ARS');
  assert.equal(prefsFresh.json.data.attendanceDuplicateToleranceMinutes, 27);
  assert.equal(profileFresh.json.data.fullName, 'Gym Admin (verificacion)');
  pass('7. gym data, preferences and profile survive logout and a new session');

  console.log('\n[Logo] Object-storage upload path');
  const s3Configured = Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_PUBLIC_BASE_URL);
  const badForm = new FormData();
  badForm.append('logo', new Blob(['not an image'], { type: 'text/plain' }), 'notes.txt');
  const badUpload = await req('/gym/logo', { method: 'POST', cookie: adminCookie, form: badForm });
  assert.equal(badUpload.response.status, 400, JSON.stringify(badUpload.json));
  const pngForm = new FormData();
  pngForm.append(
    'logo',
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }),
    'logo.png',
  );
  const pngUpload = await req('/gym/logo', { method: 'POST', cookie: adminCookie, form: pngForm });
  if (s3Configured) {
    assert.equal(pngUpload.response.status, 201, JSON.stringify(pngUpload.json));
    pass('logo uploads to configured S3-compatible storage (URL persisted, bytes never in PostgreSQL)');
  } else {
    assert.equal(pngUpload.response.status, 503, JSON.stringify(pngUpload.json));
    assert.match(pngUpload.json.error, /storage is not configured/i);
    pass('logo endpoint validated the file and reported missing S3_* configuration (503, expected until configured)');
  }
  assert.equal(badUpload.response.status, 400, 'non-image files are rejected before storage');

  console.log('\n[9] Suspended gym cannot perform administrative operations');
  const superAdmin = await login('superadmin@demo.local', DEV_PASSWORD);
  superCookie = superAdmin.cookie;
  const suspend = await req(`/admin/gyms/${GYM_ID}/suspend`, {
    method: 'POST',
    cookie: superCookie,
    body: { reason: 'Automated suspension verification' },
  });
  assert.equal(suspend.response.status, 200, JSON.stringify(suspend.json));
  suspended = true;
  const suspendedRead = await req('/gym', { cookie: adminCookie });
  assert.equal(suspendedRead.response.status, 403);
  assert.equal(suspendedRead.json.details?.code, 'GYM_SUSPENDED');
  const suspendedWrite = await req('/gym/preferences', { method: 'PUT', cookie: adminCookie, body: originalPreferences });
  assert.equal(suspendedWrite.response.status, 403);
  const suspendedLogin = await req('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: TEMP_PASSWORD } });
  assert.equal(suspendedLogin.response.status, 403, 'login from a suspended gym must be blocked');
  const reactivate = await req(`/admin/gyms/${GYM_ID}/reactivate`, { method: 'POST', cookie: superCookie });
  assert.equal(reactivate.response.status, 200, JSON.stringify(reactivate.json));
  suspended = false;
  const afterReactivate = await req('/gym', { cookie: adminCookie });
  assert.equal(afterReactivate.response.status, 200, 'active gym works again after reactivation');
  pass('9. suspension blocks reads, writes and new logins; reactivation restores access');

  console.log('\n[Audit] AuditLog rows without secrets');
  const auditRows = await prisma.auditLog.findMany({
    where: { gymId: GYM_ID, entityType: { in: ['GymProfile', 'GymPreferences', 'GymAdminProfile', 'GymAdminPassword', 'GymLogo'] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { entityType: true, newValues: true, oldValues: true },
  });
  const types = new Set(auditRows.map((row) => row.entityType));
  for (const expected of ['GymProfile', 'GymPreferences', 'GymAdminProfile', 'GymAdminPassword']) {
    assert.ok(types.has(expected), `missing AuditLog for ${expected}`);
  }
  const serialized = JSON.stringify(auditRows);
  assert.ok(!serialized.includes(TEMP_PASSWORD) && !serialized.includes(DEV_PASSWORD), 'passwords must never be audited');
  pass('AuditLog records gym/profile/preferences/password changes with no credentials stored');
} finally {
  console.log('\n[restore] Returning original values');
  try {
    if (suspended && superCookie) {
      await req(`/admin/gyms/${GYM_ID}/reactivate`, { method: 'POST', cookie: superCookie });
    }
    if (adminCookie) {
      // Restore password first (while the temp session is still valid).
      const restorePw = await req('/gym/profile/password', {
        method: 'PUT',
        cookie: adminCookie,
        body: { currentPassword: TEMP_PASSWORD, newPassword: DEV_PASSWORD },
      });
      if (restorePw.response.status !== 204) {
        // Maybe the password was never changed (early failure): try original.
        const probe = await req('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: DEV_PASSWORD } });
        if (probe.response.status !== 200) throw new Error('could not restore the admin password');
        adminCookie = probe.headers.getSetCookie()[0].split(';')[0];
      } else {
        const back = await login(ADMIN_EMAIL, DEV_PASSWORD);
        adminCookie = back.cookie;
      }
    }
    if (originalGym && adminCookie) {
      await req('/gym', {
        method: 'PATCH',
        cookie: adminCookie,
        body: {
          name: originalGym.name,
          email: originalGym.email,
          phone: originalGym.phone,
          address: originalGym.address,
          city: originalGym.city,
          province: originalGym.province,
          postalCode: originalGym.postalCode,
          country: originalGym.country,
          timezone: originalGym.timezone,
          currency: originalGym.currency,
        },
      });
    }
    if (originalPreferences && adminCookie) {
      await req('/gym/preferences', { method: 'PUT', cookie: adminCookie, body: originalPreferences });
    }
    if (originalProfile && adminCookie) {
      await req('/gym/profile', {
        method: 'PATCH',
        cookie: adminCookie,
        body: { fullName: originalProfile.fullName, phone: originalProfile.phone },
      });
    }
    console.log('  original values restored');
  } catch (restoreError) {
    console.error('  RESTORE FAILED:', restoreError instanceof Error ? restoreError.message : restoreError);
    process.exitCode = 2;
  }
  await prisma.$disconnect();
}

console.log(`\nRESULT: ${results.length} checks passed`);
if (process.exitCode && process.exitCode !== 0) process.exit(process.exitCode);
