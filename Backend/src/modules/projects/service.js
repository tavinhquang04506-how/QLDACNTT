const db = require('../../config/db');
const { AppError, forbidden, notFound } = require('../../utils/AppError');
const { writeAudit } = require('../../utils/audit');
const { visibilityPredicate, canManageProject, departmentOf, HR_ROLES } = require('./access');

const LIST_SQL = `
  SELECT p.*, d.name AS department_name, m.full_name AS manager_name, m.avatar_url AS manager_avatar,
         COUNT(t.id)::int AS total_tasks, (COUNT(t.id) FILTER (WHERE t.stage = 'done'))::int AS done_tasks
    FROM projects p
    LEFT JOIN departments d ON p.department_id = d.id
    LEFT JOIN employees m ON p.manager_id = m.id
    LEFT JOIN tasks t ON t.project_id = p.id`;
const GROUP = 'GROUP BY p.id, d.name, m.full_name, m.avatar_url';

async function findProject(executor, id) {
  const { rows } = await executor.query(`${LIST_SQL} WHERE p.id = $1 ${GROUP}`, [id]);
  return rows[0] || null;
}

async function assertExists(client, table, id, message) {
  const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  if (rows.length === 0) throw notFound(message);
}

async function list(user) {
  const params = [];
  const predicate = await visibilityPredicate(db, user, params);
  const { rows } = await db.query(
    `${LIST_SQL} ${predicate ? `WHERE ${predicate}` : ''} ${GROUP} ORDER BY p.start_date DESC NULLS LAST, p.id`, params);
  return rows;
}

async function get(user, id) {
  const project = await findProject(db, id);
  if (!project) throw notFound('Không tìm thấy dự án');
  const params = [id];
  const predicate = await visibilityPredicate(db, user, params);
  if (predicate) {
    const seen = await db.query(`SELECT 1 FROM projects p WHERE p.id = $1 AND ${predicate}`, params);
    if (seen.rows.length === 0) throw forbidden('Bạn không tham gia dự án này');
  }
  return project;
}

async function create(actor, body, req) {
  const actorDept = await departmentOf(db, actor.employeeId);
  const departmentId = body.departmentId ?? actorDept;
  if (!departmentId) throw new AppError(400, 'VALIDATION_ERROR', 'Vui lòng chọn phòng ban cho dự án');
  if (actor.roleCode === 'LINE_MANAGER' && departmentId !== actorDept) {
    throw forbidden('Trưởng phòng chỉ tạo dự án cho phòng ban của mình');
  }

  return db.withTransaction(async (client) => {
    await assertExists(client, 'departments', departmentId, 'Không tìm thấy phòng ban');
    const managerId = body.managerId ?? actor.employeeId ?? null;
    if (managerId) await assertExists(client, 'employees', managerId, 'Không tìm thấy quản lý dự án');

    const id = (await client.query("SELECT 'PRJ-' || nextval('seq_project_id') AS id")).rows[0].id;
    const code = body.code ?? (await client.query("SELECT 'PRJ-' || EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' || currval('seq_project_id') AS c")).rows[0].c;
    await client.query(
      `INSERT INTO projects (id, code, name, department_id, manager_id, start_date, end_date, priority, description, budget_hours)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, COALESCE($8::task_priority_enum, 'Trung bình'), $9, COALESCE($10, 100))`,
      [id, code, body.name, departmentId, managerId, body.startDate ?? null, body.endDate ?? null, body.priority ?? null,
        body.description ?? null, body.budgetHours ?? null]
    );
    await writeAudit(client, {
      user: actor, action: 'CREATE_PROJECT', table: 'projects', recordId: id, req,
      newValues: { code, name: body.name, department_id: departmentId, manager_id: managerId },
    });
    return findProject(client, id);
  });
}

const COLUMNS = {
  name: 'name', departmentId: 'department_id', managerId: 'manager_id', startDate: 'start_date', endDate: 'end_date',
  priority: 'priority', status: 'status', description: 'description', budgetHours: 'budget_hours',
};

async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const before = await findProject(client, id);
    if (!before) throw notFound('Không tìm thấy dự án');
    if (!(await canManageProject(client, actor, before))) throw forbidden('Bạn không có quyền sửa dự án này');
    if (body.departmentId) {
      await assertExists(client, 'departments', body.departmentId, 'Không tìm thấy phòng ban');
      if (body.departmentId !== before.department_id && !HR_ROLES.includes(actor.roleCode)) {
        const mine = await departmentOf(client, actor.employeeId);
        if (actor.roleCode !== 'LINE_MANAGER' || mine !== body.departmentId) {
          throw forbidden('Bạn chỉ chuyển được dự án sang phòng ban do mình phụ trách');
        }
      }
    }
    if (body.managerId) await assertExists(client, 'employees', body.managerId, 'Không tìm thấy quản lý dự án');

    const sets = [];
    const params = [id];
    for (const [key, column] of Object.entries(COLUMNS)) {
      if (body[key] !== undefined) {
        params.push(body[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    await client.query(`UPDATE projects SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
    await writeAudit(client, {
      user: actor, action: 'UPDATE_PROJECT', table: 'projects', recordId: id, req,
      oldValues: { name: before.name, status: before.status, manager_id: before.manager_id }, newValues: body,
    });
    return findProject(client, id);
  });
}

async function remove(actor, id, req) {
  return db.withTransaction(async (client) => {
    const project = await findProject(client, id);
    if (!project) throw notFound('Không tìm thấy dự án');
    if (!(await canManageProject(client, actor, project))) throw forbidden('Bạn không có quyền xóa dự án này');
    if (project.total_tasks > 0) {
      throw new AppError(409, 'PROJECT_HAS_TASKS', `Dự án còn ${project.total_tasks} nhiệm vụ, hãy xóa hoặc chuyển chúng trước`);
    }
    await client.query('DELETE FROM projects WHERE id = $1', [id]);
    await writeAudit(client, {
      user: actor, action: 'DELETE_PROJECT', table: 'projects', recordId: id, req, oldValues: { code: project.code, name: project.name },
    });
  });
}

module.exports = { list, get, create, update, remove, findProject };
