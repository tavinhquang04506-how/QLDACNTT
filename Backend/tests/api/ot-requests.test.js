const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE action LIKE '%\\_OT' AND table_name = 'ot_requests'");
  await db.query("DELETE FROM ot_requests WHERE employee_id LIKE 'NV-T%'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

const body = (extra = {}) => ({ workDate: '2027-07-06', startTime: '18:00', endTime: '20:30', reason: 'Hoàn thiện release', ...extra });
const submit = (s, extra) => callWith(s.token, 'post', '/api/ot-requests', body(extra));

test('create: hours are computed from the times and the request starts at the manager', async () => {
  const s = await employeeSession();
  const res = await submit(s);
  assert.equal(res.status, 201);
  assert.equal(Number(res.body.data.hours), 2.5);
  assert.equal(res.body.data.stage, 'CHO_TRUONG_PHONG_DUYET');
  assert.equal(res.body.data.work_date, '2027-07-06');
  assert.equal(res.body.data.start_time, '18:00:00');
  assert.match(res.body.data.id, /^OT-\d{4}-\d{3,}$/);
});

test('create: validation', async () => {
  const s = await employeeSession();
  const bad = [
    { startTime: '25:00' }, { startTime: '6pm' }, { endTime: '17:00' }, { endTime: '18:00' }, { endTime: '23:30' },
    { workDate: '06/07/2027' }, { reason: '' }, { reason: undefined }, { startTime: undefined },
  ];
  for (const extra of bad) assert.equal((await submit(s, extra)).status, 400, JSON.stringify(extra));
});

test('create: two requests may not overlap on the same day, cancelled ones do not count', async () => {
  const s = await employeeSession();
  const first = await submit(s, { workDate: '2027-07-07', startTime: '18:00', endTime: '20:00' });
  assert.equal(first.status, 201);
  const overlap = await submit(s, { workDate: '2027-07-07', startTime: '19:30', endTime: '21:00' });
  assert.equal(overlap.status, 409);
  assert.equal(overlap.body.code, 'OT_OVERLAP');
  assert.equal((await submit(s, { workDate: '2027-07-07', startTime: '20:00', endTime: '21:00' })).status, 201);
  await callWith(s.token, 'patch', `/api/ot-requests/${first.body.data.id}/cancel`);
  assert.equal((await submit(s, { workDate: '2027-07-07', startTime: '18:30', endTime: '19:30' })).status, 201); // the cancelled 18-20 slot is free again
});

test('create: the legal limit of 40 overtime hours a month is enforced', async () => {
  const s = await employeeSession();
  for (let day = 1; day <= 10; day += 1) {
    const res = await submit(s, { workDate: `2027-09-${String(day).padStart(2, '0')}`, startTime: '18:00', endTime: '22:00' });
    assert.equal(res.status, 201, `day ${day}`);
  }
  const over = await submit(s, { workDate: '2027-09-11', startTime: '18:00', endTime: '19:00' });
  assert.equal(over.status, 409);
  assert.equal(over.body.code, 'OT_MONTHLY_LIMIT');
  assert.equal((await submit(s, { workDate: '2027-10-01', startTime: '18:00', endTime: '19:00' })).status, 201);
});

test('an account without an employee record cannot submit', async () => {
  const { createTestUser } = require('../helpers/users');
  const { loginUser } = require('../helpers/api');
  const u = await createTestUser();
  const { accessToken } = await loginUser(u);
  assert.equal((await callWith(accessToken, 'post', '/api/ot-requests', body())).status, 403);
});

test('chain: employee -> manager -> HR, with the same scope rules as leave', async () => {
  const emp = await employeeSession({ departmentId: 'DEPT-ACC' });
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-ACC' });
  const outsider = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const id = (await submit(emp, { workDate: '2027-07-12' })).body.data.id;

  assert.equal((await callWith(outsider.token, 'patch', `/api/ot-requests/${id}/approve`, {})).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/ot-requests/${id}/approve`, {})).status, 403);
  const s1 = await callWith(mgr.token, 'patch', `/api/ot-requests/${id}/approve`, { note: 'OK' });
  assert.equal(s1.status, 200);
  assert.equal(s1.body.data.stage, 'CHO_HR_PHE_CHUAN');
  const s2 = await call('HR_DIRECTOR', 'patch', `/api/ot-requests/${id}/approve`, {});
  assert.equal(s2.body.data.stage, 'DA_PHE_DUYET');
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/ot-requests/${id}/approve`, {})).status, 409);
});

