const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, loginUser, claimsFor, closeDb } = require('../helpers/api');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { SENSITIVE_EMPLOYEE_FIELDS } = require('../../src/utils/redact');

const created = [];
after(async () => {
  for (const id of created) await db.query("DELETE FROM employees WHERE id = $1", [id]);
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const noSensitive = (o) => SENSITIVE_EMPLOYEE_FIELDS.every((f) => !has(o, f));
let n = 0;
const payload = (extra = {}) => {
  const suffix = `${Date.now().toString(36)}${++n}`;
  const id = `NV-T${suffix}`.slice(0, 20);
  created.push(id);
  return {
    id, fullName: `Nguyen Test ${suffix}`, jobTitle: 'Tester', workEmail: `test-emp-${suffix}@example.test`,
    joinedDate: '2026-01-15', departmentId: 'DEPT-IT', baseSalary: 15000000, ...extra,
  };
};

async function lmContext() {
  const { employeeId } = await claimsFor('LINE_MANAGER');
  const { rows } = await db.query('SELECT department_id FROM employees WHERE id = $1', [employeeId]);
  return { employeeId, departmentId: rows[0].department_id };
}

test('LINE_MANAGER list: own department only, no sensitive data of others, own salary visible', async () => {
  const { employeeId, departmentId } = await lmContext();
  const res = await call('LINE_MANAGER', 'get', '/api/employees?limit=200');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length > 1);
  assert.ok(res.body.data.every((e) => e.department_id === departmentId));
  for (const e of res.body.data) {
    if (e.id === employeeId) assert.ok(has(e, 'base_salary'));
    else assert.ok(noSensitive(e), `leak on ${e.id}`);
    assert.equal(has(e, 'face_encoding'), false);
  }
});

test('LINE_MANAGER without a department sees only themselves', async () => {
  const emp = await createTestEmployee({ departmentId: null });
  const u = await createTestUser({ role: 'LINE_MANAGER', employeeId: emp.id });
  const { accessToken } = await loginUser(u);
  const res = await callWith(accessToken, 'get', '/api/employees');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((e) => e.id), [emp.id]);
});

test('LINE_MANAGER detail: other department 403, same department 200 without sensitive data, self has it', async () => {
  const { employeeId, departmentId } = await lmContext();
  const other = (await db.query('SELECT id FROM employees WHERE department_id <> $1 AND id NOT LIKE $2 LIMIT 1', [departmentId, 'NV-T%'])).rows[0].id;
  const mate = (await db.query('SELECT id FROM employees WHERE department_id = $1 AND id <> $2 AND id NOT LIKE $3 LIMIT 1', [departmentId, employeeId, 'NV-T%'])).rows[0].id;

  assert.equal((await call('LINE_MANAGER', 'get', `/api/employees/${other}`)).status, 403);
  const same = await call('LINE_MANAGER', 'get', `/api/employees/${mate}`);
  assert.equal(same.status, 200);
  assert.ok(noSensitive(same.body.data));
  const self = await call('LINE_MANAGER', 'get', `/api/employees/${employeeId}`);
  assert.ok(has(self.body.data, 'base_salary'));
});

test('EMPLOYEE detail: own record only', async () => {
  const { employeeId } = await claimsFor('EMPLOYEE');
  const self = await call('EMPLOYEE', 'get', `/api/employees/${employeeId}`);
  assert.equal(self.status, 200);
  assert.ok(has(self.body.data, 'base_salary'));
  assert.equal((await call('EMPLOYEE', 'get', '/api/employees/NV-0001')).status, 403);
});

test('CEO and HRD see sensitive fields but never face_encoding', async () => {
  const emp = await createTestEmployee();
  await db.query("UPDATE employees SET face_encoding = '\\xdeadbeef'::bytea, base_salary = 777 WHERE id = $1", [emp.id]);
  for (const role of ['CEO', 'HR_DIRECTOR']) {
    const res = await call(role, 'get', `/api/employees/${emp.id}`);
    assert.equal(res.status, 200);
    assert.equal(Number(res.body.data.base_salary), 777);
    assert.equal(has(res.body.data, 'face_encoding'), false);
    assert.equal(JSON.stringify(res.body).includes('deadbeef'), false);
  }
  const list = await call('CEO', 'get', '/api/employees?limit=200');
  assert.ok(list.body.data.every((e) => !has(e, 'face_encoding')));
});

