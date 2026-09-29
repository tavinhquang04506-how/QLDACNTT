const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, loginUser, tokenFor, closeDb } = require('../helpers/api');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE table_name = 'users' AND action IN ('CREATE_USER','UPDATE_USER','RESET_PASSWORD','UNLOCK_USER')");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

const newEmail = () => `test-${Math.random().toString(16).slice(2, 10)}@example.test`;

test('GET /api/users: EMPLOYEE 403, CEO 200 without password hashes', async () => {
  assert.equal((await call('EMPLOYEE', 'get', '/api/users')).status, 403);
  const res = await call('CEO', 'get', '/api/users');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 7);
  assert.ok(res.body.pagination.total >= 7);
  const raw = JSON.stringify(res.body);
  assert.equal(raw.includes('password_hash'), false);
  assert.equal(raw.includes('passwordHash'), false);
  assert.equal(raw.includes('$2'), false);
});

test('GET /api/users filters by role and search', async () => {
  const byRole = await call('HR_DIRECTOR', 'get', '/api/users?role=CEO');
  assert.equal(byRole.status, 200);
  assert.ok(byRole.body.data.length >= 1);
  assert.ok(byRole.body.data.every((u) => u.roleCode === 'CEO'));

  const bySearch = await call('HR_DIRECTOR', 'get', '/api/users?search=ceo@fwbnexus');
  assert.equal(bySearch.body.data.length, 1);
});

test('GET /api/users clamps a huge limit instead of failing', async () => {
  const res = await call('CEO', 'get', '/api/users?limit=100000&page=-4');
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.limit, 200);
  assert.equal(res.body.pagination.page, 1);
});