test('chain: manager and CEO requests', async () => {
  const mgr = await employeeSession({ role: 'LINE_MANAGER' });
  const id = (await submit(mgr, { workDate: '2027-07-13' })).body.data.id;
  assert.equal((await callWith(mgr.token, 'patch', `/api/ot-requests/${id}/approve`, {})).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/ot-requests/${id}/approve`, {})).status, 403);
  assert.equal((await call('CEO', 'patch', `/api/ot-requests/${id}/approve`, {})).body.data.stage, 'DA_PHE_DUYET');

  const ceo = await employeeSession({ role: 'CEO', departmentId: 'DEPT-CEO' });
  assert.equal((await submit(ceo, { workDate: '2027-07-14' })).body.data.stage, 'DA_PHE_DUYET');
});

test('reject needs a note and finishes the request', async () => {
  const emp = await employeeSession();
  const mgr = await employeeSession({ role: 'LINE_MANAGER' });
  const id = (await submit(emp, { workDate: '2027-07-15' })).body.data.id;
  assert.equal((await callWith(mgr.token, 'patch', `/api/ot-requests/${id}/reject`, {})).status, 400);
  const res = await callWith(mgr.token, 'patch', `/api/ot-requests/${id}/reject`, { note: 'Không cần thiết' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.stage, 'TU_CHOI');
  assert.equal((await callWith(mgr.token, 'patch', `/api/ot-requests/${id}/reject`, { note: 'x' })).status, 409);
  assert.equal((await call('CEO', 'patch', '/api/ot-requests/OT-NOPE/approve', {})).status, 404);
});

test('cancel: only the owner; a finished overtime day cannot be cancelled', async () => {
  const emp = await employeeSession();
  const other = await employeeSession();
  const id = (await submit(emp, { workDate: '2027-07-16' })).body.data.id;
  assert.equal((await callWith(other.token, 'patch', `/api/ot-requests/${id}/cancel`)).status, 403);
  const res = await callWith(emp.token, 'patch', `/api/ot-requests/${id}/cancel`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.stage, 'DA_HUY');
  assert.equal((await callWith(emp.token, 'patch', `/api/ot-requests/${id}/cancel`)).status, 409);

  const past = await submit(emp, { workDate: '2020-02-03' });
  await call('CEO', 'patch', `/api/ot-requests/${past.body.data.id}/approve`, {});
  assert.equal((await callWith(emp.token, 'patch', `/api/ot-requests/${past.body.data.id}/cancel`)).status, 409);
  assert.equal((await callWith(emp.token, 'patch', '/api/ot-requests/OT-NOPE/cancel')).status, 404);
});

test('list and detail respect scope, filters and paging', async () => {
  const a = await employeeSession({ departmentId: 'DEPT-MKT' });
  const b = await employeeSession({ departmentId: 'DEPT-SALES' });
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const ida = (await submit(a, { workDate: '2027-11-02' })).body.data.id;
  await submit(b, { workDate: '2027-11-02' });

  const own = await callWith(a.token, 'get', '/api/ot-requests');
  assert.ok(own.body.data.every((r) => r.employee_id === a.employeeId));
  assert.deepEqual((await callWith(a.token, 'get', `/api/ot-requests?employeeId=${b.employeeId}`)).body.data, []);
  const dept = await callWith(mgr.token, 'get', '/api/ot-requests?limit=200');
  assert.ok(dept.body.data.length >= 1 && dept.body.data.every((r) => r.department_id === 'DEPT-MKT'));
  const ceo = await call('CEO', 'get', '/api/ot-requests?month=2027-11&stage=CHO_TRUONG_PHONG_DUYET&limit=200');
  assert.ok(ceo.body.data.some((r) => r.id === ida));
  assert.equal((await call('CEO', 'get', '/api/ot-requests?stage=NOPE')).status, 400);
  assert.equal((await call('CEO', 'get', '/api/ot-requests?month=2027-99')).status, 400);
  assert.equal((await call('CEO', 'get', '/api/ot-requests?limit=100000')).body.pagination.limit, 200);

  assert.equal((await callWith(a.token, 'get', `/api/ot-requests/${ida}`)).status, 200);
  assert.equal((await callWith(mgr.token, 'get', `/api/ot-requests/${ida}`)).status, 200);
  assert.equal((await callWith(b.token, 'get', `/api/ot-requests/${ida}`)).status, 403);
  assert.equal((await call('CEO', 'get', '/api/ot-requests/OT-NOPE')).status, 404);
});

test('overtime writes are audited', async () => {
  const emp = await employeeSession();
  const id = (await submit(emp, { workDate: '2027-11-09' })).body.data.id;
  await call('CEO', 'patch', `/api/ot-requests/${id}/approve`, {});
  await callWith(emp.token, 'patch', `/api/ot-requests/${id}/cancel`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'ot_requests' AND record_id = $1 ORDER BY id", [id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_OT', 'APPROVE_OT', 'CANCEL_OT']);
});
