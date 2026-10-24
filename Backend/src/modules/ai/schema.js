'use strict';

const { AppError, badRequest } = require('../../utils/AppError');

const INTENT_TYPES = Object.freeze([
  'leave_balance',
  'attendance_summary',
  'payslip_explanation',
  'payslip_comparison',
  'policy_lookup',
  'dashboard_summary',
  'performance_summary',
  'greeting',
  'clarification',
  'unsupported',
]);

const RESPONSE_TYPES = Object.freeze([
  'answer',
  'clarification',
  'empty',
  'refusal',
  'error',
  'greeting',
]);

const ALLOWED_TOOL_ARGS = Object.freeze({
  get_my_leave_balance: new Set(['year', 'leaveType', 'employeeId', '__now']),
  get_my_attendance: new Set(['from', 'to', 'month', 'employeeId', '__now']),
  get_my_payslip: new Set(['period', 'employeeId', 'latestPublished', '__now']),
  get_scoped_dashboard: new Set(['period', 'departmentId', '__now']),
  get_scoped_performance: new Set(['period', 'employeeId', 'departmentId', '__now']),
  search_policies: new Set(['query', 'period', 'effectiveDate', '__now']),
});

const NAVIGATION_ACTION_ALLOWLIST = Object.freeze({
  OPEN_PORTAL_LEAVE: {
    id: 'nav-leave',
    actionKey: 'OPEN_PORTAL_LEAVE',
    label: 'Xem Quỹ phép & Đơn nghỉ cá nhân',
    route: '/leave',
    path: '/leave',
    params: { section: 'leaves' },
    allowedRoles: ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE'],
  },
  OPEN_PORTAL_ATTENDANCE: {
    id: 'nav-attendance',
    actionKey: 'OPEN_PORTAL_ATTENDANCE',
    label: 'Xem Bảng chấm công cá nhân',
    route: '/attendance',
    path: '/attendance',
    params: { section: 'attendance' },
    allowedRoles: ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE'],
  },
  OPEN_PAYROLL: {
    id: 'nav-payslips',
    actionKey: 'OPEN_PAYROLL',
    label: 'Mở Phiếu lương của tôi',
    route: '/payroll',
    path: '/payroll',
    params: {},
    allowedRoles: ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE'],
  },
  OPEN_HANDBOOK: {
    id: 'nav-handbook',
    actionKey: 'OPEN_HANDBOOK',
    label: 'Mở Sổ tay Quy chế nội bộ',
    route: '/handbook',
    path: '/handbook',
    params: {},
    allowedRoles: ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE', 'ADMIN'],
  },
  OPEN_DASHBOARD: {
    id: 'nav-dashboard',
    actionKey: 'OPEN_DASHBOARD',
    label: 'Mở Bảng điều khiển Nhân sự',
    route: '/dashboard',
    path: '/dashboard',
    params: {},
    allowedRoles: ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER'],
  },
  OPEN_AI_ANALYTICS: {
    id: 'nav-analytics',
    actionKey: 'OPEN_AI_ANALYTICS',
    label: 'Mở Phân tích Hiệu suất & 9-Box',
    route: '/ai-analytics',
    path: '/ai-analytics',
    params: {},
    allowedRoles: ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER'],
  },
});

function computePreviousMonthString(monthStr = '') {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(monthStr || '').trim());
  if (!m) return null;
  let year = Number(m[1]);
  let month = Number(m[2]) - 1;
  if (month <= 0) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function validateCopilotRequestPayload(body = {}, options = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_REQUEST_PAYLOAD', 'Payload yêu cầu không hợp lệ (cần đối tượng JSON).');
  }

  const rawMessage = body.message;
  if (rawMessage !== undefined && rawMessage !== null && typeof rawMessage !== 'string') {
    throw new AppError(400, 'INVALID_REQUEST_PAYLOAD', 'Trường message phải là chuỗi văn bản.');
  }

  const trimmedMessage = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  if (!trimmedMessage) {
    throw badRequest('Nội dung câu hỏi (message) không được để trống');
  }

  const maxMessageChars = Number(options.maxMessageChars || 4000);
  if (trimmedMessage.length > maxMessageChars) {
    throw new AppError(
      400,
      'MESSAGE_TOO_LONG',
      `Câu hỏi vượt quá giới hạn cho phép (${maxMessageChars} ký tự).`
    );
  }

  let conversationId = null;
  if (body.conversationId !== undefined && body.conversationId !== null && String(body.conversationId).trim() !== '') {
    if (typeof body.conversationId !== 'string' && typeof body.conversationId !== 'number') {
      throw new AppError(400, 'INVALID_CONVERSATION_ID', 'Mã hội thoại (conversationId) không hợp lệ.');
    }
    const convStr = String(body.conversationId).trim();
    if (convStr.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(convStr)) {
      throw new AppError(400, 'INVALID_CONVERSATION_ID', 'Mã hội thoại (conversationId) vượt độ dài hoặc chứa ký tự không hợp lệ.');
    }
    conversationId = convStr;
  }

  let clientGenerationId = null;
  if (body.clientGenerationId !== undefined && body.clientGenerationId !== null) {
    const genStr = String(body.clientGenerationId).trim();
    if (genStr.length <= 64) {
      clientGenerationId = genStr;
    }
  }

  return {
    message: trimmedMessage,
    conversationId,
    clientGenerationId,
    clientContextProvided: Boolean(body.context && typeof body.context === 'object'),
  };
}

