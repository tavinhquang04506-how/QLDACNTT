const db = require('../../config/db');
const { AppError, forbidden, notFound, badRequest } = require('../../utils/AppError');
const { writeAudit, setAuditActor } = require('../../utils/audit');
const { HR_ROLES, departmentOf, canSeeProject } = require('../projects/access');

const TASK_SQL = `
  SELECT t.*, a.full_name AS assignee_name, a.avatar_url AS assignee_avatar, a.job_title AS assignee_role,
         c.full_name AS creator_name, p.manager_id AS project_manager_id, p.department_id AS project_department_id
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN employees a ON t.assignee_id = a.id
    LEFT JOIN employees c ON t.creator_id = c.id`;

// from>to -> which right is needed
const TRANSITIONS = {
  'todo>in_progress': 'work',
  'in_progress>todo': 'work',
  'in_progress>review': 'work',
  'review>done': 'review',
  'review>in_progress': 'review',
  'done>in_progress': 'reopen',
  'done>todo': 'reopen',
};

async function findTask(executor, id, { lock = false } = {}) {
  const { rows } = await executor.query(`${TASK_SQL} WHERE t.id = $1 ${lock ? 'FOR UPDATE OF t' : ''}`, [id]);
  return rows[0] || null;
}

/** What the user may do with this task, derived from their role and relationship to it. */
async function rightsOn(executor, user, task) {
  const employeeId = user.employeeId;
  const privileged = HR_ROLES.includes(user.roleCode);
  const isManager = Boolean(employeeId) && task.project_manager_id === employeeId;
  const isDeptManager =
    user.roleCode === 'LINE_MANAGER' &&
    Boolean(task.project_department_id) &&
    (await departmentOf(executor, employeeId)) === task.project_department_id;
  const managerSide = privileged || isManager || isDeptManager;
  return {
    managerSide,
    isAssignee: Boolean(employeeId) && task.assignee_id === employeeId,
    isCreator: Boolean(employeeId) && task.creator_id === employeeId,
  };
}

async function recalcProjectProgress(client, projectId) {
  await client.query(
    `UPDATE projects SET progress = COALESCE((SELECT ROUND(AVG(progress))::int FROM tasks WHERE project_id = $1), 0), updated_at = NOW()
      WHERE id = $1`,
    [projectId]
  );
}

