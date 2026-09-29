const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE action LIKE '%_PAYROLL'");
  await db.query("DELETE FROM payroll_periods WHERE period = '2027-02'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('F06: POST /api/attendance/check-in rejects out-of-range GPS (including 0,0) and accepts within configured radius', async () => {
  const emp = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });

  // Out-of-range coordinates (0, 0) -> 400 BAD_REQUEST
  const zeroRes = await callWith(emp.token, 'post', '/api/attendance/check-in', {
    method: 'gps',
    gpsLat: 0,
    gpsLng: 0,
  });
  assert.equal(zeroRes.status, 400);

  // Out-of-range coordinates (Hanoi 21.0285, 105.8542) -> 400 BAD_REQUEST
  const farRes = await callWith(emp.token, 'post', '/api/attendance/check-in', {
    method: 'gps',
    gpsLat: 21.0285,
    gpsLng: 105.8542,
  });
  assert.equal(farRes.status, 400);

  // Within configured office coordinates (10.77, 106.70) -> 201 CREATED
  const okRes = await callWith(emp.token, 'post', '/api/attendance/check-in', {
    method: 'gps',
    gpsLat: 10.77,
    gpsLng: 106.7,
  });
  assert.equal(okRes.status, 201);
  assert.equal(okRes.body.data.employee_id, emp.employeeId);
  assert.equal(Number(okRes.body.data.distance_meters), 0);
});

test('F09: POST /api/payroll/calculate preserves 0 actual_work_days and 0 net_salary when all logged days are VANG_KHONG_PHEP', async () => {
  const unexcusedEmp = await createTestEmployee({ status: 'DANG_LAM_VIEC', departmentId: 'DEPT-IT' });
  await db.query("UPDATE employees SET base_salary = 22000000, joined_date = '2020-01-01' WHERE id = $1", [unexcusedEmp.id]);

  // Insert 5 days of VANG_KHONG_PHEP in 2027-02
  await db.query(
    `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
     SELECT $1, ('2027-02-01'::date + g), 'VANG_KHONG_PHEP', 0
       FROM generate_series(0, 4) g`,
    [unexcusedEmp.id]
  );

  const calcRes = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2027-02' });
  assert.equal(calcRes.status, 200);

  const { rows } = await db.query(
    `SELECT ps.* FROM payslips ps JOIN payroll_periods pp ON pp.id = ps.period_id
      WHERE pp.period = '2027-02' AND ps.employee_id = $1`,
    [unexcusedEmp.id]
  );
  assert.equal(rows.length, 1);
  const slip = rows[0];
  assert.equal(Number(slip.actual_work_days), 0, 'Employee with only VANG_KHONG_PHEP must have 0 actual_work_days, not 22');
  assert.equal(Number(slip.gross_income), 0);
  assert.equal(Number(slip.net_salary), 0);
});
