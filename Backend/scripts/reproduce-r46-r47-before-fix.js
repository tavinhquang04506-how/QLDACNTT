/**
 * Safe Reproduction Script for R46 & R47 BEFORE Fix (Baseline 89ab5f5)
 * - NEVER calls cleanup or delete on repository or production storage paths.
 * - Uses only pure function checks for R46 and an isolated temp folder in os.tmpdir() + nexus_hrms_test for R47.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'nexus_hrms_test';

const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../src/config/db');
const { assertSafeTestDatabase } = require('../src/utils/testDbGuard');
const noticesService = require('../src/modules/notices/service');

async function main() {
  await assertSafeTestDatabase(db, { context: 'reproduce-r46-r47-before-fix' });

  const report = {
    timestamp: new Date().toISOString(),
    baselineCommit: '89ab5f5',
    r46: {},
    r47: {},
  };

  // =========================================================================
  // 1. Reproduce R46 (Pure function inspection — NO file deletion!)
  // =========================================================================
  const repoRoot = path.resolve(__dirname, '../..');
  const storageParent = path.resolve(__dirname, '../storage');

  let repoRootRejected = false;
  let storageParentRejected = false;
  try {
    noticesService.assertSafeStorageDir(repoRoot);
  } catch (_err) {
    repoRootRejected = true;
  }
  try {
    noticesService.assertSafeStorageDir(storageParent);
  } catch (_err) {
    storageParentRejected = true;
  }

  const prevNoticeDir = process.env.NOTICE_ATTACHMENTS_DIR;
  let inheritedProdEnvInTest = false;
  try {
    process.env.NOTICE_ATTACHMENTS_DIR = storageParent;
    const resolvedInTest = noticesService.getStorageDir();
    inheritedProdEnvInTest = path.resolve(resolvedInTest) === storageParent;
  } catch (_err) {
    inheritedProdEnvInTest = false;
  } finally {
    if (prevNoticeDir === undefined) delete process.env.NOTICE_ATTACHMENTS_DIR;
    else process.env.NOTICE_ATTACHMENTS_DIR = prevNoticeDir;
  }

  report.r46 = {
    repoRootRejected,
    storageParentRejected,
    inheritedProdEnvInTest,
    bugReproduced: !repoRootRejected || !storageParentRejected || inheritedProdEnvInTest,
  };

  // =========================================================================
  // 2. Reproduce R47 (Isolated temp dir in os.tmpdir() + nexus_hrms_test)
  // =========================================================================
  const isolatedReproDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-r47-repro-'));
  process.env.TEST_NOTICE_ATTACHMENTS_DIR = isolatedReproDir;
  let createdNoticeId = null;

  try {
    const actor = { userId: '00000000-0000-0000-0000-000000000001', employeeId: null, roleCode: 'HR_DIRECTOR' };
    const uploaded = await noticesService.uploadAttachment(actor, {
      name: 'r47-crash-repro.pdf',
      contentBase64: Buffer.from('%PDF-1.4\nR47 crash before meta bound\n%%EOF', 'utf8').toString('base64'),
    });

    // Simulate DB transaction COMMIT succeeded (`company_notices` references `uploaded.id`),
    // but process crashed before `commitBoundAttachmentsToDisk` updated `.meta.json` from `staged` to `bound`.
    const ins = await db.query(
      `INSERT INTO company_notices (title, content, category, priority, is_pinned, attachments)
       VALUES ($1, $2, 'general', 'normal', FALSE, $3::jsonb)
       RETURNING id`,
      [
        'R47 Crash Repro Notice',
        'Notice committed in DB before .meta.json was marked bound',
        JSON.stringify([{ id: uploaded.id, name: uploaded.name, size: uploaded.size, type: uploaded.type }]),
      ]
    );
    createdNoticeId = ins.rows[0].id;

    // Age `.meta.json` past the 2-hour staged TTL (3 hours old) while keeping `state: 'staged', noticeId: null`
    const metaPath = path.join(isolatedReproDir, `${uploaded.id}.meta.json`);
    const binPath = path.join(isolatedReproDir, `${uploaded.id}.bin`);
    const metaObj = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    metaObj.createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(metaObj, null, 2), 'utf8');

    // Step A: Run reconcileAttachmentStorage -> on 89ab5f5 it ignores `staged` even though DB references it
    const reconcileRes = await noticesService.reconcileAttachmentStorage(db);
    const metaAfterReconcile = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    // Step B: Trigger a new upload -> calls `cleanupExpiredOrphanAttachments()`
    const secondUpload = await noticesService.uploadAttachment(actor, {
      name: 'trigger-cleanup.pdf',
      contentBase64: Buffer.from('%PDF-1.4\ntrigger cleanup\n%%EOF', 'utf8').toString('base64'),
    });
    const firstBinStillExistsAfterNewUpload = fs.existsSync(binPath);

    report.r47 = {
      attachmentId: uploaded.id,
      noticeId: createdNoticeId,
      reconcileRestoredCount: reconcileRes.restored?.length || 0,
      stateAfterReconcile: metaAfterReconcile.state,
      firstBinStillExistsAfterNewUpload,
      bugReproduced: !firstBinStillExistsAfterNewUpload || metaAfterReconcile.state !== 'bound',
      secondUploadId: secondUpload.id,
    };
  } finally {
    if (createdNoticeId) {
      await db.query('DELETE FROM company_notices WHERE id = $1', [createdNoticeId]).catch(() => {});
    }
    delete process.env.TEST_NOTICE_ATTACHMENTS_DIR;
    try {
      fs.rmSync(isolatedReproDir, { recursive: true, force: true });
    } catch (_e) {}
    await db.pool.end().catch(() => {});
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
