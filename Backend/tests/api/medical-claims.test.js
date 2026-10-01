const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');
const { deleteTestLeaves } = require('../helpers/leaves');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE action LIKE '%\\_CLAIM' AND table_name = 'medical_claims'");
  await db.query("DELETE FROM medical_claims WHERE employee_id LIKE 'NV-T%'");
  await deleteTestLeaves();
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

const today = async () => (await db.query('SELECT CURRENT_DATE::text AS d')).rows[0].d;
const body = async (extra = {}) => ({ claimDate: await today(), amount: 1500000, hospital: 'BV Chợ Rẫy', description: 'Khám và xét nghiệm', ...extra });
const submit = async (s, extra) => callWith(s.token, 'post', '/api/medical-claims', await body(extra));

test('create: a claim starts at the manager, with an id', async () => {
  const s = await employeeSession();
  const res = await submit(s);
  assert.equal(res.status, 201);
  assert.equal(res.body.data.stage, 'CHO_TRUONG_PHONG_DUYET');
  assert.equal(Number(res.body.data.amount), 1500000);
  assert.match(res.body.data.id, /^MC-\d{4}-\d{3,}$/);
  assert.equal(res.body.data.claim_date, await today());
});

test('create: validation', async () => {
  const s = await employeeSession();
  const bad = [
    { amount: 0 }, { amount: -5 }, { amount: 'lots' }, { amount: 2e10 }, { description: '' }, { description: undefined },
    { claimDate: '2999-01-01' }, { claimDate: 'yesterday' }, { attachmentUrl: 42 },
  ];
  for (const extra of bad) assert.equal((await submit(s, extra)).status, 400, JSON.stringify(extra));
});

test('create: a linked leave must be the employee\'s own approved sick leave', async () => {
  const s = await employeeSession();
  const other = await employeeSession();
  const mk = async (owner, type, stage) => {
    const id = `LP-T-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
    await db.query(
      `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
       VALUES ($1, $2, $3, '2027-02-01', '2027-02-01', 1, 't', $4)`, [id, owner.employeeId, type, stage]);
    return id;
  };
  const sick = await mk(s, 'LT-SL', 'DA_PHE_DUYET');
  const ok = await submit(s, { leaveRequestId: sick });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.leave_request_id, sick);

  assert.equal((await submit(s, { leaveRequestId: 'LP-NOPE' })).status, 404);
  assert.equal((await submit(s, { leaveRequestId: await mk(s, 'LT-AL', 'DA_PHE_DUYET') })).status, 400); // not sick leave
  assert.equal((await submit(s, { leaveRequestId: await mk(s, 'LT-SL', 'CHO_TRUONG_PHONG_DUYET') })).status, 400); // not approved
  assert.equal((await submit(s, { leaveRequestId: await mk(other, 'LT-SL', 'DA_PHE_DUYET') })).status, 403); // someone else's
});

test('an account without an employee record cannot submit', async () => {
  const { createTestUser } = require('../helpers/users');
  const { loginUser } = require('../helpers/api');
  const u = await createTestUser();
  const { accessToken } = await loginUser(u);
  assert.equal((await callWith(accessToken, 'post', '/api/medical-claims', await body())).status, 403);
});

test('chain: employee -> manager -> HR; outsiders and wrong roles are refused', async () => {
  const emp = await employeeSession({ departmentId: 'DEPT-ACC' });
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-ACC' });
  const outsider = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const id = (await submit(emp)).body.data.id;

  assert.equal((await callWith(outsider.token, 'patch', `/api/medical-claims/${id}/approve`, {})).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/medical-claims/${id}/approve`, {})).status, 403);
  assert.equal((await callWith(mgr.token, 'patch', `/api/medical-claims/${id}/approve`, {})).body.data.stage, 'CHO_HR_PHE_CHUAN');
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/medical-claims/${id}/approve`, {})).body.data.stage, 'DA_PHE_DUYET');
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/medical-claims/${id}/approve`, {})).status, 409);
});

