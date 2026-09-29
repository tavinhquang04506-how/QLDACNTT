// Recreates the dedicated test database from database/schema.sql (+ migrations, added in Task 3).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../src/config/env');
const { runMigrations } = require('./migrate');
const { assertTestDatabaseName, assertSafeTestDatabase } = require('../src/utils/testDbGuard');

async function main() {
  const dbName = config.db.database;
  assertTestDatabaseName(dbName, 'scripts/test-setup.js target database');

  const admin = new Client({ ...config.db, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const client = new Client(config.db);
  await client.connect();
  await assertSafeTestDatabase(client, 'scripts/test-setup.js schema execution');
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
  await client.query(schemaSql);
  await client.end();

  const db = require('../src/config/db');
  await assertSafeTestDatabase(db, 'scripts/test-setup.js migration execution');
  const applied = await runMigrations({ pool: db.pool, expectedDatabase: dbName });
  await db.pool.end();
  if (applied.length) console.log(`✅ Applied ${applied.length} migration(s): ${applied.join(', ')}`);

  console.log(`✅ Test database "${dbName}" recreated from schema.sql`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ test-setup failed:', err.message);
    process.exit(1);
  });
}

module.exports = { assertTestDatabaseName };
