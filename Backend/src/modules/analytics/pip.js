const db = require('../../config/db');
const { AppError, badRequest, forbidden, notFound, conflict } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { scopeCondition } = require('../../utils/scope');
const { departmentOf } = require('../projects/access');
const { notify } = require('../notifications/notify');

/**
 * PIP lifecycle:
 *   proposed (line manager) --approve--> active --close--> completed | failed | cancelled
 *            \--reject--> rejected
 * HR/CEO may also create a plan that is active straight away. An employee has at most one open plan
 * (proposed or active), enforced by the uq_pip_one_open index.
 */
const OPEN_STATUSES = ['proposed', 'active'];
const CLOSED_STATUSES = ['completed', 'failed', 'cancelled', 'rejected'];

const SELECT = `SELECT p.*, e.full_name, e.department_id, e.job_title, e.avatar_url, d.name AS department_name,
                       c.full_name AS created_by_name, a.full_name AS approved_by_name
                  FROM pip_plans p
                  JOIN employees e ON e.id = p.employee_id
                  LEFT JOIN departments d ON d.id = e.department_id
                  LEFT JOIN employees c ON c.id = p.created_by
                  LEFT JOIN employees a ON a.id = p.approved_by`;

const STATUS_ORDER = `CASE p.status WHEN 'proposed' THEN 0 WHEN 'active' THEN 1 ELSE 2 END`;

async function findPip(executor, id, { lock = false } = {}) {
  const { rows } = await executor.query(`${SELECT} WHERE p.id = $1 ${lock ? 'FOR UPDATE OF p' : ''}`, [id]);
  return rows[0] || null;
}

const today = async (executor) => (await executor.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d`)).rows[0].d;

const actorInfo = async (executor, employeeId) => {
  if (!employeeId) return {};
  const { rows } = await executor.query('SELECT full_name, avatar_url FROM employees WHERE id = $1', [employeeId]);
  return rows[0] ?? {};
};

const userOfEmployee = async (executor, employeeId) => {
  if (!employeeId) return null;
  const { rows } = await executor.query('SELECT id FROM users WHERE employee_id = $1 AND is_active LIMIT 1', [employeeId]);
  return rows[0]?.id ?? null;
};

const departmentManagerUser = async (executor, departmentId) => {
  if (!departmentId) return null;
  const { rows } = await executor.query(
    'SELECT u.id, d.manager_id FROM departments d JOIN users u ON u.employee_id = d.manager_id AND u.is_active WHERE d.id = $1 LIMIT 1',
    [departmentId]
  );
  return rows[0] ?? null;
};

const ROLE_LABEL = { CEO: 'CEO', HR_DIRECTOR: 'HR', LINE_MANAGER: 'Trưởng phòng' };

/** A line manager may only act on plans of employees in their own department, and never on their own plan. */
async function assertDepartmentAccess(executor, actor, scope, plan) {
  if (plan.employee_id === actor.employeeId) throw forbidden('Bạn không thể thao tác trên kế hoạch PIP của chính mình');
  if (scope === 'all') return;
  const dept = await departmentOf(executor, actor.employeeId);
  if (!dept || dept !== plan.department_id) throw forbidden('Bạn chỉ được thao tác PIP của nhân sự thuộc phòng ban mình');
}

async function list(user, query, scope) {
  const { page, limit, offset } = parsePagination(query, { defaultLimit: 50, maxLimit: 200 });
  const params = [];
  const where = [];
  const cond = await scopeCondition(db, user, scope, { employee: 'p.employee_id', department: 'e.department_id' }, params);
  if (cond) where.push(cond);
  if (query.employeeId) { params.push(query.employeeId); where.push(`p.employee_id = $${params.length}`); }
  if (query.status) { params.push(query.status); where.push(`p.status = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT COUNT(*)::int AS n FROM pip_plans p JOIN employees e ON e.id = p.employee_id ${clause}`, params)).rows[0].n;
  const { rows } = await db.query(
    `${SELECT} ${clause} ORDER BY ${STATUS_ORDER}, p.created_at DESC, p.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: rows, pagination: paginationMeta(total, page, limit) };
}

async function get(user, id, scope) {
  const row = await findPip(db, id);
  if (!row) throw notFound('Không tìm thấy kế hoạch PIP');
  let allowed = scope === 'all' || row.employee_id === user.employeeId;
  if (!allowed && scope === 'department') {
    const dept = await departmentOf(db, user.employeeId);
    allowed = Boolean(dept) && dept === row.department_id;
  }
  if (!allowed) throw forbidden('Bạn không có quyền xem kế hoạch này');
  return row;
}

const normalizeGoals = (goals) => goals.map((g) => ({ ...g, status: g.status ?? 'pending' }));

