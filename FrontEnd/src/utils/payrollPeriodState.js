// ============================================
// utils/payrollPeriodState.js
// R20: Strict period resolution & state readiness guard (no fallback to apiPeriods[0])
// R22 + R26: Multi-page payslip loader with duplicate ID/employee detection, pagination metadata validation & snapshot consistency
// R24: Adjustment source conflict state & resolution payload builders
// R25: Honest period status mapping (no client-only fake CEO approval state)
// ============================================

export const ADJUSTMENT_FIELD_LABELS = {
  actualWorkDays: 'Ngày công hưởng lương',
  baseSalary: 'Lương cơ bản hợp đồng',
  otHours: 'Số giờ làm thêm (OT)',
  allowances: 'Phụ cấp theo chính sách',
  bonus: 'Thưởng hiệu suất / KPI',
  note: 'Ghi chú điều chỉnh',
};

export function formatConflictFieldValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (field === 'actualWorkDays') return `${num} ngày`;
  if (field === 'otHours') return `${num} giờ`;
  return `${num.toLocaleString('vi-VN')} đ`;
}

export function getConflictItemKey(conflict) {
  if (!conflict || typeof conflict !== 'object') return '';
  const empId = conflict.employeeId || conflict.employee_id || '';
  return `${String(empId).trim()}::${String(conflict.field || '').trim()}`;
}

export function normalizeConflictItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const employeeId = String(raw.employeeId || raw.employee_id || '').trim();
  const employeeName = String(raw.employeeName || raw.full_name || raw.name || employeeId).trim();
  const field = String(raw.field || '').trim();
  return {
    ...raw,
    employeeId,
    employee_id: employeeId,
    employeeName,
    full_name: employeeName,
    field,
    fieldLabel: raw.fieldLabel || ADJUSTMENT_FIELD_LABELS[field] || field,
    previousSourceValue: raw.previousSourceValue !== undefined ? Number(raw.previousSourceValue) : null,
    currentSourceValue: raw.currentSourceValue !== undefined ? Number(raw.currentSourceValue) : null,
    manualValue: raw.manualValue !== undefined ? Number(raw.manualValue) : null,
    staleDecisionRejected: Boolean(raw.staleDecisionRejected),
  };
}

export function extractConflictsFromError(err) {
  if (!err || typeof err !== 'object') return [];
  const candidates = [
    err?.details?.conflicts,
    err?.details,
    err?.response?.data?.details?.conflicts,
    err?.response?.data?.details,
    err?.conflicts,
  ];
  for (const cand of candidates) {
    if (Array.isArray(cand)) {
      return cand.map(normalizeConflictItem).filter(Boolean);
    }
  }
  return [];
}

export function areAllConflictsResolved(conflicts = [], decisions = {}) {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return false;
  if (!decisions || typeof decisions !== 'object') return false;
  return conflicts.every((c) => {
    const key = getConflictItemKey(c);
    const choice = decisions[key];
    return choice === 'KEEP_MANUAL' || choice === 'USE_SOURCE';
  });
}

export function buildConflictResolutionPayload(conflicts = [], decisions = {}) {
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    throw new Error('Không có mục xung đột nào để gửi đối soát.');
  }
  if (!areAllConflictsResolved(conflicts, decisions)) {
    throw new Error(
      'Vui lòng chọn rõ "Giữ điều chỉnh thủ công" hoặc "Dùng dữ liệu nguồn mới" cho tất cả các mục xung đột trước khi xác nhận.'
    );
  }

  const adjustmentResolutions = {};
  const expectedSourceValues = {};

  for (const raw of conflicts) {
    const c = normalizeConflictItem(raw);
    const empId = c.employeeId;
    const field = c.field;
    const key = getConflictItemKey(c);
    const decision = decisions[key];
    const currentSourceNum = Number(c.currentSourceValue);

    if (!adjustmentResolutions[empId]) adjustmentResolutions[empId] = {};
    if (!expectedSourceValues[empId]) expectedSourceValues[empId] = {};

    adjustmentResolutions[empId][field] = {
      action: decision,
      ...(Number.isFinite(currentSourceNum)
        ? { expectedCurrentSourceValue: currentSourceNum }
        : {}),
    };
    if (Number.isFinite(currentSourceNum)) {
      expectedSourceValues[empId][field] = currentSourceNum;
    }
  }

  return {
    adjustmentResolutions,
    expectedSourceValues,
  };
}