async function assertEmployee(client, id) {
  const { rows } = await client.query('SELECT 1 FROM employees WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound('Không tìm thấy nhân viên được giao');
}

async function requireVisible(executor, user, projectId) {
  if (!(await canSeeProject(executor, user, projectId))) throw forbidden('Bạn không tham gia dự án này');
}

async function listForProject(user, projectId) {
  const project = await db.query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
  if (project.rows.length === 0) throw notFound('Không tìm thấy dự án');
  await requireVisible(db, user, projectId);
  const { rows } = await db.query(
    `${TASK_SQL} WHERE t.project_id = $1
      ORDER BY CASE t.priority WHEN 'Khẩn cấp' THEN 1 WHEN 'Cao' THEN 2 WHEN 'Trung bình' THEN 3 ELSE 4 END, t.deadline NULLS LAST, t.id`,
    [projectId]
  );
  return rows;
}

async function get(user, id) {
  const task = await findTask(db, id);
  if (!task) throw notFound('Không tìm thấy nhiệm vụ');
  await requireVisible(db, user, task.project_id);
  return task;
}

async function create(actor, projectId, body, req) {
  return db.withTransaction(async (client) => {
    const project = (await client.query('SELECT id, manager_id, department_id FROM projects WHERE id = $1', [projectId])).rows[0];
    if (!project) throw notFound('Không tìm thấy dự án');
    await requireVisible(client, actor, projectId);

    const probe = { project_manager_id: project.manager_id, project_department_id: project.department_id };
    const { managerSide } = await rightsOn(client, actor, probe);
    const assigneeId = body.assigneeId ?? actor.employeeId ?? null;
    if (assigneeId && assigneeId !== actor.employeeId && !managerSide) {
      throw forbidden('Chỉ quản lý dự án mới được giao việc cho người khác');
    }
    if (assigneeId) await assertEmployee(client, assigneeId);

    const id = (await client.query("SELECT 'TSK-' || nextval('seq_task_id') AS id")).rows[0].id;
    await client.query(
      `INSERT INTO tasks (id, project_id, title, description, assignee_id, creator_id, deadline, priority, kpi_weight, estimated_hours, stage, progress)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::task_priority_enum, 'Trung bình'),COALESCE($9, 20),COALESCE($10, 8),$11::task_stage_enum,0)`,
      [id, projectId, body.title, body.description ?? null, assigneeId, actor.employeeId ?? null, body.deadline ?? null,
        body.priority ?? null, body.kpiWeight ?? null, body.estimatedHours ?? null, body.stage ?? 'todo']
    );
    await recalcProjectProgress(client, projectId);
    await writeAudit(client, {
      user: actor, action: 'CREATE_TASK', table: 'tasks', recordId: id, req,
      newValues: { project_id: projectId, title: body.title, assignee_id: assigneeId },
    });
    return findTask(client, id);
  });
}

const ASSIGNEE_FIELDS = new Set(['progress', 'deliverableUrl', 'deliverableNote']);
const COLUMNS = {
  title: 'title', description: 'description', assigneeId: 'assignee_id', deadline: 'deadline', priority: 'priority',
  kpiWeight: 'kpi_weight', estimatedHours: 'estimated_hours', progress: 'progress',
  deliverableUrl: 'deliverable_url', deliverableNote: 'deliverable_note',
};

async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const task = await findTask(client, id, { lock: true });
    if (!task) throw notFound('Không tìm thấy nhiệm vụ');
    await requireVisible(client, actor, task.project_id);

    const rights = await rightsOn(client, actor, task);
    const keys = Object.keys(body).filter((k) => body[k] !== undefined);
    const fullEdit = rights.managerSide || rights.isCreator;
    const workingEdit = rights.isAssignee && keys.every((k) => ASSIGNEE_FIELDS.has(k));
    if (!fullEdit && !workingEdit) throw forbidden('Bạn không có quyền sửa nhiệm vụ này');
    if (body.assigneeId && body.assigneeId !== task.assignee_id) {
      if (!rights.managerSide) throw forbidden('Chỉ quản lý dự án mới được giao việc cho người khác');
      await assertEmployee(client, body.assigneeId);
    }

    const sets = [];
    const params = [id];
    for (const [key, column] of Object.entries(COLUMNS)) {
      if (body[key] !== undefined) {
        params.push(body[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    await client.query(`UPDATE tasks SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
    if (body.progress !== undefined) await recalcProjectProgress(client, task.project_id);
    await writeAudit(client, {
      user: actor, action: 'UPDATE_TASK', table: 'tasks', recordId: id, req,
      oldValues: { title: task.title, assignee_id: task.assignee_id, progress: task.progress }, newValues: body,
    });
    return findTask(client, id);
  });
}

/** The one place a task changes stage; enforces the workflow and records the review outcome. */
async function moveTask(actor, id, toStage, note, req) {
  return db.withTransaction(async (client) => {
    await setAuditActor(client, actor);
    const task = await findTask(client, id, { lock: true });
    if (!task) throw notFound('Không tìm thấy nhiệm vụ');
    await requireVisible(client, actor, task.project_id);

    const kind = TRANSITIONS[`${task.stage}>${toStage}`];
    if (!kind) throw new AppError(409, 'INVALID_TRANSITION', `Không thể chuyển nhiệm vụ từ "${task.stage}" sang "${toStage}"`);

    const rights = await rightsOn(client, actor, task);
    if (kind === 'work' && !(rights.isAssignee || rights.managerSide)) throw forbidden('Chỉ người được giao hoặc quản lý dự án mới chuyển được nhiệm vụ');
    if (kind === 'reopen' && !rights.managerSide) throw forbidden('Chỉ quản lý dự án, HR hoặc CEO mới mở lại nhiệm vụ đã hoàn thành');
    if (kind === 'review') {
      if (!(rights.managerSide || rights.isCreator)) throw forbidden('Bạn không có quyền nghiệm thu nhiệm vụ này');
      if (rights.isAssignee) throw new AppError(403, 'SELF_REVIEW', 'Bạn không thể nghiệm thu sản phẩm của chính mình');
      if (toStage === 'in_progress' && !note) throw badRequest('Vui lòng nhập lý do trả lại nhiệm vụ');
    }

    const sets = ['stage = $2', 'updated_at = NOW()'];
    const params = [id, toStage];
    if (toStage === 'done') {
      params.push(actor.employeeId ?? null, note ?? null);
      sets.push('progress = 100', `reviewed_by = $${params.length - 1}`, 'reviewed_at = NOW()', `review_note = COALESCE($${params.length}, review_note)`);
    } else if (kind === 'review') {
      params.push(actor.employeeId ?? null, note);
      sets.push(`reviewed_by = $${params.length - 1}`, 'reviewed_at = NOW()', `review_note = $${params.length}`);
    } else if (toStage === 'review') {
      sets.push('reviewed_by = NULL', 'reviewed_at = NULL');
    }
    if (task.stage === 'done') sets.push(toStage === 'todo' ? 'progress = 0' : 'progress = LEAST(progress, 90)', 'reviewed_by = NULL', 'reviewed_at = NULL');
    await client.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $1`, params);

    if (kind === 'review') {
      await client.query(
        `INSERT INTO task_logs (task_id, actor_id, action, from_stage, to_stage, note) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, actor.employeeId ?? null, toStage === 'done' ? 'REVIEW_ACCEPTED' : 'REVIEW_REJECTED', task.stage, toStage, note ?? null]
      );
    }
    await recalcProjectProgress(client, task.project_id);
    await writeAudit(client, {
      user: actor, action: 'MOVE_TASK', table: 'tasks', recordId: id, req,
      oldValues: { stage: task.stage }, newValues: { stage: toStage, note: note ?? null },
    });
    return findTask(client, id);
  });
}

async function review(actor, id, body, req) {
  const task = await db.query('SELECT stage FROM tasks WHERE id = $1', [id]);
  if (task.rows.length === 0) throw notFound('Không tìm thấy nhiệm vụ');
  if (task.rows[0].stage !== 'review') throw new AppError(409, 'INVALID_TRANSITION', 'Nhiệm vụ không ở trạng thái chờ nghiệm thu');
  return moveTask(actor, id, body.decision === 'accept' ? 'done' : 'in_progress', body.note, req);
}

async function remove(actor, id, req) {
  return db.withTransaction(async (client) => {
    const task = await findTask(client, id, { lock: true });
    if (!task) throw notFound('Không tìm thấy nhiệm vụ');
    await requireVisible(client, actor, task.project_id);
    const rights = await rightsOn(client, actor, task);
    if (!(rights.managerSide || rights.isCreator)) throw forbidden('Bạn không có quyền xóa nhiệm vụ này');

    await client.query('DELETE FROM tasks WHERE id = $1', [id]);
    await recalcProjectProgress(client, task.project_id);
    await writeAudit(client, {
      user: actor, action: 'DELETE_TASK', table: 'tasks', recordId: id, req, oldValues: { title: task.title, project_id: task.project_id },
    });
  });
}

async function logs(user, id) {
  const task = await findTask(db, id);
  if (!task) throw notFound('Không tìm thấy nhiệm vụ');
  await requireVisible(db, user, task.project_id);
  const { rows } = await db.query(
    `SELECT l.*, a.full_name AS actor_name FROM task_logs l LEFT JOIN employees a ON a.id = l.actor_id WHERE l.task_id = $1 ORDER BY l.id`, [id]);
  return rows;
}

module.exports = { listForProject, get, create, update, moveTask, review, remove, logs };
