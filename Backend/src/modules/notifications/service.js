const db = require('../../config/db');
const { forbidden, notFound } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { notify } = require('./notify');

// $1 = the user's id, $2 = the user's role.
const VISIBLE = '(n.user_id = $1 OR (n.user_id IS NULL AND (n.role_target IS NULL OR n.role_target = $2::role_code_enum)))';
const READ = `(CASE WHEN n.user_id IS NULL
                    THEN EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = $1)
                    ELSE n.is_read END)`;
const COLUMNS = `n.id, n.user_id, n.role_target, n.type, n.category, n.title, n.summary, n.sender_name, n.sender_role,
                 n.sender_avatar, n.priority, ${READ} AS is_read, n.action_type, n.action_payload, n.created_at`;

async function unreadCount(user) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM notifications n WHERE ${VISIBLE} AND NOT ${READ}`, [user.userId, user.roleCode]);
  return rows[0].n;
}

async function list(user, query, { defaultLimit = 30 } = {}) {
  const { page, limit, offset } = parsePagination(query, { defaultLimit, maxLimit: 100 });
  const where = [VISIBLE];
  if (query.unread === 'true') where.push(`NOT ${READ}`);
  if (query.unread === 'false') where.push(READ);
  const params = [user.userId, user.roleCode];
  if (query.type) {
    params.push(query.type);
    where.push(`n.type = $${params.length}::notification_type_enum`);
  }
  const clause = where.join(' AND ');
  const total = (await db.query(`SELECT COUNT(*)::int AS n FROM notifications n WHERE ${clause}`, params)).rows[0].n;
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM notifications n WHERE ${clause} ORDER BY n.created_at DESC, n.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: rows, pagination: paginationMeta(total, page, limit), unreadCount: await unreadCount(user) };
}

async function findVisible(executor, user, id) {
  const { rows } = await executor.query(`SELECT ${COLUMNS} FROM notifications n WHERE n.id = $3 AND ${VISIBLE}`, [user.userId, user.roleCode, id]);
  if (!rows[0]) throw notFound('Không tìm thấy thông báo');
  return rows[0];
}

async function markRead(user, id) {
  const n = await findVisible(db, user, id);
  if (!n.is_read) {
    if (n.user_id) await db.query('UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1', [id]);
    else await db.query('INSERT INTO notification_reads (notification_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, user.userId]);
  }
  return findVisible(db, user, id);
}

async function markAllRead(user) {
  return db.withTransaction(async (client) => {
    const personal = await client.query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = $1 AND NOT is_read', [user.userId]);
    const shared = await client.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       SELECT n.id, $1 FROM notifications n
        WHERE n.user_id IS NULL AND (n.role_target IS NULL OR n.role_target = $2::role_code_enum)
          AND NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = $1)
       ON CONFLICT DO NOTHING`,
      [user.userId, user.roleCode]
    );
    return personal.rowCount + shared.rowCount;
  });
}

async function remove(user, id) {
  const n = await findVisible(db, user, id);
  if (!n.user_id) throw forbidden('Không thể xóa thông báo chung, hãy đánh dấu là đã đọc');
  await db.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, user.userId]);
}

async function create(actor, body, req) {
  return db.withTransaction(async (client) => {
    if (body.userId) {
      const u = await client.query('SELECT 1 FROM users WHERE id = $1', [body.userId]);
      if (u.rows.length === 0) throw notFound('Không tìm thấy người nhận');
    }
    const me = actor.employeeId
      ? (await client.query('SELECT full_name, avatar_url FROM employees WHERE id = $1', [actor.employeeId])).rows[0]
      : null;
    const row = await notify(client, {
      userId: body.userId ?? null, roleTarget: body.roleTarget ?? null, type: body.type, category: body.category ?? null,
      title: body.title, summary: body.summary ?? null, priority: body.priority,
      sender: { name: me?.full_name ?? actor.email, role: actor.roleCode, avatar: me?.avatar_url ?? null },
      actionType: body.actionType ?? null, actionPayload: body.actionPayload ?? null,
    });
    await writeAudit(client, {
      user: actor, action: 'CREATE_NOTIFICATION', table: 'notifications', recordId: row.id, req,
      newValues: { user_id: row.user_id, role_target: row.role_target, type: row.type, title: row.title },
    });
    return row;
  });
}

async function clearRead(user) {
  const res = await db.query('DELETE FROM notifications WHERE user_id = $1 AND is_read = TRUE', [user.userId]);
  return { deletedCount: res.rowCount };
}

module.exports = { list, unreadCount, markRead, markAllRead, remove, create, clearRead };
