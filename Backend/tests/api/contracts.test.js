const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, loginUser, closeDb } = require('../helpers/api');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE action LIKE '%\\_CONTRACT' AND table_name = 'contracts'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

let n = 0;
const body = (extra = {}) => ({ type: 'CHINH_THUC', startDate: '2026-01-01', salary: 20000000, ...extra });
const create = (role, empId, extra) => call(role, 'post', `/api/employees/${empId}/contracts`, body(extra));
const employeeRow = async (id) => (await db.query('SELECT base_salary, contract_type, status FROM employees WHERE id = $1', [id])).rows[0];
const contractsOf = async (id) => (await db.query('SELECT * FROM contracts WHERE employee_id = $1 ORDER BY start_date', [id])).rows;

test('create: activates, syncs the employee and numbers the contract', async () => {
  const emp = await createTestEmployee();
  const res = await create('HR_DIRECTOR', emp.id, { type: 'THU_VIEC', salary: 12000000 });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'HIEU_LUC');
  assert.equal(res.body.data.start_date, '2026-01-01');
  assert.equal(res.body.data.end_date, null);
  assert.match(res.body.data.contract_no, /^HDLD-/);
  const e = await employeeRow(emp.id);
  assert.equal(Number(e.base_salary), 12000000);
  assert.equal(e.contract_type, 'THU_VIEC');
});

test('create: a new active contract closes the previous one the day before it starts', async () => {
  const emp = await createTestEmployee();
  await create('CEO', emp.id, { type: 'THU_VIEC', startDate: '2026-01-01', salary: 10 });
  const res = await create('CEO', emp.id, { type: 'CHINH_THUC', startDate: '2026-03-01', salary: 30 });
  assert.equal(res.status, 201);
  const rows = await contractsOf(emp.id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'DA_CHAM_DUT');
  assert.equal(String(rows[0].end_date), '2026-02-28');
  assert.equal(rows[1].status, 'HIEU_LUC');
  assert.equal(Number((await employeeRow(emp.id)).base_salary), 30);
});

test('create: a contract that does not start after the active one is a conflict', async () => {
  const emp = await createTestEmployee();
  await create('CEO', emp.id, { startDate: '2026-05-01' });
  const res = await create('CEO', emp.id, { startDate: '2026-05-01' });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'CONTRACT_OVERLAP');
  assert.equal((await contractsOf(emp.id)).length, 1);
});

test('draft contracts (CHO_KY) change nothing until activated', async () => {
  const emp = await createTestEmployee();
  await create('CEO', emp.id, { salary: 100, startDate: '2026-01-01' });
  const draft = await create('CEO', emp.id, { status: 'CHO_KY', salary: 200, startDate: '2026-06-01', type: 'THOI_VU' });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.data.status, 'CHO_KY');
  assert.equal(Number((await employeeRow(emp.id)).base_salary), 100);

  const act = await call('HR_DIRECTOR', 'post', `/api/contracts/${draft.body.data.id}/activate`);
  assert.equal(act.status, 200);
  assert.equal(act.body.data.status, 'HIEU_LUC');
  const rows = await contractsOf(emp.id);
  assert.deepEqual(rows.map((r) => r.status), ['DA_CHAM_DUT', 'HIEU_LUC']);
  const e = await employeeRow(emp.id);
  assert.equal(Number(e.base_salary), 200);
  assert.equal(e.contract_type, 'THOI_VU');
  assert.equal((await call('HR_DIRECTOR', 'post', `/api/contracts/${draft.body.data.id}/activate`)).status, 409);
});

test('create: validation, unknown and terminated employees, duplicate number', async () => {
  const emp = await createTestEmployee();
  const bad = [
    { endDate: '2025-01-01' }, { salary: -1 }, { salary: 'lots' }, { type: 'FOREVER' }, { startDate: '01/01/2026' },
    { startDate: '2026-02-30' }, { status: 'DA_CHAM_DUT' }, { fileUrl: 12 },
  ];
  for (const extra of bad) assert.equal((await create('CEO', emp.id, extra)).status, 400, JSON.stringify(extra));
  assert.equal((await create('CEO', 'NV-NOPE')).status, 404);

  const gone = await createTestEmployee({ status: 'DA_NGHI_VIEC' });
  assert.equal((await create('CEO', gone.id)).status, 409);

  const no = `DUP-${Date.now().toString(36)}${++n}`;
  assert.equal((await create('CEO', emp.id, { contractNo: no, startDate: '2026-01-01' })).status, 201);
  const other = await createTestEmployee();
  assert.equal((await create('CEO', other.id, { contractNo: no })).status, 409);
});

