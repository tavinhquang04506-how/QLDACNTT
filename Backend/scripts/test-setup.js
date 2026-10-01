// Recreates the dedicated test database from database/schema.sql (+ migrations, added in Task 3).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../src/config/env');
const { runMigrations } = require('./migrate');

function assertTestDatabaseName(name) {
  if (typeof name !== 'string' || !/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to use database "${name}": test database name must match /^[a-z0-9_]+_test$/ (must end with _test)`);
  }
}

async function main() {
  const dbName = config.db.database;
  assertTestDatabaseName(dbName);

  const admin = new Client({ ...config.db, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const client = new Client(config.db);
  await client.connect();
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
  await client.query(schemaSql);
  await client.end();

  const db = require('../src/config/db');
  const applied = await runMigrations({ pool: db.pool });
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
