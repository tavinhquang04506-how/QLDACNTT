/**
 * Regression Tests for Independent Review Report 08 (`b4adde0`): R20, R21, R22, R23
 * - R23: `current_database()` guard rejects primary DB (`nexus_hrms`) & misconfigured `DB_NAME_TEST` BEFORE any DML
 * - R21: All 6 HR manual adjustment fields preserved across multiple recalculations + 409 conflict reconciliation + audit
 * - R22: Multi-page (505+ payslips across 2 pages) pagination & CSV reconciliation + partial-page failure rejection
 */
process.env.NODE_ENV = 'test';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { call, closeDb } = require('../helpers/api');
const db = require('../../src/config/db');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { giveBalance, deleteTestLeaves } = require('../helpers/leaves');
const { deleteTestProjects } = require('../helpers/projects');
const {
  isAllowedTestDatabaseName,
  assertTestDatabaseName,
  assertSafeTestDatabase,
} = require('../../src/utils/testDbGuard');
const { runMigrations } = require('../../scripts/migrate');
const {
  reconcilePayrollReportCsv,
  reconcileBankTransferCsv,
} = require('../../src/utils/csvReconciler');

const P_R21_SINGLE = '2032-06';
const P_R21_CONFLICT = '2032-07';
const P_R22_LARGE = '2032-08';

const r21Employees = [];
const r22Employees = [];

async function cleanupPeriodsAndEmployees(periods, empIds) {
  await assertSafeTestDatabase(db, { context: 'r20-r23.cleanupPeriodsAndEmployees' });
  if (Array.isArray(periods) && periods.length > 0) {
    await db.query(
      `DELETE FROM payslips WHERE period_id IN (SELECT id FROM payroll_periods WHERE period = ANY($1::text[]))`,
      [periods]
    );
    await db.query(`DELETE FROM payroll_periods WHERE period = ANY($1::text[])`, [periods]);
  }
  if (Array.isArray(empIds) && empIds.length > 0) {
    await db.query(`DELETE FROM attendance_logs WHERE employee_id = ANY($1::text[])`, [empIds]);
    await db.query(`DELETE FROM leave_requests WHERE employee_id = ANY($1::text[])`, [empIds]);
    await db.query(`DELETE FROM ot_requests WHERE employee_id = ANY($1::text[])`, [empIds]);
    await db.query(`DELETE FROM employees WHERE id = ANY($1::text[])`, [empIds]);
  }
  await deleteTestEmployees();
}