test('access: HR/CEO manage, the owner reads their own, nobody else reads', async () => {
  const emp = await createTestEmployee();
  const other = await createTestEmployee();
  const made = await create('CEO', emp.id);
  await create('CEO', other.id);

  assert.equal((await create('EMPLOYEE', emp.id)).status, 403);
  assert.equal((await create('LINE_MANAGER', emp.id)).status, 403);
  assert.equal((await call(null, 'get', `/api/employees/${emp.id}/contracts`)).status, 401);
  assert.equal((await call('LINE_MANAGER', 'get', `/api/employees/${emp.id}/contracts`)).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'get', `/api/employees/${emp.id}/contracts`)).status, 200);

  const u = await createTestUser({ employeeId: emp.id });
  const { accessToken } = await loginUser(u);
  const own = await callWith(accessToken, 'get', `/api/employees/${emp.id}/contracts`);
  assert.equal(own.status, 200);
  assert.equal(own.body.data.length, 1);
  assert.equal((await callWith(accessToken, 'get', `/api/employees/${other.id}/contracts`)).status, 403);
  assert.equal((await callWith(accessToken, 'get', `/api/contracts/${made.body.data.id}`)).status, 200);
  const otherContract = (await contractsOf(other.id))[0];
  assert.equal((await callWith(accessToken, 'get', `/api/contracts/${otherContract.id}`)).status, 403);
  assert.equal((await callWith(accessToken, 'put', `/api/contracts/${made.body.data.id}`, { note: 'x' })).status, 403);
});

test('get: 404 for unknown employee or contract', async () => {
  assert.equal((await call('CEO', 'get', '/api/employees/NV-NOPE/contracts')).status, 404);
  assert.equal((await call('CEO', 'get', '/api/contracts/CT-99999')).status, 404);
});

test('update: editing the active salary syncs the employee; ended contracts are frozen', async () => {
  const emp = await createTestEmployee();
  const c = (await create('CEO', emp.id, { salary: 100 })).body.data;
  const res = await call('HR_DIRECTOR', 'put', `/api/contracts/${c.id}`, { salary: 555, note: 'Tăng lương', fileUrl: 'https://files.example.test/c.pdf', signedAt: '2026-01-02T03:04:05Z' });
  assert.equal(res.status, 200);
  assert.equal(Number(res.body.data.salary), 555);
  assert.equal(res.body.data.note, 'Tăng lương');
  assert.equal(Number((await employeeRow(emp.id)).base_salary), 555);

  assert.equal((await call('CEO', 'put', `/api/contracts/${c.id}`, {})).status, 400);
  assert.equal((await call('CEO', 'put', `/api/contracts/${c.id}`, { endDate: '2025-12-31' })).status, 400);
  assert.equal((await call('CEO', 'put', `/api/contracts/${c.id}`, { salary: -3 })).status, 400);

  await call('CEO', 'post', `/api/contracts/${c.id}/terminate`, { terminationDate: '2026-02-01' });
  assert.equal((await call('CEO', 'put', `/api/contracts/${c.id}`, { note: 'late edit' })).status, 409);
});

test('terminate: default date, explicit date, validation, idempotency guard', async () => {
  const emp = await createTestEmployee();
  const c = (await create('CEO', emp.id, { salary: 100, startDate: '2026-01-01' })).body.data;
  assert.equal((await call('CEO', 'post', `/api/contracts/${c.id}/terminate`, { terminationDate: '2025-06-01' })).status, 400);
  const res = await call('HR_DIRECTOR', 'post', `/api/contracts/${c.id}/terminate`, { terminationDate: '2026-04-30', note: 'Hết hạn' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'DA_CHAM_DUT');
  assert.equal(res.body.data.end_date, '2026-04-30');
  assert.equal(Number((await employeeRow(emp.id)).base_salary), 100);
  assert.equal((await call('CEO', 'post', `/api/contracts/${c.id}/terminate`, {})).status, 409);
  assert.equal((await call('CEO', 'post', '/api/contracts/CT-99999/terminate', {})).status, 404);
  assert.equal((await call('EMPLOYEE', 'post', `/api/contracts/${c.id}/terminate`, {})).status, 403);

  const emp2 = await createTestEmployee();
  const c2 = (await create('CEO', emp2.id, { startDate: '2026-01-01' })).body.data;
  const dflt = await call('CEO', 'post', `/api/contracts/${c2.id}/terminate`);
  assert.equal(dflt.status, 200);
  assert.equal(dflt.body.data.end_date, (await db.query('SELECT CURRENT_DATE::text AS d')).rows[0].d);
});

test('two simultaneous activations leave exactly one active contract and never a 500', async () => {
  const emp = await createTestEmployee();
  const [a, b] = await Promise.all([
    create('CEO', emp.id, { startDate: '2026-02-01', salary: 1 }),
    create('CEO', emp.id, { startDate: '2026-03-01', salary: 2 }),
  ]);
  for (const r of [a, b]) assert.ok([201, 409].includes(r.status), `status ${r.status}`);
  assert.ok([a, b].some((r) => r.status === 201));
  const active = (await contractsOf(emp.id)).filter((r) => r.status === 'HIEU_LUC');
  assert.equal(active.length, 1);
});

test('contract writes are audited', async () => {
  const emp = await createTestEmployee();
  const c = (await create('CEO', emp.id)).body.data;
  await call('CEO', 'put', `/api/contracts/${c.id}`, { note: 'n' });
  await call('CEO', 'post', `/api/contracts/${c.id}/terminate`, {});
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'contracts' AND record_id = $1 ORDER BY id", [c.id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_CONTRACT', 'UPDATE_CONTRACT', 'TERMINATE_CONTRACT']);
});
