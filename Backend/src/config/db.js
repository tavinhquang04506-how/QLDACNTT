const { Pool, types } = require('pg');
const config = require('./env');
const { assertSafeTestDatabase, assertTestDatabaseName } = require('../utils/testDbGuard');

// Return DATE columns as 'YYYY-MM-DD' strings. The default parser builds a local-midnight Date that
// JSON.stringify shifts to the previous day in timezones ahead of UTC.
types.setTypeParser(types.builtins.DATE, (value) => value);

const pool = new Pool({
  ...config.db,
  // Company time zone for every connection: CURRENT_DATE, the 08:00 late threshold and month boundaries.
  options: `-c timezone=${config.timezone}`,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
});

let testPoolVerifiedPromise = null;

async function ensureTestPoolSafe(contextLabel) {
  if (!config.isTest) return;
  assertTestDatabaseName(config.db.database, contextLabel);
  if (pool.connect?.mock || pool.query?.mock) {
    return;
  }
  if (!testPoolVerifiedPromise) {
    testPoolVerifiedPromise = assertSafeTestDatabase(
      {
        configuredDatabase: config.db.database,
        query: (t, p) => pool.query(t, p),
      },
      contextLabel
    ).catch((err) => {
      testPoolVerifiedPromise = null;
      throw err;
    });
  }
  await testPoolVerifiedPromise;
}

const query = async (text, params) => {
  if (config.isTest && !/^\s*SELECT\s+current_database\(\)/i.test(String(text || ''))) {
    await ensureTestPoolSafe('db.query');
  }
  return pool.query(text, params);
};

const getClient = async () => {
  if (config.isTest) {
    await ensureTestPoolSafe('db.getClient');
  }
  return pool.connect();
};

/**
 * Run `fn(client)` inside BEGIN/COMMIT; ROLLBACK and rethrow on any error.
 */
async function withTransaction(fn) {
  if (config.isTest) {
    await ensureTestPoolSafe('db.withTransaction');
  }
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      releaseError = rollbackErr; // the connection is unusable: let the pool discard it
    }
    throw err;
  } finally {
    client.release(releaseError);
  }
}

/**
 * Run `fn(client)` inside a REPEATABLE READ READ ONLY transaction so multi-query reads
 * (such as pagination metadata + snapshot_token + page rows) share a single atomic MVCC snapshot.
 */
async function withReadSnapshot(fn) {
  if (dbModule.query !== query && !pool.connect?.mock) {
    return fn(dbModule);
  }
  if (config.isTest) {
    await ensureTestPoolSafe('db.withReadSnapshot');
  }
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      releaseError = rollbackErr;
    }
    throw err;
  } finally {
    client.release(releaseError);
  }
}

const dbModule = { pool, query, getClient, withTransaction, withReadSnapshot };
module.exports = dbModule;
