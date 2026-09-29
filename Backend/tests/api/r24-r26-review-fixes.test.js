/**
 * Regression Tests for Independent Review Report 09 (`4077088`): R24, R25, R26 + Role Acceptance Matrix
 * - R24: `409 ADJUSTMENT_SOURCE_CONFLICT` reconciliation + mid-review source mutation rejection (`expectedSourceValues` / `staleDecisionRejected`) + audit
 * - R25: `POST /api/payroll/calculate` strictly maintains `DU_THAO` draft status (no fake approval state) until `lock` (`DA_CHOT`) and `transfer` (`DA_CHUYEN_KHOAN`)
 * - R26: Multi-page `GET /api/payroll/payslips` (`505+` rows) returns `pagination.period`, `pagination.snapshotToken`, and `pagination.aggregates`, and detects mid-pagination amount changes
 */
process.env.NODE_ENV = 'test';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { call, callWith, loginUser, closeDb } = require('../helpers/api');
const db = require('../../src/config/db');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { assertSafeTestDatabase } = require('../../src/utils/testDbGuard');

const P_R24 = '2033-05';
const P_R25 = '2033-06';
const P_R26 = '2033-07';

const createdEmpIds = [];

async function cleanupR24R26() {
  await assertSafeTestDatabase(db, { context: 'r24-r26.cleanup' });
  const periods = [P_R24, P_R25, P_R26];
  await db.query(
    `DELETE FROM payslips WHERE period_id IN (SELECT id FROM payroll_periods WHERE period = ANY($1::text[]))`,
    [periods]
  );
  await db.query(`DELETE FROM payroll_periods WHERE period = ANY($1::text[])`, [periods]);
  await db.query(`DELETE FROM attendance_logs WHERE work_date >= '2033-01-01' AND work_date < '2034-01-01'`);
  if (createdEmpIds.length > 0) {
    await db.query(`DELETE FROM attendance_logs WHERE employee_id = ANY($1::text[])`, [createdEmpIds]);
    await db.query(`DELETE FROM leave_requests WHERE employee_id = ANY($1::text[])`, [createdEmpIds]);
    await db.query(`DELETE FROM ot_requests WHERE employee_id = ANY($1::text[])`, [createdEmpIds]);
    await db.query(`DELETE FROM payslips WHERE employee_id = ANY($1::text[])`, [createdEmpIds]);
    await db.query(`DELETE FROM users WHERE employee_id = ANY($1::text[])`, [createdEmpIds]);
    await db.query(`DELETE FROM employees WHERE id = ANY($1::text[])`, [createdEmpIds]);
  }
  await deleteTestUsers();
  await deleteTestEmployees();
}

