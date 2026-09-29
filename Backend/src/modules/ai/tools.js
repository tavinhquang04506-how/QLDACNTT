const db = require('../../config/db');
const config = require('../../config/env');
const { departmentOf } = require('../projects/access');
const dashboardService = require('../dashboard/service');
const turnoverService = require('../analytics/turnover');
const { cellOf, CELLS } = require('../analytics/nineBox');
const settingsService = require('../settings/service');

const MAX_ATTENDANCE_RANGE_DAYS = 62;

/**
 * R29: Centralized timezone-aware clock helper (Asia/Ho_Chi_Minh by default).
 * Accepts an optional `nowOverride` (Date, ISO string, or timestamp) for deterministic testing.
 */
function getCurrentClock(nowOverride = null, timeZone = null) {
  const tz = timeZone || process.env.APP_TIMEZONE || config.timezone || 'Asia/Ho_Chi_Minh';
  const rawDate = nowOverride ? new Date(nowOverride) : new Date();
  const safeDate = Number.isNaN(rawDate.getTime()) ? new Date() : rawDate;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(safeDate);

  const yearStr = parts.find((p) => p.type === 'year')?.value || String(safeDate.getUTCFullYear());
  const monthStr = parts.find((p) => p.type === 'month')?.value || String(safeDate.getUTCMonth() + 1).padStart(2, '0');
  const dayStr = parts.find((p) => p.type === 'day')?.value || String(safeDate.getUTCDate()).padStart(2, '0');

  return {
    timeZone: tz,
    year: Number(yearStr),
    month: `${yearStr}-${monthStr}`,
    date: `${yearStr}-${monthStr}-${dayStr}`,
    iso: safeDate.toISOString(),
  };
}

function isValidPeriodMonth(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(trimmed);
  if (!m) return false;
  const year = Number(m[1]);
  return year >= 2000 && year <= 2100;
}

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  const m = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(trimmed);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 2000 || year > 2100) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() + 1 === month &&
    d.getUTCDate() === day
  );
}

