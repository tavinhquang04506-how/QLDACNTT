const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, claimsFor, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');
const { giveBalance, usedDays, deleteTestLeaves } = require('../helpers/leaves');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE action LIKE '%\\_LEAVE' AND table_name = 'leave_requests'");
  await deleteTestLeaves();
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

// Fixed far-future Monday..Friday so results do not depend on today's date.
const MON = '2027-03-01';
const FRI = '2027-03-05';
const leave = (extra = {}) => ({ leaveTypeId: 'LT-AL', startDate: MON, endDate: FRI, reason: 'Nghỉ phép năm', ...extra });

async function setup({ role = 'EMPLOYEE', departmentId = 'DEPT-IT', balance = 12 } = {}) {
  const s = await employeeSession({ role, departmentId });
  if (balance !== null) await giveBalance(s.employeeId, 2027, balance);
  return s;
}
const submit = (s, extra) => callWith(s.token, 'post', '/api/leaves', leave(extra));

test('create: working days are computed when totalDays is omitted; both naming styles work', async () => {
  const s = await setup();
  const res = await submit(s);
  assert.equal(res.status, 201);
  assert.equal(Number(res.body.data.total_days), 5);
  assert.equal(res.body.data.stage, 'CHO_TRUONG_PHONG_DUYET');
  assert.match(res.body.data.id, /^LP-\d{4}-\d{3,}$/);
  assert.equal(res.body.data.start_date, MON);

  const snake = await callWith((await setup()).token, 'post', '/api/leaves', {
    leave_type_id: 'LT-AL', start_date: '2027-04-05', end_date: '2027-04-06', total_days: 1.5, reason: 'r',
  });
  assert.equal(snake.status, 201);
  assert.equal(Number(snake.body.data.total_days), 1.5);
});

test('create: ids never collide, even for simultaneous submissions', async () => {
  const sessions = await Promise.all([setup(), setup(), setup(), setup()]);
  const results = await Promise.all(sessions.map((s) => submit(s)));
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(new Set(results.map((r) => r.body.data.id)).size, 4);
});

test('create: validation', async () => {
  const s = await setup();
  const bad = [
    { leaveTypeId: undefined }, { startDate: '2027-03-06', endDate: '2027-03-01' }, { startDate: '01/03/2027' },
    { reason: '' }, { totalDays: 0 }, { totalDays: -1 }, { totalDays: 1.3 }, { totalDays: 9 }, { totalDays: 'lots' },
  ];
  for (const extra of bad) {
    const res = await submit(s, extra);
    assert.equal(res.status, 400, JSON.stringify(extra));
  }
  assert.equal((await submit(s, { leaveTypeId: 'LT-NOPE' })).status, 404);
});

test('create: an inactive leave type is refused', async () => {
  const s = await setup();
  await db.query("UPDATE leave_types SET is_active = FALSE WHERE id = 'LT-BT'");
  try {
    assert.equal((await submit(s, { leaveTypeId: 'LT-BT' })).status, 400);
  } finally {
    await db.query("UPDATE leave_types SET is_active = TRUE WHERE id = 'LT-BT'");
  }
});

test('create: an account without an employee record cannot submit', async () => {
  const { createTestUser } = require('../helpers/users');
  const { loginUser } = require('../helpers/api');
  const u = await createTestUser();
  const { accessToken } = await loginUser(u);
  assert.equal((await callWith(accessToken, 'post', '/api/leaves', leave())).status, 403);
});

test('create: overlapping requests are refused, cancelled ones are not counted', async () => {
  const s = await setup();
  const first = await submit(s, { startDate: '2027-05-03', endDate: '2027-05-05' });
  assert.equal(first.status, 201);
  const overlap = await submit(s, { startDate: '2027-05-05', endDate: '2027-05-07' });
  assert.equal(overlap.status, 409);
  assert.equal(overlap.body.code, 'LEAVE_OVERLAP');
  assert.equal((await submit(s, { startDate: '2027-05-06', endDate: '2027-05-07' })).status, 201);
  await callWith(s.token, 'patch', `/api/leaves/${first.body.data.id}/cancel`);
  assert.equal((await submit(s, { startDate: '2027-05-03', endDate: '2027-05-04' })).status, 201);
});

