const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shapeEmployee, canViewEmployee } = require('../../src/modules/employees/access');
const { SENSITIVE_EMPLOYEE_FIELDS } = require('../../src/utils/redact');

const row = {
  id: 'NV-1', full_name: 'A', department_id: 'DEPT-IT', job_title: 'Dev', work_email: 'a@x.vn',
  base_salary: 1, citizen_id: '1', bank_account: '1', bank_name: 'B', date_of_birth: '2000-01-01',
  address: 'x', termination_reason: 'r', face_encoding: Buffer.from('ab'),
};
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

test('CEO and HR_DIRECTOR see every sensitive field, but never face_encoding', () => {
  for (const roleCode of ['CEO', 'HR_DIRECTOR']) {
    const out = shapeEmployee(row, { roleCode, employeeId: 'NV-9' });
    for (const f of SENSITIVE_EMPLOYEE_FIELDS) assert.ok(has(out, f), f);
    assert.equal(has(out, 'face_encoding'), false);
  }
});

test('the owner sees their own sensitive fields whatever their role', () => {
  for (const roleCode of ['EMPLOYEE', 'LINE_MANAGER', 'ADMIN']) {
    const out = shapeEmployee(row, { roleCode, employeeId: 'NV-1' });
    for (const f of SENSITIVE_EMPLOYEE_FIELDS) assert.ok(has(out, f), `${roleCode} ${f}`);
  }
});

test('everyone else loses the sensitive fields but keeps public ones', () => {
  for (const roleCode of ['EMPLOYEE', 'LINE_MANAGER', 'ADMIN', 'KIOSK']) {
    const out = shapeEmployee(row, { roleCode, employeeId: 'NV-9' });
    for (const f of SENSITIVE_EMPLOYEE_FIELDS) assert.equal(has(out, f), false, `${roleCode} ${f}`);
    assert.equal(out.full_name, 'A');
    assert.equal(out.work_email, 'a@x.vn');
    assert.equal(has(out, 'face_encoding'), false);
  }
});

test('shapeEmployee does not mutate its input', () => {
  const copy = { ...row };
  shapeEmployee(row, { roleCode: 'EMPLOYEE', employeeId: 'NV-9' });
  assert.deepEqual(row, copy);
});

test('canViewEmployee follows the scope', () => {
  const user = { employeeId: 'NV-9' };
  assert.equal(canViewEmployee('all', user, 'DEPT-HR', row), true);
  assert.equal(canViewEmployee('department', user, 'DEPT-IT', row), true);
  assert.equal(canViewEmployee('department', user, 'DEPT-HR', row), false);
  assert.equal(canViewEmployee('department', user, null, row), false);
  assert.equal(canViewEmployee('department', { employeeId: 'NV-1' }, null, row), true);
  assert.equal(canViewEmployee('self', { employeeId: 'NV-1' }, null, row), true);
  assert.equal(canViewEmployee('self', user, null, row), false);
  assert.equal(canViewEmployee(null, user, null, row), false);
});