describe('R20–R23 Review Fixes (Guard, HR Adjustments & Conflict Reconciliation, 505+ Multi-Page Export)', () => {
  before(async () => {
    const currentDb = await assertSafeTestDatabase(db, { context: 'r20-r23.before' });
    assert.equal(currentDb, 'nexus_hrms_test');

    await db.query(
      `INSERT INTO system_policy_versions (effective_from, policy)
       VALUES ('2020-01', $1::jsonb)
       ON CONFLICT (effective_from) DO NOTHING`,
      [
        JSON.stringify({
          bhxh_rate: 8,
          bhyt_rate: 1.5,
          bhtn_rate: 1,
          insurance_cap_salary: 46800000,
          personal_deduction: 11000000,
          dependent_deduction: 4400000,
          ot_Add_weekday: 1.5,
          ot_Add_weekend: 2.0,
          ot_Add_holiday: 3.0,
          ot_night_bonus: 0.3,
          standard_work_days: 22,
          default_allowances: 1500000,
          ot_monthly_cap: 40,
        }),
      ]
    );
  });

  after(async () => {
    await cleanupPeriodsAndEmployees(
      [P_R21_SINGLE, P_R21_CONFLICT, P_R22_LARGE],
      [...r21Employees, ...r22Employees]
    );
    await closeDb();
  });

  // =========================================================================
  // 1. R23: Hard Database Guard (`current_database()` & misconfigured `DB_NAME_TEST`)
  // =========================================================================
  describe('R23: current_database() guard rejects primary DB before any setup/fixture/cleanup DML', () => {
    it('rejects nexus_hrms and non-*_test database names in assertTestDatabaseName', () => {
      assert.equal(isAllowedTestDatabaseName('nexus_hrms'), false);
      assert.equal(isAllowedTestDatabaseName('nexus_hrms_prod'), false);
      assert.equal(isAllowedTestDatabaseName(''), false);
      assert.equal(isAllowedTestDatabaseName('nexus_hrms_test'), true);
      assert.equal(isAllowedTestDatabaseName('nexus_hrms_rehearsal_test'), true);

      assert.throws(
        () => assertTestDatabaseName('nexus_hrms', 'unit-test'),
        (err) => err && err.code === 'TEST_DB_GUARD_FORBIDDEN'
      );
      assert.throws(
        () => assertTestDatabaseName('production_db', 'unit-test'),
        (err) => err && err.code === 'TEST_DB_GUARD_FORBIDDEN'
      );
    });

    it('blocks all fixture/cleanup helpers with 0 DML queries if current_database() returns nexus_hrms', async () => {
      const executedQueries = [];
      const mockPrimaryDbExecutor = {
        async query(sql, params) {
          executedQueries.push({ sql: String(sql).trim(), params });
          if (String(sql).includes('current_database()')) {
            return { rows: [{ current_db: 'nexus_hrms', current_user: 'postgres' }] };
          }
          throw new Error(`DML query should never have been reached: ${sql}`);
        },
      };

      await assert.rejects(
        () =>
          assertSafeTestDatabase(mockPrimaryDbExecutor, {
            context: 'test-spoofed-config',
            expectedDbName: 'nexus_hrms_test',
          }),
        (err) => err && err.code === 'TEST_DB_GUARD_FORBIDDEN'
      );

      await assert.rejects(
        () =>
          assertSafeTestDatabase(mockPrimaryDbExecutor, {
            context: 'test-misconfigured-env',
            expectedDbName: 'nexus_hrms',
          }),
        (err) => err && err.code === 'TEST_DB_GUARD_FORBIDDEN'
      );

      const helperCalls = [
        () => createTestEmployee({ id: 'NV-TGUARD1' }, mockPrimaryDbExecutor),
        () => deleteTestEmployees(mockPrimaryDbExecutor),
        () => createTestUser({ username: 'guard_user' }, mockPrimaryDbExecutor),
        () => deleteTestUsers(mockPrimaryDbExecutor),
        () => giveBalance('NV-TGUARD1', 'LT-ANNUAL', 2026, 12, mockPrimaryDbExecutor),
        () => deleteTestLeaves(mockPrimaryDbExecutor),
        () => deleteTestProjects(mockPrimaryDbExecutor),
      ];

      for (const callFn of helperCalls) {
        await assert.rejects(callFn, (err) => err && err.code === 'TEST_DB_GUARD_FORBIDDEN');
      }

      const dmlQueries = executedQueries.filter((q) =>
        /^\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)/i.test(q.sql)
      );
      assert.equal(
        dmlQueries.length,
        0,
        `Expected 0 DML queries when current_database() is nexus_hrms, got ${dmlQueries.length}`
      );
    });

    it('blocks migrate.js runMigrations on nexus_hrms unless --confirm-production-db=nexus_hrms is provided', async () => {
      const mockPrimaryPool = {
        async query(sql) {
          if (String(sql).includes('current_database()')) {
            return { rows: [{ db_name: 'nexus_hrms' }] };
          }
          throw new Error(`Migration SQL should never have executed: ${sql}`);
        },
      };
      await assert.rejects(
        () =>
          runMigrations({
            pool: mockPrimaryPool,
            expectedDatabase: 'nexus_hrms',
            confirmProductionDb: '',
          }),
        (err) => err && err.code === 'MIGRATION_PRODUCTION_GUARD'
      );
    });
  });

  // =========================================================================
  // 2. R21: Preserve all 6 HR manual adjustment fields + Conflict Reconciliation
  // =========================================================================
  describe('R21: Preserve all 6 HR manual adjustment fields across recalculations & reconcile conflicts', () => {
    it('preserves individual, combined, and explicit-0 HR adjustments across multiple recalculations', async () => {
      const eWorkDays = await createTestEmployee();
      const eBase = await createTestEmployee();
      const eOt = await createTestEmployee();
      const eZero = await createTestEmployee();
      const eCombined = await createTestEmployee();
      r21Employees.push(eWorkDays.id, eBase.id, eOt.id, eZero.id, eCombined.id);

      await db.query("UPDATE employees SET base_salary = 22000000, joined_date = '2020-01-01' WHERE id = $1", [eWorkDays.id]);
      await db.query("UPDATE employees SET base_salary = 24000000, joined_date = '2020-01-01' WHERE id = $1", [eBase.id]);
      await db.query("UPDATE employees SET base_salary = 26000000, joined_date = '2020-01-01' WHERE id = $1", [eOt.id]);
      await db.query("UPDATE employees SET base_salary = 28000000, joined_date = '2020-01-01' WHERE id = $1", [eZero.id]);
      await db.query("UPDATE employees SET base_salary = 30000000, joined_date = '2020-01-01' WHERE id = $1", [eCombined.id]);

      for (const empId of [eWorkDays.id, eBase.id, eOt.id, eZero.id, eCombined.id]) {
        for (let d = 1; d <= 10; d++) {
          const day = String(d).padStart(2, '0');
          await db.query(
            `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
             VALUES ($1, $2, 'DUNG_GIO', 1)`,
            [empId, `${P_R21_SINGLE}-${day}`]
          );
        }
      }

      // Initial calculate
      const calc0 = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: P_R21_SINGLE });
      assert.equal(calc0.status, 200);

      const getSlipId = async (empId) => {
        const { rows } = await db.query(
          `SELECT ps.id FROM payslips ps JOIN payroll_periods pp ON pp.id = ps.period_id
            WHERE pp.period = $1 AND ps.employee_id = $2`,
          [P_R21_SINGLE, empId]
        );
        return rows[0].id;
      };

      // 1. actualWorkDays-only adjustment (bonus=0, note=null)
      const res1 = await call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${await getSlipId(eWorkDays.id)}`, {
        actualWorkDays: 19.5,
      });
      assert.equal(res1.status, 200);

      // 2. baseSalary-only adjustment
      const res2 = await call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${await getSlipId(eBase.id)}`, {
        baseSalary: 36000000,
      });
      assert.equal(res2.status, 200);

      // 3. otHours-only adjustment
      const res3 = await call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${await getSlipId(eOt.id)}`, {
        otHours: 16,
      });
      assert.equal(res3.status, 200);

      // 4. Explicit 0 overrides (allowances = 0, otHours = 0, bonus = 0)
      const res4 = await call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${await getSlipId(eZero.id)}`, {
        allowances: 0,
        otHours: 0,
        bonus: 0,
      });
      assert.equal(res4.status, 200);

      // 5. Combined all 6 fields override
      const res5 = await call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${await getSlipId(eCombined.id)}`, {
        actualWorkDays: 21,
        baseSalary: 42000000,
        otHours: 12,
        allowances: 3200000,
        bonus: 5500000,
        note: 'Điều chỉnh tổng hợp 6 trường R21',
      });
      assert.equal(res5.status, 200);

      // Run calculate() TWICE consecutively to prove adjustments survive multiple recalculations
      for (let round = 1; round <= 2; round++) {
        const calcAgain = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: P_R21_SINGLE });
        assert.equal(calcAgain.status, 200, `Recalculation round ${round} must succeed`);

        const { rows } = await db.query(
          `SELECT ps.employee_id, ps.actual_work_days, ps.base_salary, ps.ot_hours, ps.allowances, ps.bonus, ps.note, ps.net_salary
             FROM payslips ps
             JOIN payroll_periods pp ON pp.id = ps.period_id
            WHERE pp.period = $1 AND ps.employee_id = ANY($2::text[])`,
          [P_R21_SINGLE, [eWorkDays.id, eBase.id, eOt.id, eZero.id, eCombined.id]]
        );
        const byEmp = Object.fromEntries(rows.map((r) => [r.employee_id, r]));

        assert.equal(Number(byEmp[eWorkDays.id].actual_work_days), 19.5, `Round ${round}: actualWorkDays preserved`);
        assert.equal(Number(byEmp[eBase.id].base_salary), 36000000, `Round ${round}: baseSalary preserved`);
        assert.equal(Number(byEmp[eOt.id].ot_hours), 16, `Round ${round}: otHours preserved`);
        assert.equal(Number(byEmp[eZero.id].allowances), 0, `Round ${round}: allowances=0 preserved`);
        assert.equal(Number(byEmp[eZero.id].ot_hours), 0, `Round ${round}: otHours=0 preserved`);
        assert.equal(Number(byEmp[eZero.id].bonus), 0, `Round ${round}: bonus=0 preserved`);

        assert.equal(Number(byEmp[eCombined.id].actual_work_days), 21, `Round ${round}: combined actualWorkDays`);
        assert.equal(Number(byEmp[eCombined.id].base_salary), 42000000, `Round ${round}: combined baseSalary`);
        assert.equal(Number(byEmp[eCombined.id].ot_hours), 12, `Round ${round}: combined otHours`);
        assert.equal(Number(byEmp[eCombined.id].allowances), 3200000, `Round ${round}: combined allowances`);
        assert.equal(Number(byEmp[eCombined.id].bonus), 5500000, `Round ${round}: combined bonus`);
        assert.equal(byEmp[eCombined.id].note, 'Điều chỉnh tổng hợp 6 trường R21', `Round ${round}: combined note`);
        assert.equal(Number(byEmp[eCombined.id].net_salary), Number(res5.body.data.net_salary), `Round ${round}: net_salary matches`);
      }
    });

    it('detects source-vs-manual conflicts (409 ADJUSTMENT_SOURCE_CONFLICT) and supports explicit KEEP_MANUAL / USE_SOURCE reconciliation with audit logs', async () => {
      const emp = await createTestEmployee();
      r21Employees.push(emp.id);
      await db.query("UPDATE employees SET base_salary = 30000000, joined_date = '2020-01-01' WHERE id = $1", [emp.id]);

      for (let d = 1; d <= 10; d++) {
        const day = String(d).padStart(2, '0');
        await db.query(
          `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
           VALUES ($1, $2, 'DUNG_GIO', 0)`,
          [emp.id, `${P_R21_CONFLICT}-${day}`]
        );
      }

      const calc0 = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: P_R21_CONFLICT });
      assert.equal(calc0.status, 200);

      const { rows: slipRows } = await db.query(
        `SELECT ps.id, ps.period_id FROM payslips ps JOIN payroll_periods pp ON pp.id = ps.period_id
          WHERE pp.period = $1 AND ps.employee_id = $2`,
        [P_R21_CONFLICT, emp.id]
      );
      const slipId = slipRows[0].id;
      const periodId = slipRows[0].period_id;

      // HR overrides actualWorkDays = 20 (baseline = 10) and baseSalary = 35,000,000 (baseline = 30,000,000)
      const adjRes = await call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${slipId}`, {
        actualWorkDays: 20,
        baseSalary: 35000000,
        bonus: 2000000,
        note: 'HR điều chỉnh trước khi nguồn thay đổi',
      });
      assert.equal(adjRes.status, 200);

      // Now underlying source changes AFTER HR's adjustment:
      // 1. New attendance log on day 11 (source workdays: 10 -> 11)
      await db.query(
        `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
         VALUES ($1, $2, 'DUNG_GIO', 0)`,
        [emp.id, `${P_R21_CONFLICT}-11`]
      );
      // 2. Contract salary updated on employee (source base_salary: 30,000,000 -> 32,000,000)
      await db.query(`UPDATE employees SET base_salary = 32000000 WHERE id = $1`, [emp.id]);

      // Recalculate WITHOUT conflictResolution -> MUST fail with 409 ADJUSTMENT_SOURCE_CONFLICT
      const conflictRes = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: P_R21_CONFLICT });
      assert.equal(conflictRes.status, 409);
      const errCode = conflictRes.body.code || conflictRes.body.error?.code;
      const errDetails = conflictRes.body.details || conflictRes.body.error?.details || [];
      assert.equal(errCode, 'ADJUSTMENT_SOURCE_CONFLICT');
      const empConflicts = errDetails.filter((c) => c.employee_id === emp.id);
      assert.equal(empConflicts.length, 2);

      // Reconcile explicitly: USE_SOURCE for actualWorkDays (11), KEEP_MANUAL for baseSalary (35,000,000)
      const resolvedRes = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', {
        period: P_R21_CONFLICT,
        adjustmentResolutions: {
          [emp.id]: {
            actualWorkDays: 'USE_SOURCE',
            baseSalary: 'KEEP_MANUAL',
          },
        },
      });
      assert.equal(resolvedRes.status, 200);

      const { rows: afterRows } = await db.query(
        `SELECT actual_work_days, base_salary, bonus, note FROM payslips WHERE period_id = $1 AND employee_id = $2`,
        [periodId, emp.id]
      );
      assert.equal(Number(afterRows[0].actual_work_days), 11, 'actualWorkDays updated to new source (11)');
      assert.equal(Number(afterRows[0].base_salary), 35000000, 'baseSalary kept at manual override (35,000,000)');
      assert.equal(Number(afterRows[0].bonus), 2000000, 'bonus preserved');
      assert.equal(afterRows[0].note, 'HR điều chỉnh trước khi nguồn thay đổi', 'note preserved');

      // Verify audit_logs recorded before_adjustments, after_adjustments, and reconciled_conflicts
      const { rows: auditRows } = await db.query(
        `SELECT old_values, new_values FROM audit_logs
          WHERE table_name = 'payroll_periods' AND action = 'CALCULATE_PAYROLL' AND record_id = $1
          ORDER BY id DESC LIMIT 1`,
        [String(periodId)]
      );
      assert.ok(auditRows.length > 0, 'Audit log for CALCULATE_PAYROLL must exist');
      assert.ok(auditRows[0].old_values?.before_adjustments?.[emp.id], 'before_adjustments recorded in audit');
      assert.ok(auditRows[0].new_values?.after_adjustments?.[emp.id], 'after_adjustments recorded in audit');
      assert.ok(
        Array.isArray(auditRows[0].new_values?.reconciled_conflicts) &&
          auditRows[0].new_values.reconciled_conflicts.some((c) => c.employee_id === emp.id),
        'reconciled_conflicts recorded in audit'
      );
    });
  });

  // =========================================================================
  // 3. R22: Multi-Page Fetch & Export Reconciliation for 505+ Payslips
  // =========================================================================
  describe('R22: Multi-page (> 500 payslips) pagination, completeness check & CSV reconciliation', () => {
    it('paginates and reconciles 505+ payslips across 2 pages without truncation or duplicate rows', async () => {
      // Seed 505 additional active employees in a single batch so total payslips > 500
      const valuesSql = [];
      const params = [];
      for (let i = 1; i <= 505; i++) {
        const id = `NV-TR22-${String(i).padStart(4, '0')}`;
        r22Employees.push(id);
        const offset = params.length;
        params.push(
          id,
          `Nhân sự Kiểm thử R22 ${String(i).padStart(4, '0')}`,
          `${id.toLowerCase()}@test.local`,
          15000000 + (i % 10) * 500000,
          `007100${String(i).padStart(6, '0')}`,
          'Vietcombank'
        );
        valuesSql.push(
          `($${offset + 1}, $${offset + 2}, 'DEPT-IT', NULL, 'Chuyên viên R22', $${offset + 3}, '2023-01-01'::date, $${offset + 4}, 'DANG_LAM_VIEC', $${offset + 5}, $${offset + 6})`
        );
      }

      await assertSafeTestDatabase(db, { context: 'r22.batchInsert505Employees' });
      await db.query(
        `INSERT INTO employees (id, full_name, department_id, position_id, job_title, work_email, joined_date, base_salary, status, bank_account, bank_name)
         VALUES ${valuesSql.join(', ')}`,
        params
      );

      // Calculate payroll for P_R22_LARGE
      const calcRes = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: P_R22_LARGE });
      assert.equal(calcRes.status, 200);

      // Fetch page 1 (limit=500) and page 2 (limit=500) via API
      const page1Res = await call(
        'HR_DIRECTOR',
        'get',
        `/api/payroll/payslips?period=${P_R22_LARGE}&page=1&limit=500`
      );
      assert.equal(page1Res.status, 200);
      assert.equal(page1Res.body.data.length, 500);
      assert.ok(page1Res.body.pagination.total >= 505, `Expected total >= 505, got ${page1Res.body.pagination.total}`);
      assert.ok(page1Res.body.pagination.totalPages >= 2, 'Expected at least 2 pages');

      const page2Res = await call(
        'HR_DIRECTOR',
        'get',
        `/api/payroll/payslips?period=${P_R22_LARGE}&page=2&limit=500`
      );
      assert.equal(page2Res.status, 200);
      assert.ok(page2Res.body.data.length >= 5, `Expected >= 5 rows on page 2, got ${page2Res.body.data.length}`);

      const combinedRows = [...page1Res.body.data, ...page2Res.body.data];
      assert.equal(combinedRows.length, page1Res.body.pagination.total, 'Combined pages must equal pagination.total');

      const uniqueEmpIds = new Set(combinedRows.map((r) => r.employee_id));
      assert.equal(uniqueEmpIds.size, combinedRows.length, 'Deterministic ordering must produce 0 duplicate employees across pages');

      // Query all DB rows for P_R22_LARGE and reconcile CSV exports across all 505+ rows
      const { rows: dbRows } = await db.query(
        `SELECT ps.*, e.full_name, e.job_title
           FROM payslips ps
           JOIN payroll_periods pp ON pp.id = ps.period_id
           JOIN employees e ON e.id = ps.employee_id
          WHERE pp.period = $1`,
        [P_R22_LARGE]
      );
      assert.equal(dbRows.length, combinedRows.length);

      // Build Payroll Report CSV from all pages (with UTF-8 BOM \uFEFF) and reconcile with DB
      const reportHeaders = [
        'Mã NV',
        'Họ Và Tên',
        'Chức Vụ',
        'Lương Cơ Bản',
        'Ngày Công',
        'Làm Thêm (OT)',
        'Thưởng KPI & Phụ Cấp',
        'BHXH',
        'Thuế TNCN',
        'Thực Lĩnh (Net)',
      ];
      const reportCsvLines =
        '\uFEFF' +
        [
          reportHeaders.join(','),
          ...combinedRows.map((p) =>
            [
              p.employee_id,
              `"${p.full_name}"`,
              `"${p.job_title || ''}"`,
              Number(p.base_salary ?? 0),
              `${Number(p.actual_work_days ?? 0)}/${Number(p.standard_work_days ?? 22)}`,
              Number(p.ot_pay ?? 0),
              Number(p.allowances ?? 0) + Number(p.bonus ?? 0),
              Number(p.bhxh_amount ?? 0) + Number(p.bhyt_amount ?? 0) + Number(p.bhtn_amount ?? 0),
              Number(p.pit_amount ?? 0),
              Number(p.net_salary ?? 0),
            ].join(',')
          ),
        ].join('\n');

      const reportRec = reconcilePayrollReportCsv(reportCsvLines, dbRows);
      assert.ok(reportRec.rowCount >= 505);

      // Also reconcile Bank Transfer CSV across all 505+ rows
      const validBankRows = combinedRows.filter(
        (p) => p.bank_account && p.bank_name && Number(p.net_salary) > 0
      );
      const bankHeaders = [
        'STT',
        'Mã Nhân Viên',
        'Họ Và Tên',
        'Số Tài Khoản',
        'Ngân Hàng Thụ Hưởng',
        'Số Tiền Thực Nhận (VNĐ)',
        'Trạng Thái',
      ];
      const bankCsvLines =
        '\uFEFF' +
        [
          bankHeaders.join(','),
          ...validBankRows.map((p, idx) =>
            [
              idx + 1,
              p.employee_id,
              `"${p.full_name}"`,
              p.bank_account,
              p.bank_name,
              Number(p.net_salary ?? 0),
              'Hợp lệ',
            ].join(',')
          ),
        ].join('\n');
      const bankRec = reconcileBankTransferCsv(bankCsvLines, dbRows);
      assert.equal(bankRec.payableRowCount, validBankRows.length);

      // Negative test: truncating at 500 rows (old bug) MUST fail reconciliation against 505+ DB rows
      const truncatedCsvLines =
        '\uFEFF' +
        [
          reportHeaders.join(','),
          ...page1Res.body.data.map((p) =>
            [
              p.employee_id,
              `"${p.full_name}"`,
              `"${p.job_title || ''}"`,
              Number(p.base_salary ?? 0),
              `${Number(p.actual_work_days ?? 0)}/${Number(p.standard_work_days ?? 22)}`,
              Number(p.ot_pay ?? 0),
              Number(p.allowances ?? 0) + Number(p.bonus ?? 0),
              Number(p.bhxh_amount ?? 0) + Number(p.bhyt_amount ?? 0) + Number(p.bhtn_amount ?? 0),
              Number(p.pit_amount ?? 0),
              Number(p.net_salary ?? 0),
            ].join(',')
          ),
        ].join('\n');
      assert.throws(
        () => reconcilePayrollReportCsv(truncatedCsvLines, dbRows),
        /Payroll report CSV row count \(500\) must equal DB payslips count/
      );
    });
  });
});
