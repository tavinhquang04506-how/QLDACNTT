const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const { badRequest, forbidden, notFound, conflict } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const tokens = require('../auth/tokens');
const { canAssignRole, canManageUserWithRole, generateTemporaryPassword } = require('./roleRules');

const SELECT_USER = `
  SELECT u.id, u.employee_id, u.email, u.role_code, u.is_active, u.last_login_at, u.locked_until,
         u.failed_login_attempts, u.must_change_password, u.created_at,
         e.full_name, d.id AS department_id, d.name AS department_name
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
    LEFT JOIN departments d ON d.id = e.department_id`;

const toUser = (r) => ({
  id: r.id,
  employeeId: r.employee_id,
  email: r.email,
  roleCode: r.role_code,
  isActive: r.is_active,
  lastLoginAt: r.last_login_at,
  lockedUntil: r.locked_until,
  failedLoginAttempts: r.failed_login_attempts,
  mustChangePassword: r.must_change_password,
  createdAt: r.created_at,
  fullName: r.full_name,
  departmentId: r.department_id,
  departmentName: r.department_name,
});

async function findUser(executor, id) {
  const { rows } = await executor.query(`${SELECT_USER} WHERE u.id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

/** user_roles mirrors users.role_code; roles without a matching roles row (e.g. ADMIN) simply have no link. */
async function syncUserRoles(client, userId, roleCode) {
  await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
  await client.query(
    'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE role_code = $2',
    [userId, roleCode]
  );
}

async function list(query) {
  const { page, limit, offset } = parsePagination(query);
  const where = [];
  const params = [];
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(u.email ILIKE $${params.length} OR e.full_name ILIKE $${params.length} OR u.employee_id ILIKE $${params.length})`);
  }
  if (query.role) {
    params.push(query.role);
    where.push(`u.role_code = $${params.length}`);
  }
  if (query.active) {
    params.push(query.active === 'true');
    where.push(`u.is_active = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = parseInt(
    (await db.query(`SELECT COUNT(*) FROM users u LEFT JOIN employees e ON e.id = u.employee_id ${clause}`, params)).rows[0].count,
    10
  );
  const { rows } = await db.query(
    `${SELECT_USER} ${clause} ORDER BY u.created_at, u.email LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: rows.map(toUser), pagination: paginationMeta(total, page, limit) };
}

async function get(id) {
  const user = await findUser(db, id);
  if (!user) throw notFound('Không tìm thấy tài khoản');
  return user;
}

async function create(actor, body, req) {
  if (!canAssignRole(actor.roleCode, body.role)) {
    throw forbidden(`Vai trò "${actor.roleCode}" không được cấp vai trò "${body.role}"`);
  }
  const temporaryPassword = body.password ? null : generateTemporaryPassword();
  const hash = await bcrypt.hash(body.password || temporaryPassword, 10);

  const user = await db.withTransaction(async (client) => {
    if (body.employeeId) {
      const emp = await client.query('SELECT id FROM employees WHERE id = $1', [body.employeeId]);
      if (emp.rows.length === 0) throw notFound('Không tìm thấy nhân viên');
      const has = await client.query('SELECT 1 FROM users WHERE employee_id = $1', [body.employeeId]);
      if (has.rows.length > 0) throw conflict('Nhân viên này đã có tài khoản');
    }
    const { rows } = await client.query(
      `INSERT INTO users (employee_id, email, password_hash, role_code, must_change_password)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
      [body.employeeId || null, body.email, hash, body.role]
    );
    const id = rows[0].id;
    await syncUserRoles(client, id, body.role);
    await writeAudit(client, {
      user: actor, action: 'CREATE_USER', table: 'users', recordId: id, req,
      newValues: { email: body.email, role_code: body.role, employee_id: body.employeeId || null },
    });
    return findUser(client, id);
  });
  return { user, temporaryPassword };
}

async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const target = await findUser(client, id);
    if (!target) throw notFound('Không tìm thấy tài khoản');
    if (!canManageUserWithRole(actor.roleCode, target.roleCode)) {
      throw forbidden('Bạn không có quyền quản lý tài khoản này');
    }
    const isSelf = actor.userId === id;
    if (isSelf && body.role !== undefined && body.role !== target.roleCode) {
      throw badRequest('Không thể tự thay đổi vai trò của chính mình');
    }
    if (isSelf && body.isActive === false) throw badRequest('Không thể tự vô hiệu hóa tài khoản của chính mình');
    if (body.role !== undefined && body.role !== target.roleCode && !canAssignRole(actor.roleCode, body.role)) {
      throw forbidden(`Vai trò "${actor.roleCode}" không được cấp vai trò "${body.role}"`);
    }

    const role = body.role ?? target.roleCode;
    const active = body.isActive ?? target.isActive;
    await client.query('UPDATE users SET role_code = $2, is_active = $3, updated_at = NOW() WHERE id = $1', [id, role, active]);
    if (role !== target.roleCode) await syncUserRoles(client, id, role);
    if (active !== target.isActive) await tokens.revokeAllForUser(client, id);

    await writeAudit(client, {
      user: actor, action: 'UPDATE_USER', table: 'users', recordId: id, req,
      oldValues: { role_code: target.roleCode, is_active: target.isActive },
      newValues: { role_code: role, is_active: active },
    });
    return findUser(client, id);
  });
}

async function resetPassword(actor, id, req) {
  const temporaryPassword = generateTemporaryPassword();
  const hash = await bcrypt.hash(temporaryPassword, 10);
  await db.withTransaction(async (client) => {
    const target = await findUser(client, id);
    if (!target) throw notFound('Không tìm thấy tài khoản');
    if (!canManageUserWithRole(actor.roleCode, target.roleCode)) {
      throw forbidden('Bạn không có quyền quản lý tài khoản này');
    }
    await client.query(
      `UPDATE users SET password_hash = $2, must_change_password = TRUE, failed_login_attempts = 0,
                        locked_until = NULL, updated_at = NOW() WHERE id = $1`,
      [id, hash]
    );
    await tokens.revokeAllForUser(client, id);
    await writeAudit(client, { user: actor, action: 'RESET_PASSWORD', table: 'users', recordId: id, req });
  });
  return temporaryPassword;
}

async function unlock(actor, id, req) {
  return db.withTransaction(async (client) => {
    const target = await findUser(client, id);
    if (!target) throw notFound('Không tìm thấy tài khoản');
    if (!canManageUserWithRole(actor.roleCode, target.roleCode)) {
      throw forbidden('Bạn không có quyền quản lý tài khoản này');
    }
    await client.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1', [id]);
    await writeAudit(client, { user: actor, action: 'UNLOCK_USER', table: 'users', recordId: id, req });
    return findUser(client, id);
  });
}

module.exports = { list, get, create, update, resetPassword, unlock };