function sanitizeAndValidateToolArgs(toolName, rawArgs = {}) {
  const allowedKeys = ALLOWED_TOOL_ARGS[toolName];
  if (!allowedKeys) {
    return {
      ok: false,
      errorCode: 'UNKNOWN_TOOL',
      message: `Công cụ "${toolName}" không tồn tại trong danh mục Read-Only được phép.`,
      sanitizedArgs: {},
    };
  }
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    return { ok: true, sanitizedArgs: {}, errorCode: null, message: null };
  }
  const clean = {};
  for (const [k, v] of Object.entries(rawArgs)) {
    if (allowedKeys.has(k) && v !== undefined) {
      clean[k] = v;
    }
  }
  if (clean.year !== undefined && clean.year !== null && String(clean.year).trim() !== '') {
    const y = Number(clean.year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGUMENT',
        message: 'Tham số year không hợp lệ (2000..2100).',
        sanitizedArgs: clean,
      };
    }
    clean.year = y;
  }
  return {
    ok: true,
    sanitizedArgs: clean,
    errorCode: null,
    message: null,
  };
}

function buildRoleScopedNavigationActions(arg1, arg2, arg3 = {}, arg4 = false) {
  let roleCode;
  let intent;
  let slots = {};
  let responseType = 'answer';
  let refused = false;

  if (arg1 && typeof arg1 === 'object' && 'roleCode' in arg1) {
    roleCode = arg1.roleCode;
    intent = arg2;
    responseType = typeof arg3 === 'string' ? arg3 : 'answer';
    refused = Boolean(arg4);
  } else {
    intent = arg1;
    roleCode = typeof arg2 === 'object' ? arg2?.roleCode : arg2;
    slots = arg3 && typeof arg3 === 'object' ? arg3 : {};
    responseType = typeof arg4 === 'string' ? arg4 : 'answer';
  }

  if (
    refused ||
    responseType === 'refusal' ||
    responseType === 'error' ||
    responseType === 'greeting' ||
    responseType === 'clarification'
  ) {
    return [];
  }

  const candidateKeys = [];
  if (intent === 'leave_balance') {
    candidateKeys.push('OPEN_PORTAL_LEAVE');
  } else if (intent === 'attendance_summary') {
    candidateKeys.push('OPEN_PORTAL_ATTENDANCE');
  } else if (intent === 'payslip_explanation' || intent === 'payslip_comparison') {
    candidateKeys.push('OPEN_PAYROLL');
  } else if (intent === 'policy_lookup') {
    candidateKeys.push('OPEN_HANDBOOK');
  } else if (intent === 'dashboard_summary') {
    candidateKeys.push('OPEN_DASHBOARD');
  } else if (intent === 'performance_summary') {
    if (['CEO', 'HR_DIRECTOR', 'LINE_MANAGER'].includes(roleCode)) {
      candidateKeys.push('OPEN_AI_ANALYTICS');
    }
  }

  const actions = [];
  for (const key of candidateKeys) {
    const def = NAVIGATION_ACTION_ALLOWLIST[key];
    if (def && def.allowedRoles.includes(roleCode)) {
      const params = { ...def.params };
      if (slots?.period && key === 'OPEN_PAYROLL') {
        params.period = slots.period;
      }
      if (slots?.year && key === 'OPEN_PORTAL_LEAVE') {
        params.year = slots.year;
      }
      actions.push({
        id: def.id,
        actionKey: def.actionKey,
        label: def.label,
        route: def.route,
        path: def.path,
        params,
      });
    }
  }
  return actions;
}

