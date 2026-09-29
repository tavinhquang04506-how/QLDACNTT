/**
 * reproduce-r24-r26-before-fix.js
 * Reproduces R24, R25, and R26 on commit 4077088 BEFORE applying fixes.
 * Uses only in-memory / source inspection and pure function calls (no writes to nexus_hrms).
 */

const fs = require('fs');
const path = require('path');

async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  const payrollPagePath = path.join(rootDir, 'FrontEnd/src/pages/PayrollPage.jsx');
  const periodStatePath = path.join(rootDir, 'FrontEnd/src/utils/payrollPeriodState.js');

  const payrollPageSrc = fs.readFileSync(payrollPagePath, 'utf8');
  const periodStateSrc = fs.readFileSync(periodStatePath, 'utf8');

  console.log('=== [BEFORE-FIX REPRODUCTION: R24, R25, R26 ON COMMIT 4077088] ===');

  // 1. R24: Check whether FrontEnd/src handles ADJUSTMENT_SOURCE_CONFLICT, KEEP_MANUAL, USE_SOURCE, adjustmentResolutions
  const r24Keywords = [
    'ADJUSTMENT_SOURCE_CONFLICT',
    'KEEP_MANUAL',
    'USE_SOURCE',
    'adjustmentResolutions',
  ];
  const r24Matches = {};
  for (const kw of r24Keywords) {
    r24Matches[kw] = payrollPageSrc.includes(kw);
  }
  console.log('[R24 BEFORE FIX] PayrollPage.jsx conflict handling keywords:', JSON.stringify(r24Matches));

  // 2. R25: Check fake CEO approval React state in PayrollPage.jsx & payrollPeriodState.js
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
  console.log(
    '[R25 BEFORE FIX] Server status is DU_THAO, but with client-only isCeoApproved=true -> payrollStatus:',
    JSON.stringify({
      serverStatus: 'DU_THAO',
      uiPayrollStatus: r25ViewState.payrollStatus,
      hasFakeApproveLabelInPayrollPage: payrollPageSrc.includes('Phê duyệt chi trả toàn công ty'),
    })
  );

  // 3. R26: Call real fetchAllPayslipsForPeriod with duplicate employee_id across 2 pages & mid-flight changes
  let dupCaseResult;
  try {
    const res = await periodStateMod.fetchAllPayslipsForPeriod(
      async ({ page }) => ({
        success: true,
        data: [
          {
            id: page,
            employee_id: 'NV-A',
            period: '2032-08',
            net_salary: 10000000,
          },
        ],
        pagination: { total: 2, page, limit: 1, totalPages: 2 },
      }),
      { period: '2032-08', pageSize: 1 }
    );
    dupCaseResult = {
      accepted: true,
      rows: res.data.length,
      uniqueEmployees: new Set(res.data.map((r) => r.employee_id)).size,
    };
  } catch (err) {
    dupCaseResult = { accepted: false, error: err.message };
  }
  console.log('[R26 BEFORE FIX] Duplicate employee_id across 2 pages (NV-A on page 1 & page 2, total=2):', JSON.stringify(dupCaseResult));

  let changedTotalResult;
  try {
    const res = await periodStateMod.fetchAllPayslipsForPeriod(
      async ({ page }) => ({
        success: true,
        data: [
          {
            id: page,
            employee_id: `NV-0${page}`,
            period: '2032-08',
            net_salary: 10000000,
          },
        ],
        // Page 2 reports total=3 instead of 2 (data changed mid-pagination)
        pagination: { total: page === 1 ? 2 : 3, page, limit: 1, totalPages: 2 },
      }),
      { period: '2032-08', pageSize: 1 }
    );
    changedTotalResult = { accepted: true, rows: res.data.length };
  } catch (err) {
    changedTotalResult = { accepted: false, error: err.message };
  }
  console.log('[R26 BEFORE FIX] Changed pagination.total on page 2 (2 -> 3):', JSON.stringify(changedTotalResult));

  let mixedSnapshotResult;
  try {
    const res = await periodStateMod.fetchAllPayslipsForPeriod(
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
    mixedSnapshotResult = { accepted: true, rows: res.data.length };
  } catch (err) {
    mixedSnapshotResult = { accepted: false, error: err.message };
  }
  console.log('[R26 BEFORE FIX] Mixed snapshotToken between page 1 (snap-v1) and page 2 (snap-v2):', JSON.stringify(mixedSnapshotResult));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
