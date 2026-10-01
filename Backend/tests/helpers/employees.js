const crypto = require('crypto');
const db = require('../../src/config/db');

/** Insert a throwaway employee (id NV-T…, email test-*@example.test). */
async function createTestEmployee({ departmentId = 'DEPT-IT', positionId = null, status = 'DANG_LAM_VIEC' } = {}) {
  const suffix = crypto.randomBytes(4).toString('hex');
  const id = `NV-T${suffix}`.slice(0, 20);
  await db.query(
    `INSERT INTO employees (id, full_name, department_id, position_id, job_title, work_email, joined_date, status)
     VALUES ($1, $2, $3, $4, 'Tester', $5, CURRENT_DATE, $6)`,
    [id, `Test ${suffix}`, departmentId, positionId, `test-emp-${suffix}@example.test`, status]
  );
  return { id, email: `test-emp-${suffix}@example.test` };
}

async function deleteTestEmployees() {
  await db.query("DELETE FROM audit_logs WHERE table_name = 'employees' AND record_id LIKE 'NV-T%'");
  await db.query("DELETE FROM users WHERE employee_id LIKE 'NV-T%'");
  await db.query("DELETE FROM employees WHERE id LIKE 'NV-T%'");
}

module.exports = { createTestEmployee, deleteTestEmployees };
