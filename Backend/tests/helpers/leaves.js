const db = require('../../src/config/db');
const { assertSafeTestDatabase } = require('../../src/utils/testDbGuard');

/** Give an employee a leave balance (default annual leave) for a year. */
async function giveBalance(employeeId, year, totalDays, leaveTypeId = 'LT-AL', executor = db) {
  await assertSafeTestDatabase(executor, 'helpers/leaves.giveBalance');
  await executor.query(
    `INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days) VALUES ($1, $2, $3, $4, 0)
     ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE SET total_days = EXCLUDED.total_days, used_days = 0`,
    [employeeId, leaveTypeId, year, totalDays]
  );
}

const usedDays = async (employeeId, year, leaveTypeId = 'LT-AL', executor = db) =>
  Number(
    (
      await executor.query(
        'SELECT used_days FROM leave_balances WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3',
        [employeeId, leaveTypeId, year]
      )
    ).rows[0].used_days
  );

async function deleteTestLeaves(executor = db) {
  await assertSafeTestDatabase(executor, 'helpers/leaves.deleteTestLeaves');
  await executor.query("DELETE FROM leave_requests WHERE employee_id LIKE 'NV-T%'");
  await executor.query("DELETE FROM leave_balances WHERE employee_id LIKE 'NV-T%'");
}

module.exports = { giveBalance, usedDays, deleteTestLeaves };
