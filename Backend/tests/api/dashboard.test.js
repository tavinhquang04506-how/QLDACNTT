const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, loginUser, closeDb } = require('../helpers/api');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');
const { giveBalance, deleteTestLeaves } = require('../helpers/leaves');

after(async () => {
  await deleteTestLeaves();
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('company view (CEO/HR): live counts that match the database', async () => {
  const s = await employeeSession({ departmentId: 'DEPT-MKT' });
  await callWith(s.token, 'post', '/api/attendance/check-in', {});
  const res = await call('HR_DIRECTOR', 'get', '/api/dashboard/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.scope, 'company');
  const o = res.body.data.overview;
  const count = async (sql) => Number((await db.query(sql)).rows[0].n);
  assert.equal(o.total_active, await count("SELECT COUNT(*) AS n FROM employees WHERE status = 'DANG_LAM_VIEC'"));
  assert.equal(o.total_inactive, await count("SELECT COUNT(*) AS n FROM employees WHERE status = 'DA_NGHI_VIEC'"));
  assert.equal(o.present_today, await count('SELECT COUNT(*) AS n FROM attendance_logs WHERE work_date = CURRENT_DATE AND check_in_time IS NOT NULL'));
  assert.equal(o.late_today, await count("SELECT COUNT(*) AS n FROM attendance_logs WHERE work_date = CURRENT_DATE AND status = 'DI_MUON'"));
  assert.equal(o.pending_leaves, await count("SELECT COUNT(*) AS n FROM leave_requests WHERE stage IN ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN')"));
  assert.equal(o.active_projects, await count("SELECT COUNT(*) AS n FROM projects WHERE status = 'in_progress'"));
  assert.equal(o.open_tasks, await count("SELECT COUNT(*) AS n FROM tasks WHERE stage IN ('todo', 'in_progress')"));
  assert.ok(o.last_refreshed);
  assert.ok(res.body.data.departmentStats.length >= 6);
  assert.ok(res.body.data.departmentStats.every((d) => typeof d.headcount === 'number'));
  assert.ok(res.body.data.pendingLeaves.length <= 5);
  assert.equal((await call('CEO', 'get', '/api/dashboard/stats')).body.data.scope, 'company');
});

test('department view (manager): only their department', async () => {
  const lm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-ACC' });
  const res = await callWith(lm.token, 'get', '/api/dashboard/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.scope, 'department');
  const active = Number((await db.query("SELECT COUNT(*) AS n FROM employees WHERE status = 'DANG_LAM_VIEC' AND department_id = 'DEPT-ACC'")).rows[0].n);
  assert.equal(res.body.data.overview.total_active, active);
  assert.deepEqual(res.body.data.departmentStats.map((d) => d.id), ['DEPT-ACC']);
  assert.ok(res.body.data.pendingLeaves.every((l) => l.department_id === 'DEPT-ACC'));
});

test('personal view (employee): no company figures, only their own', async () => {
  const s = await employeeSession({ departmentId: 'DEPT-IT' });
  await giveBalance(s.employeeId, new Date().getFullYear(), 12);
  await callWith(s.token, 'post', '/api/attendance/check-in', {});
  const res = await callWith(s.token, 'get', '/api/dashboard/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.scope, 'self');
  const o = res.body.data.overview;
  assert.equal(o.checked_in_today, true);
  assert.equal(o.checked_out_today, false);
  assert.equal(Number(o.leave_remaining), 12);
  assert.equal(typeof o.open_tasks, 'number');
  assert.equal(typeof o.pending_requests, 'number');
  assert.equal('total_active' in o, false);
  assert.deepEqual(res.body.data.departmentStats, []);
  assert.deepEqual(res.body.data.pendingLeaves, []);
});

test('ADMIN and KIOSK cannot read the dashboard', async () => {
  for (const role of ['ADMIN', 'KIOSK']) {
    const u = await createTestUser({ role });
    const { accessToken } = await loginUser(u);
    assert.equal((await callWith(accessToken, 'get', '/api/dashboard/stats')).status, 403, role);
  }
  assert.equal((await call(null, 'get', '/api/dashboard/stats')).status, 401);
});

test('the dashboard no longer refreshes a materialized view on every request', async () => {
  const before = (await db.query("SELECT last_refreshed FROM mv_dashboard_stats")).rows[0].last_refreshed;
  await call('CEO', 'get', '/api/dashboard/stats');
  const after2 = (await db.query("SELECT last_refreshed FROM mv_dashboard_stats")).rows[0].last_refreshed;
  assert.equal(String(after2), String(before));
});
