const db = require('../../config/db');
const { AppError, badRequest, forbidden, notFound, conflict } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { scopeCondition } = require('../../utils/scope');
const { initialStage, decide, workingDays } = require('../approvals/chain');
const workflow = require('../approvals/workflow');
const { notifySubmitted, notifyDecided } = require('../approvals/notify');

const ACTIVE_STAGES = ['CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN', 'DA_PHE_DUYET'];

const DETAIL_SQL = `
  SELECT lr.*, e.full_name, e.avatar_url, e.job_title, e.department_id, d.name AS department_name,
         lt.name AS leave_type_name, lt.code AS leave_type_code,
         ma.full_name AS manager_approver_name, ha.full_name AS hr_approver_name
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    LEFT JOIN employees ma ON lr.manager_approved_by = ma.id
    LEFT JOIN employees ha ON lr.hr_approved_by = ha.id`;

const requireEmployee = (user) => {
  if (!user.employeeId) throw forbidden('Tài khoản chưa được liên kết với hồ sơ nhân viên');
  return user.employeeId;
};

async function findDetail(executor, id) {
  const { rows } = await executor.query(`${DETAIL_SQL} WHERE lr.id = $1`, [id]);
  return rows[0] || null;
}

async function canSeeEmployee(executor, user, scope, employeeId, departmentId) {
  if (scope === 'all' || employeeId === user.employeeId) return true;
  if (scope !== 'department') return false;
  const mine = await workflow.departmentOf(executor, user.employeeId);
  return Boolean(mine) && mine === departmentId;
}