describe('R24–R26 Review Fixes & Role-Based Acceptance Verification', () => {
  before(async () => {
    const currentDb = await assertSafeTestDatabase(db, { context: 'r24-r26.before' });
    assert.equal(currentDb, 'nexus_hrms_test');
    await cleanupR24R26();

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
    try {
      await cleanupR24R26();
    } finally {
      await closeDb();
    }
  });

  // =========================================================================
  // 1. R24: Conflict Reconciliation + Mid-Review Source Change Protection
  // =========================================================================
  describe('R24: 409 ADJUSTMENT_SOURCE_CONFLICT with expectedSourceValues & staleDecisionRejected protection', () => {
    it('detects conflicts, rejects stale decisions when source mutates again during review, and persists reconciled decisions + audit log', async () => {
      const emp = await createTestEmployee();
      createdEmpIds.push(emp.id);
      await db.query(
        `UPDATE employees
            SET base_salary = 20000000,
                joined_date = '2020-01-01',
                bank_account = '007100999888',
                bank_name = 'Vietcombank'
          WHERE id = $1`,
        [emp.id]
      );

      // Seed 18 days of attendance (first 2 days with 1h OT -> total 2h OT) in 2033-05
      for (let d = 1; d <= 18; d++) {
        const dt = `${P_R24}-${String(d).padStart(2, '0')}`;
        const otH = d <= 2 ? 1 : 0;
        await db.query(
          `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
           VALUES ($1, $2, 'DUNG_GIO', $3)`,
          [emp.id, dt, otH]
        );
      }

      // Step 1: Initial calculate (actualWorkDays=18, baseSalary=20,000,000, otHours=2)
      const calc1 = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', {
        period: P_R24,
      });
      assert.equal(calc1.status, 200, JSON.stringify(calc1.body));

      const slipRes = await db.query(
        `SELECT ps.* FROM payslips ps JOIN payroll_periods pp ON pp.id = ps.period_id WHERE pp.period = $1 AND ps.employee_id = $2`,
        [P_R24, emp.id]
      );
      const slip = slipRes.rows[0];
      assert.equal(Number(slip.actual_work_days), 18);
      assert.equal(Number(slip.base_salary), 20000000);
      assert.equal(Number(slip.ot_hours), 2);

      // Step 2: HR manually adjusts actualWorkDays=21, baseSalary=25,000,000, otHours=6
      const putRes = await call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${slip.id}`, {
        actualWorkDays: 21,
        baseSalary: 25000000,
        otHours: 6,
        allowances: 2000000,
        bonus: 1500000,
        note: 'HR manual adjustment before source change',
      });
      assert.equal(putRes.status, 200, JSON.stringify(putRes.body));

      // Step 3: Underlying source changes (attendance 18 -> 19 days, base_salary 20M -> 22M, OT 2h -> 4h)
      await db.query(
        `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
         VALUES ($1, '2033-05-19', 'DUNG_GIO', 2)`,
        [emp.id]
      );
      await db.query(`UPDATE employees SET base_salary = 22000000 WHERE id = $1`, [emp.id]);

      // Step 4: Recalculate without resolutions -> 409 ADJUSTMENT_SOURCE_CONFLICT
      const calcConflict = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', {
        period: P_R24,
      });
      assert.equal(calcConflict.status, 409);
      assert.equal(calcConflict.body.code, 'ADJUSTMENT_SOURCE_CONFLICT');
      const empConflicts = (calcConflict.body.details || []).filter((c) => c.employee_id === emp.id);
      assert.equal(empConflicts.length, 3);

      // Step 5: Simulate source changing AGAIN while HR is reviewing the modal (attendance 19 -> 20 days!)
      await db.query(
        `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
         VALUES ($1, '2033-05-20', 'DUNG_GIO', 0)`,
        [emp.id]
      );

      // Step 6: HR submits decisions with expectedCurrentSourceValue=19 (stale!) -> MUST be rejected with 409 & staleDecisionRejected=true
      const calcStaleDecision = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', {
        period: P_R24,
        adjustmentResolutions: {
          [emp.id]: {
            actualWorkDays: { action: 'KEEP_MANUAL', expectedCurrentSourceValue: 19 },
            baseSalary: { action: 'USE_SOURCE', expectedCurrentSourceValue: 22000000 },
            otHours: { action: 'KEEP_MANUAL', expectedCurrentSourceValue: 4 },
          },
        },
      });
      assert.equal(calcStaleDecision.status, 409);
      assert.equal(calcStaleDecision.body.code, 'ADJUSTMENT_SOURCE_CONFLICT');
      const staleConflict = (calcStaleDecision.body.details || []).find(
        (c) => c.employee_id === emp.id && c.field === 'actualWorkDays'
      );
      assert.ok(staleConflict, 'Must return actualWorkDays conflict when source mutated from 19 to 20');
      assert.equal(staleConflict.staleDecisionRejected, true);
      assert.equal(Number(staleConflict.currentSourceValue), 20);
      assert.equal(Number(staleConflict.expectedCurrentSourceValue), 19);

      // Step 7: Unauthorized role (LINE_MANAGER) cannot submit calculate/resolutions -> 403
      const forbiddenRes = await call('LINE_MANAGER', 'post', '/api/payroll/calculate', {
        period: P_R24,
      });
      assert.equal(forbiddenRes.status, 403);

      // Step 8: HR submits updated decision with fresh expectedCurrentSourceValue=20 -> 200 OK
      const calcResolved = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', {
        period: P_R24,
        adjustmentResolutions: {
          [emp.id]: {
            actualWorkDays: { action: 'KEEP_MANUAL', expectedCurrentSourceValue: 20 },
            baseSalary: { action: 'USE_SOURCE', expectedCurrentSourceValue: 22000000 },
            otHours: { action: 'KEEP_MANUAL', expectedCurrentSourceValue: 4 },
          },
        },
      });
      assert.equal(calcResolved.status, 200, JSON.stringify(calcResolved.body));

      // Verify persisted payslip values
      const finalSlipRes = await db.query(
        `SELECT ps.* FROM payslips ps JOIN payroll_periods pp ON pp.id = ps.period_id WHERE pp.period = $1 AND ps.employee_id = $2`,
        [P_R24, emp.id]
      );
      const finalSlip = finalSlipRes.rows[0];
      assert.equal(Number(finalSlip.actual_work_days), 21); // KEEP_MANUAL
      assert.equal(Number(finalSlip.base_salary), 22000000); // USE_SOURCE
      assert.equal(Number(finalSlip.ot_hours), 6); // KEEP_MANUAL
      assert.equal(Number(finalSlip.allowances), 2000000); // Preserved non-conflicting manual adjustment
      assert.equal(Number(finalSlip.bonus), 1500000);

      // Verify audit log records reconciled_conflicts
      const auditRes = await db.query(
        `SELECT new_values FROM audit_logs WHERE table_name = 'payroll_periods' AND action = 'CALCULATE_PAYROLL' AND record_id = $1 ORDER BY id DESC LIMIT 1`,
        [String(finalSlip.period_id)]
      );
      assert.equal(auditRes.rows.length, 1);
      const auditVal = auditRes.rows[0].new_values;
      assert.ok(Array.isArray(auditVal.reconciled_conflicts));
      assert.equal(auditVal.reconciled_conflicts.filter((c) => c.employee_id === emp.id).length, 3);
    });
  });

  // =========================================================================
  // 2. R25: Honest Period Status Transitions (DU_THAO -> DA_CHOT -> DA_CHUYEN_KHOAN)
  // =========================================================================
  describe('R25: Calculate keeps period in DU_THAO; only lock and transfer advance server status', () => {
    it('maintains DU_THAO on CEO/HR calculate and transitions to DA_CHOT on lock and DA_CHUYEN_KHOAN on transfer', async () => {
      // Ensure all active employees in test DB have bank account/name so transfer test can verify DA_CHUYEN_KHOAN
      await db.query(
        `UPDATE employees
            SET bank_account = COALESCE(NULLIF(bank_account, ''), '007100888999'),
                bank_name = COALESCE(NULLIF(bank_name, ''), 'Vietcombank')
          WHERE status IN ('DANG_LAM_VIEC', 'THU_VIEC')`
      );

      const calcCeo = await call('CEO', 'post', '/api/payroll/calculate', {
        period: P_R25,
      });
      assert.equal(calcCeo.status, 200, JSON.stringify(calcCeo.body));

      const periodRowRes = await db.query(
        `SELECT id, status FROM payroll_periods WHERE period = $1`,
        [P_R25]
      );
      const periodId = periodRowRes.rows[0].id;
      assert.equal(periodRowRes.rows[0].status, 'DU_THAO');

      const periodCheck = await call('CEO', 'get', `/api/payroll/periods/${periodId}`);
      assert.equal(periodCheck.status, 200);
      assert.equal(periodCheck.body.data.status, 'DU_THAO');

      // Lock with anomaly acknowledgment
      const lockRes = await call('CEO', 'post', `/api/payroll/periods/${periodId}/lock`, {
        acknowledgeAnomalies: true,
        note: 'R25 lock verification after reviewing anomalies',
      });
      assert.equal(lockRes.status, 200, JSON.stringify(lockRes.body));
      assert.equal(lockRes.body.data.status, 'DA_CHOT');

      // Transfer
      const transferRes = await call('CEO', 'post', `/api/payroll/periods/${periodId}/transfer`);
      assert.equal(transferRes.status, 200, JSON.stringify(transferRes.body));
      assert.equal(transferRes.body.data.status, 'DA_CHUYEN_KHOAN');
    });
  });

  // =========================================================================
  // 3. R26: Multi-Page (505+ Payslips) Metadata, Snapshot Token & Aggregates
  // =========================================================================
  describe('R26: Multi-page GET /api/payroll/payslips returns snapshotToken & aggregates and detects mid-pagination changes', () => {
    it('returns consistent snapshotToken and aggregates across 2 pages for 505+ payslips and changes snapshotToken when any row mutates', async () => {
      const valuesSql = [];
      const params = [];
      for (let i = 1; i <= 505; i++) {
        const id = `NV-TR26-${String(i).padStart(4, '0')}`;
        createdEmpIds.push(id);
        const offset = params.length;
        params.push(
          id,
          `Nhân sự Kiểm thử R26 ${String(i).padStart(4, '0')}`,
          `${id.toLowerCase()}@test.local`,
          15000000 + (i % 10) * 500000,
          `007200${String(i).padStart(6, '0')}`,
          'Vietcombank'
        );
        valuesSql.push(
          `($${offset + 1}, $${offset + 2}, 'DEPT-IT', NULL, 'Chuyên viên R26', $${offset + 3}, '2023-01-01'::date, $${offset + 4}, 'DANG_LAM_VIEC', $${offset + 5}, $${offset + 6})`
        );
      }

      await db.query(
        `INSERT INTO employees (id, full_name, department_id, position_id, job_title, work_email, joined_date, base_salary, status, bank_account, bank_name)
         VALUES ${valuesSql.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        params
      );

      // Seed 10 attendance days in 2033-07 for the first 5 employees so totalNet > 0
      for (let i = 1; i <= 5; i++) {
        const empId = `NV-TR26-${String(i).padStart(4, '0')}`;
        for (let d = 1; d <= 10; d++) {
          await db.query(
            `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
             VALUES ($1, $2, 'DUNG_GIO', 0)`,
            [empId, `${P_R26}-${String(d).padStart(2, '0')}`]
          );
        }
      }

      const calcRes = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', {
        period: P_R26,
      });
      assert.equal(calcRes.status, 200, JSON.stringify(calcRes.body));

      const page1Res = await call(
        'HR_DIRECTOR',
        'get',
        `/api/payroll/payslips?period=${P_R26}&page=1&limit=500`
      );
      assert.equal(page1Res.status, 200, JSON.stringify(page1Res.body));
      assert.equal(page1Res.body.data.length, 500);
      assert.ok(page1Res.body.pagination.total >= 505);
      assert.equal(page1Res.body.pagination.totalPages, 2);
      assert.equal(page1Res.body.pagination.period, P_R26);
      assert.ok(
        typeof page1Res.body.pagination.snapshotToken === 'string' &&
          page1Res.body.pagination.snapshotToken.length > 10
      );
      assert.ok(
        page1Res.body.pagination.aggregates &&
          Number(page1Res.body.pagination.aggregates.totalNet) > 0
      );

      const page2Res = await call(
        'HR_DIRECTOR',
        'get',
        `/api/payroll/payslips?period=${P_R26}&page=2&limit=500`
      );
      assert.equal(page2Res.status, 200);
      assert.equal(
        page2Res.body.pagination.snapshotToken,
        page1Res.body.pagination.snapshotToken
      );
      assert.equal(
        Number(page2Res.body.pagination.aggregates.totalNet),
        Number(page1Res.body.pagination.aggregates.totalNet)
      );

      const combined = [...page1Res.body.data, ...page2Res.body.data];
      assert.equal(combined.length, page1Res.body.pagination.total);
      const uniqueEmpIds = new Set(combined.map((r) => r.employee_id));
      assert.equal(uniqueEmpIds.size, combined.length);

      // Mutate 1 payslip's bonus while keeping total count identical -> snapshotToken & aggregates.totalNet MUST change
      const targetSlip = page2Res.body.data[0];
      const putSlip = await call(
        'HR_DIRECTOR',
        'put',
        `/api/payroll/payslips/${targetSlip.id}`,
        {
          bonus: 900000,
          note: 'R26 mid-pagination mutation test',
        }
      );
      assert.equal(putSlip.status, 200);

      const page2AfterMutation = await call(
        'HR_DIRECTOR',
        'get',
        `/api/payroll/payslips?period=${P_R26}&page=2&limit=500`
      );
      assert.equal(page2AfterMutation.status, 200);
      assert.equal(
        page2AfterMutation.body.pagination.total,
        page1Res.body.pagination.total
      );
      assert.notEqual(
        page2AfterMutation.body.pagination.snapshotToken,
        page1Res.body.pagination.snapshotToken,
        'snapshotToken must change when any payslip amount mutates even if total row count is unchanged'
      );
      assert.notEqual(
        Number(page2AfterMutation.body.pagination.aggregates.totalNet),
        Number(page1Res.body.pagination.aggregates.totalNet),
        'aggregates.totalNet must change when any payslip amount mutates'
      );
    });
  });

  // =========================================================================
  // 4. Role-Based Acceptance Matrix (CEO, HR_DIRECTOR, LINE_MANAGER, EMPLOYEE, ADMIN)
  // =========================================================================
  describe('Role-Based Acceptance Matrix across Auth/Scope, Attendance, Leave, Payroll & AI', () => {
    it('enforces RBAC and data scope across CEO, HR_DIRECTOR, LINE_MANAGER, EMPLOYEE, and ADMIN', async () => {
      // 1. EMPLOYEE: can read own payslips (/api/payroll/me), forbidden from company periods (/api/payroll/periods) and settings update
      const empMe = await call('EMPLOYEE', 'get', '/api/payroll/me');
      assert.equal(empMe.status, 200);

      const empPeriods = await call('EMPLOYEE', 'get', '/api/payroll/periods');
      assert.equal(empPeriods.status, 403);

      const empPutSettings = await call('EMPLOYEE', 'put', '/api/settings', {
        maxOtPerMonth: 35,
      });
      assert.equal(empPutSettings.status, 403);

      // 2. LINE_MANAGER: forbidden from calculating or locking company payroll
      const mgrCalc = await call('LINE_MANAGER', 'post', '/api/payroll/calculate', {
        period: P_R25,
      });
      assert.equal(mgrCalc.status, 403);

      // 3. HR_DIRECTOR & CEO: can read periods; HR_DIRECTOR can read settings
      const hrPeriods = await call('HR_DIRECTOR', 'get', '/api/payroll/periods');
      assert.equal(hrPeriods.status, 200);

      const ceoPeriods = await call('CEO', 'get', '/api/payroll/periods');
      assert.equal(ceoPeriods.status, 200);

      const hrSettings = await call('HR_DIRECTOR', 'get', '/api/settings');
      assert.equal(hrSettings.status, 200);

      // 4. ADMIN: can read audit logs and system settings
      const adminEmp = await createTestEmployee();
      createdEmpIds.push(adminEmp.id);
      const adminUser = await createTestUser({ role: 'ADMIN', employeeId: adminEmp.id });
      const adminSession = await loginUser(adminUser);
      const adminAudit = await callWith(adminSession.token, 'get', '/api/audit-logs?limit=5');
      assert.equal(adminAudit.status, 200);
      const adminSettings = await callWith(adminSession.token, 'get', '/api/settings');
      assert.equal(adminSettings.status, 200);

      // 5. AI Copilot: returns 503 AI_NOT_CONFIGURED when GEMINI_API_KEY is absent (never fabricates fake AI response)
      if (!process.env.GEMINI_API_KEY) {
        const aiRes = await call('CEO', 'post', '/api/ai/copilot', {
          message: 'Tổng hợp quỹ lương công ty',
        });
        assert.equal(aiRes.status, 503);
        assert.equal(aiRes.body.code, 'AI_NOT_CONFIGURED');
      }
    });
  });
});
