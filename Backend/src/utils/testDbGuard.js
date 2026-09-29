/**
 * testDbGuard.js — Mandatory safety guard for all test setup, fixtures, seeds, and cleanups (R23).
 *
 * Guarantees that test helpers, setup scripts, and cleanup hooks NEVER execute write/DML
 * statements against the primary application database (`nexus_hrms`), even if `NODE_ENV`
 * is omitted or `DB_NAME_TEST` is misconfigured to point at `nexus_hrms`.
 */

const FORBIDDEN_PRIMARY_DBS = new Set([
  'nexus_hrms',
  'postgres',
  'template0',
  'template1',
]);

const ALLOWED_TEST_DBS = new Set([
  'nexus_hrms_test',
  'nexus_hrms_rehearsal_test',
  'nexus_hrms_backup_verify_test',
]);

function isAllowedTestDatabaseName(dbName) {
  if (typeof dbName !== 'string') return false;
  const normalized = dbName.trim();
  if (!normalized) return false;
  if (FORBIDDEN_PRIMARY_DBS.has(normalized.toLowerCase())) return false;
  if (!/^[a-z0-9_]+_test$/.test(normalized)) return false;
  return (
    ALLOWED_TEST_DBS.has(normalized) ||
    /^nexus_hrms_[a-z0-9_]+_test$/.test(normalized)
  );
}

function createGuardError(message, details = {}) {
  const err = new Error(message);
  err.code = 'TEST_DB_GUARD_FORBIDDEN';
  Object.assign(err, details);
  return err;
}

function assertTestDatabaseName(dbName, contextLabel = 'test operation') {
  if (!isAllowedTestDatabaseName(dbName)) {
    throw createGuardError(
      `[TEST_DB_GUARD] Refusing to execute ${contextLabel} on forbidden or non-test database "${dbName}". Target must match allowlisted *_test database and never be "nexus_hrms".`,
      { database: dbName, contextLabel }
    );
  }
  return dbName.trim();
}

/**
 * Verifies BOTH any configured database metadata AND the live PostgreSQL connection's
 * `SELECT current_database()` BEFORE any setup, fixture, seed, or cleanup DML is executed.
 */
async function assertSafeTestDatabase(executor, contextLabel = 'test fixture/cleanup') {
  if (!executor || typeof executor.query !== 'function') {
    throw createGuardError(
      `[TEST_DB_GUARD] Missing valid database executor for ${contextLabel}.`,
      { contextLabel }
    );
  }

  // 1. Pre-query check on configured database property if present on the executor/pool
  const configuredDb =
    executor.configuredDatabase ||
    executor.options?.database ||
    executor.pool?.options?.database ||
    null;
  if (configuredDb !== null && configuredDb !== undefined) {
    assertTestDatabaseName(configuredDb, `${contextLabel} (configured database)`);
  }

  // 2. Live connection verification via SELECT current_database() BEFORE any DML
  const res = await executor.query('SELECT current_database() AS db_name');
  const liveDbName =
    res?.rows?.[0]?.db_name ?? res?.rows?.[0]?.current_database ?? null;
  assertTestDatabaseName(liveDbName, `${contextLabel} (live current_database())`);
  return liveDbName;
}

module.exports = {
  FORBIDDEN_PRIMARY_DBS,
  ALLOWED_TEST_DBS,
  isAllowedTestDatabaseName,
  assertTestDatabaseName,
  assertSafeTestDatabase,
};