test('create: the balance is checked, pending requests count against it', async () => {
  const s = await setup({ balance: 6 });
  assert.equal((await submit(s, { startDate: '2027-06-07', endDate: '2027-06-11' })).status, 201); // Mon-Fri = 5 of 6
  const res = await submit(s, { startDate: '2027-06-14', endDate: '2027-06-15' }); // 2 more, only 1 left
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'INSUFFICIENT_BALANCE');
});

test('create: a leave type without a balance row is not limited', async () => {
  const s = await setup({ balance: null });
  assert.equal((await submit(s, { leaveTypeId: 'LT-UL' })).status, 201);
});

test('the starting stage depends on who submits', async () => {
  const lm = await setup({ role: 'LINE_MANAGER' });
  assert.equal((await submit(lm)).body.data.stage, 'CHO_HR_PHE_CHUAN');
  const hrd = await setup({ role: 'HR_DIRECTOR', departmentId: 'DEPT-HR' });
  assert.equal((await submit(hrd)).body.data.stage, 'CHO_HR_PHE_CHUAN');
});

test('a CEO request is approved immediately and the balance is charged', async () => {
  const ceo = await setup({ role: 'CEO', departmentId: 'DEPT-CEO' });
  const res = await submit(ceo);
  assert.equal(res.status, 201);
  assert.equal(res.body.data.stage, 'DA_PHE_DUYET');
  assert.equal(res.body.data.hr_approved_by, ceo.employeeId);
  assert.equal(await usedDays(ceo.employeeId, 2027), 5);
});

test('full chain: employee -> manager -> HR, and the balance is charged only at the end', async () => {
  const emp = await setup();
  const mgr = await setup({ role: 'LINE_MANAGER' });
  const id = (await submit(emp)).body.data.id;

  const step1 = await callWith(mgr.token, 'patch', `/api/leaves/${id}/approve`, { note: 'OK' });
  assert.equal(step1.status, 200);
  assert.equal(step1.body.data.stage, 'CHO_HR_PHE_CHUAN');
  assert.equal(step1.body.data.manager_approved_by, mgr.employeeId);
  assert.equal(await usedDays(emp.employeeId, 2027), 0);

  const step2 = await call('HR_DIRECTOR', 'patch', `/api/leaves/${id}/approve`, {});
  assert.equal(step2.status, 200);
  assert.equal(step2.body.data.stage, 'DA_PHE_DUYET');
  assert.equal(await usedDays(emp.employeeId, 2027), 5);
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/leaves/${id}/approve`, {})).status, 409);
});

test('approval scope: a manager of another department cannot act, and HR cannot approve step one', async () => {
  const emp = await setup({ departmentId: 'DEPT-ACC' });
  const outsider = await setup({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const id = (await submit(emp)).body.data.id;
  assert.equal((await callWith(outsider.token, 'patch', `/api/leaves/${id}/approve`, {})).status, 403);
  assert.equal((await callWith(outsider.token, 'patch', `/api/leaves/${id}/reject`, { note: 'no' })).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/leaves/${id}/approve`, {})).status, 403);
});