/** HR/CEO (scope "all") activate the plan directly; a line manager (scope "department") submits a proposal for HR. */
async function create(actor, body, req, scope = 'all') {
  return db.withTransaction(async (client) => {
    const emp = (await client.query('SELECT id, full_name, status, department_id FROM employees WHERE id = $1', [body.employeeId])).rows[0];
    if (!emp) throw notFound('Không tìm thấy nhân viên');
    if (emp.status === 'DA_NGHI_VIEC') throw conflict('Nhân viên đã nghỉ việc');
    await assertDepartmentAccess(client, actor, scope, { employee_id: emp.id, department_id: emp.department_id });

    const open = await client.query('SELECT id, status FROM pip_plans WHERE employee_id = $1 AND status = ANY($2)', [body.employeeId, OPEN_STATUSES]);
    if (open.rows.length > 0) {
      const o = open.rows[0];
      throw new AppError(409, 'PIP_ALREADY_ACTIVE', o.status === 'proposed'
        ? `Nhân viên đang có đề xuất ${o.id} chờ HR phê duyệt`
        : `Nhân viên đang có kế hoạch ${o.id}`);
    }

    const direct = scope === 'all';
    const status = direct ? 'active' : 'proposed';
    const goals = normalizeGoals(body.goals);
    const { rows } = await client.query(
      `INSERT INTO pip_plans (employee_id, created_by, start_date, end_date, goals, reason, status, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, ${direct ? 'NOW()' : 'NULL'}) RETURNING id`,
      [body.employeeId, actor.employeeId ?? null, body.startDate, body.endDate, JSON.stringify(goals), body.reason, status, direct ? actor.employeeId ?? null : null]
    );
    const id = rows[0].id;
    await writeAudit(client, {
      user: actor, action: 'CREATE_PIP', table: 'pip_plans', recordId: id, req,
      newValues: { employee_id: body.employeeId, status, start_date: body.startDate, end_date: body.endDate, goals: goals.length },
    });

    const who = await actorInfo(client, actor.employeeId);
    const sender = { name: who.full_name, role: ROLE_LABEL[actor.roleCode] ?? actor.roleCode, avatar: who.avatar_url };
    if (!direct) {
      await notify(client, {
        roleTarget: 'HR_DIRECTOR', type: 'approval', category: 'Hiệu suất', priority: 'high', sender,
        title: `Đề xuất PIP chờ phê duyệt: ${id}`,
        summary: `${who.full_name ?? 'Trưởng phòng'} đề xuất kế hoạch cải thiện hiệu suất cho ${emp.full_name} (${body.startDate} → ${body.endDate}).`,
        actionType: 'pip_popup', actionPayload: { id },
      });
    } else {
      const manager = await departmentManagerUser(client, emp.department_id);
      if (manager && manager.manager_id !== actor.employeeId && manager.manager_id !== emp.id) {
        await notify(client, {
          userId: manager.id, type: 'system', category: 'Hiệu suất', sender,
          title: `PIP đã kích hoạt: ${id}`,
          summary: `Nhân sự ${emp.full_name} bắt đầu kế hoạch cải thiện hiệu suất (${body.startDate} → ${body.endDate}). Vui lòng theo dõi và cập nhật tiến độ mục tiêu.`,
          actionType: 'pip_popup', actionPayload: { id },
        });
      }
    }
    return findPip(client, id);
  });
}

/** HR/CEO approve (optionally adjusting the dates) or reject a line manager's proposal. */
async function decide(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const before = await findPip(client, id, { lock: true });
    if (!before) throw notFound('Không tìm thấy kế hoạch PIP');
    if (before.status !== 'proposed') throw conflict('Chỉ đề xuất đang chờ duyệt mới có thể phê duyệt hoặc từ chối');
    if (before.employee_id === actor.employeeId) throw forbidden('Bạn không thể tự phê duyệt kế hoạch PIP của chính mình');

    const approve = body.decision === 'approve';
    if (approve) {
      const start = body.startDate ?? before.start_date;
      const end = body.endDate ?? before.end_date;
      if (end < start) throw badRequest('Ngày kết thúc không được trước ngày bắt đầu');
      await client.query(
        `UPDATE pip_plans SET status = 'active', start_date = $2, end_date = $3, approved_by = $4, approved_at = NOW() WHERE id = $1`,
        [id, start, end, actor.employeeId ?? null]
      );
    } else {
      await client.query(
        `UPDATE pip_plans SET status = 'rejected', outcome = $2, approved_by = $3, approved_at = NOW(), closed_at = NOW() WHERE id = $1`,
        [id, body.note, actor.employeeId ?? null]
      );
    }
    await writeAudit(client, {
      user: actor, action: approve ? 'APPROVE_PIP' : 'REJECT_PIP', table: 'pip_plans', recordId: id, req,
      oldValues: { status: before.status }, newValues: { status: approve ? 'active' : 'rejected', note: body.note ?? null },
    });

    const proposerUser = await userOfEmployee(client, before.created_by);
    if (proposerUser && before.created_by !== actor.employeeId) {
      const who = await actorInfo(client, actor.employeeId);
      await notify(client, {
        userId: proposerUser, type: 'approval', category: 'Hiệu suất', priority: approve ? 'normal' : 'high',
        sender: { name: who.full_name, role: ROLE_LABEL[actor.roleCode] ?? actor.roleCode, avatar: who.avatar_url },
        title: approve ? `Đề xuất PIP đã được phê duyệt: ${id}` : `Đề xuất PIP bị từ chối: ${id}`,
        summary: approve
          ? `Kế hoạch cho ${before.full_name} đã kích hoạt. ${body.note ? `Ghi chú HR: ${body.note}` : 'Vui lòng tổ chức buổi trao đổi và ký cam kết với nhân sự.'}`
          : `Lý do: ${body.note}`,
        actionType: 'pip_popup', actionPayload: { id },
      });
    }
    return findPip(client, id);
  });
}

