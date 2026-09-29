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

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const PROD_STORAGE_PARENT_DIR = path.resolve(__dirname, '../../../storage');
const PROD_DEFAULT_STORAGE_DIR = path.resolve(__dirname, '../../../storage/notice_attachments');

const REAL_OS_TMPDIR = (() => {
  try {
    return fs.realpathSync.native(os.tmpdir());
  } catch (_e) {
    return path.resolve(os.tmpdir());
  }
})();

const ALLOWED_TEST_STORAGE_ROOT = path.join(
  REAL_OS_TMPDIR,
  'nexus-hrms-notice-attachments-test-runs'
);
const TEST_STORAGE_MARKER_FILENAME = '.nexus-test-storage-owner.json';
const TEST_STORAGE_MARKER_SIGNATURE = 'NEXUS_HRMS_TEST_STORAGE_OWNER_V1';
const CURRENT_TEST_RUN_ID = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

// Registry of test directories created and owned by the current test process (`CURRENT_TEST_RUN_ID`)
const ownedTestStorageDirs = new Map();
let defaultOwnedTestDir = null;

// In-process concurrency lock set preventing two requests in the same process from binding/deleting the same attachment simultaneously
const inFlightAttachmentLocks = new Set();

function normalizeComparablePath(targetPath) {
  const resolved = path.resolve(String(targetPath || ''));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isSubPathOrEqual(candidatePath, basePath) {
  const normCandidate = normalizeComparablePath(candidatePath);
  const normBase = normalizeComparablePath(basePath);
  const rel = path.relative(normBase, normCandidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isStrictSubPath(candidatePath, basePath) {
  const normCandidate = normalizeComparablePath(candidatePath);
  const normBase = normalizeComparablePath(basePath);
  const rel = path.relative(normBase, normCandidate);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Returns true if `pathA` and `pathB` overlap (equal, ancestor, or descendant).
 * Any overlap with `REPO_ROOT` or production storage is forbidden in test mode because deleting an ancestor deletes the child.
 */
function pathsOverlap(pathA, pathB) {
  if (!pathA || !pathB) return false;
  return isSubPathOrEqual(pathA, pathB) || isSubPathOrEqual(pathB, pathA);
}

function getForbiddenProductionRootsForTest() {
  const roots = [
    REPO_ROOT,
    BACKEND_ROOT,
    PROD_STORAGE_PARENT_DIR,
    PROD_DEFAULT_STORAGE_DIR,
  ];
  if (process.env.NOTICE_ATTACHMENTS_DIR) {
    roots.push(path.resolve(process.env.NOTICE_ATTACHMENTS_DIR));
  }
  if (process.env.STORAGE_ROOT) {
    roots.push(path.resolve(process.env.STORAGE_ROOT));
    roots.push(path.join(path.resolve(process.env.STORAGE_ROOT), 'notice_attachments'));
  }
  return roots;
}

function storageGuardError(code, message) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return err;
}

/**
 * R46: Verify no symlink or NTFS junction along the test path escapes `ALLOWED_TEST_STORAGE_ROOT`.
 */
function verifyNoSymlinkOrJunctionEscape(resolvedTarget) {
  fs.mkdirSync(ALLOWED_TEST_STORAGE_ROOT, { recursive: true });
  const realAllowedRoot = fs.realpathSync.native(ALLOWED_TEST_STORAGE_ROOT);

  // Walk from ALLOWED_TEST_STORAGE_ROOT down to resolvedTarget
  const rel = path.relative(ALLOWED_TEST_STORAGE_ROOT, resolvedTarget);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw storageGuardError(
      'UNSAFE_TEST_STORAGE_PATH',
      `Test storage path must be a strict child directory inside ${ALLOWED_TEST_STORAGE_ROOT} (got ${resolvedTarget})`
    );
  }

  const segments = rel.split(path.sep).filter(Boolean);
  let cursor = ALLOWED_TEST_STORAGE_ROOT;
  for (const seg of segments) {
    cursor = path.join(cursor, seg);
    if (fs.existsSync(cursor)) {
      const st = fs.lstatSync(cursor);
      if (st.isSymbolicLink()) {
        throw storageGuardError(
          'UNSAFE_TEST_STORAGE_SYMLINK',
          `Symbolic link or junction is forbidden in test storage path (${cursor})`
        );
      }
      const realCursor = fs.realpathSync.native(cursor);
      if (!isStrictSubPath(realCursor, realAllowedRoot)) {
        throw storageGuardError(
          'UNSAFE_TEST_STORAGE_SYMLINK',
          `Canonicalized path escaped allowed test root (${realCursor})`
        );
      }
    }
  }

  if (fs.existsSync(resolvedTarget)) {
    const realTarget = fs.realpathSync.native(resolvedTarget);
    if (!isStrictSubPath(realTarget, realAllowedRoot)) {
      throw storageGuardError(
        'UNSAFE_TEST_STORAGE_SYMLINK',
        `Canonical target is outside allowed test root (${realTarget})`
      );
    }
    return realTarget;
  }

  return resolvedTarget;
}

/**
 * R46: Strict guard for attachment storage directory.
 * - Rejects empty paths, drive roots (`C:\`, `/`), repository root, `Backend/storage`, `PROD_DEFAULT_STORAGE_DIR`,
 *   and any configured `NOTICE_ATTACHMENTS_DIR` / `STORAGE_ROOT` (including their ancestors and descendants).
 * - In `NODE_ENV === 'test'`, requires `targetDir` to be a strict child directory inside `ALLOWED_TEST_STORAGE_ROOT`,
 *   free of symlinks/junctions.
 * - When `options.requireRunOwnership === true`, additionally verifies that the directory was created by the current
 *   test run (`CURRENT_TEST_RUN_ID`) and contains an intact `.nexus-test-storage-owner.json` marker matching `process.pid`.
 */
function assertSafeStorageDir(targetDir, options = {}) {
  if (!targetDir || typeof targetDir !== 'string' || !targetDir.trim()) {
    throw storageGuardError(
      'UNSAFE_TEST_STORAGE_PATH',
      'Storage directory path must be a non-empty string'
    );
  }

  const resolved = path.resolve(targetDir);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    throw storageGuardError(
      'UNSAFE_TEST_STORAGE_PATH',
      `Drive or filesystem root is forbidden as storage directory (${resolved})`
    );
  }

  if (process.env.NODE_ENV === 'test') {
    for (const forbiddenRoot of getForbiddenProductionRootsForTest()) {
      if (pathsOverlap(resolved, forbiddenRoot)) {
        throw storageGuardError(
          'UNSAFE_TEST_STORAGE_PATH',
          `Test storage path (${resolved}) overlaps with protected repository or production storage path (${forbiddenRoot})`
        );
      }
    }

    if (!isStrictSubPath(resolved, ALLOWED_TEST_STORAGE_ROOT)) {
      throw storageGuardError(
        'UNSAFE_TEST_STORAGE_PATH',
        `In NODE_ENV=test, storage directory must be a dedicated sub-directory inside ${ALLOWED_TEST_STORAGE_ROOT} (got ${resolved})`
      );
    }

    const canonical = verifyNoSymlinkOrJunctionEscape(resolved);

    if (options.requireRunOwnership) {
      if (!fs.existsSync(canonical)) {
        throw storageGuardError(
          'UNOWNED_TEST_STORAGE_DIR',
          `Target directory does not exist (${canonical})`
        );
      }
      const normKey = normalizeComparablePath(canonical);
      const memRecord = ownedTestStorageDirs.get(normKey);
      if (
        !memRecord ||
        memRecord.runId !== CURRENT_TEST_RUN_ID ||
        memRecord.pid !== process.pid
      ) {
        throw storageGuardError(
          'UNOWNED_TEST_STORAGE_DIR',
          `Directory (${canonical}) was not created by the current test run (${CURRENT_TEST_RUN_ID}); refusing cleanup`
        );
      }

      const markerPath = path.join(canonical, TEST_STORAGE_MARKER_FILENAME);
      if (!fs.existsSync(markerPath)) {
        throw storageGuardError(
          'UNOWNED_TEST_STORAGE_DIR',
          `Missing ownership marker ${TEST_STORAGE_MARKER_FILENAME} in ${canonical}`
        );
      }
      const markerStat = fs.lstatSync(markerPath);
      if (markerStat.isSymbolicLink() || !markerStat.isFile()) {
        throw storageGuardError(
          'UNSAFE_TEST_STORAGE_SYMLINK',
          `Ownership marker in ${canonical} is not a regular file`
        );
      }
      let markerData = null;
      try {
        markerData = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      } catch (_e) {
        throw storageGuardError(
          'UNOWNED_TEST_STORAGE_DIR',
          `Corrupted ownership marker in ${canonical}`
        );
      }
      if (
        !markerData ||
        markerData.signature !== TEST_STORAGE_MARKER_SIGNATURE ||
        markerData.runId !== CURRENT_TEST_RUN_ID ||
        markerData.pid !== process.pid ||
        normalizeComparablePath(markerData.canonicalPath) !== normKey
      ) {
        throw storageGuardError(
          'UNOWNED_TEST_STORAGE_DIR',
          `Ownership marker mismatch in ${canonical} (expected runId=${CURRENT_TEST_RUN_ID})`
        );
      }
    }

    return canonical;
  }

  return resolved;
}

/**
 * R46: Creates a fresh `mkdtemp` directory inside `ALLOWED_TEST_STORAGE_ROOT` stamped with the current run's ownership marker.
 */
function createIsolatedTestStorageDir(prefix = `run-${process.pid}-`) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('createIsolatedTestStorageDir is only allowed when NODE_ENV === "test"');
  }
  const safePrefix = String(prefix || `run-${process.pid}-`).replace(/[^A-Za-z0-9_-]/g, '_');
  fs.mkdirSync(ALLOWED_TEST_STORAGE_ROOT, { recursive: true });
  const realAllowedRoot = fs.realpathSync.native(ALLOWED_TEST_STORAGE_ROOT);
  const created = fs.mkdtempSync(path.join(realAllowedRoot, safePrefix));
  const canonical = fs.realpathSync.native(created);

  const markerPayload = {
    signature: TEST_STORAGE_MARKER_SIGNATURE,
    runId: CURRENT_TEST_RUN_ID,
    pid: process.pid,
    canonicalPath: canonical,
    createdAt: new Date().toISOString(),
  };
  const markerPath = path.join(canonical, TEST_STORAGE_MARKER_FILENAME);
  fs.writeFileSync(markerPath, JSON.stringify(markerPayload, null, 2), 'utf8');
  ownedTestStorageDirs.set(normalizeComparablePath(canonical), markerPayload);
  return assertSafeStorageDir(canonical, { requireRunOwnership: true });
}

