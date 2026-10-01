const db = require('../../config/db');
const { forbidden, notFound, conflict } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { scopeCondition } = require('../../utils/scope');
const { decide } = require('./chain');
const workflow = require('./workflow');
const { notifyDecided } = require('./notify');

/**
 * Read/decide/cancel operations shared by requests that follow the approval chain
 * (overtime requests and medical claims). Creation stays with each module.
 *
 * options: { table, dateColumn, notFoundMessage, audit: { approve, reject, cancel }, cancelGuard?(client, row) }
 */
function createApprovalService({ table, dateColumn, notFoundMessage, audit, cancelGuard }) {
  workflow.assertTable(table);

  const SELECT_SQL = `
    SELECT r.*, e.full_name, e.avatar_url, e.job_title, e.department_id, d.name AS department_name,
           ma.full_name AS manager_approver_name, ha.full_name AS hr_approver_name
      FROM ${table} r
      JOIN employees e ON e.id = r.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN employees ma ON ma.id = r.manager_approved_by
      LEFT JOIN employees ha ON ha.id = r.hr_approved_by`;

  async function findDetail(executor, id) {
    const { rows } = await executor.query(`${SELECT_SQL} WHERE r.id = $1`, [id]);
    return rows[0] || null;
  }

  async function list(user, query, scope) {
    const { page, limit, offset } = parsePagination(query);
    const params = [];
    const where = [];
    const cond = await scopeCondition(db, user, scope, { employee: 'r.employee_id', department: 'e.department_id' }, params);
    if (cond) where.push(cond);
    const add = (sql, value) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (query.stage) add('r.stage = ?', query.stage);
    if (query.employeeId) add('r.employee_id = ?', query.employeeId);
    if (query.month) {
      params.push(`${query.month}-01`);
      where.push(`r.${dateColumn} >= $${params.length}::date AND r.${dateColumn} < ($${params.length}::date + INTERVAL '1 month')`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = parseInt((await db.query(
      `SELECT COUNT(*) FROM ${table} r JOIN employees e ON e.id = r.employee_id ${clause}`, params)).rows[0].count, 10);
    const { rows } = await db.query(
      `${SELECT_SQL} ${clause} ORDER BY r.submitted_at DESC, r.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return { data: rows, pagination: paginationMeta(total, page, limit) };
  }

  async function get(user, id, scope) {
    const row = await findDetail(db, id);
    if (!row) throw notFound(notFoundMessage);
    let allowed = scope === 'all' || row.employee_id === user.employeeId;
    if (!allowed && scope === 'department') {
      const mine = await workflow.departmentOf(db, user.employeeId);
      allowed = Boolean(mine) && mine === row.department_id;
    }
    if (!allowed) throw forbidden('Bạn không có quyền xem đơn này');
    return row;
  }

  async function decideOn(actor, id, action, note, req) {
    return db.withTransaction(async (client) => {
      const found = await client.query(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
      const row = found.rows[0];
      if (!row) throw notFound(notFoundMessage);

      const verdict = decide({
        stage: row.stage,
        requesterId: row.employee_id,
        ...(await workflow.requesterContext(client, row.employee_id)),
        actorRole: actor.roleCode,
        actorId: actor.employeeId,
        actorDepartmentId: await workflow.departmentOf(client, actor.employeeId),
      });
      if (!verdict.ok) throw workflow.denial(verdict.reason);

      if (action === 'reject') await workflow.applyRejection(client, table, row, note);
      else await workflow.applyApproval(client, table, row, verdict, actor, note);

      const detail = await findDetail(client, id);
      await writeAudit(client, {
        user: actor, action: action === 'reject' ? audit.reject : audit.approve, table, recordId: id, req,
        oldValues: { stage: row.stage }, newValues: { stage: detail.stage, note: note ?? null },
      });
      await notifyDecided(client, table, detail, action === 'reject' ? 'rejected' : detail.stage === 'DA_PHE_DUYET' ? 'approved' : 'advanced', actor, note);
      return detail;
    });
  }

  async function cancel(user, id, req) {
    if (!user.employeeId) throw forbidden('Tài khoản chưa được liên kết với hồ sơ nhân viên');
    return db.withTransaction(async (client) => {
      const found = await client.query(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
      const row = found.rows[0];
      if (!row) throw notFound(notFoundMessage);
      if (row.employee_id !== user.employeeId) throw forbidden('Bạn chỉ có thể hủy đơn của mình');
      if (row.stage === 'TU_CHOI' || row.stage === 'DA_HUY') throw conflict('Đơn đã bị từ chối hoặc đã hủy');
      if (cancelGuard) await cancelGuard(client, row);

      await client.query(`UPDATE ${table} SET stage = 'DA_HUY' WHERE id = $1`, [id]);
      await writeAudit(client, {
        user, action: audit.cancel, table, recordId: id, req,
        oldValues: { stage: row.stage }, newValues: { stage: 'DA_HUY' },
      });
      return findDetail(client, id);
    });
  }

  return { list, get, decideOn, cancel, findDetail };
}

module.exports = { createApprovalService };
