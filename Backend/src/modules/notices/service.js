const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const db = require('../../config/db');
const { AppError, badRequest, forbidden, notFound } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { MAX_ATTACHMENT_BYTES } = require('./schema');

const HR_ROLES = ['CEO', 'HR_DIRECTOR'];
const SELECT = 'SELECT n.*, a.full_name AS author_name FROM company_notices n LEFT JOIN employees a ON a.id = n.author_id';

const PROD_DEFAULT_STORAGE_DIR = path.resolve(__dirname, '../../../storage/notice_attachments');
const TEST_DEFAULT_STORAGE_DIR = path.join(
  os.tmpdir(),
  `nexus-hrms-notice-attachments-test-${process.pid}`
);

// In-process concurrency lock set preventing two requests from binding/deleting the same attachment simultaneously
const inFlightAttachmentLocks = new Set();

function isSubPathOrEqual(candidatePath, basePath) {
  const rel = path.relative(path.resolve(basePath), path.resolve(candidatePath));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function assertSafeStorageDir(targetDir) {
  const resolved = path.resolve(targetDir);
  if (process.env.NODE_ENV === 'test' && isSubPathOrEqual(resolved, PROD_DEFAULT_STORAGE_DIR)) {
    throw new Error(
      `UNSAFE_TEST_STORAGE_PATH: Tests are forbidden from reading/writing/cleaning production attachment storage (${resolved})`
    );
  }
  return resolved;
}

function getStorageDir() {
  const explicitDir =
    process.env.NOTICE_ATTACHMENTS_DIR ||
    (process.env.STORAGE_ROOT
      ? path.join(process.env.STORAGE_ROOT, 'notice_attachments')
      : null);

  if (process.env.NODE_ENV === 'test') {
    const testDir = explicitDir || process.env.TEST_NOTICE_ATTACHMENTS_DIR || TEST_DEFAULT_STORAGE_DIR;
    return assertSafeStorageDir(testDir);
  }

  return path.resolve(explicitDir || PROD_DEFAULT_STORAGE_DIR);
}

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
  const dir = getStorageDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function cleanupTestStorageDir() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('cleanupTestStorageDir is only allowed when NODE_ENV === "test"');
  }
  const dir = assertSafeStorageDir(getStorageDir());
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function acquireAttachmentLocks(attachmentIds = []) {
  const uniqueIds = Array.from(
    new Set(
      (attachmentIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => /^NATT-[A-Za-z0-9-]+$/.test(id))
    )
  );
  for (const id of uniqueIds) {
    if (inFlightAttachmentLocks.has(id)) {
      throw new AppError(
        409,
        'ATTACHMENT_CONCURRENT_CONFLICT',
        `Tệp đính kèm "${id}" đang được xử lý bởi một giao dịch khác. Vui lòng thử lại.`
      );
    }
  }
  for (const id of uniqueIds) {
    inFlightAttachmentLocks.add(id);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const id of uniqueIds) {
      inFlightAttachmentLocks.delete(id);
    }
  };
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
  const storageDir = getStorageDir();
  return {
    id: safeId,
    binPath: path.join(storageDir, `${safeId}.bin`),
    metaPath: path.join(storageDir, `${safeId}.meta.json`),
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

function writeAttachmentMetaRaw(metaPath, metaObj) {
  const cleanMeta = { ...metaObj };
  delete cleanMeta.binPath;
  delete cleanMeta.metaPath;
  fs.writeFileSync(metaPath, JSON.stringify(cleanMeta, null, 2), 'utf8');
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
  const storageDir = ensureStorageDir();
  const now = Date.now();
  try {
    const files = fs.readdirSync(storageDir);
    for (const file of files) {
      if (!file.endsWith('.meta.json')) continue;
      const metaFull = path.join(storageDir, file);
      try {
        const meta = JSON.parse(fs.readFileSync(metaFull, 'utf8'));
        if (inFlightAttachmentLocks.has(meta.id)) continue;
        const createdAtMs = meta.createdAt ? Date.parse(meta.createdAt) : 0;
        if (
          (!meta.noticeId || meta.state === 'staged') &&
          meta.state !== 'bound' &&
          meta.state !== 'deletion-pending' &&
          createdAtMs > 0 &&
          now - createdAtMs > maxAgeMs
        ) {
          deleteAttachmentFiles(meta.id);
        }
      } catch (_e) {}
    }
  } catch (_e) {}
}

/**
 * R43: Idempotent reconciliation between PostgreSQL `company_notices.attachments` and filesystem metadata.
 * - Any `deletion-pending` file that is no longer referenced in DB is physically deleted.
 * - Any `deletion-pending` file that IS still referenced in DB (e.g. after an unclean crash before commit) is restored to `bound`.
 */
async function reconcileAttachmentStorage(executor = db) {
  const storageDir = ensureStorageDir();
  const actions = { deleted: [], restored: [] };
  let files = [];
  try {
    files = fs.readdirSync(storageDir);
  } catch (_e) {
    return actions;
  }

  for (const file of files) {
    if (!file.endsWith('.meta.json')) continue;
    const metaFull = path.join(storageDir, file);
    try {
      const meta = JSON.parse(fs.readFileSync(metaFull, 'utf8'));
      if (!meta?.id || inFlightAttachmentLocks.has(meta.id)) continue;

      if (meta.state === 'deletion-pending') {
        let stillReferenced = false;
        if (meta.noticeId) {
          const { rows } = await executor.query(
            'SELECT attachments FROM company_notices WHERE id = $1',
            [meta.noticeId]
          );
          if (rows[0] && Array.isArray(rows[0].attachments)) {
            stillReferenced = rows[0].attachments.some((a) => a && a.id === meta.id);
          }
        }
        if (stillReferenced) {
          writeAttachmentMetaRaw(metaFull, {
            ...meta,
            state: 'bound',
            deletionPendingAt: undefined,
          });
          actions.restored.push(meta.id);
        } else {
          deleteAttachmentFiles(meta.id);
          actions.deleted.push(meta.id);
        }
      }
    } catch (_e) {}
  }
  return actions;
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
    state: 'staged',
    noticeId: null,
  };

  fs.writeFileSync(paths.binPath, buffer);
  writeAttachmentMetaRaw(paths.metaPath, meta);

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
  const releaseLock = acquireAttachmentLocks([attachmentId]);
  try {
    const stored = readAttachmentMeta(attachmentId);
    if (!stored) {
      throw notFound('Không tìm thấy tệp đính kèm tạm thời trên máy chủ');
    }
    if (
      stored.uploadedByUserId &&
      actor?.userId &&
      String(stored.uploadedByUserId) !== String(actor.userId)
    ) {
      throw forbidden('Bạn không phải người tải lên tệp đính kèm tạm thời này nên không có quyền xóa.');
    }
    if (stored.noticeId) {
      const { rows } = await db.query('SELECT id, attachments FROM company_notices WHERE id = $1', [
        stored.noticeId,
      ]);
      if (rows[0]) {
        const attList = Array.isArray(rows[0].attachments) ? rows[0].attachments : [];
        if (attList.some((a) => a && a.id === attachmentId)) {
          throw badRequest(
            'Tệp đang được gắn với văn bản thông báo đã phát hành; vui lòng gỡ tệp và lưu cập nhật thông báo.'
          );
        }
      }
    }
    deleteAttachmentFiles(attachmentId);
    return { deleted: true, id: attachmentId };
  } finally {
    releaseLock();
  }
}