function getStorageDir() {
  if (process.env.NODE_ENV === 'test') {
    // R46: NEVER inherit NOTICE_ATTACHMENTS_DIR or STORAGE_ROOT in test mode!
    if (process.env.TEST_NOTICE_ATTACHMENTS_DIR) {
      return assertSafeStorageDir(process.env.TEST_NOTICE_ATTACHMENTS_DIR);
    }
    if (!defaultOwnedTestDir || !fs.existsSync(defaultOwnedTestDir)) {
      defaultOwnedTestDir = createIsolatedTestStorageDir(`run-${process.pid}-`);
    }
    return assertSafeStorageDir(defaultOwnedTestDir);
  }

  const explicitProdDir =
    process.env.NOTICE_ATTACHMENTS_DIR ||
    (process.env.STORAGE_ROOT
      ? path.join(process.env.STORAGE_ROOT, 'notice_attachments')
      : null);

  return path.resolve(explicitProdDir || PROD_DEFAULT_STORAGE_DIR);
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

/**
 * R46: Safe test storage cleanup.
 * - Requires `NODE_ENV === 'test'`.
 * - Requires `targetDir` (or active `getStorageDir()`) to pass `assertSafeStorageDir(..., { requireRunOwnership: true })`.
 * - Never executes blind `fs.rmSync(dir, { recursive: true, force: true })` on unverified paths; instead inspects each entry
 *   via `fs.lstatSync`, refuses symlinks/junctions, removes only owned attachment/marker files of the current run, and removes the empty dir.
 */
function cleanupTestStorageDir(explicitTargetDir) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('cleanupTestStorageDir is only allowed when NODE_ENV === "test"');
  }
  const candidate = explicitTargetDir || process.env.TEST_NOTICE_ATTACHMENTS_DIR || defaultOwnedTestDir;
  if (!candidate) return false;

  const safeDir = assertSafeStorageDir(candidate, { requireRunOwnership: true });
  const entries = fs.readdirSync(safeDir);

  for (const entry of entries) {
    const fullEntryPath = path.join(safeDir, entry);
    const st = fs.lstatSync(fullEntryPath);
    if (st.isSymbolicLink() || st.isDirectory()) {
      throw new Error(
        `UNSAFE_TEST_STORAGE_CONTENT: Refusing to delete unexpected symlink or subdirectory inside test storage (${fullEntryPath})`
      );
    }
    const isAllowedFile =
      entry === TEST_STORAGE_MARKER_FILENAME ||
      /^(NATT|ATT)-[A-Za-z0-9-]+\.(bin|meta\.json)(\.tmp-[A-Za-z0-9-]+)?$/.test(entry);
    if (!isAllowedFile) {
      throw storageGuardError(
        'UNSAFE_TEST_STORAGE_CONTENT',
        `Refusing to delete unrecognized file in test storage (${fullEntryPath})`
      );
    }
  }

  for (const entry of entries) {
    if (entry === TEST_STORAGE_MARKER_FILENAME) continue;
    fs.unlinkSync(path.join(safeDir, entry));
  }

  const markerPath = path.join(safeDir, TEST_STORAGE_MARKER_FILENAME);
  if (fs.existsSync(markerPath)) {
    fs.unlinkSync(markerPath);
  }
  fs.rmdirSync(safeDir);
  ownedTestStorageDirs.delete(normalizeComparablePath(safeDir));

  if (
    defaultOwnedTestDir &&
    normalizeComparablePath(defaultOwnedTestDir) === normalizeComparablePath(safeDir)
  ) {
    defaultOwnedTestDir = null;
  }
  return true;
}

