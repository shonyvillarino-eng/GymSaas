/**
 * Integration verification for the finance module (payments, receivables, cash register).
 *
 * Run from /server with the API on port 4000:
 *   node scripts/verify-financials.mjs
 *
 * Exercises the real REST API against PostgreSQL, then removes every row it
 * created (members, charges, payments, registers). AuditLog rows are kept on
 * purpose: the trail is append-only by design.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4000/api/v1';
const SEED_GYM_ID = 'seed-gym-0001';
const DEV_PASSWORD = 'DevPass!2026';
const MARKER = 'verify-financials';

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

async function req(path, { method = 'GET', cookie = '', body, raw = false } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return response;
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

let adminCookie = '';
const created = { memberId: null, memberUserId: null, obligationIds: [], paymentIds: [], registerIds: [], subscriptionId: null, foreignGym: null, foreignMemberId: null, foreignAdminEmail: null };

try {
  console.log('\n[setup] Clean previous fixtures and authenticate');
  const leftovers = await prisma.memberProfile.findMany({
    where: { gymId: SEED_GYM_ID, user: { email: 'finance-test@test.local' } },
    select: { id: true, userId: true },
  });
  for (const profile of leftovers) {
    await prisma.paymentRecord.deleteMany({ where: { memberId: profile.id } });
    await prisma.financialObligation.deleteMany({ where: { memberId: profile.id } });
    await prisma.memberSubscription.deleteMany({ where: { memberId: profile.id } });
    await prisma.memberProfile.delete({ where: { id: profile.id } });
    await prisma.gymMembership.deleteMany({ where: { userId: profile.userId } });
    await prisma.user.delete({ where: { id: profile.userId } });
  }
  await prisma.cashRegister.deleteMany({ where: { gymId: SEED_GYM_ID, notes: { contains: MARKER } } });

  adminCookie = (await login('admin@demo.local', DEV_PASSWORD)).cookie;

  const createdMember = await req('/members', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      fullName: 'Finance Test Member',
      documentType: 'DNI',
      documentNumber: newDocument(),
      birthDate: '1992-03-15',
      gender: 'FEMALE',
      phone: '+54-11-4444-9090',
      email: 'finance-test@test.local',
      address: 'Finance St 123',
      emergencyName: 'Emergency',
      emergencyPhone: '+54-11-4444-9191',
      joinDate: today(),
      notes: MARKER,
      status: 'ACTIVE',
    },
  });
  assert.equal(createdMember.response.status, 201, JSON.stringify(createdMember.json));
  created.memberId = createdMember.json.data.id;
  const profile = await prisma.memberProfile.findUnique({ where: { id: created.memberId }, select: { userId: true } });
  created.memberUserId = profile.userId;

  // Plan + membership so a charge can be generated the same way the app does.
  const plan = await req('/membership-plans', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: `Finance Plan ${Date.now()}`, price: 50000, durationValue: 1, durationUnit: 'MONTH', isActive: true },
  });
  assert.equal(plan.response.status, 201, JSON.stringify(plan.json));
  const planId = plan.json.data.id;

  const subscription = await req('/subscriptions', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: created.memberId, planId, startDate: today(), agreedPrice: 50000 },
  });
  assert.equal(subscription.response.status, 201, JSON.stringify(subscription.json));
  created.subscriptionId = subscription.json.data.id;
  console.log(`  member=${created.memberId} plan=${planId} membership=${created.subscriptionId}`);

  console.log('\n[1] Membership assignment creates an identifiable charge');
  const charges = await req(`/financial-obligations?memberId=${created.memberId}&page=1&pageSize=50`, { cookie: adminCookie });
  assert.equal(charges.response.status, 200, JSON.stringify(charges.json));
  assert.ok(charges.json.data.length >= 1, 'a receivable exists for the membership');
  const charge = charges.json.data[0];
  created.obligationIds.push(charge.id);
  assert.equal(Number(charge.originalAmount), 50000);
  assert.equal(Number(charge.paidAmount), 0);
  assert.equal(charge.status, 'PENDING');
  pass('1. assigning a membership leaves an identifiable PENDING charge of 50000 (no payment implied)');

  console.log('\n[2] Full payment settles the charge');
  const full = await req('/payments', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      memberId: created.memberId,
      obligationId: charge.id,
      concept: charge.concept,
      amount: 50000,
      method: 'CASH',
    },
  });
  assert.equal(full.response.status, 201, JSON.stringify(full.json));
  created.paymentIds.push(full.json.data.id);
  assert.match(full.json.data.receiptNumber, /^R-\d{6}$/, 'receipt number assigned server-side');
  assert.equal(Number(full.json.data.amount), 50000);

  const settled = await req(`/financial-obligations/${charge.id}`, { cookie: adminCookie });
  assert.equal(settled.json.data.status, 'PAID');
  assert.equal(Number(settled.json.data.paidAmount), 50000);
  assert.equal(Number(settled.json.data.balance), 0);
  pass(`2. full payment (${full.json.data.receiptNumber}) settles the charge: status PAID, balance 0`);

  console.log('\n[3] Partial payments accumulate without double counting');
  const manual = await req('/financial-obligations', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      memberId: created.memberId,
      concept: 'Annual maintenance fee',
      originalAmount: 50000,
      dueDate: shift(15),
    },
  });
  assert.equal(manual.response.status, 201, JSON.stringify(manual.json));
  const partialChargeId = manual.json.data.id;
  created.obligationIds.push(partialChargeId);

  const first = await req('/payments', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: created.memberId, obligationId: partialChargeId, concept: 'Annual maintenance fee', amount: 20000, method: 'TRANSFER' },
  });
  assert.equal(first.response.status, 201, JSON.stringify(first.json));
  created.paymentIds.push(first.json.data.id);

  const second = await req('/payments', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: created.memberId, obligationId: partialChargeId, concept: 'Annual maintenance fee', amount: 15000, method: 'CASH' },
  });
  assert.equal(second.response.status, 201, JSON.stringify(second.json));
  created.paymentIds.push(second.json.data.id);

  const partial = await req(`/financial-obligations/${partialChargeId}`, { cookie: adminCookie });
  assert.equal(Number(partial.json.data.paidAmount), 35000, 'partial total is 20000 + 15000');
  assert.equal(Number(partial.json.data.balance), 15000, 'balance is the exact remainder');
  assert.equal(partial.json.data.status, 'PARTIAL');
  pass('3. partial payments 20000 + 15000 → paid 35000, balance 15000, status PARTIAL (no duplicated amounts)');

  console.log('\n[4] Overpayment and duplicate-prevention rules');
  const overpay = await req('/payments', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: created.memberId, obligationId: partialChargeId, concept: 'Annual maintenance fee', amount: 20000, method: 'CASH' },
  });
  assert.equal(overpay.response.status, 400, 'paying more than the balance is rejected');
  const duplicateCharge = await req('/financial-obligations', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: created.memberId, subscriptionId: created.subscriptionId, concept: charge.concept, originalAmount: 1000, dueDate: today() },
  });
  assert.equal(duplicateCharge.response.status, 409, 'identical charge for the same membership is rejected');
  const generated = await req('/financial-obligations/generate', { method: 'POST', cookie: adminCookie, body: {} });
  assert.equal(generated.response.status, 200, JSON.stringify(generated.json));
  assert.equal(generated.json.data.created, 0, 'running the generator again creates nothing');
  const receipts = await prisma.paymentRecord.findMany({ where: { gymId: SEED_GYM_ID }, select: { receiptNumber: true } });
  assert.equal(new Set(receipts.map((row) => row.receiptNumber)).size, receipts.length, 'receipt numbers are unique');
  pass('4. overpayment rejected, duplicate charge rejected (409), generator idempotent, receipt numbers unique');

  console.log('\n[5] Concurrent payments cannot double-settle a charge');
  const raceCharge = await req('/financial-obligations', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: created.memberId, concept: 'Race condition charge', originalAmount: 1000, dueDate: shift(10) },
  });
  assert.equal(raceCharge.response.status, 201, JSON.stringify(raceCharge.json));
  const raceId = raceCharge.json.data.id;
  created.obligationIds.push(raceId);

  const attempts = await Promise.all(
    Array.from({ length: 6 }, () =>
      req('/payments', {
        method: 'POST',
        cookie: adminCookie,
        body: { memberId: created.memberId, obligationId: raceId, concept: 'Race condition charge', amount: 600, method: 'CASH' },
      }),
    ),
  );
  const succeeded = attempts.filter((attempt) => attempt.response.status === 201);
  for (const attempt of succeeded) created.paymentIds.push(attempt.json.data.id);
  assert.equal(succeeded.length, 1, `exactly one of 6 concurrent payments may succeed, got ${succeeded.length}`);
  const raceState = await req(`/financial-obligations/${raceId}`, { cookie: adminCookie });
  assert.equal(Number(raceState.json.data.paidAmount), 600);
  assert.equal(Number(raceState.json.data.balance), 400);
  pass('5. 6 simultaneous payments on one charge: exactly 1 accepted, paid 600 / balance 400');

  console.log('\n[6] Void recalculates the balance and refuses a second annulment');
  const toVoid = second.json.data.id;
  const voided = await req(`/payments/${toVoid}/void`, {
    method: 'POST',
    cookie: adminCookie,
    body: { reason: 'Registered twice by mistake' },
  });
  assert.equal(voided.response.status, 200, JSON.stringify(voided.json));
  assert.equal(voided.json.data.status, 'VOIDED');
  assert.ok(voided.json.data.voidedAt, 'voided timestamp recorded');
  assert.ok(voided.json.data.voidedBy?.fullName, 'responsible user recorded');

  const afterVoid = await req(`/financial-obligations/${partialChargeId}`, { cookie: adminCookie });
  assert.equal(Number(afterVoid.json.data.paidAmount), 20000, 'voided amount removed from paid total');
  assert.equal(Number(afterVoid.json.data.balance), 30000, 'balance restored to 30000');
  assert.equal(afterVoid.json.data.status, 'PARTIAL');

  const doubleVoid = await req(`/payments/${toVoid}/void`, { method: 'POST', cookie: adminCookie, body: { reason: 'again' } });
  assert.equal(doubleVoid.response.status, 409, 'a voided payment cannot be voided twice');
  const reasonRequired = await req(`/payments/${first.json.data.id}/void`, { method: 'POST', cookie: adminCookie, body: { reason: '' } });
  assert.equal(reasonRequired.response.status, 400, 'a reason is mandatory');
  pass('6. void keeps the original movement, restores the balance to 30000 and blocks a second annulment');

  console.log('\n[7] Financial history is preserved (no physical deletes)');
  const historyRows = await prisma.paymentRecord.count({ where: { id: { in: created.paymentIds } } });
  assert.equal(historyRows, created.paymentIds.length, 'every payment row still exists');
  const voidedRow = await prisma.paymentRecord.findUnique({ where: { id: toVoid }, select: { status: true, voidReason: true, receiptNumber: true } });
  assert.equal(voidedRow.status, 'VOIDED');
  assert.equal(voidedRow.voidReason, 'Registered twice by mistake');
  const auditRows = await prisma.auditLog.findMany({
    where: { gymId: SEED_GYM_ID, entityType: { in: ['PaymentRecord', 'FinancialObligation', 'CashRegister'] } },
    select: { action: true, newValues: true, oldValues: true },
  });
  assert.ok(auditRows.some((row) => row.action === 'PAYMENT_REGISTERED'), 'payment registration audited');
  assert.ok(auditRows.some((row) => JSON.stringify(row.newValues ?? {}).includes('VOIDED')), 'annulment audited');
  const serializedAudit = JSON.stringify(auditRows);
  assert.ok(!/cardNumber|cvv|password/i.test(serializedAudit), 'no card or credential data in the audit trail');
  pass('7. voided and valid movements persist with their reason, operator and audit entries');

  console.log('\n[8] Internal receipt PDF');
  const pdf = await req(`/payments/${full.json.data.id}/receipt`, { cookie: adminCookie, raw: true });
  assert.equal(pdf.status, 200, 'receipt endpoint responds');
  assert.match(pdf.headers.get('content-type') ?? '', /application\/pdf/, 'served as PDF');
  const buffer = Buffer.from(await pdf.arrayBuffer());
  assert.ok(buffer.length > 500, 'PDF has content');
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-', 'valid PDF header');
  // PDFKit writes text as hex literals inside TJ arrays; decode them to assert content.
  // Runs are frequently a single glyph, and PDF hex strings may have an odd digit
  // count (implicit trailing 0), so keep short runs and pad before decoding.
  const rawPdf = buffer.toString('latin1');
  const pdfText = [...rawPdf.matchAll(/<([0-9A-Fa-f]{2,})>/g)]
    .map((match) => {
      const hex = match[1].length % 2 === 0 ? match[1] : `${match[1]}0`;
      return Buffer.from(hex, 'hex').toString('latin1');
    })
    .join(' ');
  // Text may wrap across runs, so compare with whitespace removed.
  const flatPdfText = pdfText.replace(/\s+/g, '').toUpperCase();
  assert.ok(flatPdfText.includes('INTERNALRECEIPT'), 'document identifies itself as an internal receipt');
  assert.ok(flatPdfText.includes('NOTAFISCALINVOICE'), 'document states it is not a fiscal invoice');
  assert.ok(/R-\d{6}/.test(flatPdfText), 'receipt number printed');
  assert.ok(flatPdfText.includes('GYM'), 'gym name printed');
  const chargeAfterPdf = await req(`/financial-obligations/${charge.id}`, { cookie: adminCookie });
  assert.equal(Number(chargeAfterPdf.json.data.paidAmount), 50000, 'generating the PDF does not change records');
  pass(`8. receipt PDF generated (${buffer.length} bytes), marked internal, no financial record modified`);

  console.log('\n[9] Period totals and distribution by payment method');
  const dashboard = await req(`/payments/dashboard?from=${today()}&to=${today()}`, { cookie: adminCookie });
  assert.equal(dashboard.response.status, 200, JSON.stringify(dashboard.json));
  const periodPayments = await prisma.paymentRecord.findMany({
    where: { gymId: SEED_GYM_ID, voidedAt: null, status: 'COMPLETED', id: { in: created.paymentIds } },
    select: { amount: true, method: true },
  });
  const expectedCollected = periodPayments.reduce((sum, row) => sum + Number(row.amount), 0);
  assert.equal(Number(dashboard.json.data.collectedInPeriod), expectedCollected, 'period total equals the sum of valid movements');
  assert.equal(Number(dashboard.json.data.voidedInPeriod), 15000, 'voided amount reported separately');
  assert.ok(dashboard.json.data.byMethod.length > 0, 'distribution by method present');
  const cashRow = dashboard.json.data.byMethod.find((row) => row.method === 'CASH');
  const expectedCash = periodPayments.filter((row) => row.method === 'CASH').reduce((sum, row) => sum + Number(row.amount), 0);
  assert.equal(Number(cashRow?.total ?? 0), expectedCash, 'cash distribution matches CASH movements only');

  const cashSummary = await req(`/payments/cash-summary?from=${today()}&to=${today()}`, { cookie: adminCookie });
  assert.equal(Number(cashSummary.json.data.totalCollected), expectedCollected);
  assert.equal(Number(cashSummary.json.data.voidedTotal), 15000);
  pass(`9. period totals match the database (${expectedCollected} collected, 15000 voided), grouped by method`);

  console.log('\n[10] Cash register open/close with declared vs expected');
  for (const register of await prisma.cashRegister.findMany({ where: { gymId: SEED_GYM_ID, status: 'OPEN' }, select: { id: true, notes: true } })) {
    if ((register.notes ?? '').includes(MARKER)) {
      await prisma.paymentRecord.updateMany({ where: { cashRegisterId: register.id }, data: { cashRegisterId: null } });
      await prisma.cashRegister.delete({ where: { id: register.id } });
    }
  }
  const alreadyOpen = await req('/cash-registers/current', { cookie: adminCookie });
  let registerId = alreadyOpen.json?.data?.id ?? null;
  let ownsRegister = false;
  if (!registerId) {
    const opened = await req('/cash-registers/open', {
      method: 'POST',
      cookie: adminCookie,
      body: { openingBalance: 1000, notes: `${MARKER} session` },
    });
    assert.equal(opened.response.status, 201, JSON.stringify(opened.json));
    registerId = opened.json.data.id;
    created.registerIds.push(registerId);
    ownsRegister = true;
    const duplicateOpen = await req('/cash-registers/open', { method: 'POST', cookie: adminCookie, body: { openingBalance: 0 } });
    assert.equal(duplicateOpen.response.status, 409, 'only one open register per gym');
  }

  const registerPayment = await req('/payments', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: created.memberId, concept: 'Cash register test', amount: 500, method: 'CASH' },
  });
  assert.equal(registerPayment.response.status, 201, JSON.stringify(registerPayment.json));
  created.paymentIds.push(registerPayment.json.data.id);
  assert.equal(registerPayment.json.data.cashRegisterId, registerId, 'payment attached to the open register');

  const current = await req('/cash-registers/current', { cookie: adminCookie });
  assert.equal(current.json.data.totals.operationCount >= 1, true);

  if (ownsRegister) {
    const expected = Number(current.json.data.totals.expectedCash);
    const closed = await req(`/cash-registers/${registerId}/close`, {
      method: 'POST',
      cookie: adminCookie,
      body: { countedAmount: expected - 50, notes: 'Short by 50 in the drawer' },
    });
    assert.equal(closed.response.status, 200, JSON.stringify(closed.json));
    assert.equal(closed.json.data.status, 'CLOSED');
    assert.equal(Number(closed.json.data.expectedAmount), expected);
    assert.equal(Number(closed.json.data.difference), -50, 'difference = declared - expected');
    const reopen = await req(`/cash-registers/${registerId}/close`, { method: 'POST', cookie: adminCookie, body: { countedAmount: 0 } });
    assert.equal(reopen.response.status, 409, 'a closed register cannot be closed twice');
    pass(`10. register opened, payment attached, closed with expected ${expected} vs declared ${expected - 50} (difference -50)`);
  } else {
    skip('10. close flow (the gym already had an open register created outside this test)');
  }

  console.log('\n[11] Permissions');
  for (const [role, email] of [['INSTRUCTOR', 'instructor@demo.local'], ['MEMBER', 'member@demo.local'], ['SUPER_ADMIN', 'superadmin@demo.local']]) {
    const session = await login(email, DEV_PASSWORD);
    for (const [method, path, body] of [
      ['GET', '/payments', undefined],
      ['POST', '/payments', { memberId: created.memberId, concept: 'Blocked', amount: 10, method: 'CASH' }],
      ['GET', '/financial-obligations', undefined],
      ['GET', '/cash-registers', undefined],
      ['GET', '/payments/dashboard', undefined],
    ]) {
      const denied = await req(path, { method, cookie: session.cookie, ...(body ? { body } : {}) });
      assert.equal(denied.response.status, 403, `${role} ${method} ${path} must be 403, got ${denied.response.status}`);
    }
    pass(`${role} blocked from administrative finance endpoints`);
  }
  const memberSession = await login('member@demo.local', DEV_PASSWORD);
  const ownPayments = await req('/payments/me', { cookie: memberSession.cookie });
  assert.equal(ownPayments.response.status, 200, 'member can read own payments');
  assert.ok(!ownPayments.json.data.some((row) => row.memberId === created.memberId), 'member does not see other members payments');
  const ownCharges = await req('/financial-obligations/me', { cookie: memberSession.cookie });
  assert.equal(ownCharges.response.status, 200);
  assert.ok(!ownCharges.json.data.some((row) => row.memberId === created.memberId), 'member does not see other members charges');
  pass('MEMBER reads only own payments and charges, and cannot register or modify anything');

  console.log('\n[12] Tenant isolation');
  created.foreignAdminEmail = `finance-admin-${Date.now()}@test.local`;
  const gymResponse = await req('/admin/gyms', {
    method: 'POST',
    cookie: (await login('superadmin@demo.local', DEV_PASSWORD)).cookie,
    body: {
      name: 'Disposable Finance Gym',
      slug: `finance-test-${Date.now()}`,
      email: '', phone: '', address: '', city: '', province: '', postalCode: '', country: '',
      timezone: 'America/Argentina/Buenos_Aires',
      adminFullName: 'Disposable Finance Admin',
      adminEmail: created.foreignAdminEmail,
    },
  });
  assert.equal(gymResponse.response.status, 201, JSON.stringify(gymResponse.json));
  created.foreignGym = gymResponse.json.data.id;
  await req('/auth/complete-setup', { method: 'POST', body: { token: gymResponse.json.setupToken, password: 'DisposablePass!2026' } });
  const foreignAdmin = await login(created.foreignAdminEmail, 'DisposablePass!2026');

  const foreignMember = await req('/members', {
    method: 'POST',
    cookie: foreignAdmin.cookie,
    body: {
      fullName: 'Foreign Finance Member', documentType: 'DNI', documentNumber: newDocument(),
      phone: '+54-11-3333-2020', joinDate: today(), status: 'ACTIVE', notes: MARKER,
      email: 'foreign-finance@test.local',
    },
  });
  assert.equal(foreignMember.response.status, 201, JSON.stringify(foreignMember.json));
  created.foreignMemberId = foreignMember.json.data.id;

  const crossPayment = await req('/payments', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: created.foreignMemberId, concept: 'Cross tenant attempt', amount: 100, method: 'CASH' },
  });
  assert.equal(crossPayment.response.status, 404, 'cannot register a payment for another gym member');

  const crossCharge = await req('/financial-obligations', {
    method: 'POST',
    cookie: adminCookie,
    body: { memberId: created.foreignMemberId, concept: 'Cross tenant charge', originalAmount: 100, dueDate: today() },
  });
  assert.equal(crossCharge.response.status, 404, 'cannot charge another gym member');

  const crossRead = await req(`/financial-obligations/${partialChargeId}`, { cookie: foreignAdmin.cookie });
  assert.equal(crossRead.response.status, 404, 'other gym cannot read the charge');
  const crossVoid = await req(`/payments/${full.json.data.id}/void`, { method: 'POST', cookie: foreignAdmin.cookie, body: { reason: 'intrusion' } });
  assert.equal(crossVoid.response.status, 404, 'other gym cannot void the payment');
  const foreignList = await req('/payments', { cookie: foreignAdmin.cookie });
  assert.equal(foreignList.json.data.length, 0, 'foreign gym payment list is empty');
  pass('12. cross-gym payments and charges return 404 and lists stay tenant-scoped');

  console.log('\n[13] Persistence in PostgreSQL after a new session');
  await req('/auth/logout', { method: 'POST', cookie: adminCookie });
  adminCookie = (await login('admin@demo.local', DEV_PASSWORD)).cookie;
  const persisted = await req(`/financial-obligations/${partialChargeId}`, { cookie: adminCookie });
  assert.equal(Number(persisted.json.data.paidAmount), 20000);
  assert.equal(Number(persisted.json.data.balance), 30000);
  const persistedPayment = await req(`/payments/${full.json.data.id}`, { cookie: adminCookie });
  assert.equal(persistedPayment.json.data.status, 'COMPLETED');
  const memberSummary = await req(`/members/${created.memberId}/summary`, { cookie: adminCookie });
  assert.equal(memberSummary.response.status, 200);
  assert.equal(Number(memberSummary.json.data.financial.outstandingTotal), 30400, 'member detail exposes the real outstanding total');
  assert.ok(memberSummary.json.data.financial.lastPaymentAt, 'last payment date exposed');
  pass('13. balances, statuses and member outstanding total persist across a new session');
} catch (error) {
  console.error('\n✗ FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  console.log('\n[cleanup] Removing test fixtures');
  try {
    if (created.foreignGym) {
      const profiles = await prisma.memberProfile.findMany({ where: { gymId: created.foreignGym }, select: { id: true } });
      for (const profile of profiles) {
        await prisma.paymentRecord.deleteMany({ where: { memberId: profile.id } });
        await prisma.financialObligation.deleteMany({ where: { memberId: profile.id } });
        await prisma.memberSubscription.deleteMany({ where: { memberId: profile.id } });
        await prisma.instructorMember.deleteMany({ where: { memberId: profile.id } });
      }
      await prisma.memberProfile.deleteMany({ where: { gymId: created.foreignGym } });
      const users = await prisma.gymMembership.findMany({ where: { gymId: created.foreignGym }, select: { userId: true } });
      await prisma.gymMembership.deleteMany({ where: { gymId: created.foreignGym } });
      for (const user of users) {
        await prisma.authToken.deleteMany({ where: { userId: user.userId } });
        await prisma.auditLog.deleteMany({ where: { userId: user.userId, gymId: created.foreignGym } });
        await prisma.user.deleteMany({ where: { id: user.userId } });
      }
      await prisma.cashRegister.deleteMany({ where: { gymId: created.foreignGym } });
      await prisma.receiptCounter.deleteMany({ where: { gymId: created.foreignGym } });
      await prisma.auditLog.deleteMany({ where: { gymId: created.foreignGym } });
      await prisma.gym.deleteMany({ where: { id: created.foreignGym } });
      console.log('  disposable gym removed');
    }

    if (created.paymentIds.length > 0) {
      await prisma.paymentRecord.deleteMany({ where: { id: { in: created.paymentIds } } });
    }
    if (created.memberId) {
      await prisma.paymentRecord.deleteMany({ where: { memberId: created.memberId } });
      await prisma.financialObligation.deleteMany({ where: { memberId: created.memberId } });
      await prisma.memberSubscription.deleteMany({ where: { memberId: created.memberId } });
      await prisma.memberProfile.delete({ where: { id: created.memberId } });
      await prisma.gymMembership.deleteMany({ where: { userId: created.memberUserId } });
      await prisma.auditLog.deleteMany({ where: { userId: created.memberUserId } });
      await prisma.user.delete({ where: { id: created.memberUserId } });
    }
    await prisma.cashRegister.deleteMany({ where: { gymId: SEED_GYM_ID, notes: { contains: MARKER } } });
    await prisma.membershipPlan.deleteMany({ where: { gymId: SEED_GYM_ID, name: { startsWith: 'Finance Plan' } } });
    console.log('  test members, charges, payments and registers removed');
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