function buildRoleScopedFollowUpSuggestions(arg1, arg2, arg3 = {}, arg4 = {}, arg5 = 'answer') {
  let roleCode;
  let intent;
  let slots = {};
  let clock = {};

  if (arg1 && typeof arg1 === 'object' && 'roleCode' in arg1) {
    roleCode = arg1.roleCode;
    intent = arg2;
    slots = arg3 || {};
    clock = arg4 || {};
  } else {
    intent = arg1;
    roleCode = typeof arg2 === 'object' ? arg2?.roleCode : arg2;
    clock = arg3 || {};
    slots = arg4 || {};
  }
  if (arg5 === 'refusal') return [];
  const currentYear = clock?.year || new Date().getFullYear();
  const currentMonth = clock?.month || `${currentYear}-01`;
  const prevMonth = computePreviousMonthString(currentMonth) || `${currentYear - 1}-12`;

  if (roleCode === 'ADMIN') {
    return [
      'Quy chế giờ làm việc và bán kính chấm công GPS hiện hành là gì?',
      'Quy định về nghỉ phép năm trong Sổ tay Nhân sự như thế nào?',
      'Chính sách tính lương làm thêm giờ (OT) hiện hành quy định ra sao?',
    ];
  }

  if (roleCode === 'KIOSK') {
    return [];
  }

  const isManagerOrExec = ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER'].includes(roleCode);

  if (intent === 'leave_balance') {
    const list = [
      `Chi tiết quỹ phép năm và phép ốm của tôi năm ${currentYear}`,
      `Tổng hợp bảng chấm công của tôi tháng trước (${prevMonth})`,
      'Giải thích phiếu lương chính thức kỳ gần nhất của tôi',
    ];
    return list.slice(0, 3);
  }

  if (intent === 'attendance_summary') {
    return [
      `Còn tháng trước (${prevMonth}) thì bảng chấm công của tôi thế nào?`,
      `Tôi còn bao nhiêu ngày phép năm nay (${currentYear})?`,
      'Quy chế giờ làm việc và chấm công GPS hiện hành là gì?',
    ].slice(0, 3);
  }

  if (intent === 'payslip_explanation' || intent === 'payslip_comparison') {
    return [
      'So sánh phiếu lương hai kỳ đã công bố gần nhất của tôi',
      `Tổng hợp bảng chấm công của tôi kỳ ${slots.period || prevMonth}`,
      'Quy định về thuế TNCN và bảo hiểm bắt buộc trong Sổ tay Nhân sự',
    ].slice(0, 3);
  }

  if (intent === 'policy_lookup') {
    const list = [
      'Quy chế nghỉ phép năm và nghỉ ốm hiện hành quy định thế nào?',
      'Quy chế giờ làm việc và bán kính chấm công GPS là bao nhiêu?',
    ];
    if (isManagerOrExec) {
      list.push('Tóm tắt số liệu nhân sự theo phạm vi quản lý của tôi');
    } else {
      list.push(`Tôi còn bao nhiêu ngày phép năm nay (${currentYear})?`);
    }
    return list.slice(0, 3);
  }

  if (intent === 'dashboard_summary' || intent === 'performance_summary') {
    if (isManagerOrExec) {
      return [
        'Tóm tắt số liệu nhân sự theo phạm vi quản lý của tôi',
        'Tổng hợp đánh giá hiệu suất 9-Box và chỉ báo rủi ro nghỉ việc trong phạm vi quản lý',
        'Quy chế đánh giá hiệu suất trong Sổ tay Nhân sự hiện hành',
      ].slice(0, 3);
    }
  }

  // Default role-aware suggestions (no hardcoded year 2026)
  const defaults = [
    `Tôi còn bao nhiêu ngày phép năm nay (${currentYear})?`,
    'Giải thích phiếu lương chính thức kỳ gần nhất của tôi',
  ];
  if (isManagerOrExec) {
    defaults.push('Tóm tắt số liệu nhân sự theo phạm vi quản lý của tôi');
  } else {
    defaults.push(`Tổng hợp bảng chấm công của tôi tháng trước (${prevMonth})`);
  }
  return defaults.slice(0, 3);
}

module.exports = {
  INTENT_TYPES,
  RESPONSE_TYPES,
  ALLOWED_TOOL_ARGS,
  NAVIGATION_ACTION_ALLOWLIST,
  computePreviousMonthString,
  validateCopilotRequestPayload,
  sanitizeAndValidateToolArgs,
  buildRoleScopedNavigationActions,
  buildRoleScopedFollowUpSuggestions,
};
