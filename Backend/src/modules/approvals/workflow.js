const { AppError } = require('../../utils/AppError');

// Tables that share the approval columns (stage, manager_*, hr_*). Allow-listed because the name is interpolated.
const TABLES = new Set(['leave_requests', 'ot_requests', 'medical_claims']);
const assertTable = (t) => {
  if (!TABLES.has(t)) throw new Error(`Table "${t}" does not use the approval workflow`);
};

const DENIALS = {
  NOT_PENDING: [409, 'INVALID_STAGE', 'Đơn không ở trạng thái chờ duyệt'],
  SELF_APPROVAL: [403, 'SELF_APPROVAL', 'Bạn không thể xử lý đơn của chính mình'],
  WRONG_ROLE: [403, 'FORBIDDEN', 'Vai trò của bạn không thể xử lý bước duyệt này'],
  OUT_OF_SCOPE: [403, 'FORBIDDEN', 'Đơn này không thuộc phòng ban của bạn'],
  CEO_ONLY: [403, 'FORBIDDEN', 'Đơn của quản lý và Giám Đốc Nhân Sự chỉ do Tổng Giám Đốc duyệt'],
};

function denial(reason) {
  const [status, code, message] = DENIALS[reason] || [403, 'FORBIDDEN', 'Không có quyền xử lý đơn này'];
  return new AppError(status, code, message);
}

async function departmentOf(client, employeeId) {
  if (!employeeId) return null;
  const { rows } = await client.query('SELECT department_id FROM employees WHERE id = $1', [employeeId]);
  return rows[0]?.department_id ?? null;
}

/** Role and department of the person a request belongs to (an employee without an account counts as EMPLOYEE). */
async function requesterContext(client, employeeId) {
  const { rows } = await client.query(
    `SELECT e.department_id, (SELECT u.role_code FROM users u WHERE u.employee_id = e.id LIMIT 1) AS role_code
       FROM employees e WHERE e.id = $1`, [employeeId]);
  return { requesterRole: rows[0]?.role_code ?? 'EMPLOYEE', requesterDepartmentId: rows[0]?.department_id ?? null };
}

/** Apply an approval that `decide()` allowed. The caller runs any pre-checks (e.g. leave balance) first. */
async function applyApproval(client, table, row, verdict, actor, note) {
  assertTable(table);
  if (verdict.next === 'CHO_HR_PHE_CHUAN') {
    await client.query(
      `UPDATE ${table} SET stage = 'CHO_HR_PHE_CHUAN', manager_approved_by = $2, manager_approved_at = NOW(), manager_note = $3 WHERE id = $1`,
      [row.id, actor.employeeId ?? null, note || 'Đồng ý']
    );
    return;
  }
  // Final approval. When the CEO skips the manager step, record them as the manager approver too.
  await client.query(
    `UPDATE ${table} SET stage = 'DA_PHE_DUYET',
            manager_approved_by = COALESCE(manager_approved_by, CASE WHEN stage = 'CHO_TRUONG_PHONG_DUYET' THEN $2 END),
            manager_approved_at = COALESCE(manager_approved_at, CASE WHEN stage = 'CHO_TRUONG_PHONG_DUYET' THEN NOW() END),
            hr_approved_by = $2, hr_approved_at = NOW(), hr_note = $3
      WHERE id = $1`,
    [row.id, actor.employeeId ?? null, note || 'Phê chuẩn']
  );
}

async function applyRejection(client, table, row, note) {
  assertTable(table);
  await client.query(
    `UPDATE ${table} SET stage = 'TU_CHOI',
            manager_note = CASE WHEN stage = 'CHO_TRUONG_PHONG_DUYET' THEN $2 ELSE manager_note END,
            hr_note = CASE WHEN stage = 'CHO_HR_PHE_CHUAN' THEN $2 ELSE hr_note END
      WHERE id = $1`,
    [row.id, note]
  );
}

module.exports = { assertTable, denial, departmentOf, requesterContext, applyApproval, applyRejection };
