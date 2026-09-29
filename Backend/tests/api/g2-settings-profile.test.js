const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');

after(async () => {
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('F13: GET /api/settings returns real system settings and PUT /api/settings persists changes for HR_DIRECTOR while rejecting EMPLOYEE', async () => {
  const emp = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
  const hrd = await employeeSession({ role: 'HR_DIRECTOR', departmentId: 'DEPT-HR' });

  const getRes = await callWith(emp.token, 'get', '/api/settings');
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.success, true);
  assert.ok(getRes.body.data.office_name);
  assert.equal(typeof getRes.body.data.gps_radius_meters, 'number');

  // EMPLOYEE cannot update settings
  const forbiddenRes = await callWith(emp.token, 'put', '/api/settings', {
    gps_radius_meters: 500,
  });
  assert.equal(forbiddenRes.status, 403);

  // HR_DIRECTOR updates settings and persists in DB
  const updateRes = await callWith(hrd.token, 'put', '/api/settings', {
    gps_radius_meters: 300,
    late_grace_minutes: 10,
  });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.data.gps_radius_meters, 300);
  assert.equal(updateRes.body.data.late_grace_minutes, 10);

  // Reload verify persistence
  const verifyRes = await callWith(emp.token, 'get', '/api/settings');
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.data.gps_radius_meters, 300);
  assert.equal(verifyRes.body.data.late_grace_minutes, 10);

  // Restore default
  await callWith(hrd.token, 'put', '/api/settings', {
    gps_radius_meters: 250,
    late_grace_minutes: 15,
  });
});

test('F16 & F18: GET /api/employees/:id returns real contract + leave balance fields for self/HR_DIRECTOR and redacts sensitive fields for other employees', async () => {
  const emp = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
  const hrd = await employeeSession({ role: 'HR_DIRECTOR', departmentId: 'DEPT-HR' });
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });

  // Self view includes sensitive fields + contract + leave balance
  const selfRes = await callWith(emp.token, 'get', `/api/employees/${emp.employeeId}`);
  assert.equal(selfRes.status, 200);
  assert.equal(selfRes.body.data.id, emp.employeeId);
  assert.ok(selfRes.body.data.base_salary !== undefined, 'Self should see base_salary');
  assert.ok('leave_balance' in selfRes.body.data, 'Self should receive leave_balance field');

  // HR_DIRECTOR viewing NV-0001 sees contract + salary
  const hrdRes = await callWith(hrd.token, 'get', '/api/employees/NV-0001');
  assert.equal(hrdRes.status, 200);
  assert.ok(hrdRes.body.data.base_salary !== undefined, 'HR_DIRECTOR should see base_salary');
  assert.ok(hrdRes.body.data.contract_no !== undefined, 'HR_DIRECTOR should see contract_no');

  // LINE_MANAGER viewing another employee in same department has sensitive & contract fields redacted
  const mgrRes = await callWith(mgr.token, 'get', `/api/employees/${emp.employeeId}`);
  assert.equal(mgrRes.status, 200);
  assert.equal(mgrRes.body.data.base_salary, undefined, 'LINE_MANAGER should not see another employee base_salary');
  assert.equal(mgrRes.body.data.contract_salary, undefined, 'LINE_MANAGER should not see another employee contract_salary');

  // Directory filter by department ID or name works
  const dirRes = await callWith(hrd.token, 'get', '/api/employees?department=DEPT-IT&status=DANG_LAM_VIEC&page=1&limit=5');
  assert.equal(dirRes.status, 200);
  assert.ok(Array.isArray(dirRes.body.data));
  assert.ok(dirRes.body.pagination.total >= 1);
});
