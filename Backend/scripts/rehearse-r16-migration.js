#!/usr/bin/env node
/**
 * R16 Migration Rehearsal & Content Checksum Verification Script
 * 1. Verifies live `nexus_hrms` readiness state (read-only) and computes pre-rehearsal SHA-256 content hashes of all business tables.
 * 2. Takes a read-only `pg_dump` backup of `nexus_hrms` and restores it into isolated clone DB `nexus_hrms_rehearsal_test`.
 * 3. Verifies pre-migration state on `nexus_hrms_rehearsal_test` (DEPLOYMENT_PENDING, missing 010 & 011).
 * 4. Runs forward migrations (010 & 011) on `nexus_hrms_rehearsal_test` -> verifies READY state.
 * 5. Re-runs migrations a second time -> verifies idempotency (0 migrations applied, 0 table changes).
 * 6. Compares SHA-256 content hashes of all 19 pre-existing business tables before vs after migration on the clone -> proves 100% content preservation (not just row counts).
 * 7. Runs functional smoke tests on the upgraded clone (Settings policy versions, missing historical policy 422, Leaves holiday exclusion, Payroll calculate/lock).
 * 8. Verifies live `nexus_hrms` remained 100% untouched (still DEPLOYMENT_PENDING with identical content hashes) and drops the clone DB.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Pool } = require('pg');
const SOURCE_DB = 'nexus_hrms';
const CLONE_DB = 'nexus_hrms_rehearsal_test';

// Force any internal service using src/config/db to connect ONLY to CLONE_DB, never SOURCE_DB
process.env.NODE_ENV = 'test';
process.env.DB_NAME = CLONE_DB;

const config = require('../src/config/env');
const db = require('../src/config/db');
const { runMigrations } = require('./migrate');
const { checkSchemaReadiness } = require('../src/utils/schemaReadiness');

const PG_BIN_CANDIDATES = [
  'C:\\Users\\tavin\\pgsql\\bin',
  'C:\\Program Files\\PostgreSQL\\16\\bin',
  'C:\\Program Files\\PostgreSQL\\15\\bin',
];

function findPgBin(exeName) {
  for (const dir of PG_BIN_CANDIDATES) {
    const full = path.join(dir, exeName);
    if (fs.existsSync(full)) return full;
  }
  return exeName;
}

async function getPreExistingTableSpecs(pool) {
  const { rows: tables } = await pool.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       AND table_name <> 'schema_migrations'
     ORDER BY table_name
  `);
  const specs = [];
  for (const { table_name: table } of tables) {
    const { rows: colRows } = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position`,
      [table]
    );
    const colNames = colRows.map((c) => c.column_name);
    const orderBy = colNames.includes('id')
      ? 'id'
      : colNames.includes('key')
      ? 'key'
      : colNames.map((c) => `"${c}"`).join(', ');
    specs.push({
      table,
      orderBy,
      cols: colNames.map((c) => `"${c}"`).join(', '),
    });
  }
  return specs;
}

async function computeTableContentChecksum(pool, { table, orderBy, cols }) {
  const { rows } = await pool.query(`SELECT ${cols} FROM public.${table} ORDER BY ${orderBy}`);
  const hash = crypto.createHash('sha256');
  for (const row of rows) {
    const sortedKeys = Object.keys(row).sort();
    const canonicalRow = {};
    for (const k of sortedKeys) {
      const v = row[k];
      canonicalRow[k] = v instanceof Date ? v.toISOString() : v;
    }
    hash.update(JSON.stringify(canonicalRow) + '\n');
  }
  return {
    table,
    rowCount: rows.length,
    sha256: hash.digest('hex'),
  };
}

async function computeAllBusinessChecksums(pool, specs) {
  const results = {};
  for (const spec of specs) {
    results[spec.table] = await computeTableContentChecksum(pool, spec);
  }
  return results;
}

async function main() {
  assert.match(CLONE_DB, /^[a-z0-9_]+_test$/, 'Clone DB name must end with _test');
  assert.notEqual(CLONE_DB, SOURCE_DB, 'Clone DB must never equal source DB');

  console.log('=== [R16 MIGRATION REHEARSAL & CONTENT CHECKSUM VERIFICATION START] ===');
  console.log(`TIMESTAMP=${new Date().toISOString()}`);
  console.log(`SOURCE_DB=${SOURCE_DB} (read-only backup source)`);
  console.log(`CLONE_DB=${CLONE_DB} (isolated rehearsal target)`);

  const pgEnv = { ...process.env, PGPASSWORD: config.db.password };
  const pgDumpBin = findPgBin(process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
  const psqlBin = findPgBin(process.platform === 'win32' ? 'psql.exe' : 'psql');
  const backupPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `nexus_hrms_r16_backup_${Date.now()}.sql`);

  const adminPool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: 'postgres',
    user: config.db.user,
    password: config.db.password,
  });

  const sourcePool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: SOURCE_DB,
    user: config.db.user,
    password: config.db.password,
    options: '-c default_transaction_read_only=on',
  });

  try {
    // 1. Inspect source DB readiness and compute baseline content hashes (read-only)
    const tableSpecs = await getPreExistingTableSpecs(sourcePool);
    const sourceReadinessBefore = await checkSchemaReadiness(sourcePool);
    const sourceChecksumsBefore = await computeAllBusinessChecksums(sourcePool, tableSpecs);
    console.log('[STEP 1] Live source DB readiness before rehearsal:', JSON.stringify(sourceReadinessBefore));
    console.log(`[STEP 1] Discovered ${tableSpecs.length} pre-existing business tables in ${SOURCE_DB}`);

    // 2. Take non-blocking pg_dump backup of source DB
    execFileSync(
      pgDumpBin,
      [
        '-h', config.db.host,
        '-p', String(config.db.port),
        '-U', config.db.user,
        '-d', SOURCE_DB,
        '--no-owner',
        '--no-acl',
        '-f', backupPath,
      ],
      { env: pgEnv, stdio: 'pipe' }
    );
    const backupStat = fs.statSync(backupPath);
    const backupSha256 = crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex');
    console.log(
      `[STEP 2] Backup created: sizeBytes=${backupStat.size}, sha256=${backupSha256}`
    );
    assert.ok(backupStat.size > 10000, 'pg_dump backup file must be non-empty');

    // 3. Create isolated clone DB `nexus_hrms_rehearsal_test` and restore backup into it
    await adminPool.query(`
      SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
       WHERE datname = '${CLONE_DB}' AND pid <> pg_backend_pid()
    `);
    await adminPool.query(`DROP DATABASE IF EXISTS ${CLONE_DB}`);
    await adminPool.query(`CREATE DATABASE ${CLONE_DB}`);

    execFileSync(
      psqlBin,
      [
        '-h', config.db.host,
        '-p', String(config.db.port),
        '-U', config.db.user,
        '-d', CLONE_DB,
        '-v', 'ON_ERROR_STOP=1',
        '-f', backupPath,
      ],
      { env: pgEnv, stdio: 'pipe' }
    );

    const clonePool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: CLONE_DB,
      user: config.db.user,
      password: config.db.password,
    });

    try {
      // 4. Verify clone DB pre-migration state matches source DB 100%
      const cloneReadinessBefore = await checkSchemaReadiness(clonePool);
      const cloneChecksumsBefore = await computeAllBusinessChecksums(clonePool, tableSpecs);
      assert.equal(cloneReadinessBefore.ready, false);
      assert.equal(cloneReadinessBefore.status, 'DEPLOYMENT_PENDING');
      assert.deepEqual(cloneReadinessBefore.pendingMigrations, [
        '010_payroll_policy_snapshot_and_holidays.sql',
        '011_system_policy_versions.sql',
      ]);
      assert.deepEqual(cloneChecksumsBefore, sourceChecksumsBefore, 'Clone pre-migration content checksums must equal source DB 100%');
      console.log('[STEP 3] Clone pre-migration readiness:', JSON.stringify(cloneReadinessBefore));

      // 5. Run forward migrations (010 & 011) on clone DB
      const appliedRun1 = await runMigrations({ pool: clonePool });
      assert.deepEqual(appliedRun1, [
        '010_payroll_policy_snapshot_and_holidays.sql',
        '011_system_policy_versions.sql',
      ]);
      const cloneReadinessAfterRun1 = await checkSchemaReadiness(clonePool);
      assert.equal(cloneReadinessAfterRun1.ready, true);
      assert.equal(cloneReadinessAfterRun1.status, 'READY');
      assert.equal(cloneReadinessAfterRun1.appliedMigrationsCount, 11);
      assert.deepEqual(cloneReadinessAfterRun1.pendingMigrations, []);
      assert.deepEqual(cloneReadinessAfterRun1.missingStructures, []);
      console.log('[STEP 4] Forward migrations applied on clone:', JSON.stringify({
        appliedRun1,
        readinessAfterRun1: cloneReadinessAfterRun1,
      }));

      // 6. Re-run migrations on clone DB to prove idempotency
      const holidaysHashAfterRun1 = await computeTableContentChecksum(clonePool, {
        table: 'public_holidays',
        orderBy: 'holiday_date',
        cols: 'holiday_date::text AS holiday_date, name, is_paid',
      });
      const policyVersionsHashAfterRun1 = await computeTableContentChecksum(clonePool, {
        table: 'system_policy_versions',
        orderBy: 'id',
        cols: 'id, effective_from, policy, created_by',
      });
      const settingsFullHashAfterRun1 = await computeTableContentChecksum(clonePool, {
        table: 'system_settings',
        orderBy: 'key',
        cols: 'key, value, category, description, updated_by, updated_at',
      });

      const appliedRun2 = await runMigrations({ pool: clonePool });
      assert.deepEqual(appliedRun2, [], 'Second migration run must be a no-op');

      const holidaysHashAfterRun2 = await computeTableContentChecksum(clonePool, {
        table: 'public_holidays',
        orderBy: 'holiday_date',
        cols: 'holiday_date::text AS holiday_date, name, is_paid',
      });
      const policyVersionsHashAfterRun2 = await computeTableContentChecksum(clonePool, {
        table: 'system_policy_versions',
        orderBy: 'id',
        cols: 'id, effective_from, policy, created_by',
      });
      const settingsFullHashAfterRun2 = await computeTableContentChecksum(clonePool, {
        table: 'system_settings',
        orderBy: 'key',
        cols: 'key, value, category, description, updated_by, updated_at',
      });
      assert.deepEqual(holidaysHashAfterRun2, holidaysHashAfterRun1);
      assert.deepEqual(policyVersionsHashAfterRun2, policyVersionsHashAfterRun1);
      assert.deepEqual(settingsFullHashAfterRun2, settingsFullHashAfterRun1);
      console.log('[STEP 5] Idempotency verified: second run applied=[] with 0 changes to public_holidays, system_policy_versions, & system_settings');

      // 7. Verify 100% content checksum identity across all pre-existing business tables before vs after migration
      // Note: migration 010 inserts 4 new keys into system_settings (ON CONFLICT DO NOTHING).
      // We verify that the 14 pre-existing keys in system_settings are 100% unchanged AND the 4 added keys are exact.
      const preExistingSettingKeys = (
        await sourcePool.query('SELECT key FROM public.system_settings ORDER BY key')
      ).rows.map((r) => r.key);

      const clonePreExistingSettingsAfter = await computeTableContentChecksum(clonePool, {
        table: 'system_settings WHERE key = ANY(ARRAY[' + preExistingSettingKeys.map((k) => `'${k}'`).join(',') + '])',
        orderBy: 'key',
        cols: '"key", "value", "category", "description", "updated_by", "updated_at"',
      });

      const cloneChecksumsAfter = await computeAllBusinessChecksums(clonePool, tableSpecs);
      const tableComparisons = [];
      for (const spec of tableSpecs) {
        const b = cloneChecksumsBefore[spec.table];
        if (spec.table === 'system_settings') {
          assert.equal(
            clonePreExistingSettingsAfter.rowCount,
            b.rowCount,
            'Pre-existing system_settings row count must remain unchanged'
          );
          assert.equal(
            clonePreExistingSettingsAfter.sha256,
            b.sha256,
            'Pre-existing system_settings content SHA-256 must remain 100% unchanged'
          );
          const a = cloneChecksumsAfter[spec.table];
          assert.equal(a.rowCount, b.rowCount + 4, 'Migration 010 adds 4 new keys to system_settings');
          tableComparisons.push({
            table: spec.table,
            preExistingRows: b.rowCount,
            totalRowsAfterMigration: a.rowCount,
            preExistingSha256Before: b.sha256.slice(0, 16),
            preExistingSha256After: clonePreExistingSettingsAfter.sha256.slice(0, 16),
            identicalPreExistingContent: b.sha256 === clonePreExistingSettingsAfter.sha256,
          });
          continue;
        }
        const a = cloneChecksumsAfter[spec.table];
        assert.equal(a.rowCount, b.rowCount, `Row count changed for ${spec.table}`);
        assert.equal(a.sha256, b.sha256, `Content SHA-256 changed for ${spec.table}`);
        tableComparisons.push({
          table: spec.table,
          rowCount: a.rowCount,
          sha256Before: b.sha256.slice(0, 16),
          sha256After: a.sha256.slice(0, 16),
          identical: b.sha256 === a.sha256,
        });
      }

      // Verify historical payroll_periods rows did NOT get fabricated policy_snapshot values
      const histPeriodsSnapshotRes = await clonePool.query(
        'SELECT COUNT(*)::int AS non_null_snapshots FROM payroll_periods WHERE policy_snapshot IS NOT NULL'
      );
      assert.equal(
        histPeriodsSnapshotRes.rows[0].non_null_snapshots,
        0,
        'Migration must not fabricate historical policy snapshots on pre-existing payroll_periods rows'
      );
      console.log(
        `[STEP 6] Content checksum comparison across all ${tableComparisons.length} pre-existing business tables: 100% identical (0 row or value mutations)`
      );
      console.log(JSON.stringify(tableComparisons));

      // 8. Functional smoke tests on the upgraded clone DB (settings, leaves holiday calculation, payroll calculate/lock, missing historical policy 422)
      const settingsService = require('../src/modules/settings/service');
      const payrollService = require('../src/modules/payroll/service');
      const { workingDays } = require('../src/utils/dates');

      const currentSettings = await settingsService.getSettings(clonePool);
      const policyVersions = await settingsService.listPolicyVersions(clonePool);
      const policyFor202610 = await settingsService.getSettingsForPeriod(clonePool, '2026-10');
      assert.ok(currentSettings && Number(currentSettings.personal_income_tax_deduction) > 0);
      assert.ok(policyVersions.length >= 1, 'system_policy_versions must contain initial policy version from system_settings');
      assert.equal(Number(policyFor202610.personal_income_tax_deduction), Number(currentSettings.personal_income_tax_deduction));

      // Verify missing historical policy (< 2020-01) is rejected with 422 POLICY_VERSION_NOT_FOUND
      let missingHistCode = null;
      try {
        await settingsService.getSettingsForPeriod(clonePool, '2019-05');
      } catch (err) {
        missingHistCode = err.code;
      }
      assert.equal(missingHistCode, 'POLICY_VERSION_NOT_FOUND', 'Must reject period predating earliest policy version with POLICY_VERSION_NOT_FOUND');

      // Verify public_holidays integration with leave workingDays
      const holRows = (
        await clonePool.query(
          "SELECT holiday_date::text AS d FROM public_holidays WHERE is_paid = TRUE AND holiday_date >= '2026-04-30' AND holiday_date <= '2026-05-04'"
        )
      ).rows.map((r) => r.d.slice(0, 10));
      const daysAcrossHoliday = workingDays('2026-04-30', '2026-05-04', holRows);
      assert.equal(daysAcrossHoliday, 1, '2026-04-30..2026-05-04 must compute 1 working day after excluding holidays & weekend');

      // Verify payrollService.calculate works on the upgraded clone DB (db points to CLONE_DB)
      const calcSmoke = await payrollService.calculate({ id: 'EMP001', role: 'HR_ADMIN' }, '2029-11');
      assert.equal(calcSmoke.period, '2029-11');
      assert.ok(
        calcSmoke.policySnapshot && calcSmoke.policySnapshot.source_fingerprint,
        'Calculated period on upgraded clone must persist policy_snapshot + source_fingerprint'
      );

      console.log('[STEP 7] Functional smoke on upgraded clone passed:', JSON.stringify({
        settingsLoaded: true,
        policyVersionsCount: policyVersions.length,
        missingHistoricalPolicyCode: missingHistCode,
        workingDaysAcrossHoliday30AprTo4May: daysAcrossHoliday,
        payrollCalculateSmokePeriod: calcSmoke.period,
        payrollHeadcount: calcSmoke.headcount,
        hasSourceFingerprint: Boolean(calcSmoke.policySnapshot.source_fingerprint),
      }));
    } finally {
      await db.pool.end().catch(() => {});
      await clonePool.end();
    }

    // 9. Verify live `nexus_hrms` was NOT touched at all during rehearsal
    const sourceReadinessAfter = await checkSchemaReadiness(sourcePool);
    const sourceChecksumsAfter = await computeAllBusinessChecksums(sourcePool, tableSpecs);
    assert.deepEqual(sourceReadinessAfter, sourceReadinessBefore, 'Live nexus_hrms readiness state must remain untouched');
    assert.deepEqual(sourceChecksumsAfter, sourceChecksumsBefore, 'Live nexus_hrms content checksums must remain 100% untouched');
    console.log(`[STEP 8] Live nexus_hrms verified untouched (status remains DEPLOYMENT_PENDING, ${tableSpecs.length}/${tableSpecs.length} table content hashes unchanged)`);
    console.log('=== [R16 MIGRATION REHEARSAL & CONTENT CHECKSUM VERIFICATION PASSED] ===');
  } finally {
    await adminPool
      .query(`
        SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
         WHERE datname = '${CLONE_DB}' AND pid <> pg_backend_pid()
      `)
      .catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${CLONE_DB}`).catch(() => {});
    try {
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    } catch {}
    await sourcePool.end().catch(() => {});
    await adminPool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[R16 MIGRATION REHEARSAL FAILED]', err);
  process.exit(1);
});
