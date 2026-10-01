const { createTestEmployee } = require('./employees');
const { createTestUser } = require('./users');
const { loginUser } = require('./api');

/**
 * A throwaway employee with a linked account, already logged in.
 * Returns { emp, user, token, employeeId }.
 */
async function employeeSession({ role = 'EMPLOYEE', departmentId = 'DEPT-IT', positionId = null } = {}) {
  const emp = await createTestEmployee({ departmentId, positionId });
  const user = await createTestUser({ role, employeeId: emp.id });
  const session = await loginUser(user);
  return { emp, user, token: session.accessToken, employeeId: emp.id };
}

module.exports = { employeeSession };
