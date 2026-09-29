// ============================================
// appealService.js — Quản lý Đơn Giải Trình Chấm Công (F02, F03, F04, F05)
// ============================================
const crypto = require('crypto');
const db = require('../../config/db');
const { badRequest, forbidden, notFound, conflict } = require('../../utils/AppError');
const { writeAudit } = require('../../utils/audit');

const VALID_APPEAL_TYPES = ['DI_MUON', 'VE_SOM', 'QUEN_CHAM_CONG', 'CONG_TAC', 'KHAC'];
const VALID_REVIEW_STATUSES = ['DA_DUYET', 'TU_CHOI'];

async function generateAppealId(executor) {
  try {
    const { rows } = await executor.query("SELECT 'APL-' || nextval('seq_appeal_id') AS id");
    if (rows?.[0]?.id) return rows[0].id;
  } catch {
    // Fallback to cryptographic UUID if sequence is unavailable in an isolated unit mock
  }
  return `APL-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

async function createAppeal(data = {}, actor = null, scope = 'self', req = null) {
  const actorEmpId = actor?.employeeId || actor?.employee_id || null;
  let employeeId = null;

  if (actor) {
    if (!actorEmpId) {
      throw badRequest('Tài khoản hiện tại chưa được gắn mã nhân viên');
    }
    if (data.employee_id && data.employee_id !== actorEmpId && scope !== 'all') {
      throw forbidden('Bạn không được phép gửi đơn giải trình thay cho nhân viên khác');
    }
    employeeId = scope === 'all' && data.employee_id ? data.employee_id : actorEmpId;
  } else {
    employeeId = data.employee_id;
  }

  if (!employeeId || typeof employeeId !== 'string') {
    throw badRequest('Thiếu mã nhân viên hợp lệ (employee_id)');
  }

  const workDate = data.date ? String(data.date).slice(0, 10) : null;
  if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    throw badRequest('Ngày giải trình không hợp lệ (YYYY-MM-DD)');
  }

  const appealType = data.appeal_type || 'DI_MUON';
  if (!VALID_APPEAL_TYPES.includes(appealType)) {
    throw badRequest(`Loại giải trình không hợp lệ (${VALID_APPEAL_TYPES.join(', ')})`);
  }

  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (!reason) {
    throw badRequest('Vui lòng nhập lý do giải trình');
  }

  return db.withTransaction(async (client) => {
    const empRes = await client.query(
      `SELECT e.id, e.full_name, e.department_id, d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.id = $1`,
      [employeeId]
    );
    const emp = empRes.rows[0];
    if (!emp) {
      throw notFound('Không tìm thấy hồ sơ nhân viên');
    }

    const id = await generateAppealId(client);
    const { rows } = await client.query(
      `INSERT INTO attendance_appeals (
         id, employee_id, employee_name, department_name, date, appeal_type, reason, proof_url, status
       ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, 'CHO_DUYET')
       RETURNING *`,
      [
        id,
        emp.id,
        emp.full_name,
        emp.department_name || null,
        workDate,
        appealType,
        reason,
        data.proof_url || null,
      ]
    );

    const created = rows[0];
    await writeAudit(client, {
      user: actor || { userId: null, employeeId: emp.id },
      action: 'CREATE_ATTENDANCE_APPEAL',
      table: 'attendance_appeals',
      recordId: created.id,
      req,
      newValues: {
        employee_id: created.employee_id,
        date: workDate,
        appeal_type: created.appeal_type,
        status: created.status,
      },
    });

    return created;
  });
}

async function getAppeals(filter = {}, actor = null, scope = null) {
  const where = [];
  const params = [];

  if (actor) {
    const roleCode = actor.roleCode || actor.role || '';
    const actorEmpId = actor.employeeId || actor.employee_id || null;
    const effScope =
      scope ||
      (['CEO', 'HR_DIRECTOR'].includes(roleCode)
        ? 'all'
        : roleCode === 'LINE_MANAGER'
        ? 'department'
        : 'self');

    if (effScope === 'self') {
      if (!actorEmpId) return [];
      params.push(actorEmpId);
      where.push(`a.employee_id = $${params.length}`);
    } else if (effScope === 'department') {
      if (!actorEmpId) return [];
      const deptRes = await db.query('SELECT department_id FROM employees WHERE id = $1', [actorEmpId]);
      const deptId = deptRes.rows[0]?.department_id;
      if (!deptId) return [];
      params.push(deptId);
      where.push(`e.department_id = $${params.length}`);
      if (filter.employee_id) {
        params.push(filter.employee_id);
        where.push(`a.employee_id = $${params.length}`);
      }
    } else if (effScope === 'all') {
      if (filter.employee_id) {
        params.push(filter.employee_id);
        where.push(`a.employee_id = $${params.length}`);
      }
      if (filter.department_id) {
        params.push(filter.department_id);
        where.push(`e.department_id = $${params.length}`);
      }
    } else {
      throw forbidden('Bạn không có quyền xem đơn giải trình chấm công');
    }
  } else if (filter.employee_id) {
    params.push(filter.employee_id);
    where.push(`a.employee_id = $${params.length}`);
  }

  if (filter.status) {
    params.push(filter.status);
    where.push(`a.status = $${params.length}`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT a.*, e.department_id
     FROM attendance_appeals a
     LEFT JOIN employees e ON e.id = a.employee_id
     ${clause}
     ORDER BY a.created_at DESC, a.id DESC`,
    params
  );
  return rows;
}

