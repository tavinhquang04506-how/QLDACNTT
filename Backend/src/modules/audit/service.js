const db = require('../../config/db');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { redactAuditValues } = require('../../utils/redact');

const toEntry = (r, roleCode) => ({
  id: r.id,
  userId: r.user_id,
  userEmail: r.user_email,
  employeeId: r.employee_id,
  action: r.action,
  tableName: r.table_name,
  recordId: r.record_id,
  oldValues: redactAuditValues(r.old_values, roleCode),
  newValues: redactAuditValues(r.new_values, roleCode),
  ipAddress: r.ip_address,
  userAgent: r.user_agent,
  createdAt: r.created_at,
});

/** `from` is inclusive, `to` is exclusive. */
async function list(query, roleCode) {
  const { page, limit, offset } = parsePagination(query);
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (query.table) add('a.table_name = ?', query.table);
  if (query.action) add('a.action = ?', query.action);
  if (query.userId) add('a.user_id = ?', query.userId);
  if (query.from) add('a.created_at >= ?', query.from);
  if (query.to) add('a.created_at < ?', query.to);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = parseInt((await db.query(`SELECT COUNT(*) FROM audit_logs a ${clause}`, params)).rows[0].count, 10);
  const { rows } = await db.query(
    `SELECT a.*, u.email AS user_email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ${clause}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: rows.map((r) => toEntry(r, roleCode)), pagination: paginationMeta(total, page, limit) };
}

module.exports = { list };
