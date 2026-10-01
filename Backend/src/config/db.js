const { Pool, types } = require('pg');
const config = require('./env');

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

const query = (text, params) => pool.query(text, params);
const getClient = () => pool.connect();

/**
 * Run `fn(client)` inside BEGIN/COMMIT; ROLLBACK and rethrow on any error.
 */
async function withTransaction(fn) {
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

module.exports = { pool, query, getClient, withTransaction };
