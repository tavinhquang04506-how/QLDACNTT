const db = require('../../config/db');
const { AppError, forbidden, notFound, conflict } = require('../../utils/AppError');
const { parsePagination } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { HR_ROLES, departmentOf, canManageProject } = require('../projects/access');

const SQUAD_SQL = `
  SELECT s.*, l.full_name AS lead_name, l.avatar_url AS lead_avatar, p.name AS project_name
    FROM squads s
    LEFT JOIN employees l ON s.lead_id = l.id
    LEFT JOIN projects p ON s.project_id = p.id`;

async function attachMembers(executor, squads) {
  if (squads.length === 0) return squads;
  const { rows } = await executor.query(
    `SELECT sm.squad_id, sm.role_in_squad, e.id, e.full_name, e.avatar_url, e.job_title
       FROM squad_members sm JOIN employees e ON sm.employee_id = e.id
      WHERE sm.squad_id = ANY($1) ORDER BY sm.role_in_squad DESC, e.full_name`,
    [squads.map((s) => s.id)]
  );
  for (const s of squads) s.members = rows.filter((m) => m.squad_id === s.id).map(({ squad_id, ...m }) => m); // eslint-disable-line no-unused-vars
  return squads;
}

async function findSquad(executor, id, { lock = false } = {}) {
  const { rows } = await executor.query(`${SQUAD_SQL} WHERE s.id = $1 ${lock ? 'FOR UPDATE OF s' : ''}`, [id]);
  if (!rows[0]) return null;
  return (await attachMembers(executor, [rows[0]]))[0];
}

const isMember = (squad, user) => Boolean(user.employeeId) && (squad.lead_id === user.employeeId || (squad.members && squad.members.some((m) => m.id === user.employeeId)) || (user.roleCode && HR_ROLES.includes(user.roleCode)));

async function projectOf(executor, squad) {
  if (!squad.project_id) return null;
  return (await executor.query('SELECT id, manager_id, department_id FROM projects WHERE id = $1', [squad.project_id])).rows[0] ?? null;
}

async function canManage(executor, user, squad) {
  if (HR_ROLES.includes(user.roleCode)) return true;
  if (user.employeeId && squad.lead_id === user.employeeId) return true;
  const project = await projectOf(executor, squad);
  return project ? canManageProject(executor, user, project) : false;
}

async function canRead(executor, user, squad) {
  return isMember(squad, user) || (await canManage(executor, user, squad));
}

async function list(user) {
  const params = [];
  let where = '';
  if (!HR_ROLES.includes(user.roleCode)) {
    params.push(user.employeeId ?? '');
    const e = `$${params.length}`;
    let deptClause = '';
    if (user.roleCode === 'LINE_MANAGER') {
      const dept = await departmentOf(db, user.employeeId);
      if (dept) {
        params.push(dept);
        deptClause = ` OR p.department_id = $${params.length}`;
      }
    }
    where = `WHERE s.lead_id = ${e} OR EXISTS (SELECT 1 FROM squad_members sm WHERE sm.squad_id = s.id AND sm.employee_id = ${e})
             OR p.manager_id = ${e}${deptClause}`;
  }
  const { rows } = await db.query(`${SQUAD_SQL} ${where} ORDER BY s.name, s.id`, params);
  return attachMembers(db, rows);
}

async function get(user, id) {
  const squad = await findSquad(db, id);
  if (!squad) throw notFound('Không tìm thấy nhóm');
  if (!(await canRead(db, user, squad))) throw forbidden('Bạn không thuộc nhóm này');
  return squad;
}

async function assertExists(client, table, id, message) {
  const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  if (rows.length === 0) throw notFound(message);
}

async function ensureMember(client, squadId, employeeId, role) {
  await client.query(
    `INSERT INTO squad_members (squad_id, employee_id, role_in_squad) VALUES ($1, $2, $3)
     ON CONFLICT (squad_id, employee_id) DO UPDATE SET role_in_squad = EXCLUDED.role_in_squad`,
    [squadId, employeeId, role]
  );
}

