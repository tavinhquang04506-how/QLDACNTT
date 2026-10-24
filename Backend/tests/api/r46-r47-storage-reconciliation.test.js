// ============================================
// tests/api/r46-r47-storage-reconciliation.test.js — Integration & API Verification for R46–R47
// Covers:
// - R46: Strict test storage directory ownership marker (.nexus-test-storage-owner.json), rejection of repo root /
//        Backend/storage / prod storage / unowned directories, non-inheritance of NOTICE_ATTACHMENTS_DIR/STORAGE_ROOT
// - R47: Post-commit crash protection (TTL cleanup queries PostgreSQL before deleting any expired staged file and heals
//        DB-referenced files to bound; fail-closed on DB errors; idempotent retry after post-commit crash;
//        reconcileAttachmentStorage + CLI script; cross-connection PostgreSQL advisory lock pg_try_advisory_xact_lock)
// ============================================
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const request = require('supertest');
const app = require('../../src/app');
const { call, closeDb } = require('../helpers/api');
const { employeeSession } = require('../helpers/sessions');
const { deleteTestEmployees } = require('../helpers/employees');
const { deleteTestUsers } = require('../helpers/users');
const db = require('../../src/config/db');
const noticesService = require('../../src/modules/notices/service');

describe('R46–R47 Storage Ownership Guard & Post-Commit Attachment Reconciliation', () => {
  let hrActor;
  let itEmpSession;
  let prodStorageSnapshotBefore = [];
  let isolatedTestDir = null;
  const extraTempDirs = [];

  before(async () => {
    assert.equal(
      db.pool.options.database,
      'nexus_hrms_test',
      `Expected test database nexus_hrms_test, got ${db.pool.options.database}`
    );

    await deleteTestUsers();
    await deleteTestEmployees();

    if (fs.existsSync(noticesService.PROD_DEFAULT_STORAGE_DIR)) {
      prodStorageSnapshotBefore = fs.readdirSync(noticesService.PROD_DEFAULT_STORAGE_DIR).sort();
    }

    isolatedTestDir = noticesService.createIsolatedTestStorageDir('r46-r47-api-');
    process.env.TEST_NOTICE_ATTACHMENTS_DIR = isolatedTestDir;

    const hrUserRes = await db.query(
      `SELECT u.id AS user_id, u.role_code, u.employee_id, e.department_id
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.role_code = 'HR_DIRECTOR' AND u.is_active = TRUE
       ORDER BY u.id LIMIT 1`
    );
    const hrRow = hrUserRes.rows[0];
    hrActor = {
      userId: hrRow.user_id,
      roleCode: hrRow.role_code,
      employeeId: hrRow.employee_id,
      departmentId: hrRow.department_id,
    };

    itEmpSession = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
  });

  after(async () => {
    try {
      noticesService.cleanupTestStorageDir(isolatedTestDir);
    } catch {
      // ignore if already cleaned in test
    }
    delete process.env.TEST_NOTICE_ATTACHMENTS_DIR;
    for (const dir of extraTempDirs) {
      try {
        if (fs.existsSync(dir) && dir.startsWith(os.tmpdir())) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {
        // best-effort temp cleanup
      }
    }
    await deleteTestUsers();
    await deleteTestEmployees();
    await closeDb();
  });

  it('R46: enforces run-owned test storage directory, rejects parent/repo/unowned paths, and preserves sibling directories and production storage', () => {
    const activeDir = noticesService.getStorageDir();
    assert.equal(activeDir, isolatedTestDir);

    // 1. Verify marker file inside isolatedTestDir
    const markerPath = path.join(isolatedTestDir, noticesService.TEST_STORAGE_MARKER_FILENAME);
    assert.equal(fs.existsSync(markerPath), true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    assert.equal(marker.signature, 'NEXUS_HRMS_TEST_STORAGE_OWNER_V1');
    assert.equal(marker.runId, noticesService.CURRENT_TEST_RUN_ID);
    assert.equal(marker.pid, process.pid);

    // 2. Reject Backend/storage (parent of PROD_DEFAULT_STORAGE_DIR), REPO_ROOT, PROD_DEFAULT_STORAGE_DIR, ALLOWED_TEST_STORAGE_ROOT
    for (const unsafePath of [
      noticesService.REPO_ROOT,
      noticesService.PROD_STORAGE_PARENT_DIR,
      noticesService.PROD_DEFAULT_STORAGE_DIR,
      noticesService.ALLOWED_TEST_STORAGE_ROOT,
      os.tmpdir(),
    ]) {
      assert.throws(
        () => noticesService.assertSafeStorageDir(unsafePath),
        (err) => err && err.code === 'UNSAFE_TEST_STORAGE_PATH',
        `Must reject unsafe path: ${unsafePath}`
      );
      assert.throws(
        () => noticesService.cleanupTestStorageDir(unsafePath),
        (err) => err && err.code === 'UNSAFE_TEST_STORAGE_PATH',
        `cleanupTestStorageDir must refuse unsafe path: ${unsafePath}`
      );
    }

    // 3. Create an unowned sibling directory inside ALLOWED_TEST_STORAGE_ROOT with a sentinel file
    const unownedSibling = fs.mkdtempSync(
      path.join(noticesService.ALLOWED_TEST_STORAGE_ROOT, 'r46-unowned-sibling-')
    );
    extraTempDirs.push(unownedSibling);
    const siblingSentinel = path.join(unownedSibling, 'sentinel.txt');
    fs.writeFileSync(siblingSentinel, 'MUST_SURVIVE_CLEANUP', 'utf8');

    assert.throws(
      () => noticesService.cleanupTestStorageDir(unownedSibling),
      (err) => err && err.code === 'UNOWNED_TEST_STORAGE_DIR'
    );
    assert.equal(fs.existsSync(siblingSentinel), true);

    // 4. Create an owned sub-run directory, upload an attachment into it, clean it up, and verify sibling survives
    const subOwnedDir = noticesService.createIsolatedTestStorageDir('r46-owned-sub-');
    process.env.TEST_NOTICE_ATTACHMENTS_DIR = subOwnedDir;
    try {
      const cleaned = noticesService.cleanupTestStorageDir(subOwnedDir);
      assert.equal(cleaned, true);
      assert.equal(fs.existsSync(subOwnedDir), false, 'Owned test storage dir should be removed after cleanup');
      assert.equal(fs.existsSync(siblingSentinel), true, 'Unowned sibling dir must remain untouched');
    } finally {
      process.env.TEST_NOTICE_ATTACHMENTS_DIR = isolatedTestDir;
    }
  });

  it('R47 (Part 1): post-commit crash on create leaves attachment staged on disk, but TTL cleanup queries DB, heals metadata to bound instead of deleting, and supports idempotent retry', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4 R47 POST COMMIT CRASH TEST CONTENT\n', 'utf8');
    const expectedSha = crypto.createHash('sha256').update(pdfBytes).digest('hex');

    const uploadRes = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
      name: 'r47-post-commit-crash.pdf',
      type: 'application/pdf',
      contentBase64: pdfBytes.toString('base64'),
    });
    assert.equal(uploadRes.status, 201);
    const crashedAtt = uploadRes.body.data;

    const createPayload = {
      title: '[R47-CRASH-CREATE] Thông Báo Kiểm Thử Crash Sau Khi DB Commit',
      content: 'Nội dung thông báo đã được commit vào PostgreSQL trước khi tiến trình gặp sự cố cập nhật .meta.json.',
      category: 'policy',
      priority: 'high',
      targetRole: null,
      targetDepartmentId: 'DEPT-IT',
      isPinned: false,
      attachments: [{ id: crashedAtt.id, name: crashedAtt.name }],
    };

    // 1. Simulate crash AFTER PostgreSQL transaction commits but BEFORE `.meta.json` is updated to `bound`
    let caughtCrashErr = null;
    try {
      await noticesService.create(hrActor, createPayload, null, {
        afterCommitBeforeDiskSyncHook: async () => {
          throw new Error('INJECTED_POST_COMMIT_CRASH_CREATE');
        },
      });
    } catch (err) {
      caughtCrashErr = err;
    }
    assert.ok(caughtCrashErr, 'Expected afterCommitBeforeDiskSyncHook to throw');
    assert.equal(caughtCrashErr.dbCommitted, true, 'Error after commit must be marked dbCommitted=true');

    // 2. Verify DB has committed the notice row referencing `crashedAtt.id`, while `.meta.json` is still `staged`
    const dbRefRow = await noticesService.findReferencingNoticeInDb(db, crashedAtt.id);
    assert.ok(dbRefRow, 'Notice row referencing attachment must exist in PostgreSQL after commit');
    const committedNoticeId = dbRefRow.id;

    try {
      const metaAfterCrash = noticesService.readAttachmentMeta(crashedAtt.id);
      assert.ok(metaAfterCrash);
      assert.equal(metaAfterCrash.state, 'staged');
      assert.equal(metaAfterCrash.noticeId, null);

      // 3. Age `.meta.json` beyond 2h TTL (4 hours ago) AND also create an unreferenced expired staged file
      const agedTimestamp = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
      fs.writeFileSync(
        metaAfterCrash.metaPath,
        JSON.stringify(
          {
            ...metaAfterCrash,
            binPath: undefined,
            metaPath: undefined,
            createdAt: agedTimestamp,
            state: 'staged',
            noticeId: null,
          },
          null,
          2
        ),
        'utf8'
      );

      const orphanUploadRes = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
        name: 'r47-true-orphan.pdf',
        type: 'application/pdf',
        contentBase64: Buffer.from('%PDF-1.4 TRUE ORPHAN\n').toString('base64'),
      });
      assert.equal(orphanUploadRes.status, 201);
      const trueOrphanAtt = orphanUploadRes.body.data;
      const orphanMeta = noticesService.readAttachmentMeta(trueOrphanAtt.id);
      fs.writeFileSync(
        orphanMeta.metaPath,
        JSON.stringify(
          {
            ...orphanMeta,
            binPath: undefined,
            metaPath: undefined,
            createdAt: agedTimestamp,
            state: 'staged',
            noticeId: null,
          },
          null,
          2
        ),
        'utf8'
      );

      // 4. Trigger TTL cleanup via a new `uploadAttachment` call (and verify its behavior)
      const triggerUpload = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
        name: 'r47-trigger-cleanup.pdf',
        type: 'application/pdf',
        contentBase64: Buffer.from('%PDF-1.4 TRIGGER CLEANUP\n').toString('base64'),
      });
      assert.equal(triggerUpload.status, 201);
      await noticesService.deleteAttachment(hrActor, triggerUpload.body.data.id);

      // Unreferenced expired staged file MUST be deleted
      assert.equal(
        noticesService.readAttachmentMeta(trueOrphanAtt.id),
        null,
        'Unreferenced expired staged attachment must be cleaned up'
      );

      // DB-referenced expired staged file MUST NOT be deleted, and MUST be healed to `bound`!
      const healedMeta = noticesService.readAttachmentMeta(crashedAtt.id);
      assert.ok(healedMeta, 'DB-referenced attachment must NEVER be deleted by TTL cleanup');
      assert.equal(healedMeta.state, 'bound');
      assert.equal(healedMeta.noticeId, committedNoticeId);

      // Download via HTTP route as in-scope employee -> 200 OK with exact SHA-256!
      const dlRes = await request(app)
        .get(`/api/notices/${committedNoticeId}/attachments/${crashedAtt.id}/download`)
        .set('Authorization', `Bearer ${itEmpSession.token}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      assert.equal(dlRes.status, 200);
      assert.equal(crypto.createHash('sha256').update(dlRes.body).digest('hex'), expectedSha);

      // 5. Simulate client retrying the exact same `create` request before `.meta.json` was synced
      fs.writeFileSync(
        healedMeta.metaPath,
        JSON.stringify(
          {
            ...healedMeta,
            binPath: undefined,
            metaPath: undefined,
            state: 'staged',
            noticeId: null,
          },
          null,
          2
        ),
        'utf8'
      );

      const countBeforeRetry = await db.query(
        'SELECT COUNT(*)::int AS cnt FROM company_notices WHERE title = $1',
        [createPayload.title]
      );
      assert.equal(countBeforeRetry.rows[0].cnt, 1);

      const retriedNotice = await noticesService.create(hrActor, createPayload, null);
      assert.equal(
        retriedNotice.id,
        committedNoticeId,
        'Idempotent retry of post-commit failed create must return the existing committed notice'
      );

      const countAfterRetry = await db.query(
        'SELECT COUNT(*)::int AS cnt FROM company_notices WHERE title = $1',
        [createPayload.title]
      );
      assert.equal(
        countAfterRetry.rows[0].cnt,
        1,
        'Idempotent retry must not insert a duplicate notice row'
      );
      assert.equal(noticesService.readAttachmentMeta(crashedAtt.id)?.state, 'bound');

      // 6. Attempting to bind `crashedAtt` to a DIFFERENT notice payload (even if disk meta is stale `staged`)
      // must be rejected with 409 ATTACHMENT_ALREADY_BOUND by the DB reference check!
      fs.writeFileSync(
        healedMeta.metaPath,
        JSON.stringify(
          {
            ...healedMeta,
            binPath: undefined,
            metaPath: undefined,
            state: 'staged',
            noticeId: null,
          },
          null,
          2
        ),
        'utf8'
      );

      await assert.rejects(
        () =>
          noticesService.create(
            hrActor,
            {
              ...createPayload,
              title: '[R47] Different Notice Trying To Steal Committed Attachment',
            },
            null
          ),
        (err) => err.status === 409 && err.code === 'ATTACHMENT_ALREADY_BOUND'
      );
      assert.equal(noticesService.readAttachmentMeta(crashedAtt.id)?.state, 'bound');
      assert.equal(noticesService.readAttachmentMeta(crashedAtt.id)?.noticeId, committedNoticeId);

      // And if disk meta is stale `staged` when reconcileAttachmentStorage runs directly, it heals it to `bound`
      fs.writeFileSync(
        healedMeta.metaPath,
        JSON.stringify(
          {
            ...healedMeta,
            binPath: undefined,
            metaPath: undefined,
            state: 'staged',
            noticeId: null,
          },
          null,
          2
        ),
        'utf8'
      );
      const recAfterStealAttempt = await noticesService.reconcileAttachmentStorage(db);
      assert.ok(recAfterStealAttempt.restored.includes(crashedAtt.id));
      assert.ok(recAfterStealAttempt.promotedStaged.includes(crashedAtt.id));
    } finally {
      await noticesService.remove(hrActor, committedNoticeId, null);
    }
  });

  it('R47 (Part 2): post-commit crash on update preserves committed state (does not restore pre-commit snapshot), and reconcileAttachmentStorage + CLI script converge disk with DB', async () => {
    const att1Res = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
      name: 'r47-update-old.pdf',
      type: 'application/pdf',
      contentBase64: Buffer.from('%PDF-1.4 R47 OLD ATTACHMENT\n').toString('base64'),
    });
    const att1 = att1Res.body.data;

    const created = await noticesService.create(
      hrActor,
      {
        title: '[R47-UPDATE] Notice Before Update Crash',
        content: 'Initial content with att1',
        category: 'general',
        priority: 'normal',
        isPinned: false,
        attachments: [{ id: att1.id, name: att1.name }],
      },
      null
    );

    try {
      const att2Res = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
        name: 'r47-update-new.pdf',
        type: 'application/pdf',
        contentBase64: Buffer.from('%PDF-1.4 R47 NEW ATTACHMENT\n').toString('base64'),
      });
      const att2 = att2Res.body.data;

      // Simulate crash on `update` AFTER DB commit but BEFORE post-commit file sync/unlink
      let updateCrashErr = null;
      try {
        await noticesService.update(
          hrActor,
          created.id,
          {
            title: '[R47-UPDATE] Notice After Update Committed',
            attachments: [{ id: att2.id, name: att2.name }],
          },
          null,
          {
            afterCommitBeforeDiskSyncHook: async () => {
              throw new Error('INJECTED_POST_COMMIT_CRASH_UPDATE');
            },
          }
        );
      } catch (err) {
        updateCrashErr = err;
      }
      assert.ok(updateCrashErr);
      assert.equal(updateCrashErr.dbCommitted, true);

      // Verify pre-commit snapshot was NOT restored over `att1` (it remains `deletion-pending` on disk, while `att2` is `staged`)
      const att1MetaBeforeRec = noticesService.readAttachmentMeta(att1.id);
      const att2MetaBeforeRec = noticesService.readAttachmentMeta(att2.id);
      assert.equal(att1MetaBeforeRec.state, 'deletion-pending');
      assert.equal(att2MetaBeforeRec.state, 'staged');

      // Run `reconcileAttachmentStorage(db)` -> promotes `att2` to `bound` and deletes unreferenced `att1`!
      const recRes = await noticesService.reconcileAttachmentStorage(db);
      assert.ok(recRes.promotedStaged.includes(att2.id));
      assert.ok(recRes.deletedPending.includes(att1.id));
      assert.equal(noticesService.readAttachmentMeta(att1.id), null);
      assert.equal(noticesService.readAttachmentMeta(att2.id)?.state, 'bound');
      assert.equal(noticesService.readAttachmentMeta(att2.id)?.noticeId, created.id);

      // Running `reconcileAttachmentStorage(db)` a second time is idempotent
      const secondRec = await noticesService.reconcileAttachmentStorage(db);
      assert.equal(secondRec.deleted.length, 0);
      assert.equal(secondRec.restored.length, 0);

      // Verify CLI operational entry point `Backend/scripts/reconcile-attachments.js`
      const cliOut = execFileSync(
        process.execPath,
        [path.join(__dirname, '../../scripts/reconcile-attachments.js')],
        {
          env: {
            ...process.env,
            NODE_ENV: 'test',
            DB_NAME: 'nexus_hrms_test',
            TEST_NOTICE_ATTACHMENTS_DIR: isolatedTestDir,
          },
          encoding: 'utf8',
        }
      );
      const cliJson = JSON.parse(cliOut);
      assert.equal(cliJson.status, 'OK');
      assert.equal(cliJson.database, 'nexus_hrms_test');
    } finally {
      await noticesService.remove(hrActor, created.id, null);
    }
  });

  it('R47 (Part 3): enforces PostgreSQL transaction-scoped advisory lock (pg_try_advisory_xact_lock) across separate DB connections', async () => {
    const lockAttRes = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
      name: 'r47-advisory-lock.pdf',
      type: 'application/pdf',
      contentBase64: Buffer.from('%PDF-1.4 R47 ADVISORY LOCK\n').toString('base64'),
    });
    assert.equal(lockAttRes.status, 201);
    const lockAtt = lockAttRes.body.data;

    // Acquire PostgreSQL advisory lock on a separate database connection (simulating another Node.js worker instance)
    const externalClient = await db.pool.connect();
    try {
      await externalClient.query('BEGIN');
      const lockCheck = await externalClient.query(
        'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired',
        [`nexus_notice_att:${lockAtt.id}`]
      );
      assert.equal(lockCheck.rows[0].acquired, true);

      // Even though in-process `inFlightAttachmentLocks` does NOT hold `lockAtt.id`,
      // `noticesService.create` must fail with 409 ATTACHMENT_CONCURRENT_CONFLICT from PostgreSQL advisory lock!
      await assert.rejects(
        () =>
          noticesService.create(
            hrActor,
            {
              title: '[R47-LOCK] Contending Notice Across Workers',
              content: 'Blocked by pg_try_advisory_xact_lock',
              category: 'general',
              priority: 'normal',
              isPinned: false,
              attachments: [{ id: lockAtt.id, name: lockAtt.name }],
            },
            null
          ),
        (err) => err.status === 409 && err.code === 'ATTACHMENT_CONCURRENT_CONFLICT'
      );
    } finally {
      await externalClient.query('ROLLBACK').catch(() => {});
      externalClient.release();
    }

    // Once the external transaction releases the advisory lock, binding succeeds and we clean up
    const createdAfterUnlock = await noticesService.create(
      hrActor,
      {
        title: '[R47-LOCK] Succeeded After Advisory Lock Release',
        content: 'Advisory lock released',
        category: 'general',
        priority: 'normal',
        isPinned: false,
        attachments: [{ id: lockAtt.id, name: lockAtt.name }],
      },
      null
    );
    await noticesService.remove(hrActor, createdAfterUnlock.id, null);
  });

  it('R48: synchronizes PostgreSQL transaction advisory locks across bind, TTL cleanup, reconciliation, and deleteAttachment across separate OS processes/CLI with explicit barriers', async () => {
    const r48Bytes = Buffer.from('%PDF-1.4 R48 CROSS PROCESS BARRIER TEST\n', 'utf8');
    const r48ExpectedSha = crypto.createHash('sha256').update(r48Bytes).digest('hex');

    const uploadRes = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
      name: 'r48-barrier-interleaved.pdf',
      type: 'application/pdf',
      contentBase64: r48Bytes.toString('base64'),
    });
    assert.equal(uploadRes.status, 201);
    const r48Att = uploadRes.body.data;

    // Age staged file > 2h TTL so Process B cleanup/reconcile would delete it if not protected by DB advisory lock
    const initialMeta = noticesService.readAttachmentMeta(r48Att.id);
    fs.writeFileSync(
      initialMeta.metaPath,
      JSON.stringify(
        {
          ...initialMeta,
          binPath: undefined,
          metaPath: undefined,
          createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
          state: 'staged',
          noticeId: null,
        },
        null,
        2
      ),
      'utf8'
    );

    let notifyEnteredTx;
    const enteredTxBarrier = new Promise((resolve) => {
      notifyEnteredTx = resolve;
    });
    let releaseCommitBarrier;
    const commitBarrier = new Promise((resolve) => {
      releaseCommitBarrier = resolve;
    });

    // 1. Process A: Bind `r48Att` inside a transaction and hold at `beforeCommitHook` BEFORE `COMMIT`
    const createPromise = noticesService.create(
      hrActor,
      {
        title: '[R48-BARRIER] Notice Holding Advisory Lock Before Commit',
        content: 'Process A holds pg_try_advisory_xact_lock while Process B runs cleanup/reconcile/delete',
        category: 'policy',
        priority: 'high',
        targetRole: null,
        targetDepartmentId: 'DEPT-IT',
        isPinned: false,
        attachments: [{ id: r48Att.id, name: r48Att.name }],
      },
      null,
      {
        beforeCommitHook: async () => {
          notifyEnteredTx();
          await commitBarrier;
        },
      }
    );

    await enteredTxBarrier;

    const childEnv = {
      ...process.env,
      NODE_ENV: 'test',
      DB_NAME: 'nexus_hrms_test',
      TEST_NOTICE_ATTACHMENTS_DIR: isolatedTestDir,
    };

    // 1A. Process B (separate OS process with its own Set & DB connection): Run CLI `reconcile-attachments.js`
    const cliWhileLockedOut = execFileSync(
      process.execPath,
      [path.join(__dirname, '../../scripts/reconcile-attachments.js')],
      { env: childEnv, encoding: 'utf8' }
    );
    const cliWhileLockedJson = JSON.parse(cliWhileLockedOut);
    assert.equal(cliWhileLockedJson.status, 'OK');
    assert.equal(cliWhileLockedJson.reconciliation.deleted.length, 0);
    assert.ok(
      cliWhileLockedJson.reconciliation.skippedInFlight.includes(r48Att.id),
      'CLI reconcile in Process B must skip attachment locked by Process A transaction'
    );
    assert.ok(noticesService.readAttachmentMeta(r48Att.id), 'File must remain on disk');

    // 1B. Process B (separate OS process): Run `cleanupExpiredOrphanAttachments` AND `deleteAttachment`
    const childWorkerScript = `
      const db = require('./src/config/db');
      const noticesService = require('./src/modules/notices/service');
      (async () => {
        const attId = process.argv[1];
        const hrUserId = process.argv[2];
        const cleanupSummary = await noticesService.cleanupExpiredOrphanAttachments(noticesService.STAGED_TTL_MS, db);
        let deleteResult = null;
        try {
          await noticesService.deleteAttachment({ userId: hrUserId, roleCode: 'HR_DIRECTOR' }, attId, { executor: db });
          deleteResult = { status: 200 };
        } catch (err) {
          deleteResult = { status: err.status || 500, code: err.code || null, message: err.message };
        }
        await db.pool.end().catch(() => {});
        console.log(JSON.stringify({ cleanupSummary, deleteResult }));
      })();
    `;
    const workerOut = execFileSync(
      process.execPath,
      ['-e', childWorkerScript, r48Att.id, String(hrActor.userId)],
      {
        cwd: path.join(__dirname, '../..'),
        env: childEnv,
        encoding: 'utf8',
      }
    );
    const workerJson = JSON.parse(workerOut);
    assert.equal(workerJson.cleanupSummary.deleted.length, 0);
    assert.ok(
      workerJson.cleanupSummary.skippedInFlight.includes(r48Att.id),
      'TTL cleanup in Process B must skip attachment locked by Process A transaction'
    );
    assert.equal(workerJson.deleteResult.status, 409);
    assert.equal(
      workerJson.deleteResult.code,
      'ATTACHMENT_CONCURRENT_CONFLICT',
      'deleteAttachment in Process B must conflict with 409 while Process A holds DB advisory lock'
    );
    assert.ok(noticesService.readAttachmentMeta(r48Att.id), 'File must still exist on disk');

    // 2. Release Process A commit barrier -> A commits -> download matches SHA-256!
    releaseCommitBarrier();
    const committedNotice = await createPromise;
    try {
      const dlRes = await request(app)
        .get(`/api/notices/${committedNotice.id}/attachments/${r48Att.id}/download`)
        .set('Authorization', `Bearer ${itEmpSession.token}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      assert.equal(dlRes.status, 200);
      assert.equal(
        crypto.createHash('sha256').update(dlRes.body).digest('hex'),
        r48ExpectedSha
      );
    } finally {
      await noticesService.remove(hrActor, committedNotice.id, null);
    }

    // 3. Process A rolls back before COMMIT -> unreferenced expired file is legitimately cleaned up afterwards by Process B CLI
    const rbUploadRes = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
      name: 'r48-rollback-then-clean.pdf',
      type: 'application/pdf',
      contentBase64: Buffer.from('%PDF-1.4 R48 ROLLBACK THEN CLEAN\n').toString('base64'),
    });
    assert.equal(rbUploadRes.status, 201);
    const rbAtt = rbUploadRes.body.data;
    const rbMeta = noticesService.readAttachmentMeta(rbAtt.id);
    fs.writeFileSync(
      rbMeta.metaPath,
      JSON.stringify(
        {
          ...rbMeta,
          binPath: undefined,
          metaPath: undefined,
          createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
          state: 'staged',
          noticeId: null,
        },
        null,
        2
      ),
      'utf8'
    );

    await assert.rejects(
      () =>
        noticesService.create(
          hrActor,
          {
            title: '[R48-ROLLBACK] Notice Rolling Back Before Commit',
            content: 'Will rollback after CLI check',
            category: 'general',
            priority: 'normal',
            isPinned: false,
            attachments: [{ id: rbAtt.id, name: rbAtt.name }],
          },
          null,
          {
            beforeCommitHook: async () => {
              // While locked in Process A, CLI in Process B must skip it
              const midCli = JSON.parse(
                execFileSync(
                  process.execPath,
                  [path.join(__dirname, '../../scripts/reconcile-attachments.js')],
                  { env: childEnv, encoding: 'utf8' }
                )
              );
              assert.ok(midCli.reconciliation.skippedInFlight.includes(rbAtt.id));
              throw new Error('INJECTED_R48_PRE_COMMIT_ROLLBACK');
            },
          }
        ),
      /INJECTED_R48_PRE_COMMIT_ROLLBACK/
    );

    // Now that Process A rolled back and released the DB advisory lock, CLI in Process B legitimately cleans up `rbAtt`
    const postRbCli = JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(__dirname, '../../scripts/reconcile-attachments.js')],
        { env: childEnv, encoding: 'utf8' }
      )
    );
    assert.equal(postRbCli.status, 'OK');
    assert.ok(postRbCli.reconciliation.deletedExpiredStaged.includes(rbAtt.id));
    assert.equal(noticesService.readAttachmentMeta(rbAtt.id), null);

    // Confirm production storage directory remains untouched
    if (fs.existsSync(noticesService.PROD_DEFAULT_STORAGE_DIR)) {
      const prodStorageSnapshotAfter = fs
        .readdirSync(noticesService.PROD_DEFAULT_STORAGE_DIR)
        .sort();
      assert.deepEqual(prodStorageSnapshotAfter, prodStorageSnapshotBefore);
    }
  });
});
