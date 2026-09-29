/**
 * reproduce-r27-r30-before-fix.js
 * Reproduces R27, R28, R29, and R30 on commit b45bd89 BEFORE applying fixes.
 * Never touches nexus_hrms.
 */

const fs = require('fs');
const path = require('path');

async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  console.log('=== [BEFORE-FIX REPRODUCTION: R27, R28, R29, R30 ON COMMIT b45bd89] ===');

  // ---------------------------------------------------------------------------
  // 1. R27: Non-atomic aggRes + rows query in listPayslips & incomplete snapshot_token
  // ---------------------------------------------------------------------------
  const payrollServicePath = path.join(rootDir, 'Backend/src/modules/payroll/service.js');
  const payrollServiceSrc = fs.readFileSync(payrollServicePath, 'utf8');
  const db = require('../src/config/db');
  const payrollService = require('../src/modules/payroll/service');

  const origQuery = db.query;
  let queryStep = 0;
  let capturedAggSql = '';
  db.query = async (sql, params) => {
    queryStep += 1;
    if (queryStep === 1) {
      capturedAggSql = sql;
      // Query 1: aggRes returns snapshot before concurrent update (net_salary = 10,000,000)
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
    // Between Query 1 and Query 2, a concurrent request updates net_salary to 25,000,000!
    // Because listPayslips does NOT use a single REPEATABLE READ transaction or single query,
    // Query 2 sees the updated row while pagination metadata holds the old total_net & snapshot_token.
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

  const r27Interleaved = await payrollService.listPayslips(
    { role: 'HR_DIRECTOR', id: 'USR-HR' },
    { period: '2035-01', page: 1, limit: 50 },
    'all'
  );
  db.query = origQuery;

  const concatPart = capturedAggSql.slice(
    capturedAggSql.indexOf('CONCAT_WS'),
    capturedAggSql.indexOf('ORDER BY')
  );
  const tokenConcatIncludesEmployeeName = concatPart.includes('e.full_name');
  const tokenConcatIncludesDepartment = concatPart.includes('d.name');
  const usesRepeatableRead = payrollServiceSrc
    .slice(payrollServiceSrc.indexOf('async function listPayslips'), payrollServiceSrc.indexOf('async function getPayslip'))
    .includes('REPEATABLE READ');

  console.log(
    '[R27 BEFORE FIX] Interleaved listPayslips result (aggRes vs rows mismatch):',
    JSON.stringify({
      usesRepeatableReadInListPayslips: usesRepeatableRead,
      tokenConcatIncludesEmployeeName,
      tokenConcatIncludesDepartment,
      paginationTotalNet: r27Interleaved.pagination.aggregates.totalNet,
      rowNetSalarySum: r27Interleaved.data.reduce((s, r) => s + Number(r.net_salary), 0),
      mismatchDetectedByBackend:
        r27Interleaved.pagination.aggregates.totalNet ===
        r27Interleaved.data.reduce((s, r) => s + Number(r.net_salary), 0),
    })
  );

  // ---------------------------------------------------------------------------
  // 2. R28: Sample/fallback numbers (1200h, 20 members, 90.0%, DEPT-IT, random TSK-ID)
  // ---------------------------------------------------------------------------
  const tasksPagePath = path.join(rootDir, 'FrontEnd/src/pages/ProjectsTasksPage.jsx');
  const tasksPageSrc = fs.readFileSync(tasksPagePath, 'utf8');

  // Evaluate the exact expressions used in ProjectsTasksPage.jsx on empty arrays
  const emptyProjects = [];
  const emptyMembers = [];
  const emptyAssignedEmpIds = new Set();
  const totalBudgetHoursBeforeFix =
    emptyProjects.reduce((acc, p) => acc + (Number(p.budgetHours) || 0), 0) || 1200;
  const totalTeamCountBeforeFix = emptyMembers.length > 0 ? emptyMembers.length : 20;
  const allocationRateBeforeFix =
    totalTeamCountBeforeFix > 0
      ? ((emptyAssignedEmpIds.size / totalTeamCountBeforeFix) * 100).toFixed(1)
      : '90.0';

  console.log(
    '[R28 BEFORE FIX] ProjectsTasksPage.jsx sample fallbacks on empty state:',
    JSON.stringify({
      hasRandomTaskIdFallback: tasksPageSrc.includes('TSK-${Math.floor(Math.random() * 1000)}'),
      hasBudget1200Fallback: tasksPageSrc.includes('|| 1200'),
      hasTeamCount20Fallback: tasksPageSrc.includes('members.length > 0 ? members.length : 20'),
      hasAllocation90Fallback: tasksPageSrc.includes(": '90.0'"),
      hasHardcodedDeptItCreateProject: tasksPageSrc.includes("payload.department_id = 'DEPT-IT'"),
      evaluatedOnEmptyData: {
        projectsCount: 0,
        displayedBudgetHours: totalBudgetHoursBeforeFix,
        membersCount: 0,
        displayedTeamCount: totalTeamCountBeforeFix,
        displayedAllocationRate: allocationRateBeforeFix,
      },
    })
  );

  // ---------------------------------------------------------------------------
  // 3. R29: AI tools hardcoded year=2026, month='2026-09', and search_policies ignoring period
  // ---------------------------------------------------------------------------
  const aiToolsPath = path.join(rootDir, 'Backend/src/modules/ai/tools.js');
  const aiToolsSrc = fs.readFileSync(aiToolsPath, 'utf8');
  const aiTools = require('../src/modules/ai/tools');

  let capturedLeaveYear = null;
  let capturedAttendanceFrom = null;
  let searchPoliciesCalledPeriodHistory = false;

  db.query = async (sql, params) => {
    if (sql.includes('FROM leave_balances')) {
      capturedLeaveYear = params[1];
      return { rows: [] };
    }
    if (sql.includes('FROM attendance_logs')) {
      capturedAttendanceFrom = params[1];
      return { rows: [] };
    }
    if (sql.includes('system_policy_versions')) {
      searchPoliciesCalledPeriodHistory = true;
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
    if (sql.includes('FROM system_settings')) {
      return {
        rows: [
          { key: 'allowance_meal', value: '999000', category: 'PAYROLL', description: 'Phụ cấp ăn trưa' },
          { key: 'policy_effective_from', value: '2026-06', category: 'PAYROLL', description: 'Hiệu lực từ' },
        ],
      };
    }
    return { rows: [] };
  };

  const actorEmp = {
    id: 'USR-EMP-1',
    role: 'EMPLOYEE',
    employeeId: 'NV-001',
    departmentId: 'DEPT-IT',
  };

  await aiTools.executeToolCall('get_my_leave_balance', actorEmp, {});
  await aiTools.executeToolCall('get_my_attendance', actorEmp, { month: 'not-a-month' });
  const policyResBefore = await aiTools.executeToolCall(
    'search_policies',
    actorEmp,
    { query: 'phụ cấp ăn trưa kỳ 2025-01', period: '2025-01' }
  );
  db.query = origQuery;

  console.log(
    '[R29 BEFORE FIX] AI tools clock & policy version behavior:',
    JSON.stringify({
      hasHardcoded2026InToolsSrc: aiToolsSrc.includes('Number(args.year) || 2026'),
      hasHardcoded202609InToolsSrc: aiToolsSrc.includes(": '2026-09'"),
      defaultLeaveYearUsed: capturedLeaveYear,
      invalidMonthSilentlySubstitutedWithFromDate: capturedAttendanceFrom,
      searchPoliciesCheckedPolicyVersionsTable: searchPoliciesCalledPeriodHistory,
      searchPoliciesReturnedCurrentSettingForHistoricalPeriod202501:
        policyResBefore?.systemSettings?.some((s) => s.key === 'allowance_meal' && s.value === '999000') || false,
    })
  );

  // ---------------------------------------------------------------------------
  // 4. R30: PayrollPage.jsx non-EMPLOYEE period fetch, DEPT-IT assumption, 20M/95 fallbacks, Sidebar label
  // ---------------------------------------------------------------------------
  const payrollPagePath = path.join(rootDir, 'FrontEnd/src/pages/PayrollPage.jsx');
  const sidebarPath = path.join(rootDir, 'FrontEnd/src/components/layout/Sidebar.jsx');
  const payrollPageSrc = fs.readFileSync(payrollPagePath, 'utf8');
  const sidebarSrc = fs.readFileSync(sidebarPath, 'utf8');

  console.log(
    '[R30 BEFORE FIX] PayrollPage.jsx & Sidebar.jsx role/scope/fallback issues:',
    JSON.stringify({
      fetchesPeriodsWheneverRoleNotEmployee: payrollPageSrc.includes("if (roleKey !== 'EMPLOYEE')"),
      hasHardcodedDeptItForLineManager: payrollPageSrc.includes("e.department_id === 'DEPT-IT'"),
      hasContractSalary20MFallback: payrollPageSrc.includes('e.base_salary || 20000000'),
      hasKpi95Fallback: payrollPageSrc.includes('e.kpi_score ?? 95'),
      sidebarStillHasFakeApproveLabel: sidebarSrc.includes('Phê duyệt quỹ lương'),
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
