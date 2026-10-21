/**
 * Regression Tests for Master Completion Plan (`10-KE-HOACH-TONG-THE-HOAN-THIEN-b45bd89.md`):
 * R27, R28, R29, R30
 */
process.env.NODE_ENV = 'test';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { call, closeDb } = require('../helpers/api');
const db = require('../../src/config/db');
const { assertSafeTestDatabase } = require('../../src/utils/testDbGuard');
const payrollService = require('../../src/modules/payroll/service');
const aiTools = require('../../src/modules/ai/tools');
const aiService = require('../../src/modules/ai/service');

const P_R27 = '2034-05';
const POLICY_PERIODS = ['2034-01', '2034-06', '2034-10'];

async function cleanupR27R30() {
  await assertSafeTestDatabase(db, { context: 'r27-r30.cleanup' });
  await db.query(
    `DELETE FROM payslips WHERE period_id IN (SELECT id FROM payroll_periods WHERE period = $1)`,
    [P_R27]
  );
  await db.query(`DELETE FROM payroll_periods WHERE period = $1`, [P_R27]);
  await db.query(`DELETE FROM system_policy_versions WHERE effective_from = ANY($1::text[])`, [
    POLICY_PERIODS,
  ]);
}

describe('R27–R30 Release Readiness & Review Fixes Verification', () => {
  before(async () => {
    const currentDb = await assertSafeTestDatabase(db, { context: 'r27-r30.before' });
    assert.equal(currentDb, 'nexus_hrms_test');
    await cleanupR27R30();

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
          ot_rate_weekday: 150,
          ot_rate_weekend: 200,
          ot_rate_holiday: 300,
          max_ot_per_month: 40,
          standard_work_days: 22,
          allowance_meal: 730000,
          allowance_transport: 500000,
          allowance_phone: 300000,
        }),
      ]
    );
  });

  after(async () => {
    await cleanupR27R30();
    await closeDb();
  });

  it('R27: listPayslips runs inside REPEATABLE READ snapshot, includes joined employee/department fields in snapshotToken, and rejects inconsistent agg vs rows', async () => {
    // 1. Verify snapshotToken changes on net-neutral amount swap AND on employee full_name / department change
    const createRes = await db.query(
      `INSERT INTO payroll_periods (period, status, total_net)
       VALUES ($1, 'DU_THAO', 33687250)
       RETURNING id`,
      [P_R27]
    );
    const periodId = createRes.rows[0].id;

    const empRowsRes = await db.query(`SELECT id, full_name FROM employees ORDER BY id ASC LIMIT 2`);
    const emp1 = empRowsRes.rows[0];
    const emp2 = empRowsRes.rows[1];

    // Insert 2 payslips for emp1 and emp2 in P_R27
    await db.query(
      `INSERT INTO payslips (
        period_id, employee_id, standard_work_days, actual_work_days,
        base_salary, ot_hours, ot_pay, allowances, bonus, gross_income,
        bhxh_amount, bhyt_amount, bhtn_amount, pit_taxable, pit_amount,
        net_salary, status, bank_account, bank_name
      ) VALUES
        ($1, $2, 22, 22, 20000000, 0, 0, 1530000, 0, 21530000, 1600000, 300000, 200000, 8430000, 500000, 18930000, 'DU_THAO', '111', 'VCB'),
        ($1, $3, 22, 22, 15000000, 0, 0, 1530000, 0, 16530000, 1200000, 225000, 150000, 3955000, 197750, 14757250, 'DU_THAO', '222', 'VCB')`,
      [periodId, emp1.id, emp2.id]
    );

    const snap1 = await payrollService.listPayslips(
      { role: 'HR_DIRECTOR', id: 'USR-HR' },
      { period: P_R27, page: 1, limit: 50 },
      'all'
    );
    assert.equal(snap1.data.length, 2);
    const token1 = snap1.pagination.snapshotToken;
    const totalNet1 = snap1.pagination.aggregates.totalNet;
    assert.ok(token1 && token1 !== 'EMPTY');

    // Net-neutral swap: add 1,000,000 to emp1 and subtract 1,000,000 from emp2 (totalNet stays identical!)
    await db.query(
      `UPDATE payslips SET net_salary = net_salary + 1000000 WHERE period_id = $1 AND employee_id = $2`,
      [periodId, emp1.id]
    );
    await db.query(
      `UPDATE payslips SET net_salary = net_salary - 1000000 WHERE period_id = $1 AND employee_id = $2`,
      [periodId, emp2.id]
    );

    const snap2 = await payrollService.listPayslips(
      { role: 'HR_DIRECTOR', id: 'USR-HR' },
      { period: P_R27, page: 1, limit: 50 },
      'all'
    );
    assert.equal(snap2.pagination.aggregates.totalNet, totalNet1);
    assert.notEqual(
      snap2.pagination.snapshotToken,
      token1,
      'snapshotToken must change on net-neutral amount swap between employees'
    );

    // Employee name change without changing sort order or monetary amounts must also change snapshotToken
    const origName = emp1.full_name;
    try {
      await db.query(`UPDATE employees SET full_name = $1 WHERE id = $2`, [
        `${origName} (Updated)`,
        emp1.id,
      ]);
      const snap3 = await payrollService.listPayslips(
        { role: 'HR_DIRECTOR', id: 'USR-HR' },
        { period: P_R27, page: 1, limit: 50 },
        'all'
      );
      assert.notEqual(
        snap3.pagination.snapshotToken,
        snap2.pagination.snapshotToken,
        'snapshotToken must change when joined employee full_name changes'
      );
    } finally {
      await db.query(`UPDATE employees SET full_name = $1 WHERE id = $2`, [origName, emp1.id]);
    }

    // 2. Verify defense-in-depth guard rejects mismatched aggRes vs rows if a custom executor returns inconsistent state
    const origQuery = db.query;
    let step = 0;
    db.query = async () => {
      step += 1;
      if (step === 1) {
        return {
          rows: [
            {
              count: '1',
              total_net: '10000000',
              total_gross: '11000000',
              snapshot_token: 'tok-a',
            },
          ],
        };
      }
      return {
        rows: [
          {
            id: 999,
            employee_id: 'NV-001',
            period_id: periodId,
            period: P_R27,
            net_salary: 25000000,
          },
        ],
      };
    };
    try {
      await assert.rejects(
        () =>
          payrollService.listPayslips(
            { role: 'HR_DIRECTOR', id: 'USR-HR' },
            { period: P_R27, page: 1, limit: 50 },
            'all'
          ),
        (err) => err.code === 'PAYROLL_SNAPSHOT_INCONSISTENT' && err.status === 409
      );
    } finally {
      db.query = origQuery;
    }
  });

  it('R28 & R30: FrontEnd source files contain zero sample fallbacks (1200h, 20 members, 90.0%, DEPT-IT, 20M salary, 95 KPI, random TSK IDs)', () => {
    const rootDir = path.resolve(__dirname, '../../..');
    const tasksPageSrc = fs.readFileSync(
      path.join(rootDir, 'FrontEnd/src/pages/ProjectsTasksPage.jsx'),
      'utf8'
    );
    const payrollPageSrc = fs.readFileSync(
      path.join(rootDir, 'FrontEnd/src/pages/PayrollPage.jsx'),
      'utf8'
    );
    const sidebarSrc = fs.readFileSync(
      path.join(rootDir, 'FrontEnd/src/components/layout/Sidebar.jsx'),
      'utf8'
    );

    // R28 assertions
    assert.equal(tasksPageSrc.includes('|| 1200'), false);
    assert.equal(tasksPageSrc.includes('members.length > 0 ? members.length : 20'), false);
    assert.equal(tasksPageSrc.includes(": '90.0'"), false);
    assert.equal(tasksPageSrc.includes("payload.department_id = 'DEPT-IT'"), false);
    assert.equal(tasksPageSrc.includes('TSK-${Math.floor(Math.random() * 1000)}'), false);
    assert.equal(tasksPageSrc.includes('projects-load-error-banner'), true);
    assert.equal(tasksPageSrc.includes('create-project-department-select'), true);

    // R30 assertions
    assert.equal(payrollPageSrc.includes("if (roleKey !== 'EMPLOYEE')"), false);
    assert.equal(payrollPageSrc.includes("e.department_id === 'DEPT-IT'"), false);
    assert.equal(payrollPageSrc.includes('e.base_salary || 20000000'), false);
    assert.equal(payrollPageSrc.includes('e.kpi_score ?? 95'), false);
    assert.equal(payrollPageSrc.includes('canManageCompanyPayroll'), true);
    assert.equal(payrollPageSrc.includes('payroll-role-restricted'), true);
    assert.equal(sidebarSrc.includes('Phê duyệt quỹ lương'), false);
    assert.equal(sidebarSrc.includes('Quản trị bảng lương & quyết toán'), true);
  });

  it('R29: AI tools use timezone-aware dynamic clock (Asia/Ho_Chi_Minh), validate date/month/year strictly, and resolve historical policy versions by period', async () => {
    // 1. Timezone-aware year-end boundary: 2026-12-31T17:30:00Z is 2027-01-01 00:30:00 in Asia/Ho_Chi_Minh (+07:00)
    const clock = aiTools.getCurrentClock('2026-12-31T17:30:00Z', 'Asia/Ho_Chi_Minh');
    assert.equal(clock.year, 2027);
    assert.equal(clock.month, '2027-01');
    assert.equal(clock.date, '2027-01-01');

    const actor2027 = {
      userId: 'USR-EMP-1',
      roleCode: 'EMPLOYEE',
      employeeId: 'NV-001',
      departmentId: 'DEPT-IT',
      now: '2026-12-31T17:30:00Z',
    };

    // 2. get_my_leave_balance uses dynamic year 2027 when year arg is omitted, and rejects invalid year
    const leaveDefault = await aiTools.executeToolCall('get_my_leave_balance', actor2027, {});
    assert.equal(leaveDefault.ok, true);
    assert.equal(leaveDefault.year, 2027);

    const leaveInvalid = await aiTools.executeToolCall('get_my_leave_balance', actor2027, {
      year: 'not-a-year',
    });
    assert.equal(leaveInvalid.ok, false);
    assert.equal(leaveInvalid.errorCode, 'INVALID_ARGUMENT');

    // 3. get_my_attendance uses dynamic month 2027-01 when args are omitted, and rejects invalid month/dates/ranges
    const attDefault = await aiTools.executeToolCall('get_my_attendance', actor2027, {});
    assert.equal(attDefault.ok, true);
    assert.equal(attDefault.from, '2027-01-01');
    assert.equal(attDefault.to, '2027-01-31');

    const attInvalidMonth = await aiTools.executeToolCall('get_my_attendance', actor2027, {
      month: 'not-a-month',
    });
    assert.equal(attInvalidMonth.ok, false);
    assert.equal(attInvalidMonth.errorCode, 'INVALID_ARGUMENT');

    const attInvalidDate = await aiTools.executeToolCall('get_my_attendance', actor2027, {
      from: '2026-02-30',
      to: '2026-03-02',
    });
    assert.equal(attInvalidDate.ok, false);
    assert.equal(attInvalidDate.errorCode, 'INVALID_ARGUMENT');

    const attInvertedRange = await aiTools.executeToolCall('get_my_attendance', actor2027, {
      from: '2026-10-15',
      to: '2026-10-01',
    });
    assert.equal(attInvertedRange.ok, false);
    assert.equal(attInvertedRange.errorCode, 'INVALID_ARGUMENT');

    const attTooWide = await aiTools.executeToolCall('get_my_attendance', actor2027, {
      from: '2026-01-01',
      to: '2026-06-01',
    });
    assert.equal(attTooWide.ok, false);
    assert.equal(attTooWide.errorCode, 'INVALID_ARGUMENT');

    // 4. Historical policy versions in search_policies
    const basePolicy = {
      bhxh_rate: 8,
      bhyt_rate: 1.5,
      bhtn_rate: 1,
      insurance_cap_salary: 46800000,
      personal_deduction: 11000000,
      dependent_deduction: 4400000,
      ot_rate_weekday: 150,
      ot_rate_weekend: 200,
      ot_rate_holiday: 300,
      max_ot_per_month: 40,
      standard_work_days: 22,
      allowance_transport: 500000,
      allowance_phone: 300000,
    };

    await db.query(
      `INSERT INTO system_policy_versions (effective_from, policy)
       VALUES
         ('2034-01', $1::jsonb),
         ('2034-06', $2::jsonb),
         ('2034-10', $3::jsonb)`,
      [
        JSON.stringify({ ...basePolicy, allowance_meal: 750000 }),
        JSON.stringify({ ...basePolicy, allowance_meal: 920000 }),
        JSON.stringify({ ...basePolicy, allowance_meal: 1150000 }),
      ]
    );

    const polP1 = await aiTools.executeToolCall('search_policies', actor2027, {
      query: 'phụ cấp ăn trưa kỳ 2034-03',
    });
    assert.equal(polP1.ok, true);
    assert.equal(polP1.found, true);
    assert.equal(polP1.policyVersionFound, true);
    assert.equal(polP1.queriedPeriod, '2034-03');
    assert.equal(polP1.effectiveFrom, '2034-01');
    assert.equal(
      polP1.systemSettings.find((s) => s.key === 'allowance_meal')?.value,
      '750000'
    );

    const polP2 = await aiTools.executeToolCall('search_policies', actor2027, {
      query: 'phụ cấp ăn trưa',
      period: '2034-08',
    });
    assert.equal(polP2.ok, true);
    assert.equal(polP2.found, true);
    assert.equal(polP2.effectiveFrom, '2034-06');
    assert.equal(
      polP2.systemSettings.find((s) => s.key === 'allowance_meal')?.value,
      '920000'
    );

    // Querying a period before the earliest stored version ('2020-01') must NOT return current settings
    const polMissing = await aiTools.executeToolCall('search_policies', actor2027, {
      query: 'phụ cấp ăn trưa kỳ 2018-05',
      period: '2018-05',
    });
    assert.equal(polMissing.ok, true);
    assert.equal(polMissing.found, false);
    assert.equal(polMissing.policyVersionFound, false);
    assert.equal(polMissing.errorCode, 'POLICY_VERSION_NOT_FOUND');
    assert.equal(polMissing.systemSettings.length, 0);

    // 5. Redacted audit metadata & mid-conversation scope change invalidation
    aiService.clearAiRuntimeState();
    aiService.registerConversationOwner(
      'conv-scope-change',
      'USR-MGR-1',
      [{ role: 'user', parts: [{ text: 'Previous turn as HR_DIRECTOR' }] }],
      { roleCode: 'HR_DIRECTOR', departmentId: 'DEPT-HR' }
    );

    let capturedContents = null;
    const resCopilot = await aiService.runCopilot({
      actor: {
        userId: 'USR-MGR-1',
        employeeId: 'NV-002',
        roleCode: 'LINE_MANAGER',
        departmentId: 'DEPT-IT',
      },
      message: 'Xin chào trợ lý',
      conversationId: 'conv-scope-change',
      options: {
        apiKey: 'TEST-SECRET-GEMINI-KEY-DO-NOT-LOG',
        model: 'gemini-2.5-flash',
        now: '2026-12-31T17:30:00Z',
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body);
          capturedContents = body.contents;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [{ text: 'Xin chào Trưởng phòng IT.' }],
                  },
                },
              ],
            }),
          };
        },
      },
    });

    assert.equal(resCopilot.success, true);
    // Prior turn from HR_DIRECTOR role must have been discarded when actor role changed to LINE_MANAGER
    assert.equal(capturedContents.length, 1);
    assert.equal(capturedContents[0].parts[0].text, 'Xin chào trợ lý');

    const logs = aiService.getRedactedAiAuditLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].redacted, true);
    assert.equal(JSON.stringify(logs).includes('TEST-SECRET-GEMINI-KEY-DO-NOT-LOG'), false);
  });
});
