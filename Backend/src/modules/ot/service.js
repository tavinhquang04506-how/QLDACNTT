const db = require('../../config/db');
const { AppError, forbidden } = require('../../utils/AppError');
const { writeAudit } = require('../../utils/audit');
const { initialStage } = require('../approvals/chain');
const { createApprovalService } = require('../approvals/service');
const { notifySubmitted } = require('../approvals/notify');
const { minutes } = require('./schema');

const ACTIVE = ['CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN', 'DA_PHE_DUYET'];
const MONTHLY_LIMIT_HOURS = 40; // Bộ luật Lao động: tối đa 40 giờ làm thêm mỗi tháng

const shared = createApprovalService({
  table: 'ot_requests',
  dateColumn: 'work_date',
  notFoundMessage: 'Không tìm thấy đơn làm thêm giờ',
  audit: { approve: 'APPROVE_OT', reject: 'REJECT_OT', cancel: 'CANCEL_OT' },
  async cancelGuard(client, row) {
    const past = await client.query('SELECT CURRENT_DATE > $1::date AS over', [row.work_date]);
    if (row.stage === 'DA_PHE_DUYET' && past.rows[0].over) {
      throw new AppError(409, 'OT_ALREADY_WORKED', 'Ngày làm thêm đã qua, không thể hủy');
    }
  },
});

async function create(user, body, req) {
  if (!user.employeeId) throw forbidden('Tài khoản chưa được liên kết với hồ sơ nhân viên');
  const hours = Math.round(((minutes(body.endTime) - minutes(body.startTime)) / 60) * 100) / 100;

  return db.withTransaction(async (client) => {
    // Serialize this employee's submissions so the overlap and monthly-limit checks cannot race.
    await client.query('SELECT 1 FROM employees WHERE id = $1 FOR UPDATE', [user.employeeId]);

    const overlap = await client.query(
      `SELECT id FROM ot_requests
        WHERE employee_id = $1 AND work_date = $2 AND stage = ANY($3) AND start_time < $5::time AND end_time > $4::time`,
      [user.employeeId, body.workDate, ACTIVE, body.startTime, body.endTime]
    );
    if (overlap.rows.length > 0) throw new AppError(409, 'OT_OVERLAP', `Trùng giờ với đơn ${overlap.rows[0].id}`);

    const month = await client.query(
      `SELECT COALESCE(SUM(hours), 0) AS n FROM ot_requests
        WHERE employee_id = $1 AND stage = ANY($2) AND date_trunc('month', work_date) = date_trunc('month', $3::date)`,
      [user.employeeId, ACTIVE, body.workDate]
    );
    if (Number(month.rows[0].n) + hours > MONTHLY_LIMIT_HOURS) {
      throw new AppError(409, 'OT_MONTHLY_LIMIT',
        `Vượt giới hạn ${MONTHLY_LIMIT_HOURS} giờ làm thêm mỗi tháng (đã đăng ký ${month.rows[0].n} giờ)`);
    }

    const { stage, autoApprove } = initialStage(user.roleCode);
    const { rows } = await client.query(
      `INSERT INTO ot_requests (employee_id, work_date, start_time, end_time, hours, reason, stage)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [user.employeeId, body.workDate, body.startTime, body.endTime, hours, body.reason, stage]
    );
    const id = rows[0].id;
    if (autoApprove) {
      await client.query(
        `UPDATE ot_requests SET stage = 'DA_PHE_DUYET', hr_approved_by = $2, hr_approved_at = NOW(),
                hr_note = 'Tự phê duyệt (Tổng Giám Đốc)' WHERE id = $1`, [id, user.employeeId]);
    }
    await writeAudit(client, {
      user, action: 'CREATE_OT', table: 'ot_requests', recordId: id, req,
      newValues: { employee_id: user.employeeId, work_date: body.workDate, hours, stage: autoApprove ? 'DA_PHE_DUYET' : stage },
    });
    const created = await shared.findDetail(client, id);
    await notifySubmitted(client, 'ot_requests', created,
      `${created.full_name} đăng ký làm thêm ${hours} giờ ngày ${body.workDate} (${body.startTime}–${body.endTime}): ${body.reason}`);
    return { row: created, autoApproved: autoApprove };
  });
}

module.exports = { ...shared, create };
