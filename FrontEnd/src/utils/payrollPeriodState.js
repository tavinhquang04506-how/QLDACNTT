// ============================================
// utils/payrollPeriodState.js
// R20: Strict period resolution & state readiness guard (no fallback to apiPeriods[0])
// R22: Multi-page payslip loader & completeness verification for 501+ records
// ============================================

export function parsePeriodCode(periodStr) {
  if (!periodStr) return new Date().toISOString().slice(0, 7);
  const str = String(periodStr).trim();
  const m1 = str.match(/(\d{2})\/(\d{4})/);
  if (m1) return `${m1[2]}-${m1[1]}`;
  const m2 = str.match(/(\d{4})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  return new Date().toISOString().slice(0, 7);
}

export function formatPeriodLabel(periodCode) {
  if (!periodCode) return '';
  const m = String(periodCode).trim().match(/^(\d{4})-(\d{2})$/);
  if (m) return `Tháng ${m[2]}/${m[1]}`;
  return String(periodCode);
}

export function getNextPeriodCode(periodCode) {
  const code = parsePeriodCode(periodCode);
  const m = code.match(/^(\d{4})-(\d{2})$/);
  if (!m) return code;
  let year = Number(m[1]);
  let month = Number(m[2]) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * R20: Strictly resolve the period object matching `currentPeriodCode`.
 * NEVER fall back to `apiPeriods[0]` when the selected period does not exist.
 */
export function resolveSelectedPeriodObj(apiPeriods, currentPeriodCode) {
  if (!Array.isArray(apiPeriods) || !currentPeriodCode) return null;
  return apiPeriods.find((p) => p && p.period === currentPeriodCode) || null;
}

/**
 * R20: Build period selector options including existing periods AND uncreated candidate periods
 * so HR/CEO can select an uncreated period to initialize/calculate it without falling back to apiPeriods[0].
 */
export function buildPeriodSelectOptions(apiPeriods = [], selectedPeriod = '', defaultPeriodStr = '') {
  const list = Array.isArray(apiPeriods) ? apiPeriods : [];
  const byCode = new Map();

  for (const p of list) {
    if (!p || !p.period) continue;
    const formatted = formatPeriodLabel(p.period);
    const statusLabel =
      p.status === 'DA_CHOT'
        ? 'Đã chốt'
        : p.status === 'DA_CHUYEN_KHOAN'
        ? 'Đã chi trả'
        : 'Đang xử lý';
    byCode.set(p.period, {
      code: p.period,
      value: formatted,
      label: `Kỳ: ${formatted} (${statusLabel})`,
      exists: true,
      status: p.status,
      id: p.id,
    });
  }

  const candidateCodes = new Set();
  if (defaultPeriodStr) {
    candidateCodes.add(parsePeriodCode(defaultPeriodStr));
  }
  if (selectedPeriod) {
    candidateCodes.add(parsePeriodCode(selectedPeriod));
  }
  if (list.length > 0 && list[0]?.period) {
    candidateCodes.add(getNextPeriodCode(list[0].period));
  } else if (defaultPeriodStr) {
    candidateCodes.add(getNextPeriodCode(defaultPeriodStr));
  }

  for (const code of candidateCodes) {
    if (!code || byCode.has(code)) continue;
    const formatted = formatPeriodLabel(code);
    byCode.set(code, {
      code,
      value: formatted,
      label: `Kỳ: ${formatted} (Chưa mở kỳ)`,
      exists: false,
      status: 'CHUA_MO_KY',
      id: null,
    });
  }

  return Array.from(byCode.values()).sort((a, b) => b.code.localeCompare(a.code));
}

/**
 * R20: Compute period-scoped view state.
 * Guarantees that when switching from Period A to Period B (uncreated, loading, slow, or failed),
 * Period A's payslips/ID/totals/anomalies are NEVER retained or used for actions under Period B's label.
 */
export function computePeriodViewState({
  currentPeriodCode,
  currentPeriodObj,
  loadedPeriodCode,
  loadedPeriodId,
  loadedExpectedTotal = null,
  periodLoading = false,
  periodError = '',
  apiPayslips = [],
  anomalies = [],
  isCeoApproved = false,
}) {
  const isPeriodExists = Boolean(
    currentPeriodObj &&
      currentPeriodObj.id != null &&
      currentPeriodObj.period === currentPeriodCode
  );

  const isLoadedForCurrentPeriod = Boolean(
    isPeriodExists &&
      !periodLoading &&
      !periodError &&
      loadedPeriodCode === currentPeriodCode &&
      String(loadedPeriodId) === String(currentPeriodObj.id)
  );

  const periodPayslips = isLoadedForCurrentPeriod && Array.isArray(apiPayslips)
    ? apiPayslips.filter(
        (p) =>
          p &&
          p.period === currentPeriodCode &&
          (p.period_id == null || String(p.period_id) === String(currentPeriodObj.id))
      )
    : [];

  const isTotalConsistent =
    loadedExpectedTotal == null || periodPayslips.length === Number(loadedExpectedTotal);

  const isPeriodDataReady = Boolean(isLoadedForCurrentPeriod && isTotalConsistent);
  const canActOnPeriod = isPeriodDataReady;
  const safeAnomalies = isPeriodDataReady && Array.isArray(anomalies) ? anomalies : [];

  const totalNet = isPeriodDataReady
    ? periodPayslips.length > 0
      ? periodPayslips.reduce((sum, p) => sum + (parseFloat(p.net_salary) || 0), 0)
      : Number(currentPeriodObj?.total_net ?? 0)
    : 0;

  const totalOtHours = isPeriodDataReady
    ? periodPayslips.length > 0
      ? periodPayslips.reduce((sum, p) => sum + (parseFloat(p.ot_hours) || 0), 0)
      : Number(currentPeriodObj?.total_ot_hours ?? 0)
    : 0;

  const totalBhxh = isPeriodDataReady
    ? periodPayslips.length > 0
      ? periodPayslips.reduce(
          (sum, p) =>
            sum +
            (parseFloat(p.bhxh_amount) || 0) +
            (parseFloat(p.bhyt_amount) || 0) +
            (parseFloat(p.bhtn_amount) || 0),
          0
        )
      : Number(currentPeriodObj?.total_bhxh ?? 0)
    : 0;

  const totalTax = isPeriodDataReady
    ? periodPayslips.length > 0
      ? periodPayslips.reduce((sum, p) => sum + (parseFloat(p.pit_amount || p.tax_amount) || 0), 0)
      : Number(currentPeriodObj?.total_tax ?? 0)
    : 0;

  let payrollStatus = 'Chưa khởi tạo kỳ lương';
  if (periodLoading) {
    payrollStatus = 'Đang tải dữ liệu kỳ lương...';
  } else if (periodError) {
    payrollStatus = 'Lỗi tải dữ liệu kỳ lương';
  } else if (!isPeriodExists) {
    payrollStatus = 'Chưa khởi tạo kỳ lương';
  } else if (isCeoApproved && isPeriodDataReady) {
    payrollStatus = 'CEO Đã Phê Duyệt Chi Trả';
  } else {
    payrollStatus = currentPeriodObj.status || 'Chờ xử lý kỳ lương';
  }

  return {
    isPeriodExists,
    isPeriodDataReady,
    canActOnPeriod,
    periodPayslips,
    safeAnomalies,
    totalNet,
    totalOtHours,
    totalBhxh,
    totalTax,
    payrollStatus,
  };
}

/**
 * R22: Fetch all pages of payslips for a period using pagination metadata (`page`, `limit`, `total`, `totalPages`).
 * Never truncates at 500 records. Throws an explicit error if any page fails or if the total collected rows
 * do not match `pagination.total`.
 */
export async function fetchAllPayslipsForPeriod(
  getPayslipsFn,
  { period, pageSize = 500, extraParams = {} } = {}
) {
  if (typeof getPayslipsFn !== 'function') {
    throw new Error('Hàm tải phiếu lương không hợp lệ.');
  }
  if (!period) {
    throw new Error('Thiếu mã kỳ lương (period) khi tải danh sách phiếu lương.');
  }

  const safeLimit = Math.min(Math.max(1, Number(pageSize) || 500), 500);
  const firstRes = await getPayslipsFn({
    ...extraParams,
    period,
    page: 1,
    limit: safeLimit,
  });

  if (!firstRes || firstRes.success === false || !Array.isArray(firstRes.data)) {
    throw new Error(
      firstRes?.message || `Không thể tải danh sách phiếu lương trang 1 của kỳ ${period}.`
    );
  }

  const pagination = firstRes.pagination || firstRes.meta?.pagination || null;
  const expectedTotal =
    pagination && pagination.total !== undefined && pagination.total !== null
      ? Number(pagination.total)
      : null;
  const totalPages =
    pagination && pagination.totalPages !== undefined && pagination.totalPages !== null
      ? Math.max(1, Number(pagination.totalPages))
      : expectedTotal !== null
      ? Math.max(1, Math.ceil(expectedTotal / safeLimit))
      : 1;

  const allRows = [...firstRes.data];

  for (let page = 2; page <= totalPages; page += 1) {
    const pageRes = await getPayslipsFn({
      ...extraParams,
      period,
      page,
      limit: safeLimit,
    });
    if (!pageRes || pageRes.success === false || !Array.isArray(pageRes.data)) {
      throw new Error(
        pageRes?.message ||
          `Lỗi tải danh sách phiếu lương trang ${page}/${totalPages} của kỳ ${period}. Đã hủy thao tác để tránh thiếu dữ liệu.`
      );
    }
    allRows.push(...pageRes.data);
  }

  if (expectedTotal !== null && allRows.length !== expectedTotal) {
    throw new Error(
      `Số lượng phiếu lương tải về (${allRows.length}) không khớp tổng số bản ghi của kỳ ${period} (${expectedTotal}).`
    );
  }

  const mismatchedRow = allRows.find((r) => r && r.period && r.period !== period);
  if (mismatchedRow) {
    throw new Error(
      `Phát hiện phiếu lương thuộc kỳ ${mismatchedRow.period} khi đang tải kỳ ${period}.`
    );
  }

  return {
    data: allRows,
    total: expectedTotal !== null ? expectedTotal : allRows.length,
    totalPages,
    pagination: pagination || {
      total: allRows.length,
      page: 1,
      limit: safeLimit,
      totalPages,
    },
  };
}