test('ADMIN can read the directory but never sensitive fields', async () => {
  const admin = await createTestUser({ role: 'ADMIN' });
  const { accessToken } = await loginUser(admin);
  const res = await callWith(accessToken, 'get', '/api/employees?limit=200');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.every(noSensitive));
});

test('detail: 404 for an unknown employee', async () => {
  assert.equal((await call('CEO', 'get', '/api/employees/NV-NOPE')).status, 404);
});

test('list: junk paging values are clamped, not a 500', async () => {
  const res = await call('CEO', 'get', '/api/employees?page=0&limit=abc');
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.page, 1);
  assert.equal(res.body.pagination.limit, 50);
  const big = await call('CEO', 'get', '/api/employees?limit=100000&page=-4');
  assert.equal(big.body.pagination.limit, 200);
});

test('list: search and filters', async () => {
  const bySearch = await call('CEO', 'get', '/api/employees?search=ceo@fwbnexus');
  assert.equal(bySearch.body.data.length, 1);
  const byDept = await call('CEO', 'get', '/api/employees?department=DEPT-HR');
  assert.ok(byDept.body.data.every((e) => e.department_id === 'DEPT-HR'));
  const byStatus = await call('CEO', 'get', '/api/employees?status=DA_NGHI_VIEC&limit=200');
  assert.ok(byStatus.body.data.every((e) => e.status === 'DA_NGHI_VIEC'));
});

test('create: HRD creates an employee and the initial active contract', async () => {
  const p = payload({ contractType: 'THU_VIEC' });
  const res = await call('HR_DIRECTOR', 'post', '/api/employees', p);
  assert.equal(res.status, 201);
  assert.equal(res.body.data.id, p.id);
  assert.equal(res.body.data.contract_type, 'THU_VIEC');
  assert.equal(Number(res.body.data.base_salary), 15000000);
  assert.equal(has(res.body.data, 'face_encoding'), false);
  const { rows } = await db.query("SELECT type, salary, status, start_date::text AS start FROM contracts WHERE employee_id = $1", [p.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'HIEU_LUC');
  assert.equal(rows[0].type, 'THU_VIEC');
  assert.equal(Number(rows[0].salary), 15000000);
  assert.equal(rows[0].start, '2026-01-15');
});

test('create: the id is generated when omitted', async () => {
  const p = payload();
  delete p.id;
  const res = await call('CEO', 'post', '/api/employees', p);
  assert.equal(res.status, 201);
  assert.match(res.body.data.id, /^NV-\d+$/);
  created.push(res.body.data.id);
});

test('create: LINE_MANAGER and EMPLOYEE are refused', async () => {
  assert.equal((await call('LINE_MANAGER', 'post', '/api/employees', payload())).status, 403);
  assert.equal((await call('EMPLOYEE', 'post', '/api/employees', payload())).status, 403);
});

test('create: duplicate id and duplicate email -> 409', async () => {
  const p = payload();
  assert.equal((await call('CEO', 'post', '/api/employees', p)).status, 201);
  assert.equal((await call('CEO', 'post', '/api/employees', { ...payload(), id: p.id })).status, 409);
  assert.equal((await call('CEO', 'post', '/api/employees', { ...payload(), workEmail: p.workEmail })).status, 409);
});

test('create: input validation -> 400', async () => {
  const bad = [
    { fullName: '' }, { jobTitle: undefined }, { workEmail: 'not-an-email' }, { joinedDate: '15/01/2026' },
    { joinedDate: '2026-02-31' }, { citizenId: '12345' }, { citizenId: 'abcdefghijkl' }, { dateOfBirth: '2999-01-01' },
    { baseSalary: -1 }, { baseSalary: 'lots' }, { gender: 'Other' }, { contractType: 'FOREVER' }, { phoneNumber: 'call me' },
    { id: 'bad id!' },
  ];
  for (const extra of bad) {
    const res = await call('CEO', 'post', '/api/employees', { ...payload(), ...extra });
    assert.equal(res.status, 400, JSON.stringify(extra));
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  }
});

test('create: unknown department, position or manager -> 404', async () => {
  assert.equal((await call('CEO', 'post', '/api/employees', payload({ departmentId: 'DEPT-NOPE' }))).status, 404);
  assert.equal((await call('CEO', 'post', '/api/employees', payload({ positionId: 'POS-NOPE' }))).status, 404);
  assert.equal((await call('CEO', 'post', '/api/employees', payload({ managerId: 'NV-NOPE' }))).status, 404);
});

test('update: partial update keeps other fields; null clears a nullable field', async () => {
  const p = payload({ managerId: 'NV-1002', phoneNumber: '0912345678' });
  await call('CEO', 'post', '/api/employees', p);
  const res = await call('HR_DIRECTOR', 'put', `/api/employees/${p.id}`, { jobTitle: 'Senior Tester', managerId: null });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.job_title, 'Senior Tester');
  assert.equal(res.body.data.manager_id, null);
  assert.equal(res.body.data.phone_number, '0912345678');
  assert.equal(res.body.data.full_name, p.fullName);
});

