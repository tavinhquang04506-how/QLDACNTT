const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, loginUser, closeDb } = require('../helpers/api');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE record_id LIKE 'DEPT-TSTAUD%' OR action LIKE 'TEST_AUD%'");
  await db.query("DELETE FROM departments WHERE id LIKE 'DEPT-TSTAUD%'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('CEO can read the log, newest first; HRD and EMPLOYEE are refused', async () => {
  await call('CEO', 'post', '/api/departments', { code: 'TSTAUD1', name: 'Audit Dept 1' });
  const res = await call('CEO', 'get', '/api/audit-logs');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length > 0);
  const times = res.body.data.map((r) => new Date(r.createdAt).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.equal((await call('HR_DIRECTOR', 'get', '/api/audit-logs')).status, 403);
  assert.equal((await call('EMPLOYEE', 'get', '/api/audit-logs')).status, 403);
  assert.equal((await call(null, 'get', '/api/audit-logs')).status, 401);
});

test('ADMIN can read the log', async () => {
  const admin = await createTestUser({ role: 'ADMIN' });
  const { accessToken } = await loginUser(admin);
  assert.equal((await callWith(accessToken, 'get', '/api/audit-logs')).status, 200);
});

test('a write elsewhere shows up with actor details and a recordId filter', async () => {
  await call('CEO', 'post', '/api/departments', { code: 'TSTAUD2', name: 'Audit Dept 2' });
  const res = await call('CEO', 'get', '/api/audit-logs?table=departments&action=CREATE_DEPARTMENT');
  assert.equal(res.status, 200);
  const row = res.body.data.find((r) => r.recordId === 'DEPT-TSTAUD2');
  assert.ok(row);
  assert.equal(row.tableName, 'departments');
  assert.equal(row.action, 'CREATE_DEPARTMENT');
  assert.equal(row.userEmail, 'ceo@fwbnexus.vn');
  assert.ok(res.body.data.every((r) => r.tableName === 'departments' && r.action === 'CREATE_DEPARTMENT'));
});

test('filter by userId and by date range', async () => {
  const anyRow = (await call('CEO', 'get', '/api/audit-logs?action=CREATE_DEPARTMENT')).body.data[0];
  const byUser = await call('CEO', 'get', `/api/audit-logs?userId=${anyRow.userId}`);
  assert.ok(byUser.body.data.length > 0);
  assert.ok(byUser.body.data.every((r) => r.userId === anyRow.userId));

  const future = await call('CEO', 'get', '/api/audit-logs?from=2999-01-01');
  assert.equal(future.body.data.length, 0);
  const past = await call('CEO', 'get', '/api/audit-logs?to=2000-01-01');
  assert.equal(past.body.data.length, 0);
});

test('invalid filters -> 400', async () => {
  assert.equal((await call('CEO', 'get', '/api/audit-logs?userId=nope')).status, 400);
  assert.equal((await call('CEO', 'get', '/api/audit-logs?from=not-a-date')).status, 400);
});

test('pagination clamps the limit and reports totals', async () => {
  const res = await call('CEO', 'get', '/api/audit-logs?limit=100000&page=0');
  assert.equal(res.body.pagination.limit, 200);
  assert.equal(res.body.pagination.page, 1);
  const small = await call('CEO', 'get', '/api/audit-logs?limit=2');
  assert.equal(small.body.data.length, 2);
  assert.ok(small.body.pagination.total >= 2);
});

test('secrets are never exposed through the log', async () => {
  const res = await call('CEO', 'get', '/api/audit-logs?limit=200');
  const raw = JSON.stringify(res.body);
  assert.equal(raw.includes('"password_hash":"$2'), false);
});

test('ADMIN never sees salary or personal data in employee audit rows; CEO does but never face_encoding', async () => {
  const emp = await createTestEmployee();
  await db.query("UPDATE employees SET base_salary = 123456, citizen_id = '079123456789', face_encoding = '\\xdeadbeef'::bytea WHERE id = $1", [emp.id]);
  const find = (res) => res.body.data.filter((r) => r.recordId === emp.id && r.action === 'UPDATE');

  const admin = await createTestUser({ role: 'ADMIN' });
  const { accessToken } = await loginUser(admin);
  const asAdmin = find(await callWith(accessToken, 'get', '/api/audit-logs?table=employees&limit=200'));
  assert.ok(asAdmin.length > 0);
  for (const r of asAdmin) {
    assert.equal(r.newValues.base_salary, '[REDACTED]');
    assert.equal(r.newValues.citizen_id, '[REDACTED]');
    assert.equal('face_encoding' in r.newValues, false);
  }

  const asCeo = find(await call('CEO', 'get', '/api/audit-logs?table=employees&limit=200'));
  assert.ok(asCeo.some((r) => Number(r.newValues.base_salary) === 123456));
  assert.ok(asCeo.every((r) => !('face_encoding' in r.newValues)));
});
