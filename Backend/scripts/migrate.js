const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DEFAULT_DIR = path.resolve(__dirname, '../migrations');

function parseCliArgs(argv = process.argv.slice(2)) {
  const out = { targetDb: null, confirmProductionDb: null };
  for (const arg of argv) {
    if (arg.startsWith('--target-db=')) {
      out.targetDb = arg.slice('--target-db='.length).trim();
    } else if (arg.startsWith('--confirm-production-db=')) {
      out.confirmProductionDb = arg.slice('--confirm-production-db='.length).trim();
    }
  }
  return out;
}

async function runMigrations({
  pool,
  dir = DEFAULT_DIR,
  log = () => {},
  expectedDatabase = null,
  confirmProductionDb = null,
} = {}) {
  if (!pool || typeof pool.query !== 'function') {
    const err = new Error('[MIGRATE_GUARD] Valid database pool is required for runMigrations');
    err.code = 'MIGRATION_INVALID_POOL';
    throw err;
  }
  const dbRes = await pool.query('SELECT current_database() AS db_name');
  const currentDb = dbRes?.rows?.[0]?.db_name || null;
  if (expectedDatabase && currentDb !== expectedDatabase) {
    const err = new Error(
      `[MIGRATE_GUARD] Connected current_database()="${currentDb}" does not match expected target "${expectedDatabase}"`
    );
    err.code = 'MIGRATION_TARGET_MISMATCH';
    throw err;
  }
  if (
    (currentDb === 'nexus_hrms' || expectedDatabase === 'nexus_hrms') &&
    confirmProductionDb !== 'nexus_hrms'
  ) {
    const err = new Error(
      '[MIGRATE_GUARD] Refusing to run migrations on primary database "nexus_hrms" without explicit --confirm-production-db=nexus_hrms'
    );
    err.code = 'MIGRATION_PRODUCTION_GUARD';
    throw err;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(200) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
    : [];
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));

  // If 007_pip_workflow.sql is already recorded on an existing database whose schema was
  // initialized with 001..006 baked in, backfill 001..006 in schema_migrations so forward
  // migrations (008+) apply cleanly without re-creating existing tables.
  if (done.has('007_pip_workflow.sql')) {
    for (const file of files) {
      if (file < '007_pip_workflow.sql' && !done.has(file)) {
        await pool.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        done.add(file);
      }
    }
  }

  const applied = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
      log(`applied ${file} on ${currentDb}`);
    } catch (err) {
      await client.query('ROLLBACK');
      err.message = `Migration ${file} failed: ${err.message}`;
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}

if (require.main === module) {
  const config = require('../src/config/env');
  const { targetDb, confirmProductionDb } = parseCliArgs();
  const resolvedTargetDb = targetDb || config.db.database;

  if (!resolvedTargetDb || !/^[a-z0-9_]+$/i.test(resolvedTargetDb)) {
    console.error(`❌ Invalid target database name: "${resolvedTargetDb}"`);
    process.exit(1);
  }

  // Prevent accidental migration of the primary database during test/dev unless explicitly confirmed
  if (resolvedTargetDb === 'nexus_hrms' && confirmProductionDb !== 'nexus_hrms') {
    console.error(
      '❌ Refusing to run migrations on primary database "nexus_hrms" without explicit "--confirm-production-db=nexus_hrms" flag (see docs/remediation/MIGRATION_RUNBOOK.md).'
    );
    process.exit(1);
  }

  const pool = new Pool({
    ...config.db,
    database: resolvedTargetDb,
    options: `-c timezone=${config.timezone}`,
  });

  runMigrations({
    pool,
    log: console.log,
    expectedDatabase: resolvedTargetDb,
    confirmProductionDb,
  })
    .then((applied) => {
      console.log(
        applied.length
          ? `✅ [${resolvedTargetDb}] ${applied.length} migration(s) applied`
          : `✅ [${resolvedTargetDb}] Database is up to date`
      );
      return pool.end();
    })
    .catch(async (err) => {
      console.error('❌', err.message);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}

module.exports = { runMigrations, parseCliArgs };