test('a manager cannot approve their own request, and only the CEO approves manager and HRD requests', async () => {
  const mgr = await setup({ role: 'LINE_MANAGER' });
  const id = (await submit(mgr)).body.data.id;
  assert.equal((await callWith(mgr.token, 'patch', `/api/leaves/${id}/approve`, {})).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/leaves/${id}/approve`, {})).status, 403);
  const ok = await call('CEO', 'patch', `/api/leaves/${id}/approve`, {});
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.stage, 'DA_PHE_DUYET');

  const hrd = await setup({ role: 'HR_DIRECTOR', departmentId: 'DEPT-HR' });
  const hid = (await submit(hrd)).body.data.id;
  assert.equal((await callWith(hrd.token, 'patch', `/api/leaves/${hid}/approve`, {})).status, 403);
  assert.equal((await call('CEO', 'patch', `/api/leaves/${hid}/approve`, {})).status, 200);
});

test('the CEO can approve an employee request directly from step one', async () => {
  const emp = await setup();
  const id = (await submit(emp)).body.data.id;
  const res = await call('CEO', 'patch', `/api/leaves/${id}/approve`, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.data.stage, 'DA_PHE_DUYET');
  assert.equal(res.body.data.manager_approved_by, (await claimsFor('CEO')).employeeId);
  assert.equal(await usedDays(emp.employeeId, 2027), 5);
});

test('approval fails with a clear 409 when the balance is no longer enough', async () => {
  const emp = await setup({ balance: 5 });
  const id = (await submit(emp)).body.data.id;
  await db.query("UPDATE leave_balances SET total_days = 2 WHERE employee_id = $1 AND year = 2027", [emp.employeeId]);
  const res = await call('CEO', 'patch', `/api/leaves/${id}/approve`, {});
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'INSUFFICIENT_BALANCE');
  const { rows } = await db.query('SELECT stage FROM leave_requests WHERE id = $1', [id]);
  assert.equal(rows[0].stage, 'CHO_TRUONG_PHONG_DUYET');
});

test('reject: needs a note, follows the same authority, and finishes the request', async () => {
  const emp = await setup();
  const mgr = await setup({ role: 'LINE_MANAGER' });
  const id = (await submit(emp)).body.data.id;
  assert.equal((await callWith(mgr.token, 'patch', `/api/leaves/${id}/reject`, {})).status, 400);
  const res = await callWith(mgr.token, 'patch', `/api/leaves/${id}/reject`, { note: 'Trùng deadline' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.stage, 'TU_CHOI');
  assert.equal(res.body.data.manager_note, 'Trùng deadline');
  assert.equal((await callWith(mgr.token, 'patch', `/api/leaves/${id}/reject`, { note: 'again' })).status, 409);
  assert.equal((await call('CEO', 'patch', '/api/leaves/LP-NOPE/reject', { note: 'x' })).status, 404);
  assert.equal((await call('CEO', 'patch', '/api/leaves/LP-NOPE/approve', {})).status, 404);
});

test('cancel: only the owner; an approved leave is refunded; a leave already taken cannot be cancelled', async () => {
  const emp = await setup();
  const other = await setup();
  const id = (await submit(emp)).body.data.id;
  assert.equal((await callWith(other.token, 'patch', `/api/leaves/${id}/cancel`)).status, 403);
  await call('CEO', 'patch', `/api/leaves/${id}/approve`, {});
  assert.equal(await usedDays(emp.employeeId, 2027), 5);
  const res = await callWith(emp.token, 'patch', `/api/leaves/${id}/cancel`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.stage, 'DA_HUY');
  assert.equal(await usedDays(emp.employeeId, 2027), 0);
  assert.equal((await callWith(emp.token, 'patch', `/api/leaves/${id}/cancel`)).status, 409);

  const past = await setup({ balance: null });
  const pid = (await callWith(past.token, 'post', '/api/leaves', leave({ leaveTypeId: 'LT-UL', startDate: '2020-01-06', endDate: '2020-01-07' }))).body.data.id;
  await call('CEO', 'patch', `/api/leaves/${pid}/approve`, {});
  assert.equal((await callWith(past.token, 'patch', `/api/leaves/${pid}/cancel`)).status, 409);
  assert.equal((await callWith(emp.token, 'patch', '/api/leaves/LP-NOPE/cancel')).status, 404);
});

test('list: scope by role, filters, paging', async () => {
  const a = await setup({ departmentId: 'DEPT-MKT' });
  const b = await setup({ departmentId: 'DEPT-SALES' });
  const mgr = await setup({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const ida = (await submit(a)).body.data.id;
  await submit(b);

  const own = await callWith(a.token, 'get', '/api/leaves');
  assert.ok(own.body.data.length >= 1 && own.body.data.every((r) => r.employee_id === a.employeeId));
  const peek = await callWith(a.token, 'get', `/api/leaves?employeeId=${b.employeeId}`);
  assert.deepEqual(peek.body.data, []);

  const dept = await callWith(mgr.token, 'get', '/api/leaves?limit=200');
  assert.ok(dept.body.data.length >= 1 && dept.body.data.every((r) => r.department_id === 'DEPT-MKT'));

  const ceo = await call('CEO', 'get', '/api/leaves?limit=200&stage=CHO_TRUONG_PHONG_DUYET&month=2027-03');
  assert.ok(ceo.body.data.some((r) => r.id === ida));
  assert.ok(ceo.body.data.every((r) => r.stage === 'CHO_TRUONG_PHONG_DUYET' && r.start_date.startsWith('2027-03')));
  assert.ok(ceo.body.pagination.total >= 2);

  assert.equal((await call('CEO', 'get', '/api/leaves?stage=NOPE')).status, 400);
  assert.equal((await call('CEO', 'get', '/api/leaves?month=2027-13')).status, 400);
  const clamp = await call('CEO', 'get', '/api/leaves?limit=100000&page=0');
  assert.equal(clamp.body.pagination.limit, 200);
});

test('detail: owner, department manager and HR can open it; others cannot', async () => {
  const emp = await setup({ departmentId: 'DEPT-ACC' });
  const mate = await setup({ departmentId: 'DEPT-ACC' });
  const mgr = await setup({ role: 'LINE_MANAGER', departmentId: 'DEPT-ACC' });
  const outsider = await setup({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const id = (await submit(emp)).body.data.id;

  const own = await callWith(emp.token, 'get', `/api/leaves/${id}`);
  assert.equal(own.status, 200);
  assert.equal(own.body.data.id, id);
  assert.equal(own.body.data.leave_type_code, 'PHEP_NAM');
  assert.equal((await callWith(mgr.token, 'get', `/api/leaves/${id}`)).status, 200);
  assert.equal((await call('HR_DIRECTOR', 'get', `/api/leaves/${id}`)).status, 200);
  assert.equal((await callWith(mate.token, 'get', `/api/leaves/${id}`)).status, 403);
  assert.equal((await callWith(outsider.token, 'get', `/api/leaves/${id}`)).status, 403);
  assert.equal((await call('CEO', 'get', '/api/leaves/LP-NOPE')).status, 404);
});

test('calendar: leaves overlapping a month, scoped', async () => {
  const emp = await setup({ departmentId: 'DEPT-ACC' });
  await callWith(emp.token, 'post', '/api/leaves', leave({ startDate: '2027-08-30', endDate: '2027-09-02' }));
  const aug = await call('HR_DIRECTOR', 'get', '/api/leaves/calendar?month=2027-08');
  const sep = await call('HR_DIRECTOR', 'get', '/api/leaves/calendar?month=2027-09');
  const oct = await call('HR_DIRECTOR', 'get', '/api/leaves/calendar?month=2027-10');
  assert.ok(aug.body.data.some((r) => r.employee_id === emp.employeeId));
  assert.ok(sep.body.data.some((r) => r.employee_id === emp.employeeId));
  assert.equal(oct.body.data.some((r) => r.employee_id === emp.employeeId), false);
  const own = await callWith(emp.token, 'get', '/api/leaves/calendar?month=2027-08');
  assert.ok(own.body.data.every((r) => r.employee_id === emp.employeeId));
  assert.equal((await call('CEO', 'get', '/api/leaves/calendar')).status, 400);
  assert.equal((await call('CEO', 'get', '/api/leaves/calendar?month=bad')).status, 400);
});

test('balances: own via "me", others by scope', async () => {
  const emp = await setup({ departmentId: 'DEPT-ACC', balance: 10 });
  const mate = await setup({ departmentId: 'DEPT-ACC' });
  const mgr = await setup({ role: 'LINE_MANAGER', departmentId: 'DEPT-ACC' });
  const outsider = await setup({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const year = (await db.query('SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y')).rows[0].y;
  await giveBalance(emp.employeeId, year, 10);

  const me = await callWith(emp.token, 'get', '/api/leaves/balances/me');
  assert.equal(me.status, 200);
  assert.ok(me.body.data.some((b) => b.leave_type_code === 'PHEP_NAM' && Number(b.total_days) === 10));
  assert.equal((await callWith(emp.token, 'get', `/api/leaves/balances/${emp.employeeId}`)).status, 200);
  assert.equal((await callWith(mate.token, 'get', `/api/leaves/balances/${emp.employeeId}`)).status, 403);
  assert.equal((await callWith(mgr.token, 'get', `/api/leaves/balances/${emp.employeeId}`)).status, 200);
  assert.equal((await callWith(outsider.token, 'get', `/api/leaves/balances/${emp.employeeId}`)).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'get', `/api/leaves/balances/${emp.employeeId}`)).status, 200);
  assert.equal((await call('CEO', 'get', '/api/leaves/balances/NV-NOPE')).status, 404);
});

test('types: every signed-in user can read them', async () => {
  const res = await call('EMPLOYEE', 'get', '/api/leaves/types');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 6);
});

test('leave writes are audited', async () => {
  const emp = await setup();
  const id = (await submit(emp)).body.data.id;
  await call('CEO', 'patch', `/api/leaves/${id}/approve`, {});
  await callWith(emp.token, 'patch', `/api/leaves/${id}/cancel`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'leave_requests' AND record_id = $1 ORDER BY id", [id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_LEAVE', 'APPROVE_LEAVE', 'CANCEL_LEAVE']);
});