function acquireAttachmentLocks(attachmentIds = []) {
  const uniqueIds = Array.from(
    new Set(
      (attachmentIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => /^NATT-[A-Za-z0-9-]+$/.test(id))
    )
  ).sort();
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

/**
 * R47: Database-wide transaction-scoped advisory lock (`pg_try_advisory_xact_lock`)
 * so concurrent requests across multiple Node.js processes cannot bind/delete the same attachment simultaneously.
 */
async function acquireDbAttachmentLocks(client, attachmentIds = []) {
  if (!client || typeof client.query !== 'function') return;
  const sortedIds = Array.from(
    new Set(
      (attachmentIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => /^NATT-[A-Za-z0-9-]+$/.test(id))
    )
  ).sort();

  for (const id of sortedIds) {
    const lockRes = await client.query(
      `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`,
      [`nexus_notice_att:${id}`]
    );
    if (lockRes?.rows?.[0] && lockRes.rows[0].acquired === false) {
      throw new AppError(
        409,
        'ATTACHMENT_CONCURRENT_CONFLICT',
        `Tệp đính kèm "${id}" đang được xử lý bởi một giao dịch khác trên hệ thống. Vui lòng thử lại.`
      );
    }
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

/**
 * R47: Query PostgreSQL `company_notices` to determine if `attachmentId` is referenced by any committed notice row.
 * Throws if the database query fails so callers fail closed (never delete files when DB cannot be queried).
 */
async function findReferencingNoticeInDb(executor, attachmentId) {
  const dbExec = executor && typeof executor.query === 'function' ? executor : db;
  const { rows } = await dbExec.query(
    `SELECT id, title, content, author_id, target_role, target_department_id, attachments
     FROM company_notices
     WHERE EXISTS (
       SELECT 1
       FROM jsonb_array_elements(COALESCE(attachments, '[]'::jsonb)) elem
       WHERE elem->>'id' = $1
     )
     ORDER BY id DESC
     LIMIT 1`,
    [attachmentId]
  );
  return rows[0] || null;
}

const STAGED_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * R47: Fail-closed TTL cleanup of expired `staged` attachments.
 * - Before deleting ANY expired `staged` file, queries PostgreSQL (`findReferencingNoticeInDb`) to verify
 *   whether a committed notice references it (e.g. after a post-commit crash before `.meta.json` was marked `bound`).
 * - If referenced in DB: heals `.meta.json` to `state: 'bound'` with `noticeId` instead of deleting!
 * - If DB lookup fails/throws: fails closed and preserves the file on disk!
 */
async function cleanupExpiredOrphanAttachments(maxAgeMs = STAGED_TTL_MS, executor = db) {
  const storageDir = ensureStorageDir();
  const now = Date.now();
  const summary = { deleted: [], healedToBound: [], skippedDbError: [], skippedInFlight: [] };
  let files = [];
  try {
    files = fs.readdirSync(storageDir);
  } catch (_e) {
    return summary;
  }

  for (const file of files) {
    if (!file.endsWith('.meta.json')) continue;
    const metaFull = path.join(storageDir, file);
    let meta = null;
    try {
      meta = JSON.parse(fs.readFileSync(metaFull, 'utf8'));
    } catch (_e) {
      continue;
    }
    if (!meta?.id) continue;
    if (inFlightAttachmentLocks.has(meta.id)) {
      summary.skippedInFlight.push(meta.id);
      continue;
    }

    const createdAtRaw = meta.createdAt || meta.uploadedAt;
    const createdAtMs = createdAtRaw ? Date.parse(createdAtRaw) : 0;
    const isExpiredStaged =
      (!meta.noticeId || meta.state === 'staged') &&
      meta.state !== 'bound' &&
      meta.state !== 'deletion-pending' &&
      createdAtMs > 0 &&
      now - createdAtMs > maxAgeMs;

    if (!isExpiredStaged) continue;

    let releaseLock = null;
    try {
      releaseLock = acquireAttachmentLocks([meta.id]);
    } catch (_lockErr) {
      summary.skippedInFlight.push(meta.id);
      continue;
    }

    try {
      let referencingNotice = null;
      try {
        referencingNotice = await findReferencingNoticeInDb(executor, meta.id);
      } catch (_dbErr) {
        // R47: Fail closed when DB lookup fails — never delete a file if DB reference cannot be verified!
        summary.skippedDbError.push(meta.id);
        continue;
      }

      if (referencingNotice) {
        // R47: File IS referenced in PostgreSQL! Heal `.meta.json` to `bound` instead of deleting.
        writeAttachmentMetaRaw(metaFull, {
          ...meta,
          state: 'bound',
          noticeId: referencingNotice.id,
          boundAt: meta.boundAt || new Date().toISOString(),
          recoveredByReconcileAt: new Date().toISOString(),
        });
        summary.healedToBound.push(meta.id);
      } else {
        // Re-read metadata to verify it wasn't updated while awaiting DB
        const freshMeta = readAttachmentMeta(meta.id);
        if (freshMeta && freshMeta.state === 'staged' && !freshMeta.noticeId) {
          deleteAttachmentFiles(meta.id);
          summary.deleted.push(meta.id);
        }
      }
    } finally {
      if (releaseLock) releaseLock();
    }
  }
  return summary;
}

/**
 * R43 & R47: Idempotent, fail-closed reconciliation between PostgreSQL `company_notices.attachments` and filesystem metadata.
 * - Any `staged` or `deletion-pending` file that IS referenced in DB (e.g., after a process crash after DB commit or before rollback finished)
 *   is promoted/restored to `state: 'bound'` with the authoritative `noticeId` from PostgreSQL.
 * - Any `deletion-pending` file not referenced in DB is physically deleted.
 * - Any expired `staged` file (`age > maxStagedAgeMs`) confirmed unreferenced in DB is physically deleted.
 * - If DB lookup fails for any file, fails closed (`skippedDbError`) and preserves the file on disk.
 */
async function reconcileAttachmentStorage(executor = db, options = {}) {
  const maxStagedAgeMs =
    options.ttlMs !== undefined
      ? Number(options.ttlMs)
      : options.maxStagedAgeMs !== undefined
        ? Number(options.maxStagedAgeMs)
        : STAGED_TTL_MS;
  const storageDir = ensureStorageDir();
  const actions = {
    deleted: [],
    restored: [],
    promotedStaged: [],
    recoveredPending: [],
    deletedPending: [],
    deletedExpiredStaged: [],
    skippedInFlight: [],
    skippedDbError: [],
    dbError: null,
  };
  let files = [];
  try {
    files = fs.readdirSync(storageDir);
  } catch (_e) {
    return actions;
  }

  const now = Date.now();

  for (const file of files) {
    if (!file.endsWith('.meta.json')) continue;
    const metaFull = path.join(storageDir, file);
    let meta = null;
    try {
      meta = JSON.parse(fs.readFileSync(metaFull, 'utf8'));
    } catch (_e) {
      continue;
    }
    if (!meta?.id) continue;

    if (inFlightAttachmentLocks.has(meta.id)) {
      actions.skippedInFlight.push(meta.id);
      continue;
    }

    let releaseLock = null;
    try {
      releaseLock = acquireAttachmentLocks([meta.id]);
    } catch (_lockErr) {
      actions.skippedInFlight.push(meta.id);
      continue;
    }

    try {
      let referencingNotice = null;
      try {
        referencingNotice = await findReferencingNoticeInDb(executor, meta.id);
      } catch (dbErr) {
        // R47: Fail closed when DB is unreachable or query throws
        actions.skippedDbError.push(meta.id);
        if (!actions.dbError) {
          actions.dbError = dbErr?.message || String(dbErr);
        }
        continue;
      }

      if (referencingNotice) {
        if (
          meta.state !== 'bound' ||
          meta.noticeId !== referencingNotice.id ||
          meta.deletionPendingAt !== undefined
        ) {
          const prevState = meta.state;
          const updatedMeta = {
            ...meta,
            state: 'bound',
            noticeId: referencingNotice.id,
            boundAt: meta.boundAt || new Date().toISOString(),
            recoveredByReconcileAt: new Date().toISOString(),
          };
          delete updatedMeta.deletionPendingAt;
          writeAttachmentMetaRaw(metaFull, updatedMeta);
          actions.restored.push(meta.id);
          if (prevState === 'staged' || !meta.noticeId) {
            actions.promotedStaged.push(meta.id);
          } else {
            actions.recoveredPending.push(meta.id);
          }
        }
      } else {
        // Confirmed 0 references in `company_notices`
        if (meta.state === 'deletion-pending') {
          deleteAttachmentFiles(meta.id);
          actions.deleted.push(meta.id);
          actions.deletedPending.push(meta.id);
        } else if (meta.state === 'staged' || !meta.noticeId) {
          const createdAtRaw = meta.createdAt || meta.uploadedAt;
          const createdAtMs = createdAtRaw ? Date.parse(createdAtRaw) : 0;
          if (createdAtMs > 0 && now - createdAtMs > maxStagedAgeMs) {
            deleteAttachmentFiles(meta.id);
            actions.deleted.push(meta.id);
            actions.deletedExpiredStaged.push(meta.id);
          }
        } else if (meta.state === 'bound' && meta.noticeId) {
          // Was marked bound to a notice that was deleted in DB before post-commit unlink completed
          const boundAtMs = Date.parse(meta.boundAt || meta.createdAt || '') || 0;
          if (boundAtMs === 0 || now - boundAtMs > Math.min(maxStagedAgeMs, 60 * 1000)) {
            deleteAttachmentFiles(meta.id);
            actions.deleted.push(meta.id);
            actions.deletedPending.push(meta.id);
          }
        }
      }
    } finally {
      if (releaseLock) releaseLock();
    }
  }
  return actions;
}

let reconciliationTimer = null;

/**
 * R47: Operational background job entry point for periodic attachment storage reconciliation.
 */
function startAttachmentReconciliationJob(executor = db, options = {}) {
  const intervalMs = Number(options.intervalMs || 15 * 60 * 1000);
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer);
  }
  reconciliationTimer = setInterval(() => {
    reconcileAttachmentStorage(executor, options).catch((err) => {
      console.warn('[NoticeAttachmentReconcile] Periodic run failed:', err.message);
    });
  }, intervalMs);
  if (typeof reconciliationTimer.unref === 'function') {
    reconciliationTimer.unref();
  }
  return () => {
    if (reconciliationTimer) {
      clearInterval(reconciliationTimer);
      reconciliationTimer = null;
    }
  };
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
    if (stored && stored.state !== 'deletion-pending') {
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

async function uploadAttachment(actor, body, options = {}) {
  const executor = options.executor || db;
  ensureStorageDir();
  await cleanupExpiredOrphanAttachments(options.maxStagedAgeMs, executor);

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

async function deleteAttachment(actor, attachmentId, options = {}) {
  const executor = options.executor || db;
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

    // R47: Always verify against PostgreSQL even if `stored.noticeId` is null (in case of post-commit crash)
    const referencingNotice = await findReferencingNoticeInDb(executor, attachmentId);
    if (referencingNotice) {
      writeAttachmentMetaRaw(stored.metaPath, {
        ...stored,
        state: 'bound',
        noticeId: referencingNotice.id,
        boundAt: stored.boundAt || new Date().toISOString(),
      });
      throw badRequest(
        'Tệp đang được gắn với văn bản thông báo đã phát hành; vui lòng gỡ tệp và lưu cập nhật thông báo.'
      );
    }

    deleteAttachmentFiles(attachmentId);
    return { deleted: true, id: attachmentId };
  } finally {
    releaseLock();
  }
}

/**
 * R43 & R47: Validate & prepare attachment metadata for binding to `noticeId` WITHOUT mutating `.meta.json`
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
      throw new AppError(
        409,
        'ATTACHMENT_ALREADY_BOUND',
        `Tệp đính kèm "${stored.originalName}" đã được gắn với một thông báo khác (${stored.noticeId}).`
      );
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
    const clean = {
      ...stored,
      state: 'bound',
      noticeId,
      boundAt: stored.boundAt || new Date().toISOString(),
    };
    delete clean.deletionPendingAt;
    writeAttachmentMetaRaw(stored.metaPath, clean);
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

  // Self-heal metadata on read if it was left in `staged` state after a post-commit crash
  if (stored.state !== 'bound' || stored.noticeId !== noticeId) {
    try {
      commitBoundAttachmentsToDisk(noticeId, [{ id: attachmentId }]);
    } catch (_e) {}
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
  const inputAttIds = Array.from(
    new Set((body.attachments || []).map((a) => a?.id).filter(Boolean))
  );
  const releaseLocks = acquireAttachmentLocks(inputAttIds);

  let committedNoticeId = null;
  let committedAttachments = [];
  let dbCommitted = false;

  try {
    // Pre-validate ownership and file existence before opening DB transaction
    prepareVerifiedAttachmentsForNotice(actor, null, body.attachments || []);

    const createdRow = await executor.withTransaction(async (client) => {
      // R47: Acquire DB-level transaction advisory locks on all attachment IDs (works across multiple processes)
      await acquireDbAttachmentLocks(client, inputAttIds);

      // R47: Check PostgreSQL truth for each attachment ID to detect:
      // 1) An idempotent retry of a previously committed `create` call that failed post-commit before updating `.meta.json`, or
      // 2) A conflicting attempt to bind an attachment that was already committed to another notice in DB.
      for (const attId of inputAttIds) {
        const existingRef = await findReferencingNoticeInDb(client, attId);
        if (existingRef) {
          const existingAttIds = Array.isArray(existingRef.attachments)
            ? existingRef.attachments.map((a) => a?.id).filter(Boolean)
            : [];
          const sameAttachments =
            existingAttIds.length === inputAttIds.length &&
            existingAttIds.every((id) => inputAttIds.includes(id));
          const isSameRequestRetry =
            sameAttachments &&
            existingRef.title === body.title &&
            existingRef.content === body.content &&
            String(existingRef.author_id || '') === String(actor.employeeId || '');

          if (isSameRequestRetry) {
            committedNoticeId = existingRef.id;
            committedAttachments = existingRef.attachments || [];
            return (await client.query(`${SELECT} WHERE n.id = $1`, [existingRef.id])).rows[0];
          }

          // Heal `.meta.json` to reflect the true DB owner before rejecting
          try {
            commitBoundAttachmentsToDisk(existingRef.id, [{ id: attId }]);
          } catch (_e) {}
          throw new AppError(
            409,
            'ATTACHMENT_ALREADY_BOUND',
            `Tệp đính kèm "${attId}" đã được gắn với một thông báo khác (${existingRef.id}).`
          );
        }
      }

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

      // R42: Store only reference metadata in `notifications`
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

    dbCommitted = true;

    if (typeof options.afterCommitBeforeDiskSyncHook === 'function') {
      await options.afterCommitBeforeDiskSyncHook(committedNoticeId);
    }

    // R43: Only bind `.meta.json` on disk AFTER the database transaction has committed
    commitBoundAttachmentsToDisk(committedNoticeId, committedAttachments);
    return normalizeNoticeRowAttachments(createdRow);
  } catch (err) {
    if (dbCommitted && err && typeof err === 'object') {
      err.dbCommitted = true;
      err.committedNoticeId = committedNoticeId;
    }
    throw err;
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
  const inputAttIds = Array.from(
    new Set((body.attachments || []).map((a) => a?.id).filter(Boolean))
  );
  const releaseInputLocks = acquireAttachmentLocks(inputAttIds);
  let releaseExistingLocks = () => {};
  let pendingDeleteSnapshots = null;
  let removedAttachmentIds = [];
  let committedAttachments = undefined;
  let dbCommitted = false;

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

        // R47: Acquire DB-level advisory locks on both incoming and previous attachment IDs
        await acquireDbAttachmentLocks(client, [...inputAttIds, ...prevIdsToLock]);

        // R47: Verify none of the incoming attachments are bound to a DIFFERENT notice in DB
        for (const attId of inputAttIds) {
          const existingRef = await findReferencingNoticeInDb(client, attId);
          if (existingRef && existingRef.id !== id) {
            try {
              commitBoundAttachmentsToDisk(existingRef.id, [{ id: attId }]);
            } catch (_e) {}
            throw new AppError(
              409,
              'ATTACHMENT_ALREADY_BOUND',
              `Tệp đính kèm "${attId}" đã được gắn với một thông báo khác (${existingRef.id}).`
            );
          }
        }

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

    dbCommitted = true;

    if (typeof options.afterCommitBeforeDiskSyncHook === 'function') {
      await options.afterCommitBeforeDiskSyncHook(id);
    }

    // R43: Transaction committed! Now finalize newly bound metadata and physically delete removed files
    if (committedAttachments !== undefined) {
      commitBoundAttachmentsToDisk(id, committedAttachments);
      for (const remId of removedAttachmentIds) {
        deleteAttachmentFiles(remId);
      }
    }

    return normalizeNoticeRowAttachments(updatedNotice);
  } catch (err) {
    if (!dbCommitted) {
      // R43: Transaction rolled back! Restore any `deletion-pending` metadata snapshots so old files remain bound and downloadable
      restoreAttachmentMetaSnapshots(pendingDeleteSnapshots);
    } else if (err && typeof err === 'object') {
      // R47: DB already committed! Do NOT restore pre-commit metadata snapshots; mark error as post-commit
      err.dbCommitted = true;
      err.committedNoticeId = id;
    }
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
  let dbCommitted = false;

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
      await acquireDbAttachmentLocks(client, attachmentIdsToRemove);
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

    dbCommitted = true;

    if (typeof options.afterCommitBeforeDiskSyncHook === 'function') {
      await options.afterCommitBeforeDiskSyncHook(id);
    }

    // R43: Only delete physical files AFTER the database transaction commits
    for (const attId of attachmentIdsToRemove) {
      deleteAttachmentFiles(attId);
    }
  } catch (err) {
    if (!dbCommitted) {
      restoreAttachmentMetaSnapshots(pendingDeleteSnapshots);
    } else if (err && typeof err === 'object') {
      err.dbCommitted = true;
      err.committedNoticeId = id;
    }
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
  PROD_DEFAULT_STORAGE_ROOT: PROD_STORAGE_PARENT_DIR,
  PROD_STORAGE_PARENT_DIR,
  REPO_ROOT,
  ALLOWED_TEST_STORAGE_ROOT,
  TEST_STORAGE_MARKER_FILENAME,
  CURRENT_TEST_RUN_ID,
  STAGED_TTL_MS,
  assertSafeStorageDir,
  createIsolatedTestStorageDir,
  cleanupTestStorageDir,
  cleanupExpiredOrphanAttachments,
  reconcileAttachmentStorage,
  startAttachmentReconciliationJob,
  findReferencingNoticeInDb,
  readAttachmentMeta,
};
