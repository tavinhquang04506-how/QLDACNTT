const db = require('../../config/db');
const { badRequest, forbidden, notFound } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');

const HR_ROLES = ['CEO', 'HR_DIRECTOR'];
const SELECT = 'SELECT n.*, a.full_name AS author_name FROM company_notices n LEFT JOIN employees a ON a.id = n.author_id';

// Visible to staff: active, already published, not expired, and addressed to their role and department.
const audiencePredicate = (roleParam, deptParam) => `(n.is_active AND n.published_at <= NOW() AND (n.expires_at IS NULL OR n.expires_at > NOW())
   AND (n.target_role IS NULL OR n.target_role = ${roleParam}::role_code_enum)
   AND (n.target_department_id IS NULL OR n.target_department_id = ${deptParam}))`;

async function departmentOf(user) {
  if (!user.employeeId) return null;
  return (await db.query('SELECT department_id FROM employees WHERE id = $1', [user.employeeId])).rows[0]?.department_id ?? null;
}

async function list(user, query) {
  const { page, limit, offset } = parsePagination(query, { defaultLimit: 30, maxLimit: 100 });
  const params = [];
  const where = [];
  if (query.all === 'true') {
    if (!HR_ROLES.includes(user.roleCode)) throw forbidden('Chỉ HR và CEO mới xem được toàn bộ thông báo');
  } else {
    params.push(user.roleCode, await departmentOf(user));
    where.push(audiencePredicate('$1', '$2'));
  }
  if (query.category) {
    params.push(query.category);
    where.push(`n.category = $${params.length}::notice_category_enum`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT COUNT(*)::int AS n FROM company_notices n ${clause}`, params)).rows[0].n;
  const { rows } = await db.query(
    `${SELECT} ${clause} ORDER BY n.is_pinned DESC, n.published_at DESC, n.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: rows, pagination: paginationMeta(total, page, limit) };
}

async function get(user, id) {
  const params = [id];
  let extra = '';
  if (!HR_ROLES.includes(user.roleCode)) {
    params.push(user.roleCode, await departmentOf(user));
    extra = `AND ${audiencePredicate('$2', '$3')}`;
  }
  const { rows } = await db.query(`${SELECT} WHERE n.id = $1 ${extra}`, params);
  if (!rows[0]) throw notFound('Không tìm thấy thông báo');
  return rows[0];
}

async function assertDepartment(client, id) {
  const { rows } = await client.query('SELECT 1 FROM departments WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound('Không tìm thấy phòng ban');
}

async function create(actor, body, req) {
  return db.withTransaction(async (client) => {
    if (body.targetDepartmentId) await assertDepartment(client, body.targetDepartmentId);
    const attachmentsJson = JSON.stringify(body.attachments || []);
    const { rows } = await client.query(
      `INSERT INTO company_notices (title, content, category, priority, author_id, target_role, target_department_id, is_pinned, published_at, expires_at, attachments)
       VALUES ($1, $2, $3::notice_category_enum, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), $10, $11::jsonb) RETURNING id`,
      [body.title, body.content, body.category, body.priority, actor.employeeId ?? null, body.targetRole ?? null,
        body.targetDepartmentId ?? null, body.isPinned, body.publishedAt ?? null, body.expiresAt ?? null, attachmentsJson]
    );
    const noticeId = rows[0].id;

    // Get author details for notification
    const authorRes = actor.employeeId
      ? await client.query('SELECT full_name, avatar_url, job_title FROM employees WHERE id = $1', [actor.employeeId])
      : null;
    const author = authorRes?.rows[0];
    const senderName = author?.full_name || (actor.roleCode === 'CEO' ? 'Lê Vũ Ngọc Duy' : 'Trần Mai Hương');
    const senderRole = author?.job_title || (actor.roleCode === 'CEO' ? 'Tổng Giám Đốc' : 'Giám Đốc Nhân Sự');
    const senderAvatar = author?.avatar_url || (actor.roleCode === 'CEO'
      ? 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
      : 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150');

    // Auto-create/broadcast matching notification into `notifications` table
    const notifId = `NOTIF-${noticeId}`;
    await client.query(`
      INSERT INTO notifications (
        id, role_target, type, category, title, summary, sender_name, sender_role, sender_avatar,
        priority, is_read, action_type, action_payload, created_at
      ) VALUES ($1, $2, $3::notification_type_enum, $4, $5, $6, $7, $8, $9, $10, false, $11, $12, NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, summary = EXCLUDED.summary, priority = EXCLUDED.priority, action_payload = EXCLUDED.action_payload
    `, [
      notifId,
      body.targetRole ?? null,
      body.priority === 'high' ? 'ceo_directive' : 'system',
      'Thông báo công ty',
      body.title,
      body.content ? body.content.slice(0, 160) + (body.content.length > 160 ? '...' : '') : null,
      senderName,
      senderRole,
      senderAvatar,
      body.priority === 'high' ? 'urgent' : 'medium',
      'notice_popup',
      JSON.stringify({
        id: noticeId,
        title: body.title,
        content: body.content,
        category: body.category,
        priority: body.priority,
        attachments: body.attachments || [],
        date: new Date().toLocaleDateString('vi-VN'),
        signer: `${senderName} - ${senderRole}`,
        docNumber: `Số: ${Math.floor(100 + Math.random() * 900)}/2026/TB-NEXUS`
      })
    ]);

    await writeAudit(client, {
      user: actor, action: 'CREATE_NOTICE', table: 'company_notices', recordId: noticeId, req,
      newValues: { title: body.title, category: body.category, target_role: body.targetRole ?? null, target_department_id: body.targetDepartmentId ?? null },
    });
    return (await client.query(`${SELECT} WHERE n.id = $1`, [noticeId])).rows[0];
  });
}

const COLUMNS = {
  title: 'title', content: 'content', category: 'category', priority: 'priority', targetRole: 'target_role',
  targetDepartmentId: 'target_department_id', isPinned: 'is_pinned', isActive: 'is_active', publishedAt: 'published_at', expiresAt: 'expires_at',
  attachments: 'attachments',
};

async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const before = (await client.query('SELECT * FROM company_notices WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!before) throw notFound('Không tìm thấy thông báo');
    if (body.targetDepartmentId) await assertDepartment(client, body.targetDepartmentId);

    const published = new Date(body.publishedAt ?? before.published_at);
    const expires = body.expiresAt === undefined ? before.expires_at : body.expiresAt;
    if (expires && new Date(expires) <= published) throw badRequest('Thời điểm hết hạn phải sau thời điểm đăng');

    const sets = [];
    const params = [id];
    for (const [key, column] of Object.entries(COLUMNS)) {
      if (body[key] !== undefined) {
        if (key === 'attachments') {
          params.push(JSON.stringify(body[key] || []));
          sets.push(`${column} = $${params.length}::jsonb`);
        } else {
          params.push(body[key]);
          sets.push(`${column} = $${params.length}${key === 'category' ? '::notice_category_enum' : ''}`);
        }
      }
    }
    await client.query(`UPDATE company_notices SET ${sets.join(', ')} WHERE id = $1`, params);

    // Also update notification if exists
    if (body.title || body.content || body.priority || body.attachments) {
      await client.query(`
        UPDATE notifications 
        SET title = COALESCE($2, title),
            summary = COALESCE($3, summary),
            priority = COALESCE($4, priority)
        WHERE id = $1
      `, [
        `NOTIF-${id}`,
        body.title || null,
        body.content ? body.content.slice(0, 160) + (body.content.length > 160 ? '...' : '') : null,
        body.priority === 'high' ? 'urgent' : (body.priority ? 'medium' : null)
      ]);
    }

    await writeAudit(client, {
      user: actor, action: 'UPDATE_NOTICE', table: 'company_notices', recordId: id, req,
      oldValues: { title: before.title, is_pinned: before.is_pinned, is_active: before.is_active }, newValues: body,
    });
    return (await client.query(`${SELECT} WHERE n.id = $1`, [id])).rows[0];
  });
}

async function remove(actor, id, req) {
  return db.withTransaction(async (client) => {
    const res = await client.query('DELETE FROM company_notices WHERE id = $1 RETURNING title', [id]);
    if (res.rowCount === 0) throw notFound('Không tìm thấy thông báo');
    await client.query('DELETE FROM notification_reads WHERE notification_id = $1', [`NOTIF-${id}`]);
    await client.query('DELETE FROM notifications WHERE id = $1', [`NOTIF-${id}`]);
    await writeAudit(client, { user: actor, action: 'DELETE_NOTICE', table: 'company_notices', recordId: id, req, oldValues: { title: res.rows[0].title } });
  });
}

async function getReaders(actor, id) {
  const notice = (await db.query('SELECT * FROM company_notices WHERE id = $1', [id])).rows[0];
  if (!notice) throw notFound('Không tìm thấy thông báo');

  const where = ["e.status IN ('DANG_LAM_VIEC', 'THU_VIEC')"];
  const params = [];
  if (notice.target_role) {
    params.push(notice.target_role);
    where.push(`u.role_code = $${params.length}::role_code_enum`);
  }
  if (notice.target_department_id) {
    params.push(notice.target_department_id);
    where.push(`e.department_id = $${params.length}`);
  }

  const targetedEmployeesQuery = `
    SELECT e.id, e.full_name, e.job_title, e.avatar_url, d.name AS department_name, u.id AS user_id, u.email
    FROM employees e
    JOIN users u ON u.employee_id = e.id
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE ${where.join(' AND ')}
    ORDER BY e.full_name ASC
  `;
  const targetedEmployees = (await db.query(targetedEmployeesQuery, params)).rows;

  const notifId = `NOTIF-${id}`;
  const readsQuery = `
    SELECT r.user_id, r.read_at
    FROM notification_reads r
    WHERE r.notification_id = $1
  `;
  const reads = (await db.query(readsQuery, [notifId])).rows;
  const readMap = new Map(reads.map(r => [r.user_id, r.read_at]));

  const readers = [];
  const unread = [];

  for (const emp of targetedEmployees) {
    if (readMap.has(emp.user_id)) {
      readers.push({
        ...emp,
        read_at: readMap.get(emp.user_id)
      });
    } else {
      unread.push(emp);
    }
  }

  const totalTargeted = targetedEmployees.length;
  const readCount = readers.length;
  const readPercent = totalTargeted > 0 ? Math.round((readCount / totalTargeted) * 100) : 0;

  return {
    noticeId: id,
    noticeTitle: notice.title,
    totalTargeted,
    readCount,
    readPercent,
    readers,
    unread
  };
}

async function remindUnread(actor, id, req) {
  const report = await getReaders(actor, id);
  if (report.unread.length === 0) {
    return { sentCount: 0, message: 'Tất cả nhân sự mục tiêu đều đã đọc thông báo này' };
  }

  return db.withTransaction(async (client) => {
    let sent = 0;
    const me = actor.employeeId
      ? (await client.query('SELECT full_name, avatar_url, job_title FROM employees WHERE id = $1', [actor.employeeId])).rows[0]
      : null;
    const senderName = me?.full_name || (actor.roleCode === 'CEO' ? 'Lê Vũ Ngọc Duy' : 'Trần Mai Hương');
    const senderRole = me?.job_title || (actor.roleCode === 'CEO' ? 'Tổng Giám Đốc' : 'Giám Đốc Nhân Sự');
    const senderAvatar = me?.avatar_url || (actor.roleCode === 'CEO'
      ? 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
      : 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150');

    for (const target of report.unread) {
      const notifId = `REMIND-${id}-${target.id}-${Date.now().toString().slice(-4)}`;
      await client.query(`
        INSERT INTO notifications (
          id, user_id, type, category, title, summary, sender_name, sender_role, sender_avatar,
          priority, is_read, action_type, action_payload, created_at
        ) VALUES ($1, $2, 'ceo_directive', 'Nhắc nhở chỉ đạo', $3, $4, $5, $6, $7, 'urgent', false, 'notice_popup', $8, NOW())
      `, [
        notifId,
        target.user_id,
        `[NHẮC NHỞ] Bạn chưa đọc: ${report.noticeTitle}`,
        `Ban Lãnh Đạo yêu cầu bạn hoàn tất đọc văn bản chỉ đạo "${report.noticeTitle}". Vui lòng bấm vào để xem chi tiết ngay.`,
        senderName,
        senderRole,
        senderAvatar,
        JSON.stringify({
          id,
          title: report.noticeTitle,
          isReminder: true
        })
      ]);
      sent++;
    }

    await writeAudit(client, {
      user: actor, action: 'REMIND_NOTICE_UNREAD', table: 'company_notices', recordId: id, req,
      newValues: { unreadCount: report.unread.length, sentCount: sent }
    });

    return { sentCount: sent, message: `Đã gửi thông báo nhắc nhở hỏa tốc tới ${sent} nhân sự chưa đọc` };
  });
}

module.exports = { list, get, create, update, remove, getReaders, remindUnread };