async function create(actor, body, req) {
  return db.withTransaction(async (client) => {
    if (body.projectId) {
      const project = (await client.query('SELECT id, manager_id, department_id FROM projects WHERE id = $1', [body.projectId])).rows[0];
      if (!project) throw notFound('Không tìm thấy dự án');
      if (!(await canManageProject(client, actor, project))) throw forbidden('Bạn không có quyền tạo nhóm cho dự án này');
    }
    const leadId = body.leadId ?? actor.employeeId ?? null;
    if (leadId) await assertExists(client, 'employees', leadId, 'Không tìm thấy trưởng nhóm');

    const id = (await client.query("SELECT 'SQ-' || nextval('seq_squad_id') AS id")).rows[0].id;
    await client.query('INSERT INTO squads (id, name, project_id, lead_id, target) VALUES ($1, $2, $3, $4, $5)',
      [id, body.name, body.projectId ?? null, leadId, body.target ?? null]);
    if (leadId) await ensureMember(client, id, leadId, 'TechLead');
    await writeAudit(client, {
      user: actor, action: 'CREATE_SQUAD', table: 'squads', recordId: id, req,
      newValues: { name: body.name, project_id: body.projectId ?? null, lead_id: leadId },
    });
    return findSquad(client, id);
  });
}

const COLUMNS = { name: 'name', projectId: 'project_id', leadId: 'lead_id', target: 'target' };

async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const before = await findSquad(client, id, { lock: true });
    if (!before) throw notFound('Không tìm thấy nhóm');
    if (!(await canManage(client, actor, before))) throw forbidden('Bạn không có quyền sửa nhóm này');
    if (body.projectId && body.projectId !== before.project_id) {
      // Attaching a squad to a project grants its members access to it, so the actor must manage that project.
      const target = (await client.query('SELECT id, manager_id, department_id FROM projects WHERE id = $1', [body.projectId])).rows[0];
      if (!target) throw notFound('Không tìm thấy dự án');
      if (!(await canManageProject(client, actor, target))) throw forbidden('Bạn không có quyền gắn nhóm vào dự án này');
    }
    if (body.leadId) await assertExists(client, 'employees', body.leadId, 'Không tìm thấy trưởng nhóm');

    const sets = [];
    const params = [id];
    for (const [key, column] of Object.entries(COLUMNS)) {
      if (body[key] !== undefined) {
        params.push(body[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    await client.query(`UPDATE squads SET ${sets.join(', ')} WHERE id = $1`, params);
    if (body.leadId && body.leadId !== before.lead_id) {
      if (before.lead_id) await client.query("UPDATE squad_members SET role_in_squad = 'Member' WHERE squad_id = $1 AND employee_id = $2", [id, before.lead_id]);
      await ensureMember(client, id, body.leadId, 'TechLead');
    }
    await writeAudit(client, {
      user: actor, action: 'UPDATE_SQUAD', table: 'squads', recordId: id, req,
      oldValues: { name: before.name, lead_id: before.lead_id, project_id: before.project_id }, newValues: body,
    });
    return findSquad(client, id);
  });
}

async function remove(actor, id, req) {
  return db.withTransaction(async (client) => {
    const squad = await findSquad(client, id, { lock: true });
    if (!squad) throw notFound('Không tìm thấy nhóm');
    if (!(await canManage(client, actor, squad))) throw forbidden('Bạn không có quyền xóa nhóm này');
    await client.query('DELETE FROM squads WHERE id = $1', [id]);
    await writeAudit(client, { user: actor, action: 'DELETE_SQUAD', table: 'squads', recordId: id, req, oldValues: { name: squad.name } });
  });
}

async function addMember(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const squad = await findSquad(client, id, { lock: true });
    if (!squad) throw notFound('Không tìm thấy nhóm');
    if (!(await canManage(client, actor, squad))) throw forbidden('Bạn không có quyền quản lý thành viên nhóm này');
    await assertExists(client, 'employees', body.employeeId, 'Không tìm thấy nhân viên');
    if (squad.members.some((m) => m.id === body.employeeId)) throw conflict('Nhân viên đã là thành viên của nhóm');
    await client.query('INSERT INTO squad_members (squad_id, employee_id, role_in_squad) VALUES ($1, $2, $3)', [id, body.employeeId, body.role ?? 'Member']);
    await writeAudit(client, { user: actor, action: 'ADD_SQUAD_MEMBER', table: 'squads', recordId: id, req, newValues: { employee_id: body.employeeId } });
    return findSquad(client, id);
  });
}

