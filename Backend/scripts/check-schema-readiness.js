#!/usr/bin/env node
/**
 * R16: Read-only schema preflight / readiness CLI check.
 * Inspects applied vs pending migrations and required tables/columns without mutating any data.
 * Exits with code 0 when READY, or code 2 when DEPLOYMENT_PENDING (unless --report-only is passed).
 */
const { Pool } = require('pg');
const config = require('../src/config/env');
const { checkSchemaReadiness } = require('../src/utils/schemaReadiness');

async function main() {
  const targetDb = process.env.DB_NAME || config.db.database;
  const reportOnly = process.argv.includes('--report-only');
  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: targetDb,
    user: config.db.user,
    password: config.db.password,
  });

  try {
    const result = await checkSchemaReadiness(pool);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready && !reportOnly) {
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Schema readiness check failed:', err.message);
  process.exit(1);
});
