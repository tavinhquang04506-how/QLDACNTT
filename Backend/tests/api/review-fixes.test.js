const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, loginUser, closeDb } = require('../helpers/api');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');

const created = [];
after(async () => {
  for (const id of created) await db.query('DELETE FROM employees WHERE id = $1', [id]);
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

test('an access token stops working the moment the account is deactivated', async () => {
  const u = await createTestUser();
  const session = await loginUser(u);
  assert.equal((await callWith(session.accessToken, 'get', '/api/auth/me')).status, 200);
  await call('CEO', 'patch', `/api/users/${u.id}`, { isActive: false });
  const res = await callWith(session.accessToken, 'get', '/api/auth/me');
  assert.equal(res.status, 401);
});

test('offboarding cuts access immediately, not when the token expires', async () => {
  const emp = await createTestEmployee();
  const u = await createTestUser({ employeeId: emp.id });
  const session = await loginUser(u);
  await call('HR_DIRECTOR', 'post', `/api/employees/${emp.id}/offboard`, { terminationDate: '2026-09-30', reason: 'test' });
  assert.equal((await callWith(session.accessToken, 'get', '/api/auth/me')).status, 401);
});

test('a role change applies to tokens that were already issued', async () => {
  const u = await createTestUser({ role: 'LINE_MANAGER' });
  const session = await loginUser(u);
  assert.equal((await callWith(session.accessToken, 'get', '/api/attendance/live')).status, 200);
  await call('CEO', 'patch', `/api/users/${u.id}`, { role: 'EMPLOYEE' });
  assert.equal((await callWith(session.accessToken, 'get', '/api/attendance/live')).status, 403);
});

test('a KIOSK account can only punch, read its own profile and change its password', async () => {
  const kiosk = await createTestUser({ role: 'KIOSK' });
  const { accessToken } = await loginUser(kiosk);
  for (const url of ['/api/departments', '/api/positions', '/api/leaves/types', '/api/dashboard/stats', '/api/projects', '/api/payroll/me']) {
    assert.equal((await callWith(accessToken, 'get', url)).status, 403, url);
  }
  assert.equal((await callWith(accessToken, 'get', '/api/auth/me')).status, 200);
  const punch = await callWith(accessToken, 'post', '/api/attendance/kiosk/punch', {});
  assert.equal(punch.status, 400); // reaches the handler (validation), i.e. not blocked
});

test('ADMIN cannot create, promote, edit or reset privileged accounts, but can help regular users', async () => {
  const admin = await createTestUser({ role: 'ADMIN' });
  const { accessToken } = await loginUser(admin);
  const ceo = await createTestUser({ role: 'CEO' });
  const hrd = await createTestUser({ role: 'HR_DIRECTOR' });
  const peer = await createTestUser({ role: 'ADMIN' });
  for (const target of [ceo, hrd, peer]) {
    assert.equal((await callWith(accessToken, 'post', `/api/users/${target.id}/reset-password`)).status, 403, target.role);
    assert.equal((await callWith(accessToken, 'patch', `/api/users/${target.id}`, { isActive: false })).status, 403, target.role);
    assert.equal((await callWith(accessToken, 'post', `/api/users/${target.id}/unlock`)).status, 403, target.role);
  }
  const emp = await createTestEmployee();
  for (const role of ['CEO', 'HR_DIRECTOR', 'ADMIN']) {
    assert.equal((await callWith(accessToken, 'post', '/api/users', { employeeId: emp.id, email: `test-${role}@example.test`, role })).status, 403, role);
  }
  const regular = await createTestUser({ role: 'EMPLOYEE' });
  assert.equal((await callWith(accessToken, 'post', `/api/users/${regular.id}/reset-password`)).status, 200);
});

test('department budgets are visible only to CEO and HR_DIRECTOR', async () => {
  for (const role of ['CEO', 'HR_DIRECTOR']) {
    const list = await call(role, 'get', '/api/departments');
    assert.ok(list.body.data.every((d) => has(d, 'budget_yearly')), role);
    assert.ok(has((await call(role, 'get', '/api/departments/DEPT-IT')).body.data, 'budget_yearly'), role);
  }
  for (const role of ['LINE_MANAGER', 'EMPLOYEE']) {
    const list = await call(role, 'get', '/api/departments');
    assert.ok(list.body.data.every((d) => !has(d, 'budget_yearly')), role);
    assert.equal(has((await call(role, 'get', '/api/departments/DEPT-IT')).body.data, 'budget_yearly'), false, role);
  }
  const admin = await createTestUser({ role: 'ADMIN' });
  const { accessToken } = await loginUser(admin);
  assert.equal(has((await callWith(accessToken, 'get', '/api/departments/DEPT-IT')).body.data, 'budget_yearly'), false);
});

test('a dry-run import does not consume employee codes or contract ids', async () => {
  const seq = async () => (await db.query(`SELECT (SELECT last_value FROM seq_emp_code) AS e, (SELECT last_value FROM seq_contract_id) AS c`)).rows[0];
  const before = await seq();
  const rows = Array.from({ length: 3 }, (_, i) => ({
    fullName: `Dry ${i}`, jobTitle: 'Dev', workEmail: `test-dry-${Date.now()}-${i}@example.test`, joinedDate: '2026-03-01',
  }));
  const res = await call('CEO', 'post', '/api/employees/import', { rows, dryRun: true });
  assert.equal(res.body.created, 3);
  assert.deepEqual(await seq(), before);
  created.push(); // nothing was written
});

test('re-enabling an account does not resurrect its old sessions', async () => {
  const u = await createTestUser();
  const session = await loginUser(u);
  await call('CEO', 'patch', `/api/users/${u.id}`, { isActive: false });
  await call('CEO', 'patch', `/api/users/${u.id}`, { isActive: true });
  const res = await call(null, 'post', '/api/auth/refresh', { refreshToken: session.refreshToken });
  assert.equal(res.status, 401);
});