test('update: validation, unknown employee, permissions', async () => {
  const p = payload();
  await call('CEO', 'post', '/api/employees', p);
  assert.equal((await call('CEO', 'put', `/api/employees/${p.id}`, {})).status, 400);
  assert.equal((await call('CEO', 'put', `/api/employees/${p.id}`, { baseSalary: -5 })).status, 400);
  assert.equal((await call('CEO', 'put', `/api/employees/${p.id}`, { managerId: p.id })).status, 400);
  assert.equal((await call('CEO', 'put', `/api/employees/${p.id}`, { managerId: 'NV-NOPE' })).status, 404);
  assert.equal((await call('CEO', 'put', `/api/employees/${p.id}`, { departmentId: 'DEPT-NOPE' })).status, 404);
  assert.equal((await call('CEO', 'put', '/api/employees/NV-NOPE', { jobTitle: 'x' })).status, 404);
  assert.equal((await call('EMPLOYEE', 'put', `/api/employees/${p.id}`, { jobTitle: 'x' })).status, 403);
  assert.equal((await call('LINE_MANAGER', 'put', `/api/employees/${p.id}`, { jobTitle: 'x' })).status, 403);
});

test('update: cannot terminate through PUT, and duplicate email is refused', async () => {
  const a = payload();
  const b = payload();
  await call('CEO', 'post', '/api/employees', a);
  await call('CEO', 'post', '/api/employees', b);
  const term = await call('CEO', 'put', `/api/employees/${a.id}`, { status: 'DA_NGHI_VIEC' });
  assert.equal(term.status, 400);
  const dup = await call('CEO', 'put', `/api/employees/${a.id}`, { workEmail: b.workEmail });
  assert.equal(dup.status, 409);
  const ok = await call('CEO', 'put', `/api/employees/${a.id}`, { status: 'TAM_HOAN' });
  assert.equal(ok.status, 200);
});

test('update: a terminated employee cannot be reactivated through PUT', async () => {
  const emp = await createTestEmployee({ status: 'DA_NGHI_VIEC' });
  const res = await call('CEO', 'put', `/api/employees/${emp.id}`, { status: 'DANG_LAM_VIEC' });
  assert.equal(res.status, 409);
});

test('the audit row of an update names the acting user', async () => {
  const p = payload();
  await call('CEO', 'post', '/api/employees', p);
  const hrd = await claimsFor('HR_DIRECTOR');
  await call('HR_DIRECTOR', 'put', `/api/employees/${p.id}`, { jobTitle: 'Audited' });
  const { rows } = await db.query(
    "SELECT user_id FROM audit_logs WHERE table_name = 'employees' AND record_id = $1 AND action = 'UPDATE' ORDER BY id DESC LIMIT 1", [p.id]);
  assert.equal(rows[0].user_id, hrd.userId);
});
