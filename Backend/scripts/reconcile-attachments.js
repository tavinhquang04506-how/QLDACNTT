// ============================================
// scripts/reconcile-attachments.js — Notice Attachment Storage Reconciliation CLI (R47)
// Converges on-disk notice_attachments (.bin/.meta.json) with PostgreSQL company_notices truth.
// - Promotes DB-referenced 'staged' / 'deletion-pending' files to 'bound'
// - Deletes unreferenced 'deletion-pending' and expired 'staged' files
// - Fails closed (deletes nothing) if PostgreSQL is unreachable
// ============================================
const config = require('../src/config/env');
const db = require('../src/config/db');
const noticesService = require('../src/modules/notices/service');

async function main() {
  const ttlArg = process.argv.find((arg) => arg.startsWith('--ttl-ms='));
  const ttlMs = ttlArg ? Number(ttlArg.split('=')[1]) : undefined;

  try {
    const result = await noticesService.reconcileAttachmentStorage(
      db,
      Number.isFinite(ttlMs) ? { ttlMs } : {}
    );
    const payload = {
      status: result.dbError ? 'FAIL_CLOSED_DB_ERROR' : 'OK',
      database: config.db.database,
      storageDir: noticesService.getStorageDir(),
      reconciliation: result,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(payload, null, 2));
    if (result.dbError) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(
      JSON.stringify(
        {
          status: 'ERROR',
          database: config.db.database,
          error: err.message,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    await db.pool.end().catch(() => {});
  }
}

main();
