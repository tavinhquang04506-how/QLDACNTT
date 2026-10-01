const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');

after(async () => {
  await deleteTestEmployees();
  await db.pool.end();
});

test('every connection uses the company time zone', async () => {
  const { rows } = await db.query("SELECT current_setting('timezone') AS tz");
  assert.equal(rows[0].tz, 'Asia/Ho_Chi_Minh');
});

async function punch(empId, day, instant) {
  const { rows } = await db.query(
    `INSERT INTO attendance_logs (employee_id, work_date, check_in_time) VALUES ($1, $2, $3) RETURNING late_minutes, status`,
    [empId, day, instant]
  );
  return rows[0];
}

test('08:30 Vietnam time (01:30 UTC) is 30 minutes late', async () => {
  const emp = await createTestEmployee();
  const r = await punch(emp.id, '2026-03-02', '2026-03-02T01:30:00Z');
  assert.equal(r.late_minutes, 30);
  assert.equal(r.status, 'DI_MUON');
});

test('07:59 Vietnam time (00:59 UTC) is on time', async () => {
  const emp = await createTestEmployee();
  const r = await punch(emp.id, '2026-03-03', '2026-03-02T00:59:00Z');
  assert.equal(r.late_minutes, 0);
  assert.equal(r.status, 'DUNG_GIO');
});

test('the local calendar day rolls over at 17:00 UTC', async () => {
  const { rows } = await db.query("SELECT ('2026-03-01T17:30:00Z'::timestamptz)::date::text AS d");
  assert.equal(rows[0].d, '2026-03-02');
});