async function create(user, body, req) {
  const employeeId = requireEmployee(user);
  return db.withTransaction(async (client) => {
    const type = await client.query('SELECT id, is_active FROM leave_types WHERE id = $1', [body.leaveTypeId]);
    if (type.rows.length === 0) throw notFound('Không tìm thấy loại phép');
    if (!type.rows[0].is_active) throw badRequest('Loại phép này hiện không được sử dụng');

    const span = Math.round((Date.parse(`${body.endDate}T00:00:00Z`) - Date.parse(`${body.startDate}T00:00:00Z`)) / 86400000) + 1;
    const totalDays = body.totalDays ?? workingDays(body.startDate, body.endDate);
    if (totalDays <= 0) throw badRequest('Khoảng thời gian nghỉ không có ngày làm việc nào');
    if (totalDays > span) throw badRequest(`Số ngày nghỉ (${totalDays}) vượt quá khoảng thời gian đã chọn (${span} ngày)`);

    // Serialize this employee's submissions so the overlap and balance checks cannot race.
    await client.query('SELECT 1 FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);

    const overlap = await client.query(
      `SELECT id FROM leave_requests
        WHERE employee_id = $1 AND stage = ANY($2) AND start_date <= $4::date AND end_date >= $3::date`,
      [employeeId, ACTIVE_STAGES, body.startDate, body.endDate]
    );
    if (overlap.rows.length > 0) {
      throw new AppError(409, 'LEAVE_OVERLAP', `Trùng với đơn nghỉ ${overlap.rows[0].id} đã nộp`);
    }

    const bal = await client.query(
      `SELECT remaining_days FROM leave_balances
        WHERE employee_id = $1 AND leave_type_id = $2 AND year = EXTRACT(YEAR FROM $3::date)::int`,
      [employeeId, body.leaveTypeId, body.startDate]
    );
    if (bal.rows[0]) {
      const pending = await client.query(
        `SELECT COALESCE(SUM(total_days), 0) AS n FROM leave_requests
          WHERE employee_id = $1 AND leave_type_id = $2 AND stage IN ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN')
            AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM $3::date)`,
        [employeeId, body.leaveTypeId, body.startDate]
      );
      const available = Number(bal.rows[0].remaining_days) - Number(pending.rows[0].n);
      if (available < totalDays) {
        throw new AppError(409, 'INSUFFICIENT_BALANCE', `Không đủ ngày phép. Còn lại: ${available} ngày (đã trừ các đơn đang chờ duyệt)`);
      }
    }

    const { stage, autoApprove } = initialStage(user.roleCode);
    const id = (await client.query(
      "SELECT 'LP-' || EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' || LPAD(nextval('seq_leave_id')::TEXT, 3, '0') AS id")).rows[0].id;
    await client.query(
      `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason,
          handover_to, attachment_url, attachment_name, stage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, employeeId, body.leaveTypeId, body.startDate, body.endDate, totalDays, body.reason,
        body.handoverTo ?? null, body.attachmentUrl ?? null, body.attachmentName ?? null, stage]
    );
    if (autoApprove) {
      // Updating (not inserting) as approved lets the balance trigger charge the days.
      await client.query(
        `UPDATE leave_requests SET stage = 'DA_PHE_DUYET', hr_approved_by = $2, hr_approved_at = NOW(),
                hr_note = 'Tự phê duyệt (Tổng Giám Đốc)' WHERE id = $1`, [id, employeeId]);
    }
    await writeAudit(client, {
      user, action: 'CREATE_LEAVE', table: 'leave_requests', recordId: id, req,
      newValues: { employee_id: employeeId, leave_type_id: body.leaveTypeId, start_date: body.startDate, end_date: body.endDate, total_days: totalDays, stage: autoApprove ? 'DA_PHE_DUYET' : stage },
    });
    const created = await findDetail(client, id);
    await notifySubmitted(client, 'leave_requests', created,
      `${created.full_name} xin nghỉ ${totalDays} ngày (${body.startDate} → ${body.endDate}): ${body.reason}`);
    return { row: created, autoApproved: autoApprove };
  });
}

async function list(user, query, scope) {
  const { page, limit, offset } = parsePagination(query);
  const params = [];
  const where = [];
  const cond = await scopeCondition(db, user, scope, { employee: 'lr.employee_id', department: 'e.department_id' }, params);
  if (cond) where.push(cond);
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (query.stage) add('lr.stage = ?', query.stage);
  if (query.employeeId) add('lr.employee_id = ?', query.employeeId);
  if (query.month) {
    params.push(`${query.month}-01`);
    where.push(`lr.start_date >= $${params.length}::date AND lr.start_date < ($${params.length}::date + INTERVAL '1 month')`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = parseInt((await db.query(
    `SELECT COUNT(*) FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id ${clause}`, params)).rows[0].count, 10);
  const { rows } = await db.query(
    `${DETAIL_SQL} ${clause} ORDER BY lr.submitted_at DESC, lr.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: rows, pagination: paginationMeta(total, page, limit) };
}

async function get(user, id, scope) {
  const row = await findDetail(db, id);
  if (!row) throw notFound('Không tìm thấy đơn phép');
  if (!(await canSeeEmployee(db, user, scope, row.employee_id, row.department_id))) {
    throw forbidden('Bạn không có quyền xem đơn phép này');
  }
  return row;
}

async function calendar(user, query, scope) {
  const params = [`${query.month}-01`];
  const where = [
    "lr.stage IN ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN', 'DA_PHE_DUYET')",
    "lr.start_date < ($1::date + INTERVAL '1 month')",
    'lr.end_date >= $1::date',
  ];
  const cond = await scopeCondition(db, user, scope, { employee: 'lr.employee_id', department: 'e.department_id' }, params);
  if (cond) where.push(cond);
  if (query.department) {
    params.push(query.department);
    where.push(`e.department_id = $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT lr.id, lr.employee_id, e.full_name, e.department_id, lr.start_date, lr.end_date, lr.total_days, lr.stage,
            lt.code AS leave_type_code, lt.name AS leave_type_name
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE ${where.join(' AND ')}
      ORDER BY lr.start_date, e.full_name`,
    params
  );
  return rows;
}

async function balances(user, employeeParam, scope) {
  const employeeId = employeeParam === 'me' ? requireEmployee(user) : employeeParam;
  const emp = await db.query('SELECT department_id FROM employees WHERE id = $1', [employeeId]);
  if (emp.rows.length === 0) throw notFound('Không tìm thấy nhân viên');
  if (!(await canSeeEmployee(db, user, scope, employeeId, emp.rows[0].department_id))) {
    throw forbidden('Không có quyền xem phép của người khác');
  }
  const { rows } = await db.query(
    `SELECT lb.*, lt.name AS leave_type_name, lt.code AS leave_type_code, lt.is_paid
       FROM leave_balances lb JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)
      ORDER BY lt.name`,
    [employeeId]
  );
  return rows;
}

async function types() {
  return (await db.query('SELECT * FROM leave_types ORDER BY name')).rows;
}

/** Approve or reject: the chain decides whether this actor may act on this request at its current stage. */
async function decideOn(actor, id, action, note, req) {
  return db.withTransaction(async (client) => {
    const found = await client.query('SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE', [id]);
    const leave = found.rows[0];
    if (!leave) throw notFound('Không tìm thấy đơn phép');

    const verdict = decide({
      stage: leave.stage,
      requesterId: leave.employee_id,
      ...(await workflow.requesterContext(client, leave.employee_id)),
      actorRole: actor.roleCode,
      actorId: actor.employeeId,
      actorDepartmentId: await workflow.departmentOf(client, actor.employeeId),
    });
    if (!verdict.ok) throw workflow.denial(verdict.reason);

    if (action === 'reject') {
      await workflow.applyRejection(client, 'leave_requests', leave, note);
    } else {
      if (verdict.next === 'DA_PHE_DUYET') {
        const bal = await client.query(
          `SELECT remaining_days FROM leave_balances
            WHERE employee_id = $1 AND leave_type_id = $2 AND year = EXTRACT(YEAR FROM $3::date)::int FOR UPDATE`,
          [leave.employee_id, leave.leave_type_id, leave.start_date]
        );
        if (bal.rows[0] && Number(bal.rows[0].remaining_days) < Number(leave.total_days)) {
          throw new AppError(409, 'INSUFFICIENT_BALANCE', `Không đủ ngày phép để duyệt. Còn lại: ${bal.rows[0].remaining_days} ngày`);
        }
      }
      await workflow.applyApproval(client, 'leave_requests', leave, verdict, actor, note);
    }
    const row = await findDetail(client, id);
    await writeAudit(client, {
      user: actor, action: action === 'reject' ? 'REJECT_LEAVE' : 'APPROVE_LEAVE', table: 'leave_requests', recordId: id, req,
      oldValues: { stage: leave.stage }, newValues: { stage: row.stage, note: note ?? null },
    });
    await notifyDecided(client, 'leave_requests', row, action === 'reject' ? 'rejected' : row.stage === 'DA_PHE_DUYET' ? 'approved' : 'advanced', actor, note);
    return row;
  });
}

async function cancel(user, id, req) {
  const employeeId = requireEmployee(user);
  return db.withTransaction(async (client) => {
    const found = await client.query('SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE', [id]);
    const leave = found.rows[0];
    if (!leave) throw notFound('Không tìm thấy đơn phép');
    if (leave.employee_id !== employeeId) throw forbidden('Bạn chỉ có thể hủy đơn của mình');
    if (leave.stage === 'TU_CHOI' || leave.stage === 'DA_HUY') throw conflict('Đơn đã bị từ chối hoặc đã hủy');

    const taken = await client.query('SELECT CURRENT_DATE > $1::date AS over', [leave.end_date]);
    if (leave.stage === 'DA_PHE_DUYET' && taken.rows[0].over) {
      throw new AppError(409, 'LEAVE_ALREADY_TAKEN', 'Kỳ nghỉ đã kết thúc, không thể hủy');
    }
    // DA_PHE_DUYET -> DA_HUY: the trigger refunds the days.
    await client.query("UPDATE leave_requests SET stage = 'DA_HUY' WHERE id = $1", [id]);
    await writeAudit(client, {
      user, action: 'CANCEL_LEAVE', table: 'leave_requests', recordId: id, req,
      oldValues: { stage: leave.stage }, newValues: { stage: 'DA_HUY' },
    });
    return findDetail(client, id);
  });
}

module.exports = { create, list, get, calendar, balances, types, decideOn, cancel };
