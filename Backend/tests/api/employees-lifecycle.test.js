const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, loginUser, claimsFor, closeDb } = require('../helpers/api');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');

const autoIds = [];
after(async () => {
  for (const id of autoIds) await db.query('DELETE FROM employees WHERE id = $1', [id]);
  await db.query("UPDATE departments SET manager_id = NULL WHERE id LIKE 'DEPT-TSTOFF%'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await db.query("DELETE FROM departments WHERE id LIKE 'DEPT-TSTOFF%'");
  await db.query("DELETE FROM audit_logs WHERE action = 'OFFBOARD_EMPLOYEE' AND record_id LIKE 'NV-T%'");
  await closeDb();
});

let n = 0;
const uniq = () => `${Date.now().toString(36)}${++n}`;

async function offboardFixture() {
  const suffix = uniq().toUpperCase().slice(-8);
  const deptId = `DEPT-TSTOFF${suffix}`.slice(0, 20);
  await db.query('INSERT INTO departments (id, name) VALUES ($1, $2)', [deptId, `Offboard ${suffix}`]);
  const emp = await createTestEmployee({ departmentId: deptId });
  const report = await createTestEmployee({ departmentId: deptId });
  await db.query('UPDATE employees SET manager_id = $1 WHERE id = $2', [emp.id, report.id]);
  await db.query('UPDATE departments SET manager_id = $1 WHERE id = $2', [emp.id, deptId]);
  await db.query(
    `INSERT INTO contracts (employee_id, contract_no, type, start_date, salary, status)
     VALUES ($1, $2, 'CHINH_THUC', '2025-01-01', 1000, 'HIEU_LUC')`, [emp.id, `T-${suffix}`]);
  const user = await createTestUser({ employeeId: emp.id });
  const session = await loginUser(user);
  return { emp, report, deptId, user, session };
}

test('offboard: terminates the employee and leaves no working session', async () => {
  const f = await offboardFixture();
  const res = await call('HR_DIRECTOR', 'post', `/api/employees/${f.emp.id}/offboard`,
    { terminationDate: '2026-09-30', reason: 'Nghỉ theo nguyện vọng', note: 'Đã bàn giao' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'DA_NGHI_VIEC');
  assert.equal(String(res.body.data.termination_date).slice(0, 10), '2026-09-30');
  assert.equal(res.body.directReports, 1);

  const u = (await db.query('SELECT is_active FROM users WHERE id = $1', [f.user.id])).rows[0];
  assert.equal(u.is_active, false);
  assert.equal((await call(null, 'post', '/api/auth/refresh', { refreshToken: f.session.refreshToken })).status, 401);
  assert.equal((await call(null, 'post', '/api/auth/login', { email: f.user.email, password: f.user.password })).status, 403);

  const c = (await db.query("SELECT status, end_date::text AS end_date FROM contracts WHERE employee_id = $1", [f.emp.id])).rows[0];
  assert.equal(c.status, 'DA_CHAM_DUT');
  assert.equal(c.end_date, '2026-09-30');
  const d = (await db.query('SELECT manager_id FROM departments WHERE id = $1', [f.deptId])).rows[0];
  assert.equal(d.manager_id, null);
});

test('offboard: is audited with the actor, also by the DB trigger', async () => {
  const f = await offboardFixture();
  const hrd = await claimsFor('HR_DIRECTOR');
  await call('HR_DIRECTOR', 'post', `/api/employees/${f.emp.id}/offboard`, { terminationDate: '2026-09-30', reason: 'x' });
  const app = await db.query("SELECT user_id FROM audit_logs WHERE action = 'OFFBOARD_EMPLOYEE' AND record_id = $1", [f.emp.id]);
  assert.equal(app.rows.length, 1);
  assert.equal(app.rows[0].user_id, hrd.userId);
  const trg = await db.query("SELECT user_id FROM audit_logs WHERE action = 'UPDATE' AND table_name = 'employees' AND record_id = $1 ORDER BY id DESC LIMIT 1", [f.emp.id]);
  assert.equal(trg.rows[0].user_id, hrd.userId);
});

test('offboard: already terminated 409, unknown 404, self 400', async () => {
  const f = await offboardFixture();
  const url = `/api/employees/${f.emp.id}/offboard`;
  assert.equal((await call('CEO', 'post', url, { terminationDate: '2026-09-30', reason: 'x' })).status, 200);
  assert.equal((await call('CEO', 'post', url, { terminationDate: '2026-09-30', reason: 'x' })).status, 409);
  assert.equal((await call('CEO', 'post', '/api/employees/NV-NOPE/offboard', { terminationDate: '2026-09-30', reason: 'x' })).status, 404);
  const me = await claimsFor('CEO');
  assert.equal((await call('CEO', 'post', `/api/employees/${me.employeeId}/offboard`, { terminationDate: '2026-09-30', reason: 'x' })).status, 400);
});

test('offboard: validation and permissions', async () => {
  const f = await offboardFixture();
  const url = `/api/employees/${f.emp.id}/offboard`;
  assert.equal((await call('CEO', 'post', url, { terminationDate: '2026-09-30' })).status, 400);
  assert.equal((await call('CEO', 'post', url, { terminationDate: '2026-09-30', reason: '' })).status, 400);
  assert.equal((await call('CEO', 'post', url, { terminationDate: '30/09/2026', reason: 'x' })).status, 400);
  assert.equal((await call('CEO', 'post', url, { terminationDate: '1999-01-01', reason: 'x' })).status, 400);
  assert.equal((await call('EMPLOYEE', 'post', url, { terminationDate: '2026-09-30', reason: 'x' })).status, 403);
  assert.equal((await call('LINE_MANAGER', 'post', url, { terminationDate: '2026-09-30', reason: 'x' })).status, 403);
  const still = (await db.query('SELECT status FROM employees WHERE id = $1', [f.emp.id])).rows[0];
  assert.notEqual(still.status, 'DA_NGHI_VIEC');
});

const row = (extra = {}) => {
  const s = uniq();
  return { id: `NV-T${s}`.slice(0, 20), fullName: `Import ${s}`, jobTitle: 'Dev', workEmail: `test-imp-${s}@example.test`, joinedDate: '2026-03-01', departmentId: 'DEPT-IT', baseSalary: 1000, ...extra };
};

test('import: valid rows are created with their initial contract', async () => {
  const a = row();
  const b = row({ id: undefined });
  delete b.id;
  const res = await call('HR_DIRECTOR', 'post', '/api/employees/import', { rows: [a, b] });
  assert.equal(res.status, 200);
  assert.equal(res.body.created, 2);
  assert.deepEqual(res.body.failed, []);
  assert.equal(res.body.createdIds.length, 2);
  assert.match(res.body.createdIds[1], /^NV-\d+$/);
  autoIds.push(...res.body.createdIds);
  const { rows } = await db.query('SELECT employee_id FROM contracts WHERE employee_id = ANY($1)', [res.body.createdIds]);
  assert.equal(rows.length, 2);
});

test('import: bad rows are reported by row number and good rows are kept', async () => {
  const ok = row();
  const badEmail = row({ workEmail: 'nope' });
  const dupInBatch = row({ workEmail: ok.workEmail });
  const badDept = row({ departmentId: 'DEPT-NOPE' });
  const ok2 = row();
  const res = await call('CEO', 'post', '/api/employees/import', { rows: [ok, badEmail, dupInBatch, badDept, ok2] });
  assert.equal(res.status, 200);
  assert.equal(res.body.created, 2);
  assert.deepEqual(res.body.failed.map((f) => f.row), [2, 3, 4]);
  assert.equal(res.body.failed[0].code, 'VALIDATION_ERROR');
  assert.equal(res.body.failed[1].code, 'CONFLICT');
  assert.equal(res.body.failed[2].code, 'NOT_FOUND');
  const { rows } = await db.query('SELECT id FROM employees WHERE id = ANY($1)', [[ok.id, badEmail.id, dupInBatch.id, badDept.id, ok2.id]]);
  assert.deepEqual(rows.map((r) => r.id).sort(), [ok.id, ok2.id].sort());
});

test('import: an email that already exists in the database is rejected', async () => {
  const existing = row();
  await call('CEO', 'post', '/api/employees', existing);
  const res = await call('CEO', 'post', '/api/employees/import', { rows: [row({ workEmail: existing.workEmail.toUpperCase() })] });
  assert.equal(res.body.created, 0);
  assert.equal(res.body.failed[0].code, 'CONFLICT');
});

test('import: dryRun reports the outcome but writes nothing', async () => {
  const a = row();
  const res = await call('CEO', 'post', '/api/employees/import', { rows: [a, row({ workEmail: 'bad' })], dryRun: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.dryRun, true);
  assert.equal(res.body.created, 1);
  assert.equal(res.body.failed.length, 1);
  const { rows } = await db.query('SELECT 1 FROM employees WHERE id = $1', [a.id]);
  assert.equal(rows.length, 0);
});

test('import: empty, oversized and malformed batches -> 400', async () => {
  assert.equal((await call('CEO', 'post', '/api/employees/import', { rows: [] })).status, 400);
  assert.equal((await call('CEO', 'post', '/api/employees/import', { rows: 'nope' })).status, 400);
  assert.equal((await call('CEO', 'post', '/api/employees/import', {})).status, 400);
  const many = Array.from({ length: 501 }, () => ({}));
  assert.equal((await call('CEO', 'post', '/api/employees/import', { rows: many })).status, 400);
});

test('import: only CEO and HR_DIRECTOR', async () => {
  assert.equal((await call('LINE_MANAGER', 'post', '/api/employees/import', { rows: [row()] })).status, 403);
  assert.equal((await call('EMPLOYEE', 'post', '/api/employees/import', { rows: [row()] })).status, 403);
});