/**
 * R43: Validate & prepare attachment metadata for binding to `noticeId` WITHOUT mutating `.meta.json`
 * on disk before the database transaction commits.
 * Enforces ownership (`uploadedByUserId === actor.userId`) for newly staged attachments.
 */
function prepareVerifiedAttachmentsForNotice(actor, noticeId, inputAttachments = []) {
  const verified = [];
  const seenIds = new Set();
  for (const item of inputAttachments || []) {
    if (!item || !item.id) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);

    const stored = readAttachmentMeta(item.id);
    if (!stored || stored.state === 'deletion-pending') {
      throw badRequest(
        `Tệp đính kèm "${item.name || item.id}" không tồn tại trên máy chủ hoặc chưa tải lên hoàn tất.`
      );
    }
    if (stored.noticeId && stored.noticeId !== noticeId) {
      throw badRequest(`Tệp đính kèm "${stored.originalName}" đã được gắn với một thông báo khác.`);
    }
    if (
      !stored.noticeId &&
      stored.uploadedByUserId &&
      actor?.userId &&
      String(stored.uploadedByUserId) !== String(actor.userId)
    ) {
      throw forbidden(
        `Tệp đính kèm "${stored.originalName}" thuộc phiên tải lên của tài khoản khác nên không thể gắn vào thông báo.`
      );
    }

    verified.push({
      id: stored.id,
      name: stored.originalName,
      size: stored.sizeLabel,
      sizeBytes: stored.sizeBytes,
      type: stored.mimeType,
      sha256: stored.sha256,
      url: noticeId ? `/api/notices/${noticeId}/attachments/${stored.id}/download` : null,
      available: true,
    });
  }
  return verified;
}

