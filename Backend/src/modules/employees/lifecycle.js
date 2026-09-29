const db = require('../../config/db');
const { AppError, badRequest, notFound, conflict } = require('../../utils/AppError');
const { writeAudit, setAuditActor } = require('../../utils/audit');
const tokens = require('../auth/tokens');
const { shapeEmployee } = require('./access');
const { createBody } = require('./schema');
const { findEmployee, insertEmployee } = require('./service');

/**
 * End an employment: terminate the employee, close the active contract, disable the login,
 * revoke every session and clear the department head role.
 */
async function offboard(actor, id, body, req) {
  if (id === actor.employeeId) throw badRequest('Không thể cho chính mình nghỉ việc');

  return db.withTransaction(async (client) => {
    await setAuditActor(client, actor);
    const emp = await findEmployee(client, id);
    if (!emp) throw notFound('Không tìm thấy nhân viên');
    if (emp.status === 'DA_NGHI_VIEC') throw conflict('Nhân viên này đã nghỉ việc');

    const joined = String(emp.joined_date instanceof Date ? emp.joined_date.toISOString() : emp.joined_date).slice(0, 10);
    if (body.terminationDate < joined) throw badRequest('Ngày nghỉ việc không được trước ngày vào làm');

    const reason = body.note ? `${body.reason} — ${body.note}` : body.reason;
    await client.query(
      `UPDATE employees SET status = 'DA_NGHI_VIEC', termination_date = $2, termination_reason = $3 WHERE id = $1`,
      [id, body.terminationDate, reason]
    );

    const users = await client.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1 RETURNING id', [id]);
    for (const u of users.rows) await tokens.revokeAllForUser(client, u.id);

    await client.query(
      `UPDATE contracts SET status = 'DA_CHAM_DUT', end_date = GREATEST(start_date, $2::date)
        WHERE employee_id = $1 AND status = 'HIEU_LUC'`,
      [id, body.terminationDate]
    );
    await client.query('UPDATE departments SET manager_id = NULL, updated_at = NOW() WHERE manager_id = $1', [id]);

    const reports = await client.query(
      "SELECT COUNT(*)::int AS n FROM employees WHERE manager_id = $1 AND status <> 'DA_NGHI_VIEC'", [id]);

    await writeAudit(client, {
      user: actor, action: 'OFFBOARD_EMPLOYEE', table: 'employees', recordId: id, req,
      oldValues: { status: emp.status },
      newValues: { status: 'DA_NGHI_VIEC', termination_date: body.terminationDate, reason },
    });
    return { employee: shapeEmployee(await findEmployee(client, id), actor), directReports: reports.rows[0].n };
  });
}

function describeFailure(err) {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  if (err && err.code === '23505') return { code: 'CONFLICT', message: 'Dữ liệu đã tồn tại' };
  if (err && (err.code === '23514' || err.code === '22P02')) return { code: 'VALIDATION_ERROR', message: 'Dữ liệu vi phạm ràng buộc' };
  if (err && err.code === '23503') return { code: 'REFERENCE_ERROR', message: 'Dữ liệu tham chiếu không hợp lệ' };
  return null;
}

/**
 * Import up to 500 employees. Each row runs in its own savepoint so a bad row is reported and
 * skipped without affecting the others. With dryRun nothing is written.
 */
async function importEmployees(actor, rows, dryRun) {
  const client = await db.getClient();
  let releaseError;
  const failed = [];
  const createdIds = [];
  try {
    await client.query('BEGIN');
    await setAuditActor(client, actor);

    for (let i = 0; i < rows.length; i += 1) {
      const parsed = createBody.safeParse(rows[i]);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        failed.push({ row: i + 1, code: 'VALIDATION_ERROR', message: `${issue.path.join('.') || 'row'}: ${issue.message}` });
        continue;
      }
      await client.query('SAVEPOINT import_row');
      try {
        createdIds.push(await insertEmployee(client, parsed.data, { dry: Boolean(dryRun) }));
        await client.query('RELEASE SAVEPOINT import_row');
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT import_row');
        await client.query('RELEASE SAVEPOINT import_row');
        const info = describeFailure(err);
        if (!info) throw err;
        failed.push({ row: i + 1, ...info });
      }
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      releaseError = rollbackErr;
    }
    throw err;
  } finally {
    client.release(releaseError);
  }
  return { dryRun: Boolean(dryRun), created: createdIds.length, createdIds: dryRun ? [] : createdIds, failed };
}

module.exports = { offboard, importEmployees };
