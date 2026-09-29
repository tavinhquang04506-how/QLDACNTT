const db = require('../../config/db');
const { AppError, badRequest, forbidden, notFound } = require('../../utils/AppError');
const { writeAudit } = require('../../utils/audit');
const { initialStage } = require('../approvals/chain');
const { createApprovalService } = require('../approvals/service');
const { notifySubmitted } = require('../approvals/notify');

const SICK_LEAVE_TYPE = 'LT-SL';

const shared = createApprovalService({
  table: 'medical_claims',
  dateColumn: 'claim_date',
  notFoundMessage: 'Không tìm thấy đơn bồi thường y tế',
  audit: { approve: 'APPROVE_CLAIM', reject: 'REJECT_CLAIM', cancel: 'CANCEL_CLAIM' },
  async cancelGuard(client, row) {
    if (row.stage === 'DA_PHE_DUYET') {
      throw new AppError(409, 'CLAIM_ALREADY_APPROVED', 'Đơn đã được phê chuẩn chi trả, không thể hủy');
    }
  },
});

async function create(user, body, req) {
  if (!user.employeeId) throw forbidden('Tài khoản chưa được liên kết với hồ sơ nhân viên');

  return db.withTransaction(async (client) => {
    const future = await client.query('SELECT $1::date > CURRENT_DATE AS future', [body.claimDate]);
    if (future.rows[0].future) throw badRequest('Ngày phát sinh chi phí không được ở tương lai');

    if (body.leaveRequestId) {
      const leave = await client.query('SELECT employee_id, leave_type_id, stage FROM leave_requests WHERE id = $1', [body.leaveRequestId]);
      if (leave.rows.length === 0) throw notFound('Không tìm thấy đơn nghỉ phép liên kết');
      const l = leave.rows[0];
      if (l.employee_id !== user.employeeId) throw forbidden('Đơn nghỉ phép liên kết không phải của bạn');
      if (l.leave_type_id !== SICK_LEAVE_TYPE) throw badRequest('Đơn nghỉ phép liên kết phải là nghỉ ốm');
      if (l.stage !== 'DA_PHE_DUYET') throw badRequest('Đơn nghỉ ốm liên kết chưa được phê duyệt');
    }

    const { stage, autoApprove } = initialStage(user.roleCode);
    const { rows } = await client.query(
      `INSERT INTO medical_claims (employee_id, claim_date, amount, hospital, description, attachment_url, leave_request_id, stage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [user.employeeId, body.claimDate, body.amount, body.hospital ?? null, body.description,
        body.attachmentUrl ?? null, body.leaveRequestId ?? null, stage]
    );
    const id = rows[0].id;
    if (autoApprove) {
      await client.query(
        `UPDATE medical_claims SET stage = 'DA_PHE_DUYET', hr_approved_by = $2, hr_approved_at = NOW(),
                hr_note = 'Tự phê duyệt (Tổng Giám Đốc)' WHERE id = $1`, [id, user.employeeId]);
    }
    await writeAudit(client, {
      user, action: 'CREATE_CLAIM', table: 'medical_claims', recordId: id, req,
      newValues: { employee_id: user.employeeId, claim_date: body.claimDate, amount: body.amount, stage: autoApprove ? 'DA_PHE_DUYET' : stage },
    });
    const created = await shared.findDetail(client, id);
    await notifySubmitted(client, 'medical_claims', created,
      `${created.full_name} đề nghị bồi thường ${body.amount} đồng (${body.description})`);
    return { row: created, autoApproved: autoApprove };
  });
}

module.exports = { ...shared, create };
