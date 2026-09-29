// ============================================
// tests/unit/noticeStorageGuard.test.js — Unit tests for R46, R47 & R48 fail-closed guards (No PostgreSQL required)
// ============================================
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const noticesService = require('../../src/modules/notices/service');

describe('R46, R47 & R48 Unit Guards: Notice Test Storage Ownership, Fail-Closed DB Cleanup & Unified Advisory Locks', () => {
  const createdTempDirs = [];

  after(() => {
    noticesService.cleanupTestStorageDir();
    for (const dir of createdTempDirs) {
      try {
        if (fs.existsSync(dir) && dir.startsWith(os.tmpdir())) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {
        // best-effort cleanup of temp test artifacts
      }
    }
  });

  it('R46: assertSafeStorageDir rejects repo root, drive root, Backend/storage parent, prod storage, tmp root, ALLOWED_TEST_STORAGE_ROOT itself, and unowned dirs', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const backendRoot = path.resolve(__dirname, '../..');
    const driveRoot = path.parse(repoRoot).root;
    const storageParent = noticesService.PROD_STORAGE_PARENT_DIR;
    const prodStorage = noticesService.PROD_DEFAULT_STORAGE_DIR;
    const prodChild = path.join(prodStorage, 'nested-child');

    const unsafeCandidates = [
      '',
      '   ',
      driveRoot,
      repoRoot,
      backendRoot,
      storageParent,
      prodStorage,
      prodChild,
      os.tmpdir(),
      noticesService.ALLOWED_TEST_STORAGE_ROOT,
    ];

    for (const candidate of unsafeCandidates) {
      assert.throws(
        () => noticesService.assertSafeStorageDir(candidate),
        (err) => err && err.code === 'UNSAFE_TEST_STORAGE_PATH',
        `Expected assertSafeStorageDir to reject unsafe path: ${candidate}`
      );
    }

    // Create an unowned directory inside ALLOWED_TEST_STORAGE_ROOT (missing .nexus-test-storage-owner.json)
    fs.mkdirSync(noticesService.ALLOWED_TEST_STORAGE_ROOT, { recursive: true });
    const unownedInRoot = fs.mkdtempSync(
      path.join(noticesService.ALLOWED_TEST_STORAGE_ROOT, 'unowned-manual-')
    );
    createdTempDirs.push(unownedInRoot);

    assert.throws(
      () => noticesService.assertSafeStorageDir(unownedInRoot, { requireRunOwnership: true }),
      (err) => err && err.code === 'UNOWNED_TEST_STORAGE_DIR',
      'Directory inside ALLOWED_TEST_STORAGE_ROOT without ownership marker must be rejected for cleanup'
    );

    // Create a directory with a forged marker from a different runId
    const wrongRunDir = fs.mkdtempSync(
      path.join(noticesService.ALLOWED_TEST_STORAGE_ROOT, 'wrong-run-')
    );
    createdTempDirs.push(wrongRunDir);
    fs.writeFileSync(
      path.join(wrongRunDir, noticesService.TEST_STORAGE_MARKER_FILENAME),
      JSON.stringify({
        signature: 'NEXUS_HRMS_TEST_STORAGE_OWNER_V1',
        runId: 'FORGED-OTHER-PROCESS-RUN-ID',
        pid: 999999,
      }),
      'utf8'
    );

    assert.throws(
      () => noticesService.assertSafeStorageDir(wrongRunDir, { requireRunOwnership: true }),
      (err) => err && err.code === 'UNOWNED_TEST_STORAGE_DIR',
      'Directory owned by a different runId/process must be rejected for cleanup'
    );
  });

  it('R46: getStorageDir ignores NOTICE_ATTACHMENTS_DIR and STORAGE_ROOT in test mode and stamps ownership marker', () => {
    const prevNoticeDir = process.env.NOTICE_ATTACHMENTS_DIR;
    const prevStorageRoot = process.env.STORAGE_ROOT;
    const prevTestDir = process.env.TEST_NOTICE_ATTACHMENTS_DIR;

    try {
      process.env.NOTICE_ATTACHMENTS_DIR = noticesService.PROD_DEFAULT_STORAGE_DIR;
      process.env.STORAGE_ROOT = noticesService.PROD_STORAGE_PARENT_DIR;
      delete process.env.TEST_NOTICE_ATTACHMENTS_DIR;

      const resolvedTestDir = noticesService.getStorageDir();
      assert.notEqual(
        path.resolve(resolvedTestDir),
        path.resolve(noticesService.PROD_DEFAULT_STORAGE_DIR)
      );
      assert.notEqual(
        path.resolve(resolvedTestDir),
        path.resolve(noticesService.PROD_STORAGE_PARENT_DIR)
      );

      // Must have valid ownership marker for current run
      const verified = noticesService.assertSafeStorageDir(resolvedTestDir, {
        requireRunOwnership: true,
      });
      assert.equal(verified, fs.realpathSync.native(resolvedTestDir));

      const markerRaw = JSON.parse(
        fs.readFileSync(
          path.join(resolvedTestDir, noticesService.TEST_STORAGE_MARKER_FILENAME),
          'utf8'
        )
      );
      assert.equal(markerRaw.runId, noticesService.CURRENT_TEST_RUN_ID);
      assert.equal(markerRaw.pid, process.pid);
    } finally {
      if (prevNoticeDir === undefined) delete process.env.NOTICE_ATTACHMENTS_DIR;
      else process.env.NOTICE_ATTACHMENTS_DIR = prevNoticeDir;
      if (prevStorageRoot === undefined) delete process.env.STORAGE_ROOT;
      else process.env.STORAGE_ROOT = prevStorageRoot;
      if (prevTestDir === undefined) delete process.env.TEST_NOTICE_ATTACHMENTS_DIR;
      else process.env.TEST_NOTICE_ATTACHMENTS_DIR = prevTestDir;
    }
  });

  it('R46: cleanupTestStorageDir leaves sibling directories in ALLOWED_TEST_STORAGE_ROOT untouched and refuses unowned TEST_NOTICE_ATTACHMENTS_DIR', () => {
    const prevTestDir = process.env.TEST_NOTICE_ATTACHMENTS_DIR;
    try {
      const siblingDir = fs.mkdtempSync(
        path.join(noticesService.ALLOWED_TEST_STORAGE_ROOT, 'sibling-sentinel-')
      );
      createdTempDirs.push(siblingDir);
      const sentinelFile = path.join(siblingDir, 'keep-me.txt');
      fs.writeFileSync(sentinelFile, 'DO_NOT_DELETE_SIBLING', 'utf8');

      // Attempt to point TEST_NOTICE_ATTACHMENTS_DIR to siblingDir (which has no ownership marker)
      process.env.TEST_NOTICE_ATTACHMENTS_DIR = siblingDir;
      assert.throws(
        () => noticesService.cleanupTestStorageDir(),
        (err) => err && err.code === 'UNOWNED_TEST_STORAGE_DIR'
      );
      assert.equal(
        fs.existsSync(sentinelFile),
        true,
        'Unowned sibling sentinel file must remain intact'
      );
    } finally {
      if (prevTestDir === undefined) delete process.env.TEST_NOTICE_ATTACHMENTS_DIR;
      else process.env.TEST_NOTICE_ATTACHMENTS_DIR = prevTestDir;
    }
  });

  it('R47 & R48: cleanupExpiredOrphanAttachments, reconcileAttachmentStorage, and deleteAttachment fail closed on DB error and skip/conflict when pg_try_advisory_xact_lock is held', async () => {
    const isolatedDir = noticesService.createIsolatedTestStorageDir('r47-r48-unit-fail-closed-');
    const prevTestDir = process.env.TEST_NOTICE_ATTACHMENTS_DIR;
    process.env.TEST_NOTICE_ATTACHMENTS_DIR = isolatedDir;

    try {
      const attId = 'NATT-UNIT-R47-FAILCLOSED';
      const binPath = path.join(isolatedDir, `${attId}.bin`);
      const metaPath = path.join(isolatedDir, `${attId}.meta.json`);
      fs.writeFileSync(binPath, Buffer.from('%PDF-1.4 FAIL CLOSED UNIT TEST\n'));
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            id: attId,
            originalName: 'fail-closed.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 31,
            sha256: '0'.repeat(64),
            uploadedByUserId: 'USR-002',
            createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), // 5h old (>2h TTL)
            noticeId: null,
            state: 'staged',
          },
          null,
          2
        )
      );

      // 1. Fail-closed when DB query throws
      const failingExecutor = {
        async withTransaction(fn) {
          return fn({
            async query() {
              throw new Error('SIMULATED_POSTGRES_DOWN');
            },
          });
        },
      };

      const cleanupRes = await noticesService.cleanupExpiredOrphanAttachments(
        noticesService.STAGED_TTL_MS,
        failingExecutor
      );
      assert.equal(cleanupRes.deleted.length, 0);
      assert.deepEqual(cleanupRes.skippedDbError, [attId]);
      assert.equal(fs.existsSync(binPath), true, 'Binary file must NOT be deleted when DB fails');
      assert.equal(fs.existsSync(metaPath), true, 'Meta file must NOT be deleted when DB fails');

      const reconcileRes = await noticesService.reconcileAttachmentStorage(failingExecutor);
      assert.equal(reconcileRes.dbError, 'SIMULATED_POSTGRES_DOWN');
      assert.equal(reconcileRes.deletedExpiredStaged.length, 0);
      assert.equal(reconcileRes.deletedPending.length, 0);
      assert.equal(fs.existsSync(binPath), true);
      assert.equal(fs.existsSync(metaPath), true);

      await assert.rejects(
        () =>
          noticesService.deleteAttachment({ userId: 'USR-002' }, attId, {
            executor: failingExecutor,
          }),
        /SIMULATED_POSTGRES_DOWN/
      );
      assert.equal(fs.existsSync(binPath), true);

      // 2. R48: When pg_try_advisory_xact_lock returns acquired=false (lock held by another process's transaction),
      // cleanup and reconcile skip the file (`skippedInFlight`), and deleteAttachment throws 409 ATTACHMENT_CONCURRENT_CONFLICT
      const lockedByOtherProcessExecutor = {
        async withTransaction(fn) {
          return fn({
            async query(sql) {
              if (sql.includes('pg_try_advisory_xact_lock')) {
                return { rows: [{ acquired: false }] };
              }
              throw new Error('Should not query company_notices when advisory lock is not acquired');
            },
          });
        },
      };

      const cleanupLockedRes = await noticesService.cleanupExpiredOrphanAttachments(
        noticesService.STAGED_TTL_MS,
        lockedByOtherProcessExecutor
      );
      assert.equal(cleanupLockedRes.deleted.length, 0);
      assert.deepEqual(cleanupLockedRes.skippedInFlight, [attId]);
      assert.equal(fs.existsSync(binPath), true);

      const reconcileLockedRes = await noticesService.reconcileAttachmentStorage(
        lockedByOtherProcessExecutor
      );
      assert.equal(reconcileLockedRes.deleted.length, 0);
      assert.deepEqual(reconcileLockedRes.skippedInFlight, [attId]);
      assert.equal(fs.existsSync(binPath), true);

      await assert.rejects(
        () =>
          noticesService.deleteAttachment({ userId: 'USR-002' }, attId, {
            executor: lockedByOtherProcessExecutor,
          }),
        (err) => err && err.status === 409 && err.code === 'ATTACHMENT_CONCURRENT_CONFLICT'
      );
      assert.equal(fs.existsSync(binPath), true);
    } finally {
      noticesService.cleanupTestStorageDir();
      if (prevTestDir === undefined) delete process.env.TEST_NOTICE_ATTACHMENTS_DIR;
      else process.env.TEST_NOTICE_ATTACHMENTS_DIR = prevTestDir;
    }
  });
});