test('chain: a manager claim needs the CEO; a CEO claim is approved at once', async () => {
  const mgr = await employeeSession({ role: 'LINE_MANAGER' });
  const id = (await submit(mgr)).body.data.id;
  assert.equal((await callWith(mgr.token, 'patch', `/api/medical-claims/${id}/approve`, {})).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'patch', `/api/medical-claims/${id}/approve`, {})).status, 403);
  assert.equal((await call('CEO', 'patch', `/api/medical-claims/${id}/approve`, {})).body.data.stage, 'DA_PHE_DUYET');
  const ceo = await employeeSession({ role: 'CEO', departmentId: 'DEPT-CEO' });
  assert.equal((await submit(ceo)).body.data.stage, 'DA_PHE_DUYET');
});

test('reject needs a note; cancel only while pending and only by the owner', async () => {
  const emp = await employeeSession();
  const other = await employeeSession();
  const mgr = await employeeSession({ role: 'LINE_MANAGER' });
  const id = (await submit(emp)).body.data.id;
  assert.equal((await callWith(mgr.token, 'patch', `/api/medical-claims/${id}/reject`, {})).status, 400);
  assert.equal((await callWith(mgr.token, 'patch', `/api/medical-claims/${id}/reject`, { note: 'Thiếu hóa đơn' })).body.data.stage, 'TU_CHOI');

  const id2 = (await submit(emp)).body.data.id;
  assert.equal((await callWith(other.token, 'patch', `/api/medical-claims/${id2}/cancel`)).status, 403);
  assert.equal((await callWith(emp.token, 'patch', `/api/medical-claims/${id2}/cancel`)).body.data.stage, 'DA_HUY');
  assert.equal((await callWith(emp.token, 'patch', `/api/medical-claims/${id2}/cancel`)).status, 409);

  const id3 = (await submit(emp)).body.data.id;
  await call('CEO', 'patch', `/api/medical-claims/${id3}/approve`, {});
  assert.equal((await callWith(emp.token, 'patch', `/api/medical-claims/${id3}/cancel`)).status, 409); // already paid out
  assert.equal((await call('CEO', 'patch', '/api/medical-claims/MC-NOPE/approve', {})).status, 404);
});

test('list and detail respect scope, filters and paging', async () => {
  const a = await employeeSession({ departmentId: 'DEPT-MKT' });
  const b = await employeeSession({ departmentId: 'DEPT-SALES' });
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const ida = (await submit(a)).body.data.id;
  await submit(b);

  assert.ok((await callWith(a.token, 'get', '/api/medical-claims')).body.data.every((r) => r.employee_id === a.employeeId));
  assert.deepEqual((await callWith(a.token, 'get', `/api/medical-claims?employeeId=${b.employeeId}`)).body.data, []);
  const dept = await callWith(mgr.token, 'get', '/api/medical-claims?limit=200');
  assert.ok(dept.body.data.length >= 1 && dept.body.data.every((r) => r.department_id === 'DEPT-MKT'));
  const month = (await today()).slice(0, 7);
  const ceo = await call('CEO', 'get', `/api/medical-claims?month=${month}&stage=CHO_TRUONG_PHONG_DUYET&limit=200`);
  assert.ok(ceo.body.data.some((r) => r.id === ida));
  assert.equal((await call('CEO', 'get', '/api/medical-claims?stage=NOPE')).status, 400);
  assert.equal((await call('CEO', 'get', '/api/medical-claims?limit=100000')).body.pagination.limit, 200);

  assert.equal((await callWith(a.token, 'get', `/api/medical-claims/${ida}`)).status, 200);
  assert.equal((await callWith(mgr.token, 'get', `/api/medical-claims/${ida}`)).status, 200);
  assert.equal((await callWith(b.token, 'get', `/api/medical-claims/${ida}`)).status, 403);
  assert.equal((await call('CEO', 'get', '/api/medical-claims/MC-NOPE')).status, 404);
});

test('medical claim writes are audited', async () => {
  const emp = await employeeSession();
  const id = (await submit(emp)).body.data.id;
  await callWith(emp.token, 'patch', `/api/medical-claims/${id}/cancel`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'medical_claims' AND record_id = $1 ORDER BY id", [id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_CLAIM', 'CANCEL_CLAIM']);
});