function commitBoundAttachmentsToDisk(noticeId, verifiedAttachments = []) {
  for (const item of verifiedAttachments || []) {
    const stored = readAttachmentMeta(item.id);
    if (!stored) continue;
    writeAttachmentMetaRaw(stored.metaPath, {
      ...stored,
      state: 'bound',
      noticeId,
      boundAt: stored.boundAt || new Date().toISOString(),
    });
  }
}

function markAttachmentsDeletionPending(attachmentIds = []) {
  const snapshots = new Map();
  for (const id of attachmentIds) {
    const stored = readAttachmentMeta(id);
    if (!stored) continue;
    snapshots.set(id, { ...stored });
    writeAttachmentMetaRaw(stored.metaPath, {
      ...stored,
      state: 'deletion-pending',
      deletionPendingAt: new Date().toISOString(),
    });
  }
  return snapshots;
}

function restoreAttachmentMetaSnapshots(snapshots) {
  if (!snapshots || snapshots.size === 0) return;
  for (const [, meta] of snapshots.entries()) {
    if (meta?.metaPath && fs.existsSync(meta.binPath)) {
      try {
        writeAttachmentMetaRaw(meta.metaPath, meta);
      } catch (_e) {}
    }
  }
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

async function create(actor, body, req, options = {}) {
  const executor = options.executor || db;
  const inputAttIds = (body.attachments || []).map((a) => a?.id).filter(Boolean);
  const releaseLocks = acquireAttachmentLocks(inputAttIds);

  let committedNoticeId = null;
  let committedAttachments = [];

  try {
    // Pre-validate ownership and staged status before opening DB transaction
    prepareVerifiedAttachmentsForNotice(actor, null, body.attachments || []);

    const createdRow = await executor.withTransaction(async (client) => {
      if (body.targetDepartmentId) await assertDepartment(client, body.targetDepartmentId);

      const { rows } = await client.query(
        `INSERT INTO company_notices (title, content, category, priority, author_id, target_role, target_department_id, is_pinned, published_at, expires_at, attachments)
         VALUES ($1, $2, $3::notice_category_enum, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), $10, '[]'::jsonb) RETURNING id`,
        [
          body.title,
          body.content,
          body.category,
          body.priority,
          actor.employeeId ?? null,
          body.targetRole ?? null,
          body.targetDepartmentId ?? null,
          body.isPinned,
          body.publishedAt ?? null,
          body.expiresAt ?? null,
        ]
      );
      const noticeId = rows[0].id;
      const verifiedAttachments = prepareVerifiedAttachmentsForNotice(
        actor,
        noticeId,
        body.attachments || []
      );

      await client.query(`UPDATE company_notices SET attachments = $2::jsonb WHERE id = $1`, [
        noticeId,
        JSON.stringify(verifiedAttachments),
      ]);

      // Get author details for notification
      const authorRes = actor.employeeId
        ? await client.query('SELECT full_name, avatar_url, job_title FROM employees WHERE id = $1', [
            actor.employeeId,
          ])
        : null;
      const author = authorRes?.rows[0];
      const senderName =
        author?.full_name || (actor.roleCode === 'CEO' ? 'Lê Vũ Ngọc Duy' : 'Trần Mai Hương');
      const senderRole =
        author?.job_title || (actor.roleCode === 'CEO' ? 'Tổng Giám Đốc' : 'Giám Đốc Nhân Sự');
      const senderAvatar =
        author?.avatar_url ||
        (actor.roleCode === 'CEO'
          ? 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
          : 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150');

      // R42: Store only reference metadata in `notifications` (never duplicate full content or attachment metadata in notifications table)
      const notifId = `NOTIF-${noticeId}`;
      await client.query(
        `INSERT INTO notifications (
          id, role_target, type, category, title, summary, sender_name, sender_role, sender_avatar,
          priority, is_read, action_type, action_payload, created_at
        ) VALUES ($1, $2, $3::notification_type_enum, $4, $5, NULL, $6, $7, $8, $9, false, $10, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
          role_target = EXCLUDED.role_target,
          title = EXCLUDED.title,
          summary = NULL,
          priority = EXCLUDED.priority,
          action_payload = EXCLUDED.action_payload`,
        [
          notifId,
          body.targetRole ?? null,
          body.priority === 'high' ? 'ceo_directive' : 'system',
          'Thông báo công ty',
          body.title,
          senderName,
          senderRole,
          senderAvatar,
          body.priority === 'high' ? 'urgent' : 'medium',
          'notice_popup',
          JSON.stringify({
            id: noticeId,
            date: new Date().toLocaleDateString('vi-VN'),
            signer: `${senderName} - ${senderRole}`,
            docNumber: `Số: ${noticeId}/2026/TB-NEXUS`,
          }),
        ]
      );

      if (typeof options.beforeAuditHook === 'function') {
        await options.beforeAuditHook(client, noticeId);
      }

      await writeAudit(client, {
        user: actor,
        action: 'CREATE_NOTICE',
        table: 'company_notices',
        recordId: noticeId,
        req,
        newValues: {
          title: body.title,
          category: body.category,
          target_role: body.targetRole ?? null,
          target_department_id: body.targetDepartmentId ?? null,
          attachmentIds: verifiedAttachments.map((a) => a.id),
        },
      });

      if (typeof options.beforeCommitHook === 'function') {
        await options.beforeCommitHook(client, noticeId);
      }

      committedNoticeId = noticeId;
      committedAttachments = verifiedAttachments;
      return (await client.query(`${SELECT} WHERE n.id = $1`, [noticeId])).rows[0];
    });

    // R43: Only bind `.meta.json` on disk AFTER the database transaction has committed
    commitBoundAttachmentsToDisk(committedNoticeId, committedAttachments);
    return normalizeNoticeRowAttachments(createdRow);
  } finally {
    releaseLocks();
  }
}

const COLUMNS = {
  title: 'title', content: 'content', category: 'category', priority: 'priority', targetRole: 'target_role',
  targetDepartmentId: 'target_department_id', isPinned: 'is_pinned', isActive: 'is_active', publishedAt: 'published_at', expiresAt: 'expires_at',
  attachments: 'attachments',
};

async function update(actor, id, body, req, options = {}) {
  const executor = options.executor || db;
  const inputAttIds = (body.attachments || []).map((a) => a?.id).filter(Boolean);
  const releaseInputLocks = acquireAttachmentLocks(inputAttIds);
  let releaseExistingLocks = () => {};
  let pendingDeleteSnapshots = null;
  let removedAttachmentIds = [];
  let committedAttachments = undefined;

  try {
    const updatedNotice = await executor.withTransaction(async (client) => {
      const before = (await client.query('SELECT * FROM company_notices WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!before) throw notFound('Không tìm thấy thông báo');
      if (body.targetDepartmentId) await assertDepartment(client, body.targetDepartmentId);

      const published = new Date(body.publishedAt ?? before.published_at);
      const expires = body.expiresAt === undefined ? before.expires_at : body.expiresAt;
      if (expires && new Date(expires) <= published) {
        throw badRequest('Thời điểm hết hạn phải sau thời điểm đăng');
      }

      let verifiedAttachments = undefined;
      if (body.attachments !== undefined) {
        const prevAttachments = Array.isArray(before.attachments) ? before.attachments : [];
        const prevIdsToLock = prevAttachments
          .map((a) => a?.id)
          .filter((aid) => aid && !inputAttIds.includes(aid));
        releaseExistingLocks = acquireAttachmentLocks(prevIdsToLock);

        verifiedAttachments = prepareVerifiedAttachmentsForNotice(actor, id, body.attachments || []);
        const newIdSet = new Set(verifiedAttachments.map((a) => a.id));
        removedAttachmentIds = prevAttachments
          .map((a) => a?.id)
          .filter((aid) => aid && /^NATT-/.test(aid) && !newIdSet.has(aid));

        // R43: Stage removed attachments as `deletion-pending` without deleting `.bin` before commit
        pendingDeleteSnapshots = markAttachmentsDeletionPending(removedAttachmentIds);
        committedAttachments = verifiedAttachments;
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

      if (typeof options.afterNoticeUpdateHook === 'function') {
        await options.afterNoticeUpdateHook(client, id);
      }

      const currentRow = (await client.query(`${SELECT} WHERE n.id = $1`, [id])).rows[0];

      // R42: Synchronize `notifications` row metadata & role_target without storing duplicate content/attachments
      const existingNotifRes = await client.query(
        'SELECT action_payload, sender_name, sender_role FROM notifications WHERE id = $1',
        [`NOTIF-${id}`]
      );
      if (existingNotifRes.rows[0]) {
        const rawPayload = existingNotifRes.rows[0].action_payload;
        const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload || {};
        const minimalPayload = JSON.stringify({
          id,
          date:
            parsed.date ||
            (currentRow.published_at
              ? new Date(currentRow.published_at).toLocaleDateString('vi-VN')
              : new Date().toLocaleDateString('vi-VN')),
          signer:
            parsed.signer ||
            `${existingNotifRes.rows[0].sender_name || 'Ban Điều Hành'} - ${existingNotifRes.rows[0].sender_role || 'NEXUS'}`,
          docNumber: parsed.docNumber || `Số: ${id}/2026/TB-NEXUS`,
        });

        await client.query(
          `UPDATE notifications
           SET role_target = $2,
               title = $3,
               summary = NULL,
               priority = $4,
               action_payload = $5::jsonb
           WHERE id = $1`,
          [
            `NOTIF-${id}`,
            currentRow.target_role ?? null,
            currentRow.title,
            currentRow.priority === 'high' ? 'urgent' : 'medium',
            minimalPayload,
          ]
        );
      }

      if (typeof options.beforeAuditHook === 'function') {
        await options.beforeAuditHook(client, id);
      }

      await writeAudit(client, {
        user: actor,
        action: 'UPDATE_NOTICE',
        table: 'company_notices',
        recordId: id,
        req,
        oldValues: { title: before.title, is_pinned: before.is_pinned, is_active: before.is_active },
        newValues: body,
      });

      if (typeof options.beforeCommitHook === 'function') {
        await options.beforeCommitHook(client, id);
      }

      return currentRow;
    });

    // R43: Transaction committed! Now finalize newly bound metadata and physically delete removed files
    if (committedAttachments !== undefined) {
      commitBoundAttachmentsToDisk(id, committedAttachments);
      for (const remId of removedAttachmentIds) {
        deleteAttachmentFiles(remId);
      }
    }

    return normalizeNoticeRowAttachments(updatedNotice);
  } catch (err) {
    // R43: Transaction rolled back! Restore any `deletion-pending` metadata snapshots so old files remain bound and downloadable
    restoreAttachmentMetaSnapshots(pendingDeleteSnapshots);
    throw err;
  } finally {
    releaseExistingLocks();
    releaseInputLocks();
  }
}

async function remove(actor, id, req, options = {}) {
  const executor = options.executor || db;
  let releaseLocks = () => {};
  let pendingDeleteSnapshots = null;
  let attachmentIdsToRemove = [];

  try {
    await executor.withTransaction(async (client) => {
      const res = await client.query(
        'DELETE FROM company_notices WHERE id = $1 RETURNING title, attachments',
        [id]
      );
      if (res.rowCount === 0) throw notFound('Không tìm thấy thông báo');

      const oldAttachments = Array.isArray(res.rows[0].attachments) ? res.rows[0].attachments : [];
      attachmentIdsToRemove = oldAttachments
        .map((a) => a?.id)
        .filter((aid) => aid && /^NATT-/.test(aid));

      releaseLocks = acquireAttachmentLocks(attachmentIdsToRemove);
      pendingDeleteSnapshots = markAttachmentsDeletionPending(attachmentIdsToRemove);

      if (typeof options.afterNoticeDeleteHook === 'function') {
        await options.afterNoticeDeleteHook(client, id);
      }

      await client.query(
        `DELETE FROM notification_reads
         WHERE notification_id = $1
            OR notification_id LIKE $2
            OR notification_id IN (
              SELECT id FROM notifications WHERE action_type = 'notice_popup' AND action_payload->>'id' = $3
            )`,
        [`NOTIF-${id}`, `REMIND-${id}-%`, id]
      );
      await client.query(
        `DELETE FROM notifications
         WHERE id = $1
            OR id LIKE $2
            OR (action_type = 'notice_popup' AND action_payload->>'id' = $3)`,
        [`NOTIF-${id}`, `REMIND-${id}-%`, id]
      );

      if (typeof options.beforeAuditHook === 'function') {
        await options.beforeAuditHook(client, id);
      }

      await writeAudit(client, {
        user: actor,
        action: 'DELETE_NOTICE',
        table: 'company_notices',
        recordId: id,
        req,
        oldValues: { title: res.rows[0].title },
      });

      if (typeof options.beforeCommitHook === 'function') {
        await options.beforeCommitHook(client, id);
      }
    });

    // R43: Only delete physical files AFTER the database transaction commits
    for (const attId of attachmentIdsToRemove) {
      deleteAttachmentFiles(attId);
    }
  } catch (err) {
    restoreAttachmentMetaSnapshots(pendingDeleteSnapshots);
    throw err;
  } finally {
    releaseLocks();
  }
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
  const readMap = new Map(reads.map((r) => [r.user_id, r.read_at]));

  const readers = [];
  const unread = [];

  for (const emp of targetedEmployees) {
    if (readMap.has(emp.user_id)) {
      readers.push({
        ...emp,
        read_at: readMap.get(emp.user_id),
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
    unread,
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
      const remindHash = crypto
        .createHash('sha1')
        .update(`${id}:${target.id}:${Date.now()}:${sent}`)
        .digest('hex')
        .slice(0, 8);
      const notifId = `REMIND-${id}-${remindHash}`.slice(0, 30);
      await client.query(
        `INSERT INTO notifications (
          id, user_id, type, category, title, summary, sender_name, sender_role, sender_avatar,
          priority, is_read, action_type, action_payload, created_at
        ) VALUES ($1, $2, 'ceo_directive', 'Nhắc nhở chỉ đạo', $3, NULL, $4, $5, $6, 'urgent', false, 'notice_popup', $7, NOW())`,
        [
          notifId,
          target.user_id,
          `[NHẮC NHỞ] Bạn chưa đọc thông báo ${id}`,
          senderName,
          senderRole,
          senderAvatar,
          JSON.stringify({
            id,
            isReminder: true,
          }),
        ]
      );
      sent++;
    }

    await writeAudit(client, {
      user: actor,
      action: 'REMIND_NOTICE_UNREAD',
      table: 'company_notices',
      recordId: id,
      req,
      newValues: { unreadCount: report.unread.length, sentCount: sent },
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
  getStorageDir,
  PROD_DEFAULT_STORAGE_DIR,
  assertSafeStorageDir,
  cleanupTestStorageDir,
  reconcileAttachmentStorage,
  readAttachmentMeta,
};
