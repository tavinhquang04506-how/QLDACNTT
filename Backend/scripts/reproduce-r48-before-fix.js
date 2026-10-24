// ============================================
// scripts/reproduce-r48-before-fix.js — Safe reproduction of R48 on baseline 984ac62
// Demonstrates cross-process race between Process A (bind in transaction before COMMIT, holding pg_try_advisory_xact_lock)
// and Process B (CLI reconcile-attachments.js in a separate OS process without DB advisory lock).
// Uses ONLY nexus_hrms_test and an isolated mkdtemp test storage directory.
// ============================================
process.env.NODE_ENV = 'test';
require('../tests/helpers/env');

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const db = require('../src/config/db');
const noticesService = require('../src/modules/notices/service');

async function main() {
  if (db.pool.options.database !== 'nexus_hrms_test') {
    throw new Error(`Refusing to run on non-test DB: ${db.pool.options.database}`);
  }

  const isolatedDir = noticesService.createIsolatedTestStorageDir('r48-repro-');
  process.env.TEST_NOTICE_ATTACHMENTS_DIR = isolatedDir;
  let createdNoticeId = null;

  try {
    const { rows: hrRows } = await db.query(
      `SELECT u.id AS user_id, u.role_code, u.employee_id, e.department_id
       FROM users u LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.role_code = 'HR_DIRECTOR' AND u.is_active = TRUE LIMIT 1`
    );
    const hrActor = {
      userId: hrRows[0].user_id,
      roleCode: hrRows[0].role_code,
      employeeId: hrRows[0].employee_id,
      departmentId: hrRows[0].department_id,
    };

    const uploaded = await noticesService.uploadAttachment(hrActor, {
      name: 'r48-interleaved-race.pdf',
      type: 'application/pdf',
      contentBase64: Buffer.from('%PDF-1.4 R48 CROSS PROCESS RACE\n', 'utf8').toString('base64'),
    });

    // Age staged file > 2h TTL (e.g., user kept create modal open or clock skew)
    const metaBefore = noticesService.readAttachmentMeta(uploaded.id);
    fs.writeFileSync(
      metaBefore.metaPath,
      JSON.stringify(
        {
          ...metaBefore,
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

    let notifyInsideTx;
    const insideTxReady = new Promise((resolve) => {
      notifyInsideTx = resolve;
    });
    let releaseCommitBarrier;
    const commitBarrier = new Promise((resolve) => {
      releaseCommitBarrier = resolve;
    });

    // Process A: Bind attachment inside DB transaction (holds pg_try_advisory_xact_lock, paused before COMMIT)
    const createPromise = noticesService.create(
      hrActor,
      {
        title: '[R48-REPRO] Notice In Flight Before Commit',
        content: 'Holding pg_try_advisory_xact_lock while CLI runs in Process B',
        category: 'general',
        priority: 'normal',
        isPinned: false,
        attachments: [{ id: uploaded.id, name: uploaded.name }],
      },
      null,
      {
        beforeCommitHook: async () => {
          notifyInsideTx();
          await commitBarrier;
        },
      }
    );

    await insideTxReady;

    // Process B: Separate OS process running CLI `reconcile-attachments.js` while Process A holds DB advisory lock
    const cliStdout = execFileSync(
      process.execPath,
      [path.join(__dirname, 'reconcile-attachments.js')],
      {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DB_NAME: 'nexus_hrms_test',
          TEST_NOTICE_ATTACHMENTS_DIR: isolatedDir,
        },
        encoding: 'utf8',
      }
    );
    const cliResult = JSON.parse(cliStdout);

    // Release Process A so it commits
    releaseCommitBarrier();
    const created = await createPromise;
    createdNoticeId = created.id;

    const metaAfterCommit = noticesService.readAttachmentMeta(uploaded.id);
    const dbRefAfterCommit = await noticesService.findReferencingNoticeInDb(db, uploaded.id);

    const report = {
      baselineCommit: '984ac62',
      finding: 'R48',
      attachmentId: uploaded.id,
      committedNoticeId: createdNoticeId,
      dbReferencesAttachmentAfterCommit: Boolean(dbRefAfterCommit),
      cliDeletedInProcessB: cliResult.reconciliation?.deleted || [],
      cliSkippedInFlightInProcessB: cliResult.reconciliation?.skippedInFlight || [],
      fileExistsOnDiskAfterCommit: Boolean(metaAfterCommit),
      bugReproduced: Boolean(dbRefAfterCommit) && !metaAfterCommit,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (createdNoticeId) {
      await db.query('DELETE FROM notifications WHERE id = $1', [`NOTIF-${createdNoticeId}`]);
      await db.query('DELETE FROM company_notices WHERE id = $1', [createdNoticeId]);
    }
    noticesService.cleanupTestStorageDir(isolatedDir);
    await db.pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