function extractPeriodFromQuery(rawQuery = '') {
  const text = String(rawQuery || '');
  const isoMatch = /\b(20\d{2})-(0[1-9]|1[0-2])\b/.exec(text);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}`;
  }
  const vnMatch = /(?:tháng|kỳ(?:\s+lương)?)\s*(0?[1-9]|1[0-2])\s*(?:\/|-|\s+năm\s+)\s*(20\d{2})/i.exec(text);
  if (vnMatch) {
    return `${vnMatch[2]}-${String(Number(vnMatch[1])).padStart(2, '0')}`;
  }
  return null;
}

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+|previous\s+|prior\s+)*(?:instructions|prompts?|rules?)(?:\s+and\s+[^.!?\n]*)?/gi,
  /bỏ\s+qua\s+(?:mọi\s+|tất\s+cả\s+)*(?:quy\s+tắc|hướng\s+dẫn|phân\s+quyền)(?:\s+và\s+[^.!?\n]*)?/gi,
  /(?:đọc|xuất)\s+(?:toàn\s+bộ\s+)?lương(?:\s+toàn\s+công\s+ty)?/gi,
  /tiết\s+lộ\s+(?:api\s+key|mật\s+khẩu|cccd|số\s+tài\s+khoản)/gi,
  /system\s*prompt\s*override/gi,
];

function sanitizePolicyText(text = '') {
  let cleaned = String(text || '');
  let filtered = false;
  for (const rx of INJECTION_PATTERNS) {
    rx.lastIndex = 0;
    if (rx.test(cleaned)) {
      filtered = true;
      rx.lastIndex = 0;
      cleaned = cleaned.replace(rx, '[NỘI DUNG KHÔNG TIN CẬY ĐÃ ĐƯỢC LỌC BỞI HỆ THỐNG]');
    }
  }
  return { text: cleaned, filtered };
}

/**
 * Gemini Function Declarations (Read-only MVP tools)
 */
const TOOL_DECLARATIONS = [
  {
    name: 'get_my_leave_balance',
    description: 'Tra cứu số dư ngày phép cá nhân của chính người dùng đang đăng nhập theo năm và loại phép.',
    parameters: {
      type: 'OBJECT',
      properties: {
        year: { type: 'INTEGER', description: 'Năm tra cứu (ví dụ: 2026)' },
        leaveType: { type: 'STRING', description: 'Mã loại phép tùy chọn (PHEP_NAM, NGHI_OM, VIEC_RIENG)' },
        employeeId: { type: 'STRING', description: 'Mã nhân viên (chỉ hợp lệ nếu trùng với người đang đăng nhập)' },
      },
    },
  },
  {
    name: 'get_my_attendance',
    description: 'Tra cứu dữ liệu chấm công cá nhân và đơn giải trình của chính người dùng đang đăng nhập trong khoảng ngày giới hạn.',
    parameters: {
      type: 'OBJECT',
      properties: {
        from: { type: 'STRING', description: 'Ngày bắt đầu YYYY-MM-DD' },
        to: { type: 'STRING', description: 'Ngày kết thúc YYYY-MM-DD' },
        month: { type: 'STRING', description: 'Tháng tra cứu YYYY-MM' },
        employeeId: { type: 'STRING', description: 'Mã nhân viên (chỉ hợp lệ nếu trùng với người đang đăng nhập)' },
      },
    },
  },
  {
    name: 'get_my_payslip',
    description: 'Tra cứu và giải thích phiếu lương đã công bố chính thức của chính người dùng đang đăng nhập.',
    parameters: {
      type: 'OBJECT',
      properties: {
        period: { type: 'STRING', description: 'Kỳ lương YYYY-MM hoặc mã kỳ lương (ví dụ: 2026-08)' },
        employeeId: { type: 'STRING', description: 'Mã nhân viên (chỉ hợp lệ nếu trùng với người đang đăng nhập)' },
      },
    },
  },
  {
    name: 'get_scoped_dashboard',
    description: 'Tóm tắt số liệu nhân sự tổng hợp (Dashboard) theo đúng phạm vi quyền hạn của người dùng (Phòng ban hoặc Toàn công ty).',
    parameters: {
      type: 'OBJECT',
      properties: {
        period: { type: 'STRING', description: 'Kỳ thống kê tùy chọn YYYY-MM' },
        departmentId: { type: 'STRING', description: 'Mã phòng ban cần xem (phải nằm trong phạm vi quản lý)' },
      },
    },
  },
  {
    name: 'get_scoped_performance',
    description: 'Tra cứu điểm đánh giá 9-Box, tín hiệu rủi ro nghỉ việc (Turnover Risk) theo phạm vi quyền hạn để giải thích hoặc gợi ý nháp PIP.',
    parameters: {
      type: 'OBJECT',
      properties: {
        period: { type: 'STRING', description: 'Kỳ đánh giá (ví dụ: 2026-Q3)' },
        employeeId: { type: 'STRING', description: 'Mã nhân viên cần tra cứu (theo đúng phạm vi quản lý)' },
        departmentId: { type: 'STRING', description: 'Mã phòng ban (theo đúng phạm vi quản lý)' },
      },
    },
  },
  {
    name: 'search_policies',
    description: 'Tìm kiếm quy chế nội bộ đã phê duyệt (handbook_docs) và thông số cấu hình hệ thống (system_settings / system_policy_versions) theo đúng kỳ hiệu lực.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Từ khóa hoặc câu hỏi về chính sách/quy chế công ty' },
        period: { type: 'STRING', description: 'Kỳ lương tùy chọn YYYY-MM khi người dùng hỏi chính sách áp dụng cho một tháng/kỳ cụ thể (ví dụ: 2025-01, 2026-08)' },
        effectiveDate: { type: 'STRING', description: 'Ngày cần kiểm tra hiệu lực chính sách YYYY-MM-DD' },
      },
      required: ['query'],
    },
  },
];

async function getMyLeaveBalance(actor, args = {}, executor = db) {
  const clock = getCurrentClock(actor?.now || args?.__now);
  const nowIso = clock.iso;
  if (!actor || !actor.employeeId || ['ADMIN', 'KIOSK'].includes(actor.roleCode)) {
    return {
      ok: false,
      errorCode: 'FORBIDDEN_ROLE',
      message: 'Tài khoản quản trị kỹ thuật hoặc Kiosk không gắn với quỹ ngày phép nhân sự.',
    };
  }
  if (args.employeeId && String(args.employeeId).trim() !== actor.employeeId) {
    return {
      ok: false,
      errorCode: 'FORBIDDEN_CROSS_EMPLOYEE',
      message: 'Bạn không có quyền tra cứu số dư ngày phép của nhân viên khác.',
    };
  }

  let year = clock.year;
  if (args.year !== undefined && args.year !== null && String(args.year).trim() !== '') {
    const parsedYear = Number(args.year);
    if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGUMENT',
        message: 'Tham số year không hợp lệ (cần năm nguyên YYYY từ 2000 đến 2100).',
      };
    }
    year = parsedYear;
  }

  const params = [actor.employeeId, year];
  let typeFilter = '';
  if (args.leaveType) {
    params.push(String(args.leaveType).trim().toUpperCase());
    typeFilter = 'AND (UPPER(lt.code::text) = $3 OR UPPER(lt.id::text) = $3)';
  }

  const { rows } = await executor.query(
    `SELECT lb.leave_type_id, lt.code::text AS leave_type_code, lt.name AS leave_type_name,
            lb.year, lb.total_days, lb.used_days, lb.remaining_days,
            COALESCE((
              SELECT SUM(lr.total_days)
                FROM leave_requests lr
               WHERE lr.employee_id = lb.employee_id
                 AND lr.leave_type_id = lb.leave_type_id
                 AND lr.stage IN ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN')
                 AND EXTRACT(YEAR FROM lr.start_date)::int = lb.year
            ), 0) AS pending_days
       FROM leave_balances lb
       JOIN leave_types lt ON lt.id = lb.leave_type_id
      WHERE lb.employee_id = $1 AND lb.year = $2 ${typeFilter}
      ORDER BY lt.id ASC`,
    params
  );

  const balances = rows.map((r) => {
    const entitlement = Number(r.total_days);
    const used = Number(r.used_days);
    const remaining = Number(r.remaining_days);
    const pending = Number(r.pending_days);
    const available = Math.max(0, Number((remaining - pending).toFixed(2)));
    return {
      leaveTypeId: r.leave_type_id,
      leaveTypeCode: r.leave_type_code,
      leaveTypeName: r.leave_type_name,
      year: Number(r.year),
      entitlement,
      used,
      remaining,
      pending,
      available,
    };
  });

  return {
    ok: true,
    employeeId: actor.employeeId,
    year,
    hasRecord: balances.length > 0,
    balances,
    source: {
      id: `leave-balance:${actor.employeeId}:${year}`,
      title: `Quỹ phép cá nhân năm ${year} (${actor.employeeId})`,
      period: String(year),
      asOf: nowIso,
    },
  };
}

async function getMyAttendance(actor, args = {}, executor = db) {
  const clock = getCurrentClock(actor?.now || args?.__now);
  const nowIso = clock.iso;
  if (!actor || !actor.employeeId || ['ADMIN', 'KIOSK'].includes(actor.roleCode)) {
    return {
      ok: false,
      errorCode: 'FORBIDDEN_ROLE',
      message: 'Tài khoản này không gắn với bảng chấm công nhân viên.',
    };
  }
  if (args.employeeId && String(args.employeeId).trim() !== actor.employeeId) {
    return {
      ok: false,
      errorCode: 'FORBIDDEN_CROSS_EMPLOYEE',
      message: 'Bạn không có quyền xem dữ liệu chấm công của nhân viên khác qua công cụ cá nhân.',
    };
  }

  const rawFrom = args.from !== undefined && args.from !== null ? String(args.from).trim() : '';
  const rawTo = args.to !== undefined && args.to !== null ? String(args.to).trim() : '';
  const rawMonth = args.month !== undefined && args.month !== null ? String(args.month).trim() : '';

  let from = '';
  let to = '';

  if (rawFrom || rawTo) {
    if (!rawFrom || !rawTo || !isValidIsoDate(rawFrom) || !isValidIsoDate(rawTo)) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGUMENT',
        message: 'Khoảng ngày tra cứu chấm công không hợp lệ (cần cả from và to theo định dạng thực tế YYYY-MM-DD).',
      };
    }
    if (rawFrom > rawTo) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGUMENT',
        message: 'Ngày bắt đầu (from) không được lớn hơn ngày kết thúc (to).',
      };
    }
    const diffDays =
      Math.round((new Date(`${rawTo}T00:00:00Z`) - new Date(`${rawFrom}T00:00:00Z`)) / 86400000) + 1;
    if (diffDays > MAX_ATTENDANCE_RANGE_DAYS) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGUMENT',
        message: `Khoảng ngày tra cứu chấm công vượt quá giới hạn cho phép (${MAX_ATTENDANCE_RANGE_DAYS} ngày).`,
      };
    }
    from = rawFrom;
    to = rawTo;
  } else {
    let month = clock.month;
    if (rawMonth) {
      if (!isValidPeriodMonth(rawMonth)) {
        return {
          ok: false,
          errorCode: 'INVALID_ARGUMENT',
          message: 'Tham số month không hợp lệ (định dạng bắt buộc YYYY-MM, ví dụ 2026-10).',
        };
      }
      month = rawMonth;
    }
    from = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    to = `${month}-${String(lastDay).padStart(2, '0')}`;
  }

  const { rows: logs } = await executor.query(
    `SELECT id, work_date::text AS work_date, check_in_time, check_out_time, work_hours, ot_hours,
            status, gps_lat, gps_lng, check_in_lat, check_in_lng, distance_meters, note
       FROM attendance_logs
      WHERE employee_id = $1 AND work_date >= $2::date AND work_date <= $3::date
      ORDER BY work_date DESC
      LIMIT 31`,
    [actor.employeeId, from, to]
  );

  const { rows: appeals } = await executor.query(
    `SELECT id, date::text AS work_date, appeal_type, status, reason, review_note
       FROM attendance_appeals
      WHERE employee_id = $1 AND date >= $2::date AND date <= $3::date
      ORDER BY date DESC
      LIMIT 20`,
    [actor.employeeId, from, to]
  );

  const hasCoords = (l) =>
    (l.gps_lat !== null && l.gps_lng !== null) || (l.check_in_lat !== null && l.check_in_lng !== null);

  const summary = {
    totalLogs: logs.length,
    presentDays: logs.filter((l) => l.status === 'DUNG_GIO').length,
    lateDays: logs.filter((l) => l.status === 'DI_MUON').length,
    earlyLeaveDays: logs.filter((l) => l.status === 'VE_SOM').length,
    absentDays: logs.filter((l) => l.status === 'VANG_KHONG_PHEP').length,
    leaveDays: logs.filter((l) => l.status === 'NGHI_PHEP').length,
    totalWorkHours: Number(logs.reduce((s, l) => s + Number(l.work_hours || 0), 0).toFixed(2)),
    totalOtHours: Number(logs.reduce((s, l) => s + Number(l.ot_hours || 0), 0).toFixed(2)),
    missingGpsCount: logs.filter((l) => !hasCoords(l)).length,
    appealsCount: appeals.length,
  };

  return {
    ok: true,
    employeeId: actor.employeeId,
    from,
    to,
    summary,
    logs: logs.map((l) => ({
      id: l.id,
      workDate: l.work_date,
      status: l.status,
      workHours: Number(l.work_hours || 0),
      otHours: Number(l.ot_hours || 0),
      hasGps: hasCoords(l),
      distanceMeters: l.distance_meters !== null ? Number(l.distance_meters) : null,
      notes: l.note || null,
    })),
    appeals: appeals.map((a) => ({
      id: a.id,
      workDate: a.work_date,
      appealType: a.appeal_type,
      status: a.status,
      reason: a.reason,
      reviewNote: a.review_note || null,
    })),
    source: {
      id: `attendance:${actor.employeeId}:${from}..${to}`,
      title: `Bảng chấm công cá nhân (${from} đến ${to})`,
      period: `${from}..${to}`,
      asOf: nowIso,
    },
  };
}

async function getMyPayslip(actor, args = {}, executor = db) {
  const clock = getCurrentClock(actor?.now || args?.__now);
  const nowIso = clock.iso;
  if (!actor || !actor.employeeId || ['ADMIN', 'KIOSK'].includes(actor.roleCode)) {
    return {
      ok: false,
      errorCode: 'FORBIDDEN_ROLE',
      message: 'Tài khoản quản trị kỹ thuật hoặc Kiosk không có quyền đọc phiếu lương nhân sự.',
    };
  }
  if (args.employeeId && String(args.employeeId).trim() !== actor.employeeId) {
    return {
      ok: false,
      errorCode: 'FORBIDDEN_CROSS_EMPLOYEE',
      message: 'Bạn không có quyền truy cập phiếu lương của nhân viên khác.',
    };
  }

  const params = [actor.employeeId];
  let periodWhere = '';
  const rawPeriodInput =
    args.period !== undefined && args.period !== null ? String(args.period).trim() : '';
  const isLatestAlias =
    !rawPeriodInput ||
    ['latest', 'latest_published', 'gan_nhat', 'gần nhất', 'moi_nhat', 'mới nhất'].includes(
      rawPeriodInput.toLowerCase()
    );

  if (!isLatestAlias) {
    if (!isValidPeriodMonth(rawPeriodInput) && !/^\d+$/.test(rawPeriodInput)) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGUMENT',
        message: 'Tham số period không hợp lệ (cần định dạng kỳ lương YYYY-MM).',
      };
    }
    params.push(rawPeriodInput);
    periodWhere = 'AND (pp.period = $2 OR pp.id::text = $2)';
  }

  let rows = [];
  if (isLatestAlias) {
    // Phase C & Case 11: "gần nhất" resolves to the latest PUBLISHED payslip (DA_CHOT / DA_CHUYEN_KHOAN),
    // never defaulting to an unpublished draft in the current calendar month.
    const pubRes = await executor.query(
      `SELECT ps.*, pp.period AS period_code, pp.status AS period_status
         FROM payslips ps
         JOIN payroll_periods pp ON pp.id = ps.period_id
        WHERE ps.employee_id = $1
          AND pp.status IN ('DA_CHOT', 'DA_CHUYEN_KHOAN')
        ORDER BY pp.period DESC
        LIMIT 1`,
      [actor.employeeId]
    );
    rows = pubRes?.rows || [];
  }

  if (rows.length === 0) {
    const anyRes = await executor.query(
      `SELECT ps.*, pp.period AS period_code, pp.status AS period_status
         FROM payslips ps
         JOIN payroll_periods pp ON pp.id = ps.period_id
        WHERE ps.employee_id = $1 ${periodWhere}
        ORDER BY pp.period DESC
        LIMIT 1`,
      params
    );
    rows = anyRes?.rows || [];
  }

  if (rows.length === 0) {
    return {
      ok: true,
      found: false,
      employeeId: actor.employeeId,
      period: !isLatestAlias && rawPeriodInput ? rawPeriodInput : null,
      message: 'Không tìm thấy phiếu lương cho kỳ được yêu cầu.',
      source: {
        id: `payslip:${actor.employeeId}:none`,
        title: `Tra cứu phiếu lương cá nhân (${actor.employeeId})`,
        asOf: nowIso,
      },
    };
  }

  const r = rows[0];
  const periodLabel = r.period_code;
  const isPublished = ['DA_CHOT', 'DA_CHUYEN_KHOAN'].includes(r.period_status);

  if (!isPublished) {
    return {
      ok: true,
      found: true,
      published: false,
      employeeId: actor.employeeId,
      periodId: r.period_id,
      period: periodLabel,
      periodStatus: r.period_status,
      message: `Kỳ lương ${periodLabel} đang ở trạng thái ${r.period_status} (chưa chốt công bố chính thức).`,
      source: {
        id: `payslip:${r.id}:unpublished`,
        title: `Trạng thái kỳ lương ${periodLabel}`,
        asOf: nowIso,
      },
    };
  }

  const baseSalary = toFiniteNumberOrNull(r.base_salary);
  const standardWorkDays = toFiniteNumberOrNull(r.standard_work_days ?? 22);
  const actualWorkDays = toFiniteNumberOrNull(r.actual_work_days);
  const workDaysSalary =
    baseSalary !== null && actualWorkDays !== null && standardWorkDays !== null && standardWorkDays > 0
      ? Math.round((baseSalary * actualWorkDays) / standardWorkDays)
      : null;

  return {
    ok: true,
    found: true,
    published: true,
    employeeId: actor.employeeId,
    payslipId: r.id,
    periodId: r.period_id,
    period: periodLabel,
    periodStatus: r.period_status,
    baseSalary,
    standardWorkDays,
    actualWorkDays,
    workDaysSalary,
    totalAllowances: toFiniteNumberOrNull(r.allowances),
    bonus: toFiniteNumberOrNull(r.bonus),
    otPay: toFiniteNumberOrNull(r.ot_pay),
    grossIncome: toFiniteNumberOrNull(r.gross_income),
    bhxhEmp: toFiniteNumberOrNull(r.bhxh_amount),
    bhytEmp: toFiniteNumberOrNull(r.bhyt_amount),
    bhtnEmp: toFiniteNumberOrNull(r.bhtn_amount),
    taxableIncome: toFiniteNumberOrNull(r.pit_taxable),
    personalDeduction: toFiniteNumberOrNull(r.pit_deduction),
    pitAmount: toFiniteNumberOrNull(r.pit_amount),
    totalDeductions: toFiniteNumberOrNull(r.total_deductions),
    netSalary: toFiniteNumberOrNull(r.net_salary),
    isLocked: isPublished,
    source: {
      id: `payslip:${r.id}`,
      title: `Phiếu lương chính thức kỳ ${periodLabel} (#${r.id})`,
      period: periodLabel,
      asOf: nowIso,
    },
  };
}