async function reviewAppeal(id, reviewData = {}, actor = null, scope = null, req = null) {
  if (!id || typeof id !== 'string') {
    throw badRequest('Mã đơn giải trình không hợp lệ');
  }

  const { status, review_note } = reviewData;
  if (!VALID_REVIEW_STATUSES.includes(status)) {
    throw badRequest(`Trạng thái phê duyệt phải là một trong: ${VALID_REVIEW_STATUSES.join(', ')}`);
  }

  return db.withTransaction(async (client) => {
    const existingRes = await client.query(
      `SELECT a.*, a.date::text AS date_str, e.department_id AS employee_department_id
       FROM attendance_appeals a
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [id]
    );

    const appealRow = existingRes.rows[0];
    if (!appealRow) {
      throw notFound('Không tìm thấy đơn giải trình chấm công');
    }

    if (appealRow.status !== 'CHO_DUYET') {
      throw conflict('Đơn giải trình này đã được xử lý trước đó');
    }

    const reviewerId = actor?.employeeId || actor?.employee_id || reviewData.reviewer_id || null;
    if (reviewerId && appealRow.employee_id === reviewerId) {
      throw forbidden('Không được tự duyệt đơn giải trình của chính mình');
    }

    if (actor) {
      const roleCode = actor.roleCode || actor.role || '';
      const effScope =
        scope ||
        (['CEO', 'HR_DIRECTOR'].includes(roleCode)
          ? 'all'
          : roleCode === 'LINE_MANAGER'
          ? 'department'
          : null);

      if (!effScope || effScope === 'self') {
        throw forbidden('Bạn không có quyền duyệt đơn giải trình chấm công');
      }

      if (effScope === 'department') {
        if (!reviewerId) {
          throw forbidden('Trưởng phòng chưa liên kết hồ sơ nhân sự');
        }
        const mgrRes = await client.query('SELECT department_id FROM employees WHERE id = $1', [reviewerId]);
        const mgrDept = mgrRes.rows[0]?.department_id;
        if (!mgrDept || mgrDept !== appealRow.employee_department_id) {
          throw forbidden('Không có quyền duyệt đơn giải trình của nhân viên ngoài phòng ban');
        }
      }
    }

    let reviewerName = reviewData.reviewer_name || null;
    if (reviewerId && !reviewerName) {
      const revEmp = await client.query('SELECT full_name FROM employees WHERE id = $1', [reviewerId]);
      reviewerName = revEmp.rows[0]?.full_name || null;
    }

    const updateRes = await client.query(
      `UPDATE attendance_appeals
       SET status = $1,
           review_note = $2,
           reviewer_id = $3,
           reviewer_name = $4,
           reviewed_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [status, review_note || '', reviewerId, reviewerName, id]
    );
    const updatedAppeal = updateRes.rows[0];

    if (status === 'DA_DUYET') {
      const empId = appealRow.employee_id;
      const workDate = String(appealRow.date_str || appealRow.date).slice(0, 10);
      const appealType = appealRow.appeal_type || 'DI_MUON';
      const noteMsg = `[Giải trình ${appealType} đã được duyệt: ${review_note || 'Đồng ý'}]`;
      const stdCheckIn = `${workDate} 08:00:00+07`;
      const stdCheckOut = `${workDate} 17:00:00+07`;

      const logRes = await client.query(
        'SELECT id, note FROM attendance_logs WHERE employee_id = $1 AND work_date = $2::date FOR UPDATE',
        [empId, workDate]
      );

      if (logRes.rows[0]) {
        await client.query(
          `UPDATE attendance_logs
           SET check_in_time = $2::timestamptz,
               check_out_time = GREATEST(COALESCE(check_out_time, $3::timestamptz), $3::timestamptz),
               status = 'DUNG_GIO',
               late_minutes = 0,
               work_hours = GREATEST(COALESCE(work_hours, 0), 8.0),
               note = TRIM(COALESCE(note, '') || ' ' || $4)
           WHERE id = $1`,
          [logRes.rows[0].id, stdCheckIn, stdCheckOut, noteMsg]
        );
      } else {
        await client.query(
          `INSERT INTO attendance_logs (
             employee_id, work_date, check_in_time, check_out_time, check_in_method, status, late_minutes, work_hours, note
           ) VALUES ($1, $2::date, $3::timestamptz, $4::timestamptz, 'manual', 'DUNG_GIO', 0, 8.0, $5)`,
          [empId, workDate, stdCheckIn, stdCheckOut, noteMsg]
        );
      }
    }

    await writeAudit(client, {
      user: actor || { userId: null, employeeId: reviewerId },
      action: status === 'DA_DUYET' ? 'APPROVE_ATTENDANCE_APPEAL' : 'REJECT_ATTENDANCE_APPEAL',
      table: 'attendance_appeals',
      recordId: id,
      req,
      oldValues: { status: appealRow.status },
      newValues: { status, review_note: review_note || '', reviewer_id: reviewerId },
    });

    return updatedAppeal;
  });
}

module.exports = {
  createAppeal,
  getAppeals,
  reviewAppeal,
};
