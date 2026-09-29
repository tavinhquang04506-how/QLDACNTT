const db = require('../../config/db');
const { notFound, AppError } = require('../../utils/AppError');
const { writeAudit } = require('../../utils/audit');

const SELECT_DEPT = `
  SELECT d.id, d.name, d.description, d.budget_yearly, d.is_active, d.manager_id,
         m.full_name AS manager_name, m.avatar_url AS manager_avatar,
         COUNT(e.id) FILTER (WHERE e.status = 'DANG_LAM_VIEC') AS employee_count
    FROM departments d
    LEFT JOIN employees m ON m.id = d.manager_id
    LEFT JOIN employees e ON e.department_id = d.id`;
const GROUP_DEPT = 'GROUP BY d.id, m.full_name, m.avatar_url';

async function findDepartment(executor, id) {
  const { rows } = await executor.query(`${SELECT_DEPT} WHERE d.id = $1 ${GROUP_DEPT}`, [id]);
  return rows[0] || null;
}

async function assertEmployeeExists(client, employeeId) {
  const { rows } = await client.query('SELECT 1 FROM employees WHERE id = $1', [employeeId]);
  if (rows.length === 0) throw notFound('Không tìm thấy nhân viên');
}

async function get(id) {
  const dept = await findDepartment(db, id);
  if (!dept) throw notFound('Không tìm thấy phòng ban');
  return dept;
}

async function create(actor, body, req) {
  const id = `DEPT-${body.code}`;
  return db.withTransaction(async (client) => {
    if (body.managerId) await assertEmployeeExists(client, body.managerId);
    await client.query(
      `INSERT INTO departments (id, name, description, budget_yearly, manager_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, body.name, body.description ?? null, body.budgetYearly ?? null, body.managerId ?? null]
    );
    await writeAudit(client, {
      user: actor, action: 'CREATE_DEPARTMENT', table: 'departments', recordId: id, req,
      newValues: { name: body.name, manager_id: body.managerId ?? null, budget_yearly: body.budgetYearly ?? null },
    });
    return findDepartment(client, id);
  });
}

const COLUMNS = {
  name: 'name',
  description: 'description',
  budgetYearly: 'budget_yearly',
  managerId: 'manager_id',
  isActive: 'is_active',
};

async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const before = await findDepartment(client, id);
    if (!before) throw notFound('Không tìm thấy phòng ban');
    if (body.managerId) await assertEmployeeExists(client, body.managerId);

    const sets = [];
    const params = [id];
    for (const [key, column] of Object.entries(COLUMNS)) {
      if (body[key] !== undefined) {
        params.push(body[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    await client.query(`UPDATE departments SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, params);

    await writeAudit(client, {
      user: actor, action: 'UPDATE_DEPARTMENT', table: 'departments', recordId: id, req,
      oldValues: { name: before.name, description: before.description, budget_yearly: before.budget_yearly, manager_id: before.manager_id, is_active: before.is_active },
      newValues: body,
    });
    return findDepartment(client, id);
  });
}

async function deactivate(actor, id, req) {
  return db.withTransaction(async (client) => {
    const dept = await findDepartment(client, id);
    if (!dept) throw notFound('Không tìm thấy phòng ban');

    const { rows } = await client.query(
      "SELECT COUNT(*)::int AS n FROM employees WHERE department_id = $1 AND status <> 'DA_NGHI_VIEC'",
      [id]
    );
    if (rows[0].n > 0) {
      throw new AppError(409, 'DEPARTMENT_HAS_EMPLOYEES', `Phòng ban còn ${rows[0].n} nhân viên, hãy chuyển họ sang phòng ban khác trước`);
    }
    await client.query('UPDATE departments SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
    await writeAudit(client, {
      user: actor, action: 'DEACTIVATE_DEPARTMENT', table: 'departments', recordId: id, req,
      oldValues: { is_active: dept.is_active }, newValues: { is_active: false },
    });
  });
}

module.exports = { get, create, update, deactivate };
