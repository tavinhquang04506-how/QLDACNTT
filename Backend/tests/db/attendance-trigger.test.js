const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');

after(async () => {
  await deleteTestEmployees();
  await db.pool.end();
});

const insert = async (empId, day, status, inAt, outAt = null) => (await db.query(
  `INSERT INTO attendance_logs (employee_id, work_date, status, check_in_time, check_out_time) VALUES ($1, $2, $3, $4, $5)
   RETURNING status, late_minutes, work_hours`, [empId, day, status, inAt, outAt])).rows[0];

test('a manually chosen status (business trip, holiday, paid leave) survives the time calculations', async () => {
  const emp = await createTestEmployee();
  const trip = await insert(emp.id, '2027-04-05', 'CONG_TAC', '2027-04-05T02:30:00Z', '2027-04-05T10:00:00Z'); // 09:30 VN
  assert.equal(trip.status, 'CONG_TAC');
  assert.equal(trip.late_minutes, 90); // lateness is still measured
  for (const status of ['NGHI_LE', 'NGHI_PHEP', 'VE_SOM', 'VANG_KHONG_PHEP']) {
    const day = `2027-04-${String(6 + ['NGHI_LE', 'NGHI_PHEP', 'VE_SOM', 'VANG_KHONG_PHEP'].indexOf(status)).padStart(2, '0')}`;
    assert.equal((await insert(emp.id, day, status, `${day}T02:30:00Z`)).status, status, status);
  }
});

test('the automatic statuses are still computed: late -> DI_MUON, on time -> DUNG_GIO', async () => {
  const emp = await createTestEmployee();
  assert.equal((await insert(emp.id, '2027-04-12', 'DUNG_GIO', '2027-04-12T01:30:00Z')).status, 'DI_MUON');
  assert.equal((await insert(emp.id, '2027-04-13', 'DUNG_GIO', '2027-04-13T00:30:00Z')).status, 'DUNG_GIO');
  // moving an automatic status back to DUNG_GIO recalculates it
  await db.query("UPDATE attendance_logs SET status = 'DUNG_GIO' WHERE employee_id = $1 AND work_date = '2027-04-12'", [emp.id]);
  const { rows } = await db.query("SELECT status FROM attendance_logs WHERE employee_id = $1 AND work_date = '2027-04-12'", [emp.id]);
  assert.equal(rows[0].status, 'DI_MUON');
});

test('a check-out does not overwrite a manual status', async () => {
  const emp = await createTestEmployee();
  await insert(emp.id, '2027-04-14', 'CONG_TAC', '2027-04-14T00:30:00Z');
  await db.query("UPDATE attendance_logs SET check_out_time = '2027-04-14T10:30:00Z' WHERE employee_id = $1 AND work_date = '2027-04-14'", [emp.id]);
  const { rows } = await db.query("SELECT status, work_hours FROM attendance_logs WHERE employee_id = $1 AND work_date = '2027-04-14'", [emp.id]);
  assert.equal(rows[0].status, 'CONG_TAC');
  assert.equal(Number(rows[0].work_hours), 10);
});
