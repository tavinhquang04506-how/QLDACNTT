const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

const REQUIRED_TABLES = [
  'public.departments',
  'public.positions',
  'public.employees',
  'public.users',
  'public.contracts',
  'public.attendance_logs',
  'public.attendance_appeals',
  'public.leave_types',
  'public.leave_balances',
  'public.leave_requests',
  'public.ot_requests',
  'public.payroll_periods',
  'public.payslips',
  'public.system_settings',
  'public.public_holidays',
  'public.system_policy_versions',
  'public.audit_logs',
];

const REQUIRED_COLUMNS = [
  { table: 'payroll_periods', column: 'policy_snapshot' },
  { table: 'public_holidays', column: 'holiday_date' },
  { table: 'public_holidays', column: 'is_paid' },
  { table: 'system_policy_versions', column: 'effective_from' },
  { table: 'system_policy_versions', column: 'policy' },
];

/**
 * R16: Read-only schema readiness and pending migration detector.
 * Never mutates schema or data. Reports READY vs DEPLOYMENT_PENDING.
 */
async function checkSchemaReadiness(executor, { migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  const dbNameRes = await executor.query('SELECT current_database() AS db_name');
  const database = dbNameRes.rows[0]?.db_name || null;

  const expectedFiles = fs.existsSync(migrationsDir)
    ? fs
        .readdirSync(migrationsDir)
        .filter((f) => /^\d+_.+\.sql$/.test(f))
        .sort()
    : [];

  const migTableRes = await executor.query("SELECT to_regclass('public.schema_migrations') AS reg");
  const hasSchemaMigrationsTable = Boolean(migTableRes.rows[0]?.reg);

  const appliedSet = new Set();
  if (hasSchemaMigrationsTable) {
    const appliedRes = await executor.query('SELECT name FROM public.schema_migrations ORDER BY name');
    for (const r of appliedRes.rows || []) {
      appliedSet.add(r.name);
    }
    // Mirror migrate.js legacy 001..006 recognition when 007_pip_workflow.sql is present
    if (appliedSet.has('007_pip_workflow.sql')) {
      for (const file of expectedFiles) {
        if (file < '007_pip_workflow.sql') {
          appliedSet.add(file);
        }
      }
    }
  }

  const pendingMigrations = expectedFiles.filter((f) => !appliedSet.has(f));
  const missingStructures = [];

  for (const regName of REQUIRED_TABLES) {
    const res = await executor.query('SELECT to_regclass($1) AS reg', [regName]);
    if (!res.rows[0]?.reg) {
      missingStructures.push(`table:${regName}`);
    }
  }

  for (const colSpec of REQUIRED_COLUMNS) {
    const res = await executor.query(
      `SELECT EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
       ) AS present`,
      [colSpec.table, colSpec.column]
    );
    if (!res.rows[0]?.present) {
      missingStructures.push(`column:public.${colSpec.table}.${colSpec.column}`);
    }
  }

  const ready = pendingMigrations.length === 0 && missingStructures.length === 0;

  return {
    ready,
    status: ready ? 'READY' : 'DEPLOYMENT_PENDING',
    database,
    expectedMigrationsCount: expectedFiles.length,
    appliedMigrationsCount: expectedFiles.length - pendingMigrations.length,
    pendingMigrations,
    missingStructures,
  };
}

module.exports = {
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
  checkSchemaReadiness,
};
