/**
 * Performance and consistency probe for the admin dashboard/report endpoints.
 *
 * Run from /server with the API on port 4000:
 *   node scripts/verify-performance.mjs
 *
 * Read-only: it measures latency of the main read endpoints and asserts that
 * the dashboard indicators match aggregates computed directly in PostgreSQL.
 * It does not write, update or delete any row.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4000/api/v1';
const DEV_PASSWORD = 'DevPass!2026';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@demo.local';
const SAMPLES = Number(process.env.SAMPLES ?? 5);

const prisma = new PrismaClient();
const results = [];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function req(path, { method = 'GET', cookie = '', body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const started = process.hrtime.bigint();
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    // A stuck request must fail the probe instead of hanging it forever.
    signal: AbortSignal.timeout(15_000),
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { response, json, durationMs };
}

async function login() {
  const { response, json } = await req('/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: DEV_PASSWORD },
  });
  assert.equal(response.status, 200, `login failed: ${JSON.stringify(json)}`);
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(cookie, 'session cookie required');
  return cookie;
}

async function measure(label, path, cookie) {
  const durations = [];
  let payload = null;
  for (let i = 0; i < SAMPLES; i += 1) {
    const { response, json, durationMs } = await req(path, { cookie });
    assert.equal(response.status, 200, `${label} -> ${response.status}: ${JSON.stringify(json)}`);
    durations.push(durationMs);
    payload = json;
  }
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  console.log(
    `  ${label.padEnd(26)} median ${median(durations).toFixed(0).padStart(5)} ms  ` +
      `(min ${min.toFixed(0)} / max ${max.toFixed(0)}, n=${SAMPLES})`
  );
  results.push(label);
  return payload;
}

async function main() {
  console.log('Dashboard/report performance probe (read-only)\n');
  const cookie = await login();

  const overview = await measure('dashboard/overview', '/dashboard/overview?period=month', cookie);
  await measure('dashboard/attendance', '/dashboard/attendance?period=30d', cookie);
  await measure('dashboard/revenue', '/dashboard/revenue?period=month', cookie);
  await measure('dashboard/memberships', '/dashboard/memberships?period=month', cookie);
  await measure('reports/members', '/reports/members?page=1&pageSize=25', cookie);
  await measure('reports/attendance', '/reports/attendance?page=1&pageSize=25&period=month', cookie);
  await measure('reports/financial', '/reports/financial?page=1&pageSize=25&period=month', cookie);

  const gymId = overview?.data?.gym?.id;
  assert.ok(gymId, 'overview must include the gym');

  const [memberTotal, memberActive, openCharges, activeSubs] = await Promise.all([
    prisma.memberProfile.count({ where: { gymId } }),
    prisma.memberProfile.count({ where: { gymId, status: 'ACTIVE' } }),
    prisma.financialObligation.aggregate({
      where: { gymId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }, cancelledAt: null },
      _sum: { originalAmount: true, paidAmount: true },
    }),
    prisma.memberSubscription.count({ where: { gymId, status: 'ACTIVE' } }),
  ]);

  const expectedDebt = Number(openCharges._sum.originalAmount ?? 0) - Number(openCharges._sum.paidAmount ?? 0);
  assert.equal(overview.data.members.total, memberTotal, 'members.total must match the database');
  assert.equal(overview.data.members.active, memberActive, 'members.active must match the database');
  assert.equal(overview.data.memberships.active, activeSubs, 'memberships.active must match the database');
  assert.ok(
    Math.abs(overview.data.revenue.pendingObligations - expectedDebt) < 0.01,
    `pendingObligations ${overview.data.revenue.pendingObligations} != outstanding ${expectedDebt}`
  );
  console.log('\n  ✓ dashboard indicators match PostgreSQL aggregates (incl. outstanding = charged - paid)');

  console.log(`\nRESULT: ${results.length} endpoints measured, consistency checks passed.`);
}

main()
  .catch((error) => {
    console.error('\n❌ Performance probe failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
