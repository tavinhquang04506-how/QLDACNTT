const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../config/db');
const { AppError, badRequest, forbidden, notFound } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { MAX_ATTACHMENT_BYTES } = require('./schema');

const HR_ROLES = ['CEO', 'HR_DIRECTOR'];
const SELECT = 'SELECT n.*, a.full_name AS author_name FROM company_notices n LEFT JOIN employees a ON a.id = n.author_id';

const STORAGE_DIR = path.join(__dirname, '../../../storage/notice_attachments');

const ALLOWED_EXTENSIONS = new Map([
  ['.pdf', 'application/pdf'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
]);

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function sanitizeFileName(rawName = '') {
  const base = path.basename(String(rawName || '').trim()).replace(/[\r\n"\\<>|?*]/g, '_');
  return base || 'tai_lieu_dinh_kem.txt';
}

function formatSizeLabel(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getAttachmentPaths(attachmentId) {
  const safeId = path.basename(String(attachmentId || '').trim());
  if (!/^NATT-[A-Za-z0-9-]+$/.test(safeId)) {
    return null;
  }
  return {
    id: safeId,
    binPath: path.join(STORAGE_DIR, `${safeId}.bin`),
    metaPath: path.join(STORAGE_DIR, `${safeId}.meta.json`),
  };
}

function readAttachmentMeta(attachmentId) {
  const paths = getAttachmentPaths(attachmentId);
  if (!paths || !fs.existsSync(paths.metaPath) || !fs.existsSync(paths.binPath)) {
    return null;
  }
  try {
    const meta = JSON.parse(fs.readFileSync(paths.metaPath, 'utf8'));
    return { ...meta, ...paths };
  } catch (_err) {
    return null;
  }
}

function deleteAttachmentFiles(attachmentId) {
  const paths = getAttachmentPaths(attachmentId);
  if (!paths) return false;
  let removed = false;
  for (const p of [paths.binPath, paths.metaPath]) {
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        removed = true;
      } catch (_e) {}
    }
  }
  return removed;
}

function cleanupExpiredOrphanAttachments(maxAgeMs = 2 * 60 * 60 * 1000) {
  ensureStorageDir();
  const now = Date.now();
  try {
    const files = fs.readdirSync(STORAGE_DIR);
    for (const file of files) {
      if (!file.endsWith('.meta.json')) continue;
      const metaFull = path.join(STORAGE_DIR, file);
      try {
        const meta = JSON.parse(fs.readFileSync(metaFull, 'utf8'));
        const createdAtMs = meta.createdAt ? Date.parse(meta.createdAt) : 0;
        if (!meta.noticeId && createdAtMs > 0 && now - createdAtMs > maxAgeMs) {
          deleteAttachmentFiles(meta.id);
        }
      } catch (_e) {}
    }
  } catch (_e) {}
}

function normalizeNoticeRowAttachments(row) {
  if (!row) return row;
  let rawList = [];
  if (Array.isArray(row.attachments)) {
    rawList = row.attachments;
  } else if (typeof row.attachments === 'string') {
    try {
      const parsed = JSON.parse(row.attachments);
      if (Array.isArray(parsed)) rawList = parsed;
    } catch (_e) {}
  }

  const normalized = rawList.map((att) => {
    if (!att || typeof att !== 'object') {
      return {
        id: 'legacy-unknown',
        name: 'Tệp đính kèm cũ',
        size: '',
        type: 'application/octet-stream',
        url: null,
        content: null,
        available: false,
        legacyUnavailable: true,
        unavailableReason: 'Tệp đính kèm cũ không khả dụng — cần tải lên lại',
      };
    }

    const stored = readAttachmentMeta(att.id);
    if (stored) {
      return {
        id: stored.id,
        name: stored.originalName || att.name || 'tai_lieu',
        size: stored.sizeLabel || att.size || formatSizeLabel(stored.sizeBytes || 0),
        sizeBytes: stored.sizeBytes,
        type: stored.mimeType || att.type || 'application/octet-stream',
        sha256: stored.sha256,
        url: `/api/notices/${row.id}/attachments/${stored.id}/download`,
        available: true,
        legacyUnavailable: false,
      };
    }

    // Legacy blob: / example.com / missing file on disk: report honestly, never synthesize fake file content
    return {
      id: att.id || 'legacy',
      name: att.name || 'Tệp đính kèm cũ',
      size: att.size || '',
      type: att.type || 'application/octet-stream',
      url: null,
      content: null,
      available: false,
      legacyUnavailable: true,
      unavailableReason: 'Tệp đính kèm cũ không khả dụng — cần tải lên lại',
    };
  });

  return {
    ...row,
    attachments: normalized,
  };
}

async function uploadAttachment(actor, body) {
  ensureStorageDir();
  cleanupExpiredOrphanAttachments();

  const cleanName = sanitizeFileName(body.name);
  const ext = path.extname(cleanName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw badRequest(
      `Định dạng tệp "${ext || 'không xác định'}" không được hỗ trợ. Chỉ chấp nhận: ${Array.from(ALLOWED_EXTENSIONS.keys()).join(', ')}`
    );
  }

  if (body.sizeBytes !== undefined && Number(body.sizeBytes) > MAX_ATTACHMENT_BYTES) {
    throw new AppError(
      413,
      'ATTACHMENT_TOO_LARGE',
      `Dung lượng tệp vượt quá giới hạn tối đa cho phép (${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB)`
    );
  }

  const rawBase64 = String(body.contentBase64 || '')
    .replace(/^data:[^;]+;base64,/i, '')
    .trim();
  if (!rawBase64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(rawBase64)) {
    throw badRequest('Dữ liệu tệp tải lên (base64) không hợp lệ');
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  if (buffer.length === 0) {
    throw badRequest('Không thể tải lên tệp rỗng (0 byte)');
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new AppError(
      413,
      'ATTACHMENT_TOO_LARGE',
      `Dung lượng tệp vượt quá giới hạn tối đa cho phép (${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB)`
    );
  }

  const canonicalMime = ALLOWED_EXTENSIONS.get(ext);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const id = `NATT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const sizeLabel = formatSizeLabel(buffer.length);
  const paths = getAttachmentPaths(id);

  const meta = {
    id,
    originalName: cleanName,
    mimeType: canonicalMime,
    sizeBytes: buffer.length,
    sizeLabel,
    sha256,
    uploadedByUserId: actor.userId,
    uploadedByEmployeeId: actor.employeeId || null,
    createdAt: new Date().toISOString(),
    noticeId: null,
  };

  fs.writeFileSync(paths.binPath, buffer);
  fs.writeFileSync(paths.metaPath, JSON.stringify(meta, null, 2), 'utf8');

  return {
    id,
    name: cleanName,
    size: sizeLabel,
    sizeBytes: buffer.length,
    type: canonicalMime,
    sha256,
    available: true,
    legacyUnavailable: false,
  };
}

async function deleteAttachment(actor, attachmentId) {
  const stored = readAttachmentMeta(attachmentId);
  if (!stored) {
    throw notFound('Không tìm thấy tệp đính kèm tạm thời trên máy chủ');
  }
  if (stored.noticeId) {
    const { rows } = await db.query('SELECT id, attachments FROM company_notices WHERE id = $1', [
      stored.noticeId,
    ]);
    if (rows[0]) {
      const attList = Array.isArray(rows[0].attachments) ? rows[0].attachments : [];
      if (attList.some((a) => a && a.id === attachmentId)) {
        throw badRequest('Tệp đang được gắn với văn bản thông báo đã phát hành; vui lòng gỡ tệp và lưu cập nhật thông báo.');
      }
    }
  }
  deleteAttachmentFiles(attachmentId);
  return { deleted: true, id: attachmentId };
}

function bindVerifiedAttachmentsToNotice(noticeId, inputAttachments = []) {
  const verified = [];
  const seenIds = new Set();
  for (const item of inputAttachments || []) {
    if (!item || !item.id) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);

    const stored = readAttachmentMeta(item.id);
    if (!stored) {
      throw badRequest(
        `Tệp đính kèm "${item.name || item.id}" không tồn tại trên máy chủ hoặc chưa tải lên hoàn tất.`
      );
    }
    if (stored.noticeId && stored.noticeId !== noticeId) {
      throw badRequest(`Tệp đính kèm "${stored.originalName}" đã được gắn với một thông báo khác.`);
    }

    const updatedMeta = {
      id: stored.id,
      originalName: stored.originalName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      sizeLabel: stored.sizeLabel,
      sha256: stored.sha256,
      uploadedByUserId: stored.uploadedByUserId,
      uploadedByEmployeeId: stored.uploadedByEmployeeId,
      createdAt: stored.createdAt,
      noticeId,
    };
    fs.writeFileSync(stored.metaPath, JSON.stringify(updatedMeta, null, 2), 'utf8');

    verified.push({
      id: stored.id,
      name: stored.originalName,
      size: stored.sizeLabel,
      sizeBytes: stored.sizeBytes,
      type: stored.mimeType,
      sha256: stored.sha256,
      url: `/api/notices/${noticeId}/attachments/${stored.id}/download`,
      available: true,
    });
  }
  return verified;
}

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
  return {
    data: rows.map(normalizeNoticeRowAttachments),
    pagination: paginationMeta(total, page, limit),
  };
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
  return normalizeNoticeRowAttachments(rows[0]);
}

async function downloadAttachment(user, noticeId, attachmentId) {
  const noticeRes = await db.query(`${SELECT} WHERE n.id = $1`, [noticeId]);
  const notice = noticeRes.rows[0];
  if (!notice) {
    throw notFound('Không tìm thấy thông báo');
  }

  if (!HR_ROLES.includes(user.roleCode)) {
    const userDept = await departmentOf(user);
    const scopeCheck = await db.query(
      `SELECT 1 FROM company_notices n WHERE n.id = $1 AND ${audiencePredicate('$2', '$3')}`,
      [noticeId, user.roleCode, userDept]
    );
    if (scopeCheck.rowCount === 0) {
      throw forbidden('Bạn không thuộc phạm vi đối tượng nhận của thông báo này nên không có quyền tải tệp đính kèm.');
    }
  }

  const normalized = normalizeNoticeRowAttachments(notice);
  const attEntry = (normalized.attachments || []).find((a) => a && a.id === attachmentId);
  if (!attEntry) {
    throw notFound('Tệp đính kèm không thuộc về thông báo này');
  }
  if (!attEntry.available || attEntry.legacyUnavailable) {
    throw notFound('Tệp đính kèm cũ không khả dụng — cần tải lên lại');
  }

  const stored = readAttachmentMeta(attachmentId);
  if (!stored) {
    throw notFound('Không tìm thấy dữ liệu tệp đính kèm trên máy chủ');
  }

  const buffer = fs.readFileSync(stored.binPath);
  return {
    buffer,
    fileName: stored.originalName,
    mimeType: stored.mimeType || 'application/octet-stream',
    sizeBytes: buffer.length,
    sha256: stored.sha256,
  };
}

async function assertDepartment(client, id) {
  const { rows } = await client.query('SELECT 1 FROM departments WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound('Không tìm thấy phòng ban');
}

async function create(actor, body, req) {
  return db.withTransaction(async (client) => {
    if (body.targetDepartmentId) await assertDepartment(client, body.targetDepartmentId);

    // Pre-validate that all referenced attachments exist on disk before inserting
    for (const item of body.attachments || []) {
      const stored = readAttachmentMeta(item.id);
      if (!stored) {
        throw badRequest(`Tệp đính kèm "${item.name || item.id}" không tồn tại trên máy chủ hoặc chưa được tải lên hợp lệ.`);
      }
      if (stored.noticeId) {
        throw badRequest(`Tệp đính kèm "${stored.originalName}" đã được gắn với một thông báo khác.`);
      }
    }

    const { rows } = await client.query(
      `INSERT INTO company_notices (title, content, category, priority, author_id, target_role, target_department_id, is_pinned, published_at, expires_at, attachments)
       VALUES ($1, $2, $3::notice_category_enum, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), $10, '[]'::jsonb) RETURNING id`,
      [body.title, body.content, body.category, body.priority, actor.employeeId ?? null, body.targetRole ?? null,
        body.targetDepartmentId ?? null, body.isPinned, body.publishedAt ?? null, body.expiresAt ?? null]
    );
    const noticeId = rows[0].id;

    const verifiedAttachments = bindVerifiedAttachmentsToNotice(noticeId, body.attachments || []);
    await client.query(
      `UPDATE company_notices SET attachments = $2::jsonb WHERE id = $1`,
      [noticeId, JSON.stringify(verifiedAttachments)]
    );

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
        attachments: verifiedAttachments,
        date: new Date().toLocaleDateString('vi-VN'),
        signer: `${senderName} - ${senderRole}`,
        docNumber: `Số: ${noticeId}/2026/TB-NEXUS`,
      }),
    ]);

    await writeAudit(client, {
      user: actor, action: 'CREATE_NOTICE', table: 'company_notices', recordId: noticeId, req,
      newValues: {
        title: body.title,
        category: body.category,
        target_role: body.targetRole ?? null,
        target_department_id: body.targetDepartmentId ?? null,
        attachmentIds: verifiedAttachments.map((a) => a.id),
      },
    });
    const createdRow = (await client.query(`${SELECT} WHERE n.id = $1`, [noticeId])).rows[0];
    return normalizeNoticeRowAttachments(createdRow);
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

    let verifiedAttachments = undefined;
    if (body.attachments !== undefined) {
      verifiedAttachments = bindVerifiedAttachmentsToNotice(id, body.attachments || []);
    }

    const sets = [];
    const params = [id];
    for (const [key, column] of Object.entries(COLUMNS)) {
      if (body[key] !== undefined) {
        if (key === 'attachments') {
          params.push(JSON.stringify(verifiedAttachments || []));
          sets.push(`${column} = $${params.length}::jsonb`);
        } else {
          params.push(body[key]);
          sets.push(`${column} = $${params.length}${key === 'category' ? '::notice_category_enum' : ''}`);
        }
      }
    }
    await client.query(`UPDATE company_notices SET ${sets.join(', ')} WHERE id = $1`, params);

    // Clean up any previously attached NATT-* files that were removed during this update
    if (verifiedAttachments !== undefined) {
      const prevAttachments = Array.isArray(before.attachments) ? before.attachments : [];
      const newIdSet = new Set(verifiedAttachments.map((a) => a.id));
      for (const prevAtt of prevAttachments) {
        if (prevAtt?.id && /^NATT-/.test(prevAtt.id) && !newIdSet.has(prevAtt.id)) {
          deleteAttachmentFiles(prevAtt.id);
        }
      }
    }

    const updatedNotice = (await client.query(`${SELECT} WHERE n.id = $1`, [id])).rows[0];
    const normalizedUpdated = normalizeNoticeRowAttachments(updatedNotice);

    // Also update notification if exists
    if (body.title || body.content || body.priority || body.attachments !== undefined) {
      const existingNotifRes = await client.query('SELECT action_payload FROM notifications WHERE id = $1', [`NOTIF-${id}`]);
      let updatedPayload = null;
      if (existingNotifRes.rows[0]?.action_payload) {
        const rawPayload = existingNotifRes.rows[0].action_payload;
        const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
        updatedPayload = JSON.stringify({
          ...parsed,
          title: normalizedUpdated.title,
          content: normalizedUpdated.content,
          category: normalizedUpdated.category,
          priority: normalizedUpdated.priority,
          attachments: normalizedUpdated.attachments || [],
        });
      }
      await client.query(`
        UPDATE notifications 
        SET title = COALESCE($2, title),
            summary = COALESCE($3, summary),
            priority = COALESCE($4, priority),
            action_payload = COALESCE($5::jsonb, action_payload)
        WHERE id = $1
      `, [
        `NOTIF-${id}`,
        body.title || null,
        body.content ? body.content.slice(0, 160) + (body.content.length > 160 ? '...' : '') : null,
        body.priority === 'high' ? 'urgent' : (body.priority ? 'medium' : null),
        updatedPayload,
      ]);
    }

    await writeAudit(client, {
      user: actor, action: 'UPDATE_NOTICE', table: 'company_notices', recordId: id, req,
      oldValues: { title: before.title, is_pinned: before.is_pinned, is_active: before.is_active }, newValues: body,
    });
    return normalizedUpdated;
  });
}

async function remove(actor, id, req) {
  return db.withTransaction(async (client) => {
    const res = await client.query('DELETE FROM company_notices WHERE id = $1 RETURNING title, attachments', [id]);
    if (res.rowCount === 0) throw notFound('Không tìm thấy thông báo');
    const oldAttachments = Array.isArray(res.rows[0].attachments) ? res.rows[0].attachments : [];
    for (const att of oldAttachments) {
      if (att?.id && /^NATT-/.test(att.id)) {
        deleteAttachmentFiles(att.id);
      }
    }
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

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  getReaders,
  remindUnread,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
  normalizeNoticeRowAttachments,
};
