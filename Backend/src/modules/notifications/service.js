const db = require('../../config/db');
const { forbidden, notFound } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { notify } = require('./notify');
const { normalizeNoticeRowAttachments } = require('../notices/service');

const IS_NOTICE_NOTIFICATION = `(COALESCE(n.action_type, '') = 'notice_popup' OR n.id LIKE 'NOTIF-NT-%' OR n.id LIKE 'REMIND-%')`;

const NOTICE_JOIN = `
  LEFT JOIN company_notices cn
    ON ${IS_NOTICE_NOTIFICATION}
   AND cn.id = COALESCE(
     CASE
       WHEN n.action_payload IS NOT NULL AND jsonb_typeof(n.action_payload) = 'object'
       THEN n.action_payload->>'id'
       ELSE NULL
     END,
     CASE
       WHEN n.id LIKE 'NOTIF-%' THEN SUBSTRING(n.id FROM 7)
       ELSE NULL
     END
   )
`;

// $1 = the user's id, $2 = the user's role.
// R42: Any notification linked to a company notice MUST satisfy the live company_notices
// schedule (is_active, published_at <= NOW(), expires_at > NOW()) and audience scope (target_role, target_department_id).
const VISIBLE = `(
  (n.user_id = $1 OR (n.user_id IS NULL AND (n.role_target IS NULL OR n.role_target = $2::role_code_enum)))
  AND (
    NOT ${IS_NOTICE_NOTIFICATION}
    OR (
      cn.id IS NOT NULL
      AND cn.is_active = TRUE
      AND cn.published_at <= NOW()
      AND (cn.expires_at IS NULL OR cn.expires_at > NOW())
      AND (cn.target_role IS NULL OR cn.target_role = $2::role_code_enum)
      AND (
        cn.target_department_id IS NULL
        OR cn.target_department_id = (
          SELECT e_scope.department_id
          FROM users u_scope
          LEFT JOIN employees e_scope ON e_scope.id = u_scope.employee_id
          WHERE u_scope.id = $1
        )
      )
    )
  )
)`;

const READ = `(CASE WHEN n.user_id IS NULL
                    THEN EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = $1)
                    ELSE n.is_read END)`;

const COLUMNS = `n.id, n.user_id, n.role_target, n.type, n.category, n.title, n.summary, n.sender_name, n.sender_role,
                 n.sender_avatar, n.priority, ${READ} AS is_read, n.action_type, n.action_payload, n.created_at,
                 cn.id AS _cn_id, cn.title AS _cn_title, cn.content AS _cn_content, cn.category AS _cn_category,
                 cn.priority AS _cn_priority, cn.is_pinned AS _cn_is_pinned, cn.published_at AS _cn_published_at,
                 cn.attachments AS _cn_attachments`;

function hydrateNotificationRow(row) {
  if (!row) return row;
  const out = { ...row };
  const cnId = out._cn_id;
  const cnTitle = out._cn_title;
  const cnContent = out._cn_content;
  const cnCategory = out._cn_category;
  const cnPriority = out._cn_priority;
  const cnIsPinned = out._cn_is_pinned;
  const cnPublishedAt = out._cn_published_at;
  const cnAttachments = out._cn_attachments;

  delete out._cn_id;
  delete out._cn_title;
  delete out._cn_content;
  delete out._cn_category;
  delete out._cn_priority;
  delete out._cn_is_pinned;
  delete out._cn_published_at;
  delete out._cn_attachments;

  if (cnId) {
    const normalizedNotice = normalizeNoticeRowAttachments({
      id: cnId,
      attachments: cnAttachments,
    });
    const isReminder = String(out.id || '').startsWith('REMIND-') || Boolean(out.action_payload?.isReminder);
    const basePayload =
      typeof out.action_payload === 'object' && out.action_payload !== null
        ? out.action_payload
        : {};

    out.title = isReminder ? `[NHẮC NHỞ] Bạn chưa đọc: ${cnTitle}` : cnTitle;
    out.summary = isReminder
      ? `Ban Lãnh Đạo yêu cầu bạn hoàn tất đọc văn bản chỉ đạo "${cnTitle}". Vui lòng bấm vào để xem chi tiết ngay.`
      : cnContent
        ? cnContent.slice(0, 160) + (cnContent.length > 160 ? '...' : '')
        : null;
    out.action_payload = {
      ...basePayload,
      id: cnId,
      title: cnTitle,
      content: cnContent,
      category: cnCategory,
      priority: cnPriority,
      isPinned: Boolean(cnIsPinned),
      attachments: normalizedNotice.attachments || [],
      date:
        basePayload.date ||
        (cnPublishedAt
          ? new Date(cnPublishedAt).toLocaleDateString('vi-VN')
          : new Date().toLocaleDateString('vi-VN')),
      signer:
        basePayload.signer ||
        `${out.sender_name || 'Ban Điều Hành'} - ${out.sender_role || 'NEXUS'}`,
      docNumber: basePayload.docNumber || `Số: ${cnId}/2026/TB-NEXUS`,
    };
  }

  return out;
}

async function unreadCount(user) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM notifications n ${NOTICE_JOIN} WHERE ${VISIBLE} AND NOT ${READ}`,
    [user.userId, user.roleCode]
  );
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
  const total = (
    await db.query(
      `SELECT COUNT(*)::int AS n FROM notifications n ${NOTICE_JOIN} WHERE ${clause}`,
      params
    )
  ).rows[0].n;
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM notifications n ${NOTICE_JOIN} WHERE ${clause} ORDER BY n.created_at DESC, n.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return {
    data: rows.map(hydrateNotificationRow),
    pagination: paginationMeta(total, page, limit),
    unreadCount: await unreadCount(user),
  };
}

async function findVisible(executor, user, id) {
  const { rows } = await executor.query(
    `SELECT ${COLUMNS} FROM notifications n ${NOTICE_JOIN} WHERE n.id = $3 AND ${VISIBLE}`,
    [user.userId, user.roleCode, id]
  );
  if (!rows[0]) throw notFound('Không tìm thấy thông báo');
  return hydrateNotificationRow(rows[0]);
}

async function markRead(user, id) {
  const n = await findVisible(db, user, id);
  if (!n.is_read) {
    if (n.user_id) {
      await db.query('UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1', [id]);
    } else {
      await db.query(
        'INSERT INTO notification_reads (notification_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, user.userId]
      );
    }
  }
  return findVisible(db, user, id);
}

async function markAllRead(user) {
  return db.withTransaction(async (client) => {
    const personal = await client.query(
      `UPDATE notifications target
       SET is_read = TRUE, read_at = NOW()
       FROM (
         SELECT n.id
         FROM notifications n
         ${NOTICE_JOIN}
         WHERE n.user_id = $1 AND NOT n.is_read AND ${VISIBLE}
       ) vis
       WHERE target.id = vis.id`,
      [user.userId, user.roleCode]
    );
    const shared = await client.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       SELECT n.id, $1
       FROM notifications n
       ${NOTICE_JOIN}
       WHERE n.user_id IS NULL
         AND ${VISIBLE}
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

module.exports = { list, unreadCount, findVisible, markRead, markAllRead, remove, create, clearRead };
