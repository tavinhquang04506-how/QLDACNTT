/**
 * verify-r27-r30-after-fix.js
 * Verifies R27, R28, R29, and R30 AFTER applying fixes.
 * Never touches nexus_hrms.
 */

const fs = require('fs');
const path = require('path');

async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  console.log('=== [AFTER-FIX VERIFICATION: R27, R28, R29, R30] ===');

  // 1. R27: Verify REPEATABLE READ transaction, snapshot_token joined fields, and PAYROLL_SNAPSHOT_INCONSISTENT guard
  const payrollServicePath = path.join(rootDir, 'Backend/src/modules/payroll/service.js');
  const payrollServiceSrc = fs.readFileSync(payrollServicePath, 'utf8');
  const db = require('../src/config/db');
  const payrollService = require('../src/modules/payroll/service');

  const origQuery = db.query;
  let queryStep = 0;
  let capturedAggSql = '';
  db.query = async (sql) => {
    queryStep += 1;
    if (queryStep === 1) {
      capturedAggSql = sql;
      return {
        rows: [
          {
            count: '1',
            total_net: '10000000',
            total_gross: '11000000',
            snapshot_token: 'md5-before-concurrent-update',
          },
        ],
      };
    }
    return {
      rows: [
        {
          id: 501,
          employee_id: 'NV-001',
          period_id: 77,
          period: '2035-01',
          net_salary: 25000000,
          gross_salary: 27000000,
          full_name: 'Nguyen Van A (Renamed)',
          department_id: 'DEPT-SALES',
          department_name: 'Phòng Kinh Doanh',
        },
      ],
    };
  };

  let mismatchCaught = false;
  let mismatchErrorCode = null;
  try {
    await payrollService.listPayslips(
      { role: 'HR_DIRECTOR', id: 'USR-HR' },
      { period: '2035-01', page: 1, limit: 50 },
      'all'
    );
  } catch (err) {
    mismatchCaught = true;
    mismatchErrorCode = err.code;
  } finally {
    db.query = origQuery;
  }

  const concatPart = capturedAggSql.slice(
    capturedAggSql.indexOf('CONCAT_WS'),
    capturedAggSql.indexOf('ORDER BY')
  );
  const tokenConcatIncludesEmployeeName = concatPart.includes('e.full_name');
  const tokenConcatIncludesDepartment = concatPart.includes('d.name');
  const usesReadSnapshot = payrollServiceSrc
    .slice(payrollServiceSrc.indexOf('async function listPayslips'), payrollServiceSrc.indexOf('async function myPayslips'))
    .includes('db.withReadSnapshot');

  console.log(
    '[R27 AFTER FIX] listPayslips atomic snapshot & token verification:',
    JSON.stringify({
      usesReadSnapshotInListPayslips: usesReadSnapshot,
      tokenConcatIncludesEmployeeName,
      tokenConcatIncludesDepartment,
      interleavedMismatchBlocked: mismatchCaught,
      interleavedMismatchErrorCode: mismatchErrorCode,
    })
  );

  // 2. R28: Verify ProjectsTasksPage.jsx & projectsTasksState.js have zero sample fallbacks
  const tasksPagePath = path.join(rootDir, 'FrontEnd/src/pages/ProjectsTasksPage.jsx');
  const tasksStatePath = path.join(rootDir, 'FrontEnd/src/utils/projectsTasksState.js');
  const tasksPageSrc = fs.readFileSync(tasksPagePath, 'utf8');
  const tasksStateMod = await import('file:///' + tasksStatePath.replace(/\\/g, '/'));
  const emptyMetrics = tasksStateMod.computeProjectsTasksMetrics({
    projects: [],
    tasks: [],
    members: [],
  });

  console.log(
    '[R28 AFTER FIX] ProjectsTasksPage.jsx & projectsTasksState.js on empty state:',
    JSON.stringify({
      hasRandomTaskIdFallback: tasksPageSrc.includes('TSK-${Math.floor(Math.random() * 1000)}'),
      hasBudget1200Fallback: tasksPageSrc.includes('|| 1200'),
      hasTeamCount20Fallback: tasksPageSrc.includes('members.length > 0 ? members.length : 20'),
      hasAllocation90Fallback: tasksPageSrc.includes(": '90.0'"),
      hasHardcodedDeptItCreateProject: tasksPageSrc.includes("payload.department_id = 'DEPT-IT'"),
      evaluatedOnEmptyData: {
        projectsCount: 0,
        displayedBudgetHours: emptyMetrics.totalBudgetHours,
        membersCount: 0,
        displayedTeamCount: emptyMetrics.totalTeamCount,
        displayedAllocationRate: emptyMetrics.allocationRate,
      },
    })
  );

  // 3. R29: Verify AI tools dynamic clock, strict validation, and historical policy version lookup
  const aiToolsPath = path.join(rootDir, 'Backend/src/modules/ai/tools.js');
  const aiToolsSrc = fs.readFileSync(aiToolsPath, 'utf8');
  const aiTools = require('../src/modules/ai/tools');

  let capturedLeaveYear = null;
  let searchPoliciesCheckedPolicyVersionsTable = false;

  db.query = async (sql, params) => {
    if (sql.includes('FROM leave_balances')) {
      capturedLeaveYear = params[1];
      return { rows: [] };
    }
    if (sql.includes('system_policy_versions')) {
      searchPoliciesCheckedPolicyVersionsTable = true;
      return { rows: [] };
    }
    if (sql.includes('FROM handbook_docs')) {
      return {
        rows: [
          {
            id: 'HB-01',
            title: 'Quy chế lương & phụ cấp ăn trưa',
            category: 'PAYROLL',
            content: 'Phụ cấp ăn trưa áp dụng theo cấu hình hệ thống.',
            version: 1,
            is_active: true,
            updated_at: '2026-06-01T00:00:00Z',
          },
        ],
      };
    }
    return { rows: [] };
  };

  const actorEmp2027 = {
    id: 'USR-EMP-1',
    roleCode: 'EMPLOYEE',
    employeeId: 'NV-001',
    departmentId: 'DEPT-IT',
    now: '2026-12-31T17:30:00Z', // 2027-01-01 00:30 in Asia/Ho_Chi_Minh
  };

  await aiTools.executeToolCall('get_my_leave_balance', actorEmp2027, {});
  const invalidMonthRes = await aiTools.executeToolCall('get_my_attendance', actorEmp2027, {
    month: 'not-a-month',
  });
  const policyResAfter = await aiTools.executeToolCall(
    'search_policies',
    actorEmp2027,
    { query: 'phụ cấp ăn trưa kỳ 2025-01', period: '2025-01' }
  );
  db.query = origQuery;

  console.log(
    '[R29 AFTER FIX] AI tools clock & policy version behavior:',
    JSON.stringify({
      hasHardcoded2026InToolsSrc: aiToolsSrc.includes('Number(args.year) || 2026'),
      hasHardcoded202609InToolsSrc: aiToolsSrc.includes(": '2026-09'"),
      defaultLeaveYearUsedFor2027Clock: capturedLeaveYear,
      invalidMonthRejectedWithErrorCode: invalidMonthRes.errorCode,
      searchPoliciesCheckedPolicyVersionsTable,
      historicalPeriod202501ErrorCode: policyResAfter.errorCode,
      searchPoliciesReturnedCurrentSettingForHistoricalPeriod202501:
        (policyResAfter.systemSettings || []).length > 0,
    })
  );

  // 4. R30: Verify PayrollPage.jsx & Sidebar.jsx
  const payrollPagePath = path.join(rootDir, 'FrontEnd/src/pages/PayrollPage.jsx');
  const sidebarPath = path.join(rootDir, 'FrontEnd/src/components/layout/Sidebar.jsx');
  const payrollPageSrc = fs.readFileSync(payrollPagePath, 'utf8');
  const sidebarSrc = fs.readFileSync(sidebarPath, 'utf8');

  console.log(
    '[R30 AFTER FIX] PayrollPage.jsx & Sidebar.jsx role/scope/fallback verification:',
    JSON.stringify({
      fetchesPeriodsWheneverRoleNotEmployee: payrollPageSrc.includes("if (roleKey !== 'EMPLOYEE')"),
      hasHardcodedDeptItForLineManager: payrollPageSrc.includes("e.department_id === 'DEPT-IT'"),
      hasContractSalary20MFallback: payrollPageSrc.includes('e.base_salary || 20000000'),
      hasKpi95Fallback: payrollPageSrc.includes('e.kpi_score ?? 95'),
      sidebarStillHasFakeApproveLabel: sidebarSrc.includes('Phê duyệt quỹ lương'),
      sidebarUsesAccuratePayrollLabel: sidebarSrc.includes('Quản trị bảng lương & quyết toán'),
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
