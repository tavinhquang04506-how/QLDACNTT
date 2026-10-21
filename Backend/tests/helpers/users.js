const crypto = require('crypto');
const db = require('../../src/config/db');
const { assertSafeTestDatabase } = require('../../src/utils/testDbGuard');

const EMAIL_DOMAIN = '@example.test';

/** Insert a throwaway account (no employee link) with a known password. */
async function createTestUser(
  {
    role = 'EMPLOYEE',
    password = 'Passw0rd!x',
    active = true,
    mustChange = false,
    employeeId = null,
  } = {},
  executor = db
) {
  await assertSafeTestDatabase(executor, 'helpers/users.createTestUser');
  const email = `test-${crypto.randomBytes(5).toString('hex')}${EMAIL_DOMAIN}`;
  const { rows } = await executor.query(
    `INSERT INTO users (email, password_hash, role_code, is_active, must_change_password, employee_id)
     VALUES ($1, crypt($2, gen_salt('bf')), $3, $4, $5, $6) RETURNING id`,
    [email, password, role, active, mustChange, employeeId]
  );
  return { id: rows[0].id, email, password, role };
}

async function deleteTestUsers(executor = db) {
  await assertSafeTestDatabase(executor, 'helpers/users.deleteTestUsers');
  await executor.query('DELETE FROM users WHERE email LIKE $1', [`test-%${EMAIL_DOMAIN}`]);
}

module.exports = { createTestUser, deleteTestUsers, EMAIL_DOMAIN };