/**
 * AI-V1-F02: Resolve distinct published payslip periods (DA_CHOT / DA_CHUYEN_KHOAN)
 * for the authenticated actor from PostgreSQL, ordered by period DESC.
 */
async function resolveLatestPublishedPayslipPeriods(actor, limit = 2, executor = db) {
  if (!actor || !actor.employeeId || ['ADMIN', 'KIOSK'].includes(actor.roleCode)) {
    return [];
  }
  const safeLimit = Math.max(1, Math.min(12, Number(limit) || 2));
  const { rows } = await executor.query(
    `SELECT DISTINCT pp.period AS period_code
       FROM payslips ps
       JOIN payroll_periods pp ON pp.id = ps.period_id
      WHERE ps.employee_id = $1
        AND pp.status IN ('DA_CHOT', 'DA_CHUYEN_KHOAN')
      ORDER BY pp.period DESC
      LIMIT $2`,
    [actor.employeeId, safeLimit]
  );
  return (rows || []).map((r) => r.period_code).filter(Boolean);
}

async function getScopedDashboard(actor, args = {}, executor = db) {
  const clock = getCurrentClock(actor?.now || args?.__now);
  const nowIso = clock.iso;
  if (!actor || !['CEO', 'HR_DIRECTOR', 'LINE_MANAGER'].includes(actor.roleCode)) {
    return {
      ok: false,
      errorCode: 'FORBIDDEN_SCOPE',
      message: 'Bạn không có quyền truy cập số liệu tổng hợp Dashboard của phòng ban hoặc toàn công ty.',
    };
  }

  if (args.period !== undefined && args.period !== null && String(args.period).trim() !== '') {
    if (!isValidPeriodMonth(String(args.period).trim())) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGUMENT',
        message: 'Tham số period của get_scoped_dashboard không hợp lệ (định dạng YYYY-MM).',
      };
    }
  }

  if (actor.roleCode === 'LINE_MANAGER') {
    const myDept = await departmentOf(executor, actor.employeeId);
    if (!myDept) {
      return {
        ok: false,
        errorCode: 'FORBIDDEN_SCOPE',
        message: 'Tài khoản Trưởng phòng chưa được gán phòng ban quản lý.',
      };
    }
    if (args.departmentId && String(args.departmentId).trim() !== myDept) {
      return {
        ok: false,
        errorCode: 'FORBIDDEN_CROSS_DEPARTMENT',
        message: `Trưởng phòng chỉ được phép tra cứu số liệu của phòng ban mình (${myDept}), không được xem phòng ban ${args.departmentId}.`,
      };
    }
    const getDashFn = dashboardService.get || dashboardService.getDashboard;
    const data = await getDashFn.call(dashboardService, actor, 'department');
    return {
      ok: true,
      scope: 'department',
      departmentId: myDept,
      asOfDate: clock.date,
      overview: data.overview,
      departmentStats: data.departmentStats,
      source: {
        id: `dashboard:department:${myDept}`,
        title: `Dashboard tổng hợp phòng ban ${myDept}`,
        asOf: nowIso,
      },
    };
  }

  const getDashFn = dashboardService.get || dashboardService.getDashboard;
  const data = await getDashFn.call(dashboardService, actor, 'all');
  return {
    ok: true,
    scope: 'all',
    asOfDate: clock.date,
    overview: data.overview,
    departmentStats: data.departmentStats,
    source: {
      id: 'dashboard:company:all',
      title: 'Dashboard tổng hợp toàn công ty',
      asOf: nowIso,
    },
  };
}

