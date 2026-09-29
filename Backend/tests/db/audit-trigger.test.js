const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { setAuditActor } = require('../../src/utils/audit');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');

after(async () => {
  await deleteTestEmployees();
  await db.pool.end();
});

async function ceo() {
  const { rows } = await db.query("SELECT id, employee_id FROM users WHERE email = 'ceo@fwbnexus.vn'");
  return { userId: rows[0].id, employeeId: rows[0].employee_id };
}

const lastEmployeeAudit = async (id) =>
  (await db.query("SELECT * FROM audit_logs WHERE table_name = 'employees' AND record_id = $1 ORDER BY id DESC LIMIT 1", [id])).rows[0];

test('trigger rows carry the acting user when setAuditActor is used', async () => {
  const emp = await createTestEmployee();
  const actor = await ceo();
  await db.withTransaction(async (client) => {
    await setAuditActor(client, actor);
    await client.query("UPDATE employees SET job_title = 'Changed' WHERE id = $1", [emp.id]);
  });
  const row = await lastEmployeeAudit(emp.id);
  assert.equal(row.action, 'UPDATE');
  assert.equal(row.user_id, actor.userId);
  assert.equal(row.employee_id, actor.employeeId);
  assert.equal(row.new_values.job_title, 'Changed');
});

test('without an actor the user is null, and the setting does not leak to the next transaction', async () => {
  const emp = await createTestEmployee();
  await db.withTransaction(async (client) => {
    await setAuditActor(client, await ceo());
    await client.query("UPDATE employees SET job_title = 'One' WHERE id = $1", [emp.id]);
  });
  await db.query("UPDATE employees SET job_title = 'Two' WHERE id = $1", [emp.id]);
  const row = await lastEmployeeAudit(emp.id);
  assert.equal(row.new_values.job_title, 'Two');
  assert.equal(row.user_id, null);
});

test('face_encoding is never stored in audit rows', async () => {
  const emp = await createTestEmployee();
  await db.query("UPDATE employees SET face_encoding = '\\xdeadbeef'::bytea WHERE id = $1", [emp.id]);
  await db.query("UPDATE employees SET job_title = 'After face' WHERE id = $1", [emp.id]);
  const { rows } = await db.query("SELECT old_values, new_values FROM audit_logs WHERE table_name = 'employees' AND record_id = $1", [emp.id]);
  assert.ok(rows.length >= 3);
  for (const r of rows) {
    assert.ok(!(r.old_values && 'face_encoding' in r.old_values));
    assert.ok(!(r.new_values && 'face_encoding' in r.new_values));
  }
});

test('every existing active employee got exactly one active seed contract', async () => {
  const { rows } = await db.query(`
    SELECT e.id, COUNT(c.id) FILTER (WHERE c.status = 'HIEU_LUC') AS active
      FROM employees e LEFT JOIN contracts c ON c.employee_id = e.id
     WHERE e.status <> 'DA_NGHI_VIEC' AND e.id NOT LIKE 'NV-T%'
     GROUP BY e.id`);
  assert.ok(rows.length >= 14);
  assert.ok(rows.every((r) => Number(r.active) === 1), JSON.stringify(rows.filter((r) => Number(r.active) !== 1)));
});

test('the database allows only one active contract per employee', async () => {
  const emp = await createTestEmployee();
  const insert = () => db.query(
    `INSERT INTO contracts (employee_id, contract_no, type, start_date, salary, status)
     VALUES ($1, $2, 'CHINH_THUC', CURRENT_DATE, 1, 'HIEU_LUC')`, [emp.id, `T-${Math.random()}`]);
  await insert();
  await assert.rejects(insert(), (e) => e.code === '23505');
});

test('a contract cannot end before it starts, or have a negative salary', async () => {
  const emp = await createTestEmployee();
  await assert.rejects(db.query(
    `INSERT INTO contracts (employee_id, contract_no, type, start_date, end_date, salary, status)
     VALUES ($1, $2, 'THU_VIEC', '2026-02-01', '2026-01-01', 1, 'CHO_KY')`, [emp.id, `T-${Math.random()}`]), (e) => e.code === '23514');
  await assert.rejects(db.query(
    `INSERT INTO contracts (employee_id, contract_no, type, start_date, salary, status)
     VALUES ($1, $2, 'THU_VIEC', '2026-01-01', -1, 'CHO_KY')`, [emp.id, `T-${Math.random()}`]), (e) => e.code === '23514');
});