async function removeMember(actor, id, employeeId, req) {
  return db.withTransaction(async (client) => {
    const squad = await findSquad(client, id, { lock: true });
    if (!squad) throw notFound('Không tìm thấy nhóm');
    if (!(await canManage(client, actor, squad))) throw forbidden('Bạn không có quyền quản lý thành viên nhóm này');
    if (squad.lead_id === employeeId) throw new AppError(409, 'CANNOT_REMOVE_LEAD', 'Không thể xóa trưởng nhóm khỏi nhóm, hãy đổi trưởng nhóm trước');
    const res = await client.query('DELETE FROM squad_members WHERE squad_id = $1 AND employee_id = $2', [id, employeeId]);
    if (res.rowCount === 0) throw notFound('Nhân viên không thuộc nhóm này');
    await writeAudit(client, { user: actor, action: 'REMOVE_SQUAD_MEMBER', table: 'squads', recordId: id, req, oldValues: { employee_id: employeeId } });
    return findSquad(client, id);
  });
}

const MESSAGE_SQL = `
  SELECT m.*, e.full_name AS sender_name, e.avatar_url AS sender_avatar
    FROM squad_messages m LEFT JOIN employees e ON e.id = m.sender_id`;

async function listMessages(user, id, query) {
  const squad = await get(user, id);
  const { limit } = parsePagination({ limit: query.limit }, { defaultLimit: 50, maxLimit: 200 });
  if (query.since) {
    const { rows } = await db.query(`${MESSAGE_SQL} WHERE m.squad_id = $1 AND m.id > $2 ORDER BY m.id ASC LIMIT $3`, [squad.id, query.since, limit]);
    return rows;
  }
  const { rows } = await db.query(`SELECT * FROM (${MESSAGE_SQL} WHERE m.squad_id = $1 ORDER BY m.id DESC LIMIT $2) recent ORDER BY id ASC`, [squad.id, limit]);
  return rows;
}

async function postMessage(user, id, body) {
  const squad = await findSquad(db, id);
  if (!squad) throw notFound('Không tìm thấy nhóm');
  if (!isMember(squad, user)) throw forbidden('Chỉ thành viên của nhóm mới được nhắn tin');
  const { rows } = await db.query('INSERT INTO squad_messages (squad_id, sender_id, content) VALUES ($1, $2, $3) RETURNING id', [id, user.employeeId, body.content]);
  return (await db.query(`${MESSAGE_SQL} WHERE m.id = $1`, [rows[0].id])).rows[0];
}

async function clearMessages(user, id) {
  const squad = await findSquad(db, id);
  if (!squad) throw notFound('Không tìm thấy nhóm');
  if (!isMember(squad, user) && !(await canManage(db, user, squad))) {
    throw forbidden('Bạn không có quyền xóa lịch sử tin nhắn của nhóm này');
  }
  await db.query('DELETE FROM squad_messages WHERE squad_id = $1', [id]);
  return { success: true, squadId: id, message: 'Đã xóa toàn bộ lịch sử tin nhắn' };
}

async function leaveSquad(user, id) {
  const squad = await findSquad(db, id);
  if (!squad) throw notFound('Không tìm thấy nhóm');
  if (squad.lead_id === user.employeeId) {
    throw new AppError(400, 'LEAD_CANNOT_LEAVE', 'Trưởng nhóm không thể rời nhóm. Vui lòng chuyển giao vai trò trưởng nhóm trước.');
  }
  await db.query('DELETE FROM squad_members WHERE squad_id = $1 AND employee_id = $2', [id, user.employeeId]);
  
  if (user.employeeId) {
    try {
      await db.query(
        'INSERT INTO squad_messages (squad_id, sender_id, content, is_system_notice) VALUES ($1, $2, $3, true)',
        [id, user.employeeId, `${user.name || 'Thành viên'} đã rời khỏi nhóm trò chuyện`]
      );
    } catch {}
  }
  return { success: true, squadId: id, left: true };
}

async function rejoinSquad(user, id) {
  const squad = await findSquad(db, id);
  if (!squad) throw notFound('Không tìm thấy nhóm');
  if (!user.employeeId) throw forbidden('Tài khoản không có thông tin nhân viên');
  await db.query(
    'INSERT INTO squad_members (squad_id, employee_id, role_in_squad) VALUES ($1, $2, $3) ON CONFLICT (squad_id, employee_id) DO NOTHING',
    [id, user.employeeId, 'Member']
  );
  try {
    await db.query(
      'INSERT INTO squad_messages (squad_id, sender_id, content, is_system_notice) VALUES ($1, $2, $3, true)',
      [id, user.employeeId, `${user.name || 'Thành viên'} đã tham gia lại nhóm trò chuyện`]
    );
  } catch {}
  return { success: true, squadId: id, left: false };
}

module.exports = { list, get, create, update, remove, addMember, removeMember, listMessages, postMessage, clearMessages, leaveSquad, rejoinSquad };