test('GET /api/users/:id: found, unknown, and malformed id', async () => {
  const list = await call('CEO', 'get', '/api/users?role=CEO');
  const id = list.body.data[0].id;
  const ok = await call('CEO', 'get', `/api/users/${id}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.id, id);
  assert.equal((await call('CEO', 'get', '/api/users/00000000-0000-0000-0000-000000000000')).status, 404);
  assert.equal((await call('CEO', 'get', '/api/users/not-a-uuid')).status, 400);
});

test('create: HR_DIRECTOR gets a one-time temporary password and the account works', async () => {
  const emp = await createTestEmployee();
  const email = newEmail();
  const res = await call('HR_DIRECTOR', 'post', '/api/users', { employeeId: emp.id, email, role: 'EMPLOYEE' });
  assert.equal(res.status, 201);
  assert.ok(res.body.temporaryPassword.length >= 12);
  assert.equal(res.body.data.email, email);
  assert.equal(res.body.data.mustChangePassword, true);
  assert.equal(JSON.stringify(res.body.data).includes('password'), false);

  const session = await loginUser({ email, password: res.body.temporaryPassword });
  assert.equal(session.mustChangePassword, true);

  // user_roles is kept in sync with users.role_code
  const { rows } = await db.query(
    `SELECT r.role_code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`, [res.body.data.id]);
  assert.deepEqual(rows.map((r) => r.role_code), ['EMPLOYEE']);
});

test('create: the temporary password never reaches audit_logs', async () => {
  const emp = await createTestEmployee();
  const res = await call('CEO', 'post', '/api/users', { employeeId: emp.id, email: newEmail(), role: 'EMPLOYEE' });
  const { rows } = await db.query("SELECT new_values FROM audit_logs WHERE action = 'CREATE_USER' AND record_id = $1", [res.body.data.id]);
  assert.equal(rows.length, 1);
  assert.equal(JSON.stringify(rows[0].new_values).includes(res.body.temporaryPassword), false);
});

test('create: an admin-supplied password must satisfy the policy and is not echoed back', async () => {
  const emp = await createTestEmployee();
  const weak = await call('CEO', 'post', '/api/users', { employeeId: emp.id, email: newEmail(), role: 'EMPLOYEE', password: 'abc' });
  assert.equal(weak.status, 400);
  const ok = await call('CEO', 'post', '/api/users', { employeeId: emp.id, email: newEmail(), role: 'EMPLOYEE', password: 'Supplied123' });
  assert.equal(ok.status, 201);
  assert.equal('temporaryPassword' in ok.body, false);
});

test('create: HR_DIRECTOR cannot create CEO/ADMIN accounts, CEO can', async () => {
  const e1 = await createTestEmployee();
  assert.equal((await call('HR_DIRECTOR', 'post', '/api/users', { employeeId: e1.id, email: newEmail(), role: 'CEO' })).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'post', '/api/users', { employeeId: e1.id, email: newEmail(), role: 'ADMIN' })).status, 403);
  assert.equal((await call('CEO', 'post', '/api/users', { employeeId: e1.id, email: newEmail(), role: 'HR_DIRECTOR' })).status, 201);
});

test('create: EMPLOYEE and LINE_MANAGER get 403', async () => {
  const emp = await createTestEmployee();
  const body = { employeeId: emp.id, email: newEmail(), role: 'EMPLOYEE' };
  assert.equal((await call('EMPLOYEE', 'post', '/api/users', body)).status, 403);
  assert.equal((await call('LINE_MANAGER', 'post', '/api/users', body)).status, 403);
});

test('create: duplicate email 409, unknown employee 404, employee already has an account 409', async () => {
  const e1 = await createTestEmployee();
  const e2 = await createTestEmployee();
  const email = newEmail();
  assert.equal((await call('CEO', 'post', '/api/users', { employeeId: e1.id, email, role: 'EMPLOYEE' })).status, 201);
  assert.equal((await call('CEO', 'post', '/api/users', { employeeId: e2.id, email, role: 'EMPLOYEE' })).status, 409);
  assert.equal((await call('CEO', 'post', '/api/users', { employeeId: 'NV-NOPE', email: newEmail(), role: 'EMPLOYEE' })).status, 404);
  assert.equal((await call('CEO', 'post', '/api/users', { employeeId: e1.id, email: newEmail(), role: 'EMPLOYEE' })).status, 409);
});

test('create: validation errors -> 400', async () => {
  const emp = await createTestEmployee();
  assert.equal((await call('CEO', 'post', '/api/users', { employeeId: emp.id, email: 'nope', role: 'EMPLOYEE' })).status, 400);
  assert.equal((await call('CEO', 'post', '/api/users', { employeeId: emp.id, email: newEmail(), role: 'GOD' })).status, 400);
  assert.equal((await call('CEO', 'post', '/api/users', { email: newEmail(), role: 'EMPLOYEE' })).status, 400);
});

test('create: a KIOSK account needs no employee', async () => {
  const res = await call('HR_DIRECTOR', 'post', '/api/users', { email: newEmail(), role: 'KIOSK' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.employeeId, null);
});

test('PATCH: role change syncs user_roles; HRD cannot promote to CEO', async () => {
  const target = await createTestUser({ role: 'EMPLOYEE' });
  const up = await call('HR_DIRECTOR', 'patch', `/api/users/${target.id}`, { role: 'LINE_MANAGER' });
  assert.equal(up.status, 200);
  assert.equal(up.body.data.roleCode, 'LINE_MANAGER');
  const { rows } = await db.query(
    `SELECT r.role_code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`, [target.id]);
  assert.deepEqual(rows.map((r) => r.role_code), ['LINE_MANAGER']);
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/users/${target.id}`, { role: 'CEO' })).status, 403);
});

