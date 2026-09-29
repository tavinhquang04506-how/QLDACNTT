#!/usr/bin/env node
/**
 * check-phase-a-baseline.js
 * Strictly read-only inspection of environment, Git commit, nexus_hrms preservation state,
 * and nexus_hrms_test readiness for Phase A / Phase F verification.
 */
const { execSync } = require('child_process');
const { Pool } = require('pg');
const config = require('../src/config/env');
const { checkSchemaReadiness } = require('../src/utils/schemaReadiness');

async function inspectDbReadOnly(dbName) {
  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: dbName,
    user: config.db.user,
    password: config.db.password,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const dbRes = await client.query('SELECT current_database() AS db, version() AS pg_version');
    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
    );
    const counts = {};
    for (const r of tablesRes.rows) {
      const cRes = await client.query(`SELECT COUNT(*)::int AS cnt FROM "${r.table_name}"`);
      counts[r.table_name] = cRes.rows[0].cnt;
    }
    const readiness = await checkSchemaReadiness(client);
    await client.query('COMMIT');
    return {
      database: dbRes.rows[0].db,
      pgVersion: dbRes.rows[0].pg_version.split(',')[0],
      tableCount: tablesRes.rows.length,
      readinessStatus: readiness.status,
      ready: readiness.ready,
      pendingMigrations: readiness.pendingMigrations,
      missingTables: readiness.missingTables,
      missingColumns: readiness.missingColumns,
      counts,
    };
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const commit = execSync('git rev-parse --short HEAD').toString().trim();
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  const primaryReport = await inspectDbReadOnly('nexus_hrms');
  const testReport = await inspectDbReadOnly(process.env.DB_NAME_TEST || 'nexus_hrms_test');

  const manifest = {
    timestamp: new Date().toISOString(),
    gitCommit: commit,
    gitBranch: branch,
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    sanitizedEnv: {
      PORT: config.port,
      NODE_ENV: config.nodeEnv,
      DB_HOST: config.db.host,
      DB_PORT: config.db.port,
      DB_NAME_PRIMARY: 'nexus_hrms',
      DB_NAME_TEST: process.env.DB_NAME_TEST || 'nexus_hrms_test',
      GEMINI_API_KEY_CONFIGURED: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
    },
    primaryDb: primaryReport,
    testDb: testReport,
  };

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error('Baseline check failed:', err.message);
  process.exit(1);
});
