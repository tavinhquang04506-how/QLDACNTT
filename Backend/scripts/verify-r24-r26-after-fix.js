/**
 * verify-r24-r26-after-fix.js
 * Verifies R24, R25, and R26 AFTER applying fixes (direct counterpart to reproduce-r24-r26-before-fix.js).
 */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  const payrollPagePath = path.join(rootDir, 'FrontEnd/src/pages/PayrollPage.jsx');
  const periodStatePath = path.join(rootDir, 'FrontEnd/src/utils/payrollPeriodState.js');

  const payrollPageSrc = fs.readFileSync(payrollPagePath, 'utf8');
  const periodStateSrc = fs.readFileSync(periodStatePath, 'utf8');
  const combinedSrc = payrollPageSrc + '\n' + periodStateSrc;

  console.log('=== [AFTER-FIX VERIFICATION: R24, R25, R26] ===');

  // 1. R24: Verify FrontEnd handles ADJUSTMENT_SOURCE_CONFLICT, KEEP_MANUAL, USE_SOURCE, adjustmentResolutions, expectedSourceValues
  const r24Keywords = [
    'ADJUSTMENT_SOURCE_CONFLICT',
    'KEEP_MANUAL',
    'USE_SOURCE',
    'adjustmentResolutions',
    'expectedSourceValues',
    'data-testid="adjustment-conflict-modal"',
  ];
  const r24Matches = {};
  for (const kw of r24Keywords) {
    r24Matches[kw] = combinedSrc.includes(kw);
    assert.equal(r24Matches[kw], true, `R24 keyword missing after fix: ${kw}`);
  }
  console.log('[R24 AFTER FIX] Conflict reconciliation UI & payload keywords:', JSON.stringify(r24Matches));

  // 2. R25: Verify fake CEO approval React state is removed and status reflects server DU_THAO
  const periodStateMod = await import('file:///' + periodStatePath.replace(/\\/g, '/'));
  const r25ViewState = periodStateMod.computePeriodViewState({
    currentPeriodCode: '2028-10',
    currentPeriodObj: { id: 101, period: '2028-10', status: 'DU_THAO', total_net: 50000000 },
    loadedPeriodCode: '2028-10',
    loadedPeriodId: 101,
    loadedExpectedTotal: 1,
    periodLoading: false,
    periodError: '',
    apiPayslips: [{ id: 1, employee_id: 'NV-001', period: '2028-10', period_id: 101, net_salary: 50000000 }],
    anomalies: [],
    isCeoApproved: true,
  });
  const r25Summary = {
    serverStatus: 'DU_THAO',
    uiPayrollStatus: r25ViewState.payrollStatus,
    hasFakeApproveLabelInPayrollPage: payrollPageSrc.includes('Phê duyệt chi trả toàn công ty'),
    hasHonestRecalculateBtn: payrollPageSrc.includes('data-testid="recalculate-payroll-btn"'),
  };
  assert.equal(r25Summary.uiPayrollStatus, 'Đang xử lý dự thảo');
  assert.equal(r25Summary.hasFakeApproveLabelInPayrollPage, false);
  assert.equal(r25Summary.hasHonestRecalculateBtn, true);
  console.log('[R25 AFTER FIX] Honest period status & button state:', JSON.stringify(r25Summary));

  // 3. R26: Verify fetchAllPayslipsForPeriod rejects duplicate employee_id, changed total, and mixed snapshotToken
  let dupCaseResult;
  try {
    await periodStateMod.fetchAllPayslipsForPeriod(
      async ({ page }) => ({
        success: true,
        data: [{ id: page, employee_id: 'NV-A', period: '2032-08', net_salary: 10000000 }],
        pagination: { total: 2, page, limit: 1, totalPages: 2 },
      }),
      { period: '2032-08', pageSize: 1 }
    );
    dupCaseResult = { accepted: true };
  } catch (err) {
    dupCaseResult = { accepted: false, code: err.code, error: err.message };
  }
  assert.equal(dupCaseResult.accepted, false);
  assert.equal(dupCaseResult.code, 'DUPLICATE_PAYSLIP_EMPLOYEE');
  console.log('[R26 AFTER FIX] Duplicate employee_id across 2 pages:', JSON.stringify(dupCaseResult));

  let changedTotalResult;
  try {
    await periodStateMod.fetchAllPayslipsForPeriod(
      async ({ page }) => ({
        success: true,
        data: [{ id: page, employee_id: `NV-0${page}`, period: '2032-08', net_salary: 10000000 }],
        pagination: { total: page === 1 ? 2 : 3, page, limit: 1, totalPages: 2 },
      }),
      { period: '2032-08', pageSize: 1 }
    );
    changedTotalResult = { accepted: true };
  } catch (err) {
    changedTotalResult = { accepted: false, code: err.code, error: err.message };
  }
  assert.equal(changedTotalResult.accepted, false);
  assert.equal(changedTotalResult.code, 'PAGINATION_TOTAL_CHANGED');
  console.log('[R26 AFTER FIX] Changed pagination.total on page 2 (2 -> 3):', JSON.stringify(changedTotalResult));

  let mixedSnapshotResult;
  try {
    await periodStateMod.fetchAllPayslipsForPeriod(
      async ({ page }) => ({
        success: true,
        data: [
          {
            id: page,
            employee_id: `NV-0${page}`,
            period: '2032-08',
            net_salary: page === 1 ? 10000000 : 99999999,
          },
        ],
        pagination: {
          total: 2,
          page,
          limit: 1,
          totalPages: 2,
          snapshotToken: page === 1 ? 'snap-v1' : 'snap-v2',
        },
      }),
      { period: '2032-08', pageSize: 1 }
    );
    mixedSnapshotResult = { accepted: true };
  } catch (err) {
    mixedSnapshotResult = { accepted: false, code: err.code, error: err.message };
  }
  assert.equal(mixedSnapshotResult.accepted, false);
  assert.equal(mixedSnapshotResult.code, 'SNAPSHOT_CHANGED_DURING_PAGINATION');
  console.log('[R26 AFTER FIX] Mixed snapshotToken between page 1 and page 2:', JSON.stringify(mixedSnapshotResult));

  console.log('=== [ALL R24, R25, R26 AFTER-FIX VERIFICATIONS PASSED] ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
