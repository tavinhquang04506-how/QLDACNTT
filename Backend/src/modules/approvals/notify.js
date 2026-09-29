const { notify } = require('../notifications/notify');
const { requesterContext } = require('./workflow');

const KINDS = {
  leave_requests: { type: 'approval', category: 'Nghỉ phép', noun: 'Đơn xin nghỉ phép', kind: 'leave' },
  ot_requests: { type: 'ot_request', category: 'Làm thêm giờ', noun: 'Đăng ký làm thêm giờ', kind: 'ot' },
  medical_claims: { type: 'c65_claim', category: 'Bồi thường y tế', noun: 'Đơn bồi thường y tế', kind: 'claim' },
};

/** Who should act next: the department manager for step one, HR (or the CEO for manager/HR requests) for the last step. */
async function approverTarget(client, stage, requesterRole, departmentId) {
  if (stage === 'CHO_TRUONG_PHONG_DUYET') {
    const { rows } = await client.query(
      `SELECT u.id FROM departments d JOIN users u ON u.employee_id = d.manager_id AND u.is_active WHERE d.id = $1 LIMIT 1`,
      [departmentId]
    );
    return rows[0] ? { userId: rows[0].id } : { roleTarget: 'HR_DIRECTOR' };
  }
  return { roleTarget: ['LINE_MANAGER', 'HR_DIRECTOR', 'CEO'].includes(requesterRole) ? 'CEO' : 'HR_DIRECTOR' };
}

const requesterInfo = async (client, employeeId) => {
  const { rows } = await client.query(
    `SELECT e.full_name, e.avatar_url, (SELECT u.id FROM users u WHERE u.employee_id = e.id AND u.is_active LIMIT 1) AS user_id
       FROM employees e WHERE e.id = $1`, [employeeId]);
  return rows[0] ?? {};
};

/** Tell the next approver that a request is waiting. No-op when the request needs no approval. */
async function notifySubmitted(client, table, row, summary) {
  if (!['CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN'].includes(row.stage)) return;
  const k = KINDS[table];
  const { requesterRole, requesterDepartmentId } = await requesterContext(client, row.employee_id);
  const target = await approverTarget(client, row.stage, requesterRole, requesterDepartmentId);
  const who = await requesterInfo(client, row.employee_id);
  await notify(client, {
    ...target, type: k.type, category: k.category, title: `${k.noun} mới chờ phê duyệt: ${row.id}`, summary,
    priority: 'normal', sender: { name: who.full_name, role: requesterRole, avatar: who.avatar_url },
    actionType: 'open_request', actionPayload: { id: row.id, kind: k.kind },
  });
}

/** outcome: 'advanced' (step one done, HR is next), 'approved' or 'rejected'. */
async function notifyDecided(client, table, row, outcome, actor, note) {
  const k = KINDS[table];
  const sender = { name: actor.fullName ?? null, role: actor.roleCode };
  const payload = { id: row.id, kind: k.kind };

  if (outcome === 'advanced') {
    const { requesterRole, requesterDepartmentId } = await requesterContext(client, row.employee_id);
    const target = await approverTarget(client, row.stage, requesterRole, requesterDepartmentId);
    const who = await requesterInfo(client, row.employee_id);
    await notify(client, {
      ...target, type: k.type, category: k.category, title: `${k.noun} chờ phê chuẩn: ${row.id}`,
      summary: `${who.full_name ?? ''} — đã được trưởng phòng duyệt cấp 1`, sender, actionType: 'open_request', actionPayload: payload,
    });
    return;
  }
  const who = await requesterInfo(client, row.employee_id);
  if (!who.user_id) return;
  await notify(client, {
    userId: who.user_id, type: k.type, category: k.category,
    title: outcome === 'approved' ? `${k.noun} đã được phê duyệt: ${row.id}` : `${k.noun} bị từ chối: ${row.id}`,
    summary: outcome === 'rejected' ? `Lý do: ${note ?? ''}` : note ?? null,
    priority: outcome === 'rejected' ? 'high' : 'normal', sender, actionType: 'open_request', actionPayload: payload,
  });
}

module.exports = { notifySubmitted, notifyDecided };
