#!/usr/bin/env node
/**
 * Reproduction script for R16, R17, R18, R19 BEFORE applying fixes (at commit 5335e7c).
 * Uses nexus_hrms_test for any write tests and read-only metadata query on nexus_hrms for R16.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'nexus_hrms_test';

const db = require('../src/config/db');
const payrollService = require('../src/modules/payroll/service');
const { createTestEmployee, deleteTestEmployees } = require('../tests/helpers/employees');

async function main() {
  console.log('=== [R16-R19 REPRODUCTION BEFORE FIX] ===');
  console.log(`TIMESTAMP=${new Date().toISOString()}`);

  // ---------------------------------------------------------------------------
  // 1. Reproduce R16: Read-only schema check on application DB `nexus_hrms`
  // ---------------------------------------------------------------------------
  const appPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: 'nexus_hrms',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '123456',
  });
  try {
    const r16Res = await appPool.query(`
      SELECT current_database() AS db,
             to_regclass('public.system_policy_versions') AS versions,
             to_regclass('public.public_holidays') AS holidays,
             EXISTS (
               SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'payroll_periods'
                  AND column_name = 'policy_snapshot'
             ) AS snapshot
    `);
    console.log('[R16 REPRODUCED] Read-only application DB schema query:', JSON.stringify(r16Res.rows[0]));
  } finally {
    await appPool.end();
  }

  // ---------------------------------------------------------------------------
  // 2. Reproduce R17: SettingsPage.jsx allows Save with default state after GET fails
  // ---------------------------------------------------------------------------
  const settingsPageSrc = fs.readFileSync(
    path.resolve(__dirname, '../../FrontEnd/src/pages/SettingsPage.jsx'),
    'utf8'
  );
  const hasDefaultInit = settingsPageSrc.includes('useState(11000000)') && settingsPageSrc.includes("useState('2020-01')");
  const saveDisabledExpr = (settingsPageSrc.match(/data-testid="settings-save-btn"[\s\S]{0,160}disabled=\{([^}]+)\}/) || [])[1];
  const handleSaveChecksLoaded = /const handleSave[\s\S]{0,200}hasLoaded/.test(settingsPageSrc);
  console.log('[R17 REPRODUCED] SettingsPage before fix:', JSON.stringify({
    hasDefaultInit,
    saveDisabledExpr,
    handleSaveChecksLoaded,
  }));

  // ---------------------------------------------------------------------------
  // 3a. Reproduce R18 (Service-level): payrollService.lock() with mock executor
  // ---------------------------------------------------------------------------
  const origWithTx = db.withTransaction;
  let mockQueryCount = 0;
  db.withTransaction = async (fn) => {
    const mockClient = {
      query: async (sql) => {
        mockQueryCount++;
        const s = String(sql);
        if (s.includes('FROM payroll_periods WHERE id = $1')) {
          return { rows: [{ id: 901, period: '2028-11', status: 'DU_THAO', policy_snapshot: null }] };
        }
        if (s.includes('SELECT COUNT(*)::int AS n FROM payslips')) {
          return { rows: [{ n: 1 }] };
        }
        if (s.includes('FROM system_policy_versions')) {
          return {
            rows: [{
              id: 1,
              effective_from: '2020-01',
              policy: { max_ot_per_month: 40, standard_work_days: 22 },
            }],
          };
        }
        if (s.includes('FROM payslips ps JOIN employees e')) {
          return {
            rows: [{
              employee_id: 'NV-MOCK-1',
              full_name: 'Mock Stale Employee',
              actual_work_days: 0,
              ot_hours: 0,
              bank_account: '0071001234567',
              bank_name: 'Vietcombank',
              att_days: 1,
              approved_ot: 0,
            }],
          };
        }
        if (s.includes("UPDATE payroll_periods")) {
          return { rows: [{ id: 901, status: 'DA_CHOT' }] };
        }
        if (s.includes("UPDATE payslips SET status = 'DA_CHOT'")) {
          return { rows: [] };
        }
        if (s.includes('INSERT INTO audit_logs')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    return fn(mockClient);
  };

  try {
    await payrollService.lock({ employeeId: 'NV-0001', role: 'HR_DIRECTOR' }, 901, { acknowledgeAnomalies: false });
    console.log(`[R18 SERVICE REPRODUCED] payrollService.lock() succeeded on stale payslip (actual_work_days=0 vs att_days=1) with acknowledgeAnomalies=false after ${mockQueryCount} mock queries`);
  } catch (err) {
    console.log('[R18 SERVICE] Rejected with:', err.code, err.message);
  } finally {
    db.withTransaction = origWithTx;
  }

  // ---------------------------------------------------------------------------
  // 3b. Reproduce R18 (DB Integration-level on nexus_hrms_test):
  //     - Calculate -> add attendance -> lock still succeeds or wipes HR bonus on recalc
  // ---------------------------------------------------------------------------
  try {
    const emp = await createTestEmployee({ status: 'DANG_LAM_VIEC', departmentId: 'DEPT-IT' });
    await db.query(
      "UPDATE employees SET base_salary = 22000000, joined_date = '2020-01-01', bank_account = '0071009999999', bank_name = 'Vietcombank' WHERE id = $1",
      [emp.id]
    );

    await payrollService.calculate({ employeeId: null, role: 'HR_DIRECTOR' }, '2028-11', null);
    const periodRow = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-11'")).rows[0];
    const slipBefore = (await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [periodRow.id, emp.id])).rows[0];

    // HR manually adjusts bonus & note on the draft payslip
    await payrollService.updatePayslip(
      { employeeId: null, role: 'HR_DIRECTOR' },
      slipBefore.id,
      { bonus: 5000000, note: 'Thưởng nóng trước khi tính lại' },
      null
    );

    // Source changes AFTER calculate(): add 10 attendance days for emp
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-11-01'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 9) g`,
      [emp.id]
    );

    // Attempt lock with acknowledgeAnomalies=true while period is stale (payslip still has 0 actual_work_days!)
    let lockStaleStatus = 'REJECTED';
    try {
      const locked = await payrollService.lock({ employeeId: null, role: 'HR_DIRECTOR' }, periodRow.id, { acknowledgeAnomalies: true }, null);
      lockStaleStatus = locked.status;
    } catch (err) {
      lockStaleStatus = `REJECTED:${err.code}`;
    }
    const slipAtLock = (await db.query('SELECT actual_work_days, net_salary, bonus FROM payslips WHERE id = $1', [slipBefore.id])).rows[0];
    console.log('[R18 DB STALE LOCK REPRODUCED]', JSON.stringify({
      lockStaleStatus,
      payslipWorkDaysAtLock: Number(slipAtLock.actual_work_days),
      liveAttendanceDays: 10,
    }));

    // Reset status to DU_THAO to test what happens to HR manual bonus when calculate() runs again
    await db.query("UPDATE payroll_periods SET status = 'DU_THAO' WHERE id = $1", [periodRow.id]);
    await payrollService.calculate({ employeeId: null, role: 'HR_DIRECTOR' }, '2028-11', null);
    const slipAfterRecalc = (await db.query('SELECT actual_work_days, bonus, note FROM payslips WHERE period_id = $1 AND employee_id = $2', [periodRow.id, emp.id])).rows[0];
    console.log('[R18 DB RECALC BONUS WIPE REPRODUCED]', JSON.stringify({
      bonusBeforeRecalc: 5000000,
      bonusAfterRecalc: Number(slipAfterRecalc.bonus || 0),
      noteAfterRecalc: slipAfterRecalc.note,
    }));
  } finally {
    await db.query("DELETE FROM audit_logs WHERE action IN ('CALCULATE_PAYROLL', 'LOCK_PAYROLL', 'UPDATE_PAYSLIP')").catch(() => {});
    await db.query("DELETE FROM payroll_periods WHERE period = '2028-11'").catch(() => {});
    await deleteTestEmployees().catch(() => {});
    await db.pool.end().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // 4. Reproduce R19: Substring .includes() passes even when two employees' amounts are swapped
  // ---------------------------------------------------------------------------
  const swappedCsv = [
    'Mã NV,Họ Và Tên,Thực Lĩnh (Net)',
    'NV-A,Nguyễn Văn A,29500000', // Swapped: NV-A actually earned 18,000,000, NV-B earned 29,500,000
    'NV-B,Trần Thị B,18000000',
  ].join('\r\n');
  const naiveIncludesPass =
    swappedCsv.includes('NV-A') &&
    swappedCsv.includes('Nguyễn Văn A') &&
    swappedCsv.includes('18000000');
  console.log('[R19 REPRODUCED] Naive substring .includes() on swapped-row CSV:', JSON.stringify({
    naiveIncludesPass,
    actualRowForNvA: 'NV-A,Nguyễn Văn A,29500000 (wrong amount)',
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
