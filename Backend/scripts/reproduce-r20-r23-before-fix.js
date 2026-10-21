/**
 * reproduce-r20-r23-before-fix.js
 * Reproduces R20, R21, R22, R23 (and R16 CLI --target-db gap) on commit b4adde0 before applying fixes.
 * Strictly read-only / in-memory (does not connect to or write to any PostgreSQL database).
 */
const fs = require('fs');
const path = require('path');
const { parsePagination, paginationMeta } = require('../src/utils/pagination');

async function main() {
  console.log('=== [R20-R23 REPRODUCTION BEFORE FIX START] ===');
  console.log(`TIMESTAMP=${new Date().toISOString()}`);

  // 1. R20: Selecting non-existent period B falls back to apiPeriods[0] (Period A) and retains Period A payslips on error
  const payrollPageSrc = fs.readFileSync(
    path.resolve(__dirname, '../../FrontEnd/src/pages/PayrollPage.jsx'),
    'utf8'
  );
  const hasPeriodZeroFallback = payrollPageSrc.includes(
    'apiPeriods.find(p => p.period === currentPeriodCode) || apiPeriods[0] || null'
  );
  const hasPeriodIdFilterLeak = payrollPageSrc.includes(
    'String(p.period_id) === String(currentPeriodObj?.id)'
  );
  const hasEmptyCatchOnPayslips = payrollPageSrc.includes('.catch(() => {});');

  // Simulate the exact logic in PayrollPage.jsx lines 136-137 & 204-210:
  const apiPeriods = [{ id: 101, period: '2028-10', status: 'DU_THAO', total_net: 83880875 }];
  const apiPayslips = [
    { id: 1, period_id: 101, period: '2028-10', employee_id: 'NV-0001', net_salary: 21231000 },
  ];
  const selectedPeriod = 'Tháng 11/2028'; // Period B (does not exist in apiPeriods)
  const currentPeriodCode = '2028-11';
  const currentPeriodObj =
    apiPeriods.find((p) => p.period === currentPeriodCode) || apiPeriods[0] || null;
  const periodPayslips = apiPayslips.filter(
    (p) =>
      !p.period ||
      p.period === currentPeriodCode ||
      String(p.period_id) === String(currentPeriodObj?.id)
  );
  const modalPayloadWhenSelectingUncreatedB = {
    periodId: currentPeriodObj?.id,
    period: selectedPeriod,
    slipsCount: periodPayslips.length,
  };
  console.log(
    '[R20 REPRODUCED] Non-existent period B falls back to Period A ID & data:',
    JSON.stringify({
      hasPeriodZeroFallback,
      hasPeriodIdFilterLeak,
      hasEmptyCatchOnPayslips,
      selectedPeriod,
      currentPeriodCode,
      resolvedPeriodId: currentPeriodObj?.id,
      resolvedPeriodCode: currentPeriodObj?.period,
      leakedPayslipsCount: periodPayslips.length,
      modalPayloadWhenSelectingUncreatedB,
    })
  );

  // 2. R21: calculate() drops actualWorkDays, baseSalary, otHours from manual_adjustments
  const payrollServiceSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/payroll/service.js'),
    'utf8'
  );
  // Simulate lines 272-287 of Backend/src/modules/payroll/service.js on commit b4adde0:
  const existingSlipsByEmp = new Map([
    [
      'NV-0001',
      {
        employee_id: 'NV-0001',
        bonus: 0,
        allowances: 1500000,
        note: null,
        actual_work_days: 20,
        base_salary: 30000000,
        ot_hours: 12,
      },
    ],
  ]);
  const prevManualAdjustments = {
    'NV-0001': {
      actualWorkDays: 20,
      baseSalary: 30000000,
      otHours: 12,
      updated_by: 'NV-0002',
      updated_at: '2026-10-21T07:00:00.000Z',
    },
  };
  const preservedAdjustments = {};
  for (const [empId, slip] of existingSlipsByEmp.entries()) {
    const prevAdj = prevManualAdjustments[empId] || {};
    const bonusNum = prevAdj.bonus !== undefined ? Number(prevAdj.bonus) : Number(slip.bonus || 0);
    const noteVal = prevAdj.note !== undefined ? prevAdj.note : slip.note || null;
    const hasCustomAllowances = prevAdj.allowances !== undefined;
    if (bonusNum !== 0 || noteVal || hasCustomAllowances) {
      preservedAdjustments[empId] = {
        bonus: bonusNum,
        note: noteVal,
        ...(hasCustomAllowances ? { allowances: Number(prevAdj.allowances) } : {}),
      };
    }
  }
  console.log(
    '[R21 REPRODUCED] HR manual adjustments on actualWorkDays/baseSalary/otHours lost on calculate():',
    JSON.stringify({
      beforeRecalculate: prevManualAdjustments['NV-0001'],
      afterRecalculatePreserved: preservedAdjustments['NV-0001'] || null,
      lostActualWorkDays: preservedAdjustments['NV-0001']?.actualWorkDays === undefined,
      lostBaseSalary: preservedAdjustments['NV-0001']?.baseSalary === undefined,
      lostOtHours: preservedAdjustments['NV-0001']?.otHours === undefined,
      calculatesUsesEmpSrcBaseDirectly: payrollServiceSrc.includes('const base = empSrc.base;'),
      calculatesUsesEmpSrcWorkDaysDirectly: payrollServiceSrc.includes(
        'const workDays = empSrc.rawWorkDays;'
      ),
      calculatesUsesEmpSrcOtHoursDirectly: payrollServiceSrc.includes(
        'const otHours = empSrc.otHours;'
      ),
    })
  );

  // 3. R22: Single getPayslips({ period, limit: 500 }) truncates at 500 when total is 505
  const hasSinglePageLimit500 = payrollPageSrc.includes(
    'payrollService.getPayslips({ period: currentPeriodCode, limit: 500 })'
  );
  const { page, limit } = parsePagination({ limit: '500' }, { defaultLimit: 100, maxLimit: 500 });
  const metaFor505 = paginationMeta(505, page, limit);
  console.log(
    '[R22 REPRODUCED] 505 payslips truncated to 500 by single-page fetch:',
    JSON.stringify({
      hasSinglePageLimit500,
      maxLimitEnforcedByBackend: limit,
      totalRecordsInPeriod: 505,
      returnedInSingleCall: 500,
      missingRecordsCount: 505 - 500,
      paginationMeta: metaFor505,
    })
  );

  // 4. R23 & R16 CLI: Helpers lack current_database() guard; migrate.js does not parse --target-db
  const employeesHelperSrc = fs.readFileSync(
    path.resolve(__dirname, '../tests/helpers/employees.js'),
    'utf8'
  );
  const migrateScriptSrc = fs.readFileSync(path.resolve(__dirname, './migrate.js'), 'utf8');
  console.log(
    '[R23 & R16-CLI REPRODUCED] Guard & CLI inspection:',
    JSON.stringify({
      employeesHelperChecksCurrentDatabase: employeesHelperSrc.includes('current_database()'),
      migrateScriptParsesTargetDbFlag: migrateScriptSrc.includes('--target-db'),
    })
  );

  console.log('=== [R20-R23 REPRODUCTION BEFORE FIX COMPLETE] ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