test('PATCH: HRD cannot modify a CEO account', async () => {
  const ceo = await createTestUser({ role: 'CEO' });
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/users/${ceo.id}`, { isActive: false })).status, 403);
});

test('PATCH: nobody changes their own role or deactivates themselves', async () => {
  const me = await createTestUser({ role: 'HR_DIRECTOR' });
  const { accessToken } = await loginUser(me);
  const role = await callWith(accessToken, 'patch', `/api/users/${me.id}`, { role: 'CEO' });
  assert.equal(role.status, 400);
  const off = await callWith(accessToken, 'patch', `/api/users/${me.id}`, { isActive: false });
  assert.equal(off.status, 400);
});

test('PATCH: deactivation revokes refresh tokens and blocks login', async () => {
  const target = await createTestUser();
  const session = await loginUser(target);
  const res = await call('CEO', 'patch', `/api/users/${target.id}`, { isActive: false });
  assert.equal(res.status, 200);
  const refreshed = await call(null, 'post', '/api/auth/refresh', { refreshToken: session.refreshToken });
  assert.equal(refreshed.status, 401);
  const login = await call(null, 'post', '/api/auth/login', { email: target.email, password: target.password });
  assert.equal(login.status, 403);
});

test('PATCH: empty body and unknown user', async () => {
  const target = await createTestUser();
  assert.equal((await call('CEO', 'patch', `/api/users/${target.id}`, {})).status, 400);
  assert.equal((await call('CEO', 'patch', '/api/users/00000000-0000-0000-0000-000000000000', { isActive: true })).status, 404);
});

test('reset-password: temp password works, unlocks, flags change, revokes sessions', async () => {
  const target = await createTestUser();
  const session = await loginUser(target);
  await db.query("UPDATE users SET locked_until = NOW() + INTERVAL '10 minutes', failed_login_attempts = 5 WHERE id = $1", [target.id]);

  const res = await call('HR_DIRECTOR', 'post', `/api/users/${target.id}/reset-password`);
  assert.equal(res.status, 200);
  assert.ok(res.body.temporaryPassword.length >= 12);

  assert.equal((await call(null, 'post', '/api/auth/refresh', { refreshToken: session.refreshToken })).status, 401);
  const again = await loginUser({ email: target.email, password: res.body.temporaryPassword });
  assert.equal(again.mustChangePassword, true);
  assert.equal((await call(null, 'post', '/api/auth/login', { email: target.email, password: target.password })).status, 401);
});

test('reset-password: HRD cannot reset a CEO, EMPLOYEE gets 403', async () => {
  const ceo = await createTestUser({ role: 'CEO' });
  assert.equal((await call('HR_DIRECTOR', 'post', `/api/users/${ceo.id}/reset-password`)).status, 403);
  assert.equal((await call('EMPLOYEE', 'post', `/api/users/${ceo.id}/reset-password`)).status, 403);
  assert.equal((await call('CEO', 'post', `/api/users/${ceo.id}/reset-password`)).status, 200);
});

test('unlock clears the lock and failed attempts', async () => {
  const target = await createTestUser();
  await db.query("UPDATE users SET locked_until = NOW() + INTERVAL '10 minutes', failed_login_attempts = 5 WHERE id = $1", [target.id]);
  const res = await call('HR_DIRECTOR', 'post', `/api/users/${target.id}/unlock`);
  assert.equal(res.status, 200);
  const { rows } = await db.query('SELECT locked_until, failed_login_attempts FROM users WHERE id = $1', [target.id]);
  assert.equal(rows[0].locked_until, null);
  assert.equal(rows[0].failed_login_attempts, 0);
});

test('every write leaves an audit row', async () => {
  const target = await createTestUser();
  await call('CEO', 'patch', `/api/users/${target.id}`, { role: 'LINE_MANAGER' });
  await call('CEO', 'post', `/api/users/${target.id}/reset-password`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'users' AND record_id = $1 ORDER BY id", [target.id]);
  assert.deepEqual(rows.map((r) => r.action), ['UPDATE_USER', 'RESET_PASSWORD']);
});

test('tokens issued before a role change still resolve the new role on refresh', async () => {
  const target = await createTestUser({ role: 'EMPLOYEE' });
  const session = await loginUser(target);
  await call('CEO', 'patch', `/api/users/${target.id}`, { role: 'LINE_MANAGER' });
  const refreshed = await call(null, 'post', '/api/auth/refresh', { refreshToken: session.refreshToken });
  assert.equal(refreshed.status, 200);
  const claims = JSON.parse(Buffer.from(refreshed.body.accessToken.split('.')[1], 'base64url').toString());
  assert.equal(claims.roleCode, 'LINE_MANAGER');
  await tokenFor('CEO');
});