/** Record the evaluation of each goal of an active plan (manager of the department or HR/CEO). */
async function progress(actor, id, body, req, scope = 'all') {
  return db.withTransaction(async (client) => {
    const before = await findPip(client, id, { lock: true });
    if (!before) throw notFound('Không tìm thấy kế hoạch PIP');
    await assertDepartmentAccess(client, actor, scope, before);
    if (before.status !== 'active') throw conflict('Chỉ kế hoạch đang thực hiện mới được cập nhật tiến độ');
    const current = Array.isArray(before.goals) ? before.goals : [];
    if (body.goals.length !== current.length) throw badRequest(`Kế hoạch có ${current.length} mục tiêu, dữ liệu gửi lên có ${body.goals.length}`);

    const date = await today(client);
    const goals = current.map((g, i) => {
      const next = body.goals[i];
      const note = next.note ?? g.note;
      const changed = next.status !== (g.status ?? 'pending') || (next.note !== undefined && next.note !== g.note);
      const merged = { ...g, status: next.status };
      if (note) merged.note = note; else delete merged.note;
      if (changed) merged.checkedAt = date;
      return merged;
    });

    await client.query('UPDATE pip_plans SET goals = $2::jsonb WHERE id = $1', [id, JSON.stringify(goals)]);
    const count = (s) => goals.filter((g) => g.status === s).length;
    await writeAudit(client, {
      user: actor, action: 'UPDATE_PIP_PROGRESS', table: 'pip_plans', recordId: id, req,
      newValues: { achieved: count('achieved'), missed: count('missed'), pending: count('pending') },
    });
    return findPip(client, id);
  });
}

/** HR/CEO edit an open plan (dates, goals, reason) or close an active one with an outcome. */
async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const before = await findPip(client, id, { lock: true });
    if (!before) throw notFound('Không tìm thấy kế hoạch PIP');
    if (CLOSED_STATUSES.includes(before.status)) throw conflict('Kế hoạch đã kết thúc, không thể chỉnh sửa');
    if (before.status === 'proposed' && body.status) throw conflict('Đề xuất đang chờ duyệt — hãy phê duyệt hoặc từ chối trước');

    const start = body.startDate ?? before.start_date;
    const end = body.endDate ?? before.end_date;
    if (end < start) throw badRequest('Ngày kết thúc không được trước ngày bắt đầu');
    const closing = Boolean(body.status && body.status !== 'active');
    if (closing && !body.outcome) throw badRequest('Vui lòng nhập kết quả khi kết thúc kế hoạch');

    await client.query(
      `UPDATE pip_plans SET start_date = $2, end_date = $3, goals = COALESCE($4::jsonb, goals), status = COALESCE($5, status),
              outcome = COALESCE($6, outcome), reason = COALESCE($7, reason), closed_at = CASE WHEN $8::boolean THEN NOW() ELSE closed_at END
        WHERE id = $1`,
      [id, start, end, body.goals ? JSON.stringify(normalizeGoals(body.goals)) : null, body.status ?? null, body.outcome ?? null, body.reason ?? null, closing]
    );
    await writeAudit(client, {
      user: actor, action: 'UPDATE_PIP', table: 'pip_plans', recordId: id, req,
      oldValues: { status: before.status, end_date: before.end_date }, newValues: { status: body.status ?? before.status, end_date: end },
    });

    if (closing) {
      const manager = await departmentManagerUser(client, before.department_id);
      if (manager && manager.manager_id !== actor.employeeId && manager.manager_id !== before.employee_id) {
        const who = await actorInfo(client, actor.employeeId);
        const label = { completed: 'Đạt yêu cầu', failed: 'Không đạt', cancelled: 'Đã hủy' }[body.status];
        await notify(client, {
          userId: manager.id, type: 'system', category: 'Hiệu suất',
          sender: { name: who.full_name, role: ROLE_LABEL[actor.roleCode] ?? actor.roleCode, avatar: who.avatar_url },
          title: `PIP đã nghiệm thu: ${id} — ${label}`, summary: `${before.full_name}: ${body.outcome}`,
          actionType: 'pip_popup', actionPayload: { id },
        });
      }
    }
    return findPip(client, id);
  });
}

module.exports = { list, get, create, decide, progress, update, OPEN_STATUSES, CLOSED_STATUSES };