/**
 * R24: When a 409 ADJUSTMENT_SOURCE_CONFLICT returns while the modal is already open
 * (e.g., because the underlying source changed AGAIN during review), invalidate any decision
 * whose `currentSourceValue` changed or was flagged `staleDecisionRejected`.
 * Initializes unselected decisions to `null` (never auto-selects a default).
 */
export function reconcileConflictModalState(prevConflicts = [], arg2 = {}, arg3 = []) {
  const prevDecisions = Array.isArray(arg2) ? (arg3 && typeof arg3 === 'object' ? arg3 : {}) : (arg2 || {});
  const rawNextConflicts = Array.isArray(arg2) ? arg2 : (Array.isArray(arg3) ? arg3 : []);

  const normalizedPrev = (Array.isArray(prevConflicts) ? prevConflicts : [])
    .map(normalizeConflictItem)
    .filter(Boolean);
  const normalizedNext = rawNextConflicts
    .map(normalizeConflictItem)
    .filter(Boolean);

  const prevByKey = new Map(normalizedPrev.map((c) => [getConflictItemKey(c), c]));
  const nextByKey = new Map(normalizedNext.map((c) => [getConflictItemKey(c), c]));
  const mergedItems = [];
  const seenKeys = new Set();
  const nextDecisions = {};
  const invalidatedKeys = [];

  // Preserve previous conflict items (and their valid decisions) because a 409 rolls back the whole calculate() transaction
  for (const prevItem of normalizedPrev) {
    const key = getConflictItemKey(prevItem);
    seenKeys.add(key);
    const nextItem = nextByKey.get(key);
    const prevChoice = prevDecisions?.[key];
    if (nextItem) {
      mergedItems.push(nextItem);
      const sourceChangedAgain =
        Boolean(nextItem.staleDecisionRejected) ||
        Math.abs(Number(nextItem.currentSourceValue) - Number(prevItem.currentSourceValue)) > 0.001;
      if (sourceChangedAgain) {
        invalidatedKeys.push(key);
        nextDecisions[key] = null;
      } else if (prevChoice === 'KEEP_MANUAL' || prevChoice === 'USE_SOURCE') {
        nextDecisions[key] = prevChoice;
      } else {
        nextDecisions[key] = null;
      }
    } else {
      mergedItems.push(prevItem);
      nextDecisions[key] =
        prevChoice === 'KEEP_MANUAL' || prevChoice === 'USE_SOURCE' ? prevChoice : null;
    }
  }

  // Append any brand-new conflict items that were not in prevConflicts
  for (const nextItem of normalizedNext) {
    const key = getConflictItemKey(nextItem);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    mergedItems.push(nextItem);
    const prevChoice = prevDecisions?.[key];
    if (Boolean(nextItem.staleDecisionRejected)) {
      invalidatedKeys.push(key);
      nextDecisions[key] = null;
    } else if (prevChoice === 'KEEP_MANUAL' || prevChoice === 'USE_SOURCE') {
      nextDecisions[key] = prevChoice;
    } else {
      nextDecisions[key] = null;
    }
  }

  return {
    conflictItems: mergedItems,
    conflicts: mergedItems,
    decisions: nextDecisions,
    invalidatedKeys,
    changedWhileOpenCount: invalidatedKeys.length,
  };
}

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
        : 'Dự thảo';
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
 * R20 + R25: Compute period-scoped view state.
 * - R20: Never retains Period A's payslips/ID/totals/anomalies when switching to Period B.
 * - R25: Never reports a fake client-only "CEO Đã Phê Duyệt Chi Trả" status; strictly reflects server status.
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

  const periodPayslips =
    isLoadedForCurrentPeriod && Array.isArray(apiPayslips)
      ? apiPayslips.filter(
          (p) =>
            p &&
            p.period === currentPeriodCode &&
            (p.period_id == null || String(p.period_id) === String(currentPeriodObj.id))
        )
      : [];

  const uniqueEmployeeCount = new Set(
    periodPayslips.map((p) => (p?.employee_id != null ? String(p.employee_id).trim() : '')).filter(Boolean)
  ).size;

  const isTotalConsistent =
    periodPayslips.length === uniqueEmployeeCount &&
    (loadedExpectedTotal == null || periodPayslips.length === Number(loadedExpectedTotal));

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
  } else if (currentPeriodObj.status === 'DA_CHUYEN_KHOAN') {
    payrollStatus = 'Đã chuyển khoản chi trả';
  } else if (currentPeriodObj.status === 'DA_CHOT') {
    payrollStatus = 'Đã khóa sổ & Quyết toán';
  } else {
    payrollStatus = 'Đang xử lý dự thảo';
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

function createLoaderError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * R22 + R26: Fetch all pages of payslips for a period using pagination metadata (`page`, `limit`, `total`, `totalPages`, `snapshotToken`, `aggregates`).
 * - Never truncates at 500 records.
 * - Rejects missing or inconsistent pagination metadata (`total`, `totalPages`, `page`, `period`).
 * - Rejects duplicate `employee_id` or duplicate payslip `id` within or across pages.
 * - Rejects any row missing `period` or belonging to a different `period` / `period_id`.
 * - Rejects mixed versions if `snapshotToken` or `aggregates.totalNet` changes between page requests,
 *   or if `expectedSnapshotToken` / `expectedTotalNet` does not match the fetched dataset.
 */
export async function fetchAllPayslipsForPeriod(
  getPayslipsFn,
  {
    period,
    pageSize = 500,
    extraParams = {},
    expectedSnapshotToken = null,
    expectedTotalNet = null,
  } = {}
) {
  if (typeof getPayslipsFn !== 'function') {
    throw createLoaderError('INVALID_LOADER_FN', 'Hàm tải phiếu lương không hợp lệ.');
  }
  if (!period) {
    throw createLoaderError('MISSING_PERIOD', 'Thiếu mã kỳ lương (period) khi tải danh sách phiếu lương.');
  }

  const safeLimit = Math.min(Math.max(1, Number(pageSize) || 500), 500);

  const validateAndExtractPagination = (res, expectedPage, expectedTotalFromPage1 = null) => {
    const pagination = res?.pagination || res?.meta?.pagination || null;
    if (
      !pagination ||
      typeof pagination !== 'object' ||
      pagination.total === undefined ||
      pagination.total === null ||
      !Number.isFinite(Number(pagination.total)) ||
      Number(pagination.total) < 0
    ) {
      throw createLoaderError(
        'INVALID_PAGINATION_METADATA',
        `Thiếu hoặc sai định dạng metadata phân trang (pagination.total) ở trang ${expectedPage} của kỳ ${period}.`
      );
    }
    if (
      pagination.page !== undefined &&
      pagination.page !== null &&
      Number(pagination.page) !== expectedPage
    ) {
      throw createLoaderError(
        'PAGINATION_PAGE_MISMATCH',
        `Metadata trang trả về (${pagination.page}) không khớp trang yêu cầu (${expectedPage}) của kỳ ${period}.`
      );
    }
    if (
      pagination.period !== undefined &&
      pagination.period !== null &&
      String(pagination.period) !== String(period)
    ) {
      throw createLoaderError(
        'PAGINATION_PERIOD_MISMATCH',
        `Metadata kỳ lương trả về (${pagination.period}) không khớp kỳ yêu cầu (${period}) ở trang ${expectedPage}.`
      );
    }

    const total = Number(pagination.total);
    if (expectedTotalFromPage1 !== null && total !== expectedTotalFromPage1) {
      throw createLoaderError(
        'PAGINATION_TOTAL_CHANGED',
        `Tổng số bản ghi của kỳ ${period} đã thay đổi trong lúc tải trang ${expectedPage} (${expectedTotalFromPage1} -> ${total}). Đã hủy thao tác để tránh trộn dữ liệu.`
      );
    }
    const minRequiredPages = total === 0 ? 1 : Math.ceil(total / safeLimit);
    const totalPages =
      pagination.totalPages !== undefined && pagination.totalPages !== null
        ? Number(pagination.totalPages)
        : minRequiredPages;

    if (!Number.isFinite(totalPages) || totalPages < minRequiredPages) {
      throw createLoaderError(
        'INVALID_PAGINATION_METADATA',
        `Metadata totalPages (${pagination.totalPages}) không hợp lệ so với total=${total}, limit=${safeLimit} ở trang ${expectedPage} của kỳ ${period}.`
      );
    }

    return {
      pagination,
      total,
      totalPages: Math.max(1, totalPages),
      snapshotToken: pagination.snapshotToken || pagination.revision || null,
      aggregates:
        pagination.aggregates && typeof pagination.aggregates === 'object'
          ? pagination.aggregates
          : null,
    };
  };

  const seenEmployeeIds = new Set();
  const seenPayslipIds = new Set();
  let seenPeriodId = null;
  const allRows = [];

  const validateAndCollectPageRows = (rows, pageNum) => {
    for (const r of rows) {
      if (!r || typeof r !== 'object') {
        throw createLoaderError(
          'INVALID_PAYSLIP_ROW',
          `Dữ liệu phiếu lương không hợp lệ ở trang ${pageNum} của kỳ ${period}.`
        );
      }
      if (!r.period || String(r.period) !== String(period)) {
        throw createLoaderError(
          'ROW_PERIOD_MISMATCH',
          `Phát hiện phiếu lương thuộc kỳ "${r.period || 'N/A'}" khi đang tải kỳ "${period}" (trang ${pageNum}).`
        );
      }
      if (r.period_id !== undefined && r.period_id !== null) {
        const pidStr = String(r.period_id);
        if (seenPeriodId === null) {
          seenPeriodId = pidStr;
        } else if (seenPeriodId !== pidStr) {
          throw createLoaderError(
            'ROW_PERIOD_ID_MISMATCH',
            `Phát hiện phiếu lương không cùng mã kỳ (period_id ${pidStr} != ${seenPeriodId}) ở trang ${pageNum} của kỳ ${period}.`
          );
        }
      }

      const empId = r.employee_id !== undefined && r.employee_id !== null ? String(r.employee_id).trim() : '';
      if (!empId) {
        throw createLoaderError(
          'MISSING_EMPLOYEE_ID',
          `Phát hiện phiếu lương thiếu mã nhân viên (employee_id) ở trang ${pageNum} của kỳ ${period}.`
        );
      }
      if (seenEmployeeIds.has(empId)) {
        throw createLoaderError(
          'DUPLICATE_PAYSLIP_EMPLOYEE',
          `Phát hiện trùng lặp nhân viên "${empId}" khi tải phân trang kỳ ${period} (trang ${pageNum}). Đã hủy thao tác để tránh trùng lặp dữ liệu.`
        );
      }
      seenEmployeeIds.add(empId);

      if (r.id !== undefined && r.id !== null && String(r.id).trim() !== '') {
        const slipId = String(r.id).trim();
        if (seenPayslipIds.has(slipId)) {
          throw createLoaderError(
            'DUPLICATE_PAYSLIP_ID',
            `Phát hiện trùng lặp mã phiếu lương (id=${slipId}) khi tải phân trang kỳ ${period} (trang ${pageNum}).`
          );
        }
        seenPayslipIds.add(slipId);
      }

      allRows.push(r);
    }
  };

  const firstRes = await getPayslipsFn({
    ...extraParams,
    period,
    page: 1,
    limit: safeLimit,
  });

  if (!firstRes || firstRes.success === false || !Array.isArray(firstRes.data)) {
    throw createLoaderError(
      'PAGE_LOAD_FAILED',
      firstRes?.message || `Không thể tải danh sách phiếu lương trang 1 của kỳ ${period}.`
    );
  }

  const page1Meta = validateAndExtractPagination(firstRes, 1);
  const {
    pagination: basePagination,
    total: expectedTotal,
    totalPages,
    snapshotToken: baseSnapshotToken,
    aggregates: baseAggregates,
  } = page1Meta;

  if (
    expectedSnapshotToken &&
    baseSnapshotToken &&
    String(baseSnapshotToken) !== String(expectedSnapshotToken)
  ) {
    throw createLoaderError(
      'SNAPSHOT_CHANGED_DURING_EXPORT',
      `Dữ liệu bảng lương kỳ ${period} đã thay đổi trên máy chủ so với phiên bản đang hiển thị. Vui lòng tải lại kỳ lương trước khi kết xuất.`
    );
  }

  validateAndCollectPageRows(firstRes.data, 1);

  for (let page = 2; page <= totalPages; page += 1) {
    const pageRes = await getPayslipsFn({
      ...extraParams,
      period,
      page,
      limit: safeLimit,
    });
    if (!pageRes || pageRes.success === false || !Array.isArray(pageRes.data)) {
      throw createLoaderError(
        'PAGE_LOAD_FAILED',
        pageRes?.message ||
          `Lỗi tải danh sách phiếu lương trang ${page}/${totalPages} của kỳ ${period}. Đã hủy thao tác để tránh thiếu dữ liệu.`
      );
    }

    const pageMeta = validateAndExtractPagination(pageRes, page, expectedTotal);

    if (pageMeta.total !== expectedTotal) {
      throw createLoaderError(
        'PAGINATION_TOTAL_CHANGED',
        `Tổng số bản ghi của kỳ ${period} đã thay đổi trong lúc tải trang ${page}/${totalPages} (${expectedTotal} -> ${pageMeta.total}). Đã hủy thao tác để tránh trộn dữ liệu.`
      );
    }
    if (pageMeta.totalPages !== totalPages) {
      throw createLoaderError(
        'PAGINATION_TOTAL_PAGES_CHANGED',
        `Số trang của kỳ ${period} đã thay đổi trong lúc tải trang ${page} (${totalPages} -> ${pageMeta.totalPages}).`
      );
    }
    if (
      (baseSnapshotToken !== null || pageMeta.snapshotToken !== null) &&
      String(baseSnapshotToken || '') !== String(pageMeta.snapshotToken || '')
    ) {
      throw createLoaderError(
        'SNAPSHOT_CHANGED_DURING_PAGINATION',
        `Dữ liệu bảng lương kỳ ${period} đã thay đổi giữa trang 1 và trang ${page} (snapshot không nhất quán). Đã hủy thao tác để tránh trộn dữ liệu khác phiên bản.`
      );
    }
    if (
      baseAggregates &&
      pageMeta.aggregates &&
      baseAggregates.totalNet !== undefined &&
      pageMeta.aggregates.totalNet !== undefined &&
      Math.abs(Number(baseAggregates.totalNet) - Number(pageMeta.aggregates.totalNet)) > 0.01
    ) {
      throw createLoaderError(
        'SNAPSHOT_AGGREGATE_CHANGED',
        `Tổng quỹ lương kỳ ${period} trên máy chủ đã thay đổi trong lúc tải trang ${page}. Đã hủy thao tác để tránh trộn dữ liệu.`
      );
    }

    validateAndCollectPageRows(pageRes.data, page);
  }

  if (allRows.length !== expectedTotal || seenEmployeeIds.size !== expectedTotal) {
    throw createLoaderError(
      'ROW_COUNT_MISMATCH',
      `Số lượng phiếu lương hợp lệ tải về (${allRows.length} dòng, ${seenEmployeeIds.size} nhân viên duy nhất) không khớp tổng số bản ghi của kỳ ${period} (${expectedTotal}).`
    );
  }

  const collectedNetSum = allRows.reduce((sum, r) => sum + (Number(r.net_salary) || 0), 0);
  if (
    baseAggregates &&
    baseAggregates.totalNet !== undefined &&
    baseAggregates.totalNet !== null &&
    Math.abs(collectedNetSum - Number(baseAggregates.totalNet)) > 0.01
  ) {
    throw createLoaderError(
      'SNAPSHOT_AMOUNT_MISMATCH',
      `Tổng thực lĩnh của các trang tải về (${collectedNetSum.toLocaleString('vi-VN')} đ) không khớp tổng snapshot máy chủ (${Number(baseAggregates.totalNet).toLocaleString('vi-VN')} đ). Dữ liệu đã thay đổi giữa các trang tải.`
    );
  }

  if (
    expectedTotalNet !== null &&
    expectedTotalNet !== undefined &&
    Math.abs(collectedNetSum - Number(expectedTotalNet)) > 0.01
  ) {
    throw createLoaderError(
      'EXPECTED_TOTAL_NET_MISMATCH',
      `Tổng thực lĩnh khi kết xuất (${collectedNetSum.toLocaleString('vi-VN')} đ) đã thay đổi so với dữ liệu kỳ đang hiển thị (${Number(expectedTotalNet).toLocaleString('vi-VN')} đ). Vui lòng tải lại kỳ lương.`
    );
  }

  return {
    data: allRows,
    total: expectedTotal,
    totalPages,
    totalNet: collectedNetSum,
    snapshotToken: baseSnapshotToken,
    aggregates: baseAggregates || { totalNet: collectedNetSum },
    pagination: {
      ...basePagination,
      total: expectedTotal,
      page: 1,
      limit: safeLimit,
      totalPages,
      snapshotToken: baseSnapshotToken,
    },
  };
}