async function getScopedPerformance(actor, args = {}, executor = db) {
  const clock = getCurrentClock(actor?.now || args?.__now);
  const nowIso = clock.iso;
  if (!actor || ['ADMIN', 'KIOSK'].includes(actor.roleCode)) {
    return {
      ok: false,
      errorCode: 'FORBIDDEN_SCOPE',
      message: 'Tài khoản quản trị kỹ thuật hoặc Kiosk không có quyền đọc dữ liệu đánh giá hiệu suất/9-Box/Turnover Risk.',
    };
  }

  const disclaimer =
    'Điểm rủi ro nghỉ việc (Turnover Risk) là chỉ báo theo quy tắc định lượng hiện hành, không phải mô hình dự đoán xác suất tuyệt đối. Trợ lý AI ở chế độ chỉ đọc (Read-only MVP), chỉ giải thích tín hiệu và gợi ý bản nháp PIP, không tự động sửa điểm hoặc kích hoạt PIP.';

  if (actor.roleCode === 'EMPLOYEE') {
    if (args.employeeId && String(args.employeeId).trim() !== actor.employeeId) {
      return {
        ok: false,
        errorCode: 'FORBIDDEN_CROSS_EMPLOYEE',
        message: 'Nhân viên chỉ được phép tra cứu kết quả đánh giá hiệu suất của chính mình.',
      };
    }
    if (args.departmentId) {
      return {
        ok: false,
        errorCode: 'FORBIDDEN_SCOPE',
        message: 'Nhân viên không có quyền xem thống kê hiệu suất/rủi ro cấp phòng ban.',
      };
    }
    const { rows: reviews } = await executor.query(
      `SELECT id, period, performance_score, potential_score, nine_box_cell, comments
         FROM performance_reviews
        WHERE employee_id = $1
        ORDER BY period DESC
        LIMIT 4`,
      [actor.employeeId]
    );
    const latest = reviews[0] || null;
    const cellInfo = latest ? CELLS.find((c) => c.cell === cellOf(Number(latest.performance_score), Number(latest.potential_score))) : null;
    return {
      ok: true,
      scope: 'self',
      employeeId: actor.employeeId,
      missingReview: reviews.length === 0,
      latestReview: latest
        ? {
            id: latest.id,
            period: latest.period,
            performanceScore: Number(latest.performance_score),
            potentialScore: Number(latest.potential_score),
            nineBoxCell: cellInfo || null,
            comments: latest.comments || null,
          }
        : null,
      readOnlyMvp: true,
      disclaimer,
      source: {
        id: `performance:${actor.employeeId}`,
        title: `Đánh giá hiệu suất cá nhân (${actor.employeeId})`,
        asOf: nowIso,
      },
    };
  }

  const isManager = actor.roleCode === 'LINE_MANAGER';
  const myDept = isManager ? await departmentOf(executor, actor.employeeId) : null;
  if (isManager && !myDept) {
    return {
      ok: false,
      errorCode: 'FORBIDDEN_SCOPE',
      message: 'Tài khoản Trưởng phòng chưa được gán phòng ban quản lý.',
    };
  }
  if (isManager && args.departmentId && String(args.departmentId).trim() !== myDept) {
    return {
      ok: false,
      errorCode: 'FORBIDDEN_CROSS_DEPARTMENT',
      message: `Trưởng phòng chỉ được phép tra cứu đánh giá/rủi ro của phòng ban mình (${myDept}).`,
    };
  }

  if (args.employeeId) {
    const targetEmpId = String(args.employeeId).trim();
    const { rows: empRows } = await executor.query(
      `SELECT id, full_name, department_id, job_title FROM employees WHERE id = $1`,
      [targetEmpId]
    );
    if (empRows.length === 0) {
      return {
        ok: true,
        found: false,
        employeeId: targetEmpId,
        message: `Không tìm thấy nhân viên ${targetEmpId}.`,
        source: {
          id: `performance:${targetEmpId}:not-found`,
          title: `Tra cứu đánh giá hiệu suất (${targetEmpId})`,
          asOf: nowIso,
        },
      };
    }
    const emp = empRows[0];
    if (isManager && emp.department_id !== myDept) {
      return {
        ok: false,
        errorCode: 'FORBIDDEN_CROSS_DEPARTMENT',
        message: `Nhân viên ${targetEmpId} thuộc phòng ban ${emp.department_id}, nằm ngoài phạm vi quản lý của bạn (${myDept}).`,
      };
    }

    const { rows: reviews } = await executor.query(
      `SELECT id, period, performance_score, potential_score, nine_box_cell, comments
         FROM performance_reviews
        WHERE employee_id = $1
        ORDER BY period DESC
        LIMIT 4`,
      [targetEmpId]
    );
    const { data: riskList } = await turnoverService.list(actor, { limit: 200 }, isManager ? 'department' : 'all');
    const riskEntry = riskList.find((r) => r.employee_id === targetEmpId) || null;
    const latest = reviews[0] || null;
    const cellInfo = latest ? CELLS.find((c) => c.cell === cellOf(Number(latest.performance_score), Number(latest.potential_score))) : null;

    return {
      ok: true,
      found: true,
      scope: isManager ? 'department' : 'all',
      employeeId: emp.id,
      fullName: emp.full_name,
      departmentId: emp.department_id,
      jobTitle: emp.job_title,
      queriedPeriod: args.period ? String(args.period).trim() : null,
      evaluationYear: clock.year,
      missingReview: reviews.length === 0,
      latestReview: latest
        ? {
            id: latest.id,
            period: latest.period,
            performanceScore: Number(latest.performance_score),
            potentialScore: Number(latest.potential_score),
            nineBoxCell: cellInfo || null,
            comments: latest.comments || null,
          }
        : null,
      turnoverRisk: riskEntry
        ? {
            score: riskEntry.score,
            level: riskEntry.level,
            signals: riskEntry.signals,
          }
        : null,
      readOnlyMvp: true,
      disclaimer,
      source: {
        id: `performance:${emp.id}`,
        title: `Hiệu suất 9-Box & Chỉ báo rủi ro (${emp.id})`,
        asOf: nowIso,
      },
    };
  }

  const scope = isManager ? 'department' : 'all';
  const { data: riskList } = await turnoverService.list(actor, { limit: 200 }, scope);
  const filtered = args.departmentId
    ? riskList.filter((r) => r.department_id === args.departmentId)
    : riskList;

  return {
    ok: true,
    scope,
    departmentId: isManager ? myDept : args.departmentId || 'all',
    totalEvaluated: filtered.length,
    highRiskCount: filtered.filter((r) => r.level === 'Cao').length,
    mediumRiskCount: filtered.filter((r) => r.level === 'Trung bình').length,
    topSignals: filtered.slice(0, 10).map((r) => ({
      employeeId: r.employee_id,
      fullName: r.full_name,
      departmentId: r.department_id,
      score: r.score,
      level: r.level,
      signals: r.signals,
    })),
    readOnlyMvp: true,
    disclaimer,
    source: {
      id: `performance-summary:${scope}:${isManager ? myDept : args.departmentId || 'all'}`,
      title: `Tổng hợp hiệu suất & chỉ báo rủi ro (${isManager ? myDept : 'Toàn công ty'})`,
      asOf: nowIso,
    },
  };
}

