const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, closeDb } = require('../helpers/api');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE table_name = 'departments' AND record_id LIKE 'DEPT-TST%'");
  await deleteTestEmployees();
  await db.query("DELETE FROM departments WHERE id LIKE 'DEPT-TST%'");
  await closeDb();
});

let n = 0;
const uniq = () => `${Date.now().toString(36)}${++n}`.toUpperCase().slice(-8);
const body = (extra = {}) => {
  const code = `TST${uniq()}`.slice(0, 15);
  return { code, name: `Test Dept ${code}`, description: 'temp', budgetYearly: 1000, ...extra };
};

test('GET /api/departments/:id returns one department with counts', async () => {
  const res = await call('EMPLOYEE', 'get', '/api/departments/DEPT-IT');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, 'DEPT-IT');
  assert.ok('employee_count' in res.body.data);
  assert.equal((await call('EMPLOYEE', 'get', '/api/departments/DEPT-NOPE')).status, 404);
});

test('create: CEO and HR_DIRECTOR succeed, EMPLOYEE and LINE_MANAGER get 403', async () => {
  const a = body();
  const res = await call('HR_DIRECTOR', 'post', '/api/departments', a);
  assert.equal(res.status, 201);
  assert.equal(res.body.data.id, `DEPT-${a.code}`);
  assert.equal(res.body.data.name, a.name);
  assert.equal((await call('CEO', 'post', '/api/departments', body())).status, 201);
  assert.equal((await call('EMPLOYEE', 'post', '/api/departments', body())).status, 403);
  assert.equal((await call('LINE_MANAGER', 'post', '/api/departments', body())).status, 403);
});

test('create: duplicate code or name -> 409, invalid code/name -> 400', async () => {
  const a = body();
  assert.equal((await call('CEO', 'post', '/api/departments', a)).status, 201);
  assert.equal((await call('CEO', 'post', '/api/departments', { ...a, name: 'Another name' })).status, 409);
  assert.equal((await call('CEO', 'post', '/api/departments', { ...body(), name: a.name })).status, 409);
  assert.equal((await call('CEO', 'post', '/api/departments', body({ code: 'bad code!' }))).status, 400);
  assert.equal((await call('CEO', 'post', '/api/departments', body({ name: '' }))).status, 400);
  assert.equal((await call('CEO', 'post', '/api/departments', body({ budgetYearly: -5 }))).status, 400);
});

test('create/update: the manager must be an existing employee', async () => {
  assert.equal((await call('CEO', 'post', '/api/departments', body({ managerId: 'NV-NOPE' }))).status, 404);
  const emp = await createTestEmployee();
  const ok = await call('CEO', 'post', '/api/departments', body({ managerId: emp.id }));
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.manager_id, emp.id);
  const bad = await call('CEO', 'put', `/api/departments/${ok.body.data.id}`, { managerId: 'NV-NOPE' });
  assert.equal(bad.status, 404);
});

test('update: changes fields, 404 for unknown, 400 for an empty body', async () => {
  const created = (await call('CEO', 'post', '/api/departments', body())).body.data;
  const res = await call('HR_DIRECTOR', 'put', `/api/departments/${created.id}`, { name: `${created.name} v2`, budgetYearly: 5000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, `${created.name} v2`);
  assert.equal(Number(res.body.data.budget_yearly), 5000);
  assert.equal((await call('CEO', 'put', '/api/departments/DEPT-NOPE', { name: 'x' })).status, 404);
  assert.equal((await call('CEO', 'put', `/api/departments/${created.id}`, {})).status, 400);
  assert.equal((await call('EMPLOYEE', 'put', `/api/departments/${created.id}`, { name: 'x' })).status, 403);
});

test('delete: a department with active employees is refused', async () => {
  const dept = (await call('CEO', 'post', '/api/departments', body())).body.data;
  const emp = await createTestEmployee({ departmentId: dept.id });
  const res = await call('CEO', 'delete', `/api/departments/${dept.id}`);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'DEPARTMENT_HAS_EMPLOYEES');
  await db.query("UPDATE employees SET status = 'DA_NGHI_VIEC' WHERE id = $1", [emp.id]);
  assert.equal((await call('CEO', 'delete', `/api/departments/${dept.id}`)).status, 200);
});

test('delete: an empty department is deactivated and hidden from the list', async () => {
  const dept = (await call('CEO', 'post', '/api/departments', body())).body.data;
  const res = await call('HR_DIRECTOR', 'delete', `/api/departments/${dept.id}`);
  assert.equal(res.status, 200);
  const list = await call('EMPLOYEE', 'get', '/api/departments');
  assert.equal(list.body.data.some((d) => d.id === dept.id), false);
  assert.equal((await call('CEO', 'delete', `/api/departments/${dept.id}`)).status, 200); // idempotent
  assert.equal((await call('CEO', 'delete', '/api/departments/DEPT-NOPE')).status, 404);
  assert.equal((await call('EMPLOYEE', 'delete', `/api/departments/${dept.id}`)).status, 403);
});

test('writes are audited', async () => {
  const dept = (await call('CEO', 'post', '/api/departments', body())).body.data;
  await call('CEO', 'put', `/api/departments/${dept.id}`, { description: 'changed' });
  await call('CEO', 'delete', `/api/departments/${dept.id}`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'departments' AND record_id = $1 ORDER BY id", [dept.id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_DEPARTMENT', 'UPDATE_DEPARTMENT', 'DEACTIVATE_DEPARTMENT']);
});