async function searchPolicies(actor, args = {}, executor = db) {
  const clock = getCurrentClock(actor?.now || args?.__now);
  const nowIso = clock.iso;
  const rawQuery = String(args.query || '').trim();
  const qLower = rawQuery.toLowerCase();

  const CURRENT_POLICY_ALIASES = new Set([
    'current', 'latest', 'now', 'today', 'active', 'present',
    'hien_hanh', 'hiện hành', 'hien_tai', 'hiện tại', 'hien nay', 'hiện nay',
  ]);
  const rawArgPeriod =
    args.period !== undefined && args.period !== null ? String(args.period).trim() : '';
  const cleanArgPeriod =
    rawArgPeriod && !CURRENT_POLICY_ALIASES.has(rawArgPeriod.toLowerCase()) ? rawArgPeriod : '';

  if (cleanArgPeriod !== '') {
    if (!isValidPeriodMonth(cleanArgPeriod)) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGUMENT',
        message: 'Tham số period của search_policies không hợp lệ (định dạng bắt buộc YYYY-MM).',
      };
    }
  }

  const rawArgEffDate =
    args.effectiveDate !== undefined && args.effectiveDate !== null ? String(args.effectiveDate).trim() : '';
  const cleanArgEffDate =
    rawArgEffDate && !CURRENT_POLICY_ALIASES.has(rawArgEffDate.toLowerCase()) ? rawArgEffDate : '';

  if (cleanArgEffDate !== '') {
    if (!isValidIsoDate(cleanArgEffDate)) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGUMENT',
        message: 'Tham số effectiveDate của search_policies không hợp lệ (định dạng bắt buộc YYYY-MM-DD).',
      };
    }
  }

  const targetPeriod =
    cleanArgPeriod
      ? cleanArgPeriod
      : cleanArgEffDate
      ? cleanArgEffDate.slice(0, 7)
      : extractPeriodFromQuery(rawQuery);

  const { rows: allDocs } = await executor.query(
    `SELECT id, title, category, content, version, is_active, updated_at
       FROM handbook_docs
      ORDER BY id ASC`
  );

  // R29: When a specific period is requested (via args.period, args.effectiveDate, or query text),
  // resolve the exact policy version effective for that period from system_policy_versions
  // (or locked payroll_periods.policy_snapshot) instead of returning current system_settings.
  let relevantSettings = [];
  let resolvedEffectiveFrom = null;
  let resolvedPolicyVersionId = null;
  let resolvedPolicySource = null;

  if (targetPeriod) {
    let periodPolicy = null;
    try {
      periodPolicy = await settingsService.getSettingsForPeriod(executor, targetPeriod);
    } catch (err) {
      if (err?.code === 'POLICY_VERSION_NOT_FOUND') {
        return {
          ok: true,
          found: false,
          policyVersionFound: false,
          errorCode: 'POLICY_VERSION_NOT_FOUND',
          queriedPeriod: targetPeriod,
          matches: [],
          systemSettings: [],
          message: err.message,
          sources: [],
        };
      }
      throw err;
    }

    resolvedEffectiveFrom = periodPolicy.policyEffectiveFrom || periodPolicy.policy_effective_from || targetPeriod;
    resolvedPolicyVersionId = periodPolicy.policy_version_id || 1;
    const metaExclude = new Set(['updated_at', 'updated_by', 'policy_version_id']);
    relevantSettings = Object.entries(periodPolicy)
      .filter(([k, v]) => !metaExclude.has(k) && v !== undefined && v !== null)
      .map(([k, v]) => ({
        key: k,
        value: String(v),
        effectiveFrom: resolvedEffectiveFrom,
        policyVersionId: resolvedPolicyVersionId,
      }));

    resolvedPolicySource = {
      id: `policy-version:${resolvedEffectiveFrom}:v${resolvedPolicyVersionId}`,
      title: `Phiên bản cấu hình chính sách hiệu lực từ kỳ ${resolvedEffectiveFrom} (tra cứu kỳ ${targetPeriod})`,
      period: targetPeriod,
      effectiveFrom: resolvedEffectiveFrom,
      version: `v${resolvedPolicyVersionId}`,
      asOf: periodPolicy.updated_at ? new Date(periodPolicy.updated_at).toISOString() : nowIso,
    };
  } else {
    const { rows: settingsRows } = await executor.query(
      `SELECT key, value, category, description, updated_at
         FROM system_settings
        ORDER BY key ASC`
    );
    const effRow = settingsRows.find((s) => s.key === 'policy_effective_from');
    resolvedEffectiveFrom = effRow?.value || clock.month;
    relevantSettings = settingsRows.map((s) => ({
      key: s.key,
      value: s.value,
      category: s.category,
      description: s.description,
      effectiveFrom: resolvedEffectiveFrom,
    }));
  }

  const tokens = qLower
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !['của', 'cho', 'với', 'như', 'thế', 'nào', 'bao', 'nhiêu', 'quy', 'định', 'chính', 'sách'].includes(w));

  const scoreDoc = (doc) => {
    const hay = `${doc.id} ${doc.title} ${doc.category} ${doc.content}`.toLowerCase();
    if (tokens.length === 0) return 1;
    let hits = 0;
    for (const tk of tokens) {
      if (hay.includes(tk)) hits += 1;
    }
    return hits;
  };

  const activeDocs = allDocs.filter((d) => d.is_active);
  const inactiveDocs = allDocs.filter((d) => !d.is_active);

  const scoredActive = activeDocs
    .map((d) => ({ doc: d, score: scoreDoc(d) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const scoredInactive = inactiveDocs
    .map((d) => ({ doc: d, score: scoreDoc(d) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const specificMustMatch = ['vinmec', 'bảo hiểm quốc tế', 'cổ phiếu', 'esop', 'thai sản quốc tế'].find((kw) =>
    qLower.includes(kw)
  );
  const hasSpecificActiveMatch = specificMustMatch
    ? activeDocs.some((d) => `${d.title} ${d.content}`.toLowerCase().includes(specificMustMatch))
    : true;

  const bestActiveScore = scoredActive[0]?.score || 0;
  const bestInactiveScore = scoredInactive[0]?.score || 0;
  const expiredMatchPreferred = bestInactiveScore > 0 && bestInactiveScore > bestActiveScore;

  if (!hasSpecificActiveMatch || (scoredActive.length === 0 && !targetPeriod) || expiredMatchPreferred) {
    const expiredOnly = expiredMatchPreferred || (scoredActive.length === 0 && scoredInactive.length > 0);
    return {
      ok: true,
      found: false,
      expiredMatch: expiredOnly,
      queriedPeriod: targetPeriod || null,
      matches: [],
      systemSettings: [],
      message: expiredOnly
        ? 'Văn bản quy chế liên quan đã hết hiệu lực hoặc bị thu hồi (is_active = false).'
        : 'Không tìm thấy văn bản quy chế đã phê duyệt trong Sổ tay Nhân sự (handbook_docs) khớp với nội dung tra cứu.',
      sources: [],
    };
  }

  let anyInjectionFiltered = false;
  const matches = scoredActive.slice(0, 4).map(({ doc }) => {
    const sanitized = sanitizePolicyText(doc.content);
    if (sanitized.filtered) anyInjectionFiltered = true;
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      version: Number(doc.version || 1),
      effectiveStatus: 'PUBLISHED',
      excerpt: sanitized.text,
      promptInjectionFiltered: sanitized.filtered,
      updatedAt: doc.updated_at ? new Date(doc.updated_at).toISOString() : nowIso,
    };
  });

  const sources = matches.map((m) => ({
    id: `policy:${m.id}:v${m.version}`,
    title: `${m.title} (${m.id} v${m.version})`,
    version: `v${m.version}`,
    effectiveFrom: resolvedEffectiveFrom,
    period: targetPeriod || resolvedEffectiveFrom,
    asOf: m.updatedAt,
  }));
  if (resolvedPolicySource) {
    sources.push(resolvedPolicySource);
  }

  return {
    ok: true,
    found: true,
    policyVersionFound: true,
    queriedPeriod: targetPeriod || null,
    effectiveFrom: resolvedEffectiveFrom,
    policyVersionId: resolvedPolicyVersionId,
    promptInjectionFiltered: anyInjectionFiltered,
    matches,
    systemSettings: relevantSettings,
    sources,
  };
}

const TOOL_HANDLERS = {
  get_my_leave_balance: getMyLeaveBalance,
  get_my_attendance: getMyAttendance,
  get_my_payslip: getMyPayslip,
  get_scoped_dashboard: getScopedDashboard,
  get_scoped_performance: getScopedPerformance,
  search_policies: searchPolicies,
};

async function executeToolCall(toolName, actor, args = {}, executor = db) {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return {
      ok: false,
      errorCode: 'UNKNOWN_TOOL',
      message: `Công cụ "${toolName}" không tồn tại hoặc không được phép thực thi.`,
    };
  }
  return handler(actor, args || {}, executor);
}

module.exports = {
  TOOL_DECLARATIONS,
  TOOL_HANDLERS,
  executeToolCall,
  resolveLatestPublishedPayslipPeriods,
  toFiniteNumberOrNull,
  sanitizePolicyText,
  getCurrentClock,
  isValidPeriodMonth,
  isValidIsoDate,
  extractPeriodFromQuery,
};
