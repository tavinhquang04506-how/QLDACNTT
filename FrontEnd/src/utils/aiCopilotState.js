/**
 * Pure state adapter for AI Copilot V1 responses on the Frontend.
 * Maps the backend `/api/ai/copilot` contract (`verified`, `refused`, `refusalCodes`,
 * `responseType`, `intent`, `slots`, `answerSections`, `clarification`,
 * `followUpSuggestions`, `navigationActions`, `sources`, `structuredEvidence`,
 * `verifiedClaims`, `toolsUsed`, `scopeChangedDuringRequest`) into explicit
 * UI presentation states so refused or unverified responses are never rendered as verified HR facts.
 */

export function buildUserScopeWatchKey(user) {
  if (!user) return 'anonymous';
  return JSON.stringify({
    id: user.id || user.userId || 'anonymous',
    roleCode: user.roleCode || user.role || null,
    departmentId: user.departmentId || null,
    employeeId: user.employeeId || null,
  });
}

export function getVietnamCurrentYearAndMonth(nowInput = new Date()) {
  const d = nowInput instanceof Date && !Number.isNaN(nowInput.getTime()) ? nowInput : new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const year = Number(map.year) || d.getFullYear();
    const monthNum = Number(map.month) || d.getMonth() + 1;
    const prevYear = monthNum === 1 ? year - 1 : year;
    const prevMonthNum = monthNum === 1 ? 12 : monthNum - 1;
    return {
      year,
      month: `${year}-${String(monthNum).padStart(2, '0')}`,
      prevMonth: `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`,
    };
  } catch {
    const year = d.getFullYear();
    const monthNum = d.getMonth() + 1;
    const prevYear = monthNum === 1 ? year - 1 : year;
    const prevMonthNum = monthNum === 1 ? 12 : monthNum - 1;
    return {
      year,
      month: `${year}-${String(monthNum).padStart(2, '0')}`,
      prevMonth: `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`,
    };
  }
}

export function buildRoleAwareWelcomeMessage(user, nowInput = new Date()) {
  const { year, prevMonth } = getVietnamCurrentYearAndMonth(nowInput);
  const roleCode = user?.roleCode || user?.role || 'EMPLOYEE';
  const hasEmployeeId = Boolean(user?.employeeId);

  let chips = [];
  if (roleCode === 'ADMIN') {
    chips = [
      'Quy chế giờ làm việc và bán kính chấm công GPS hiện hành',
      'Quy định nghỉ phép năm trong Sổ tay Nhân sự hiện hành',
      'Quy định trang phục và nội quy công sở hiện hành',
    ];
  } else if (['CEO', 'HR_DIRECTOR', 'LINE_MANAGER'].includes(roleCode)) {
    chips = [
      'Tóm tắt số liệu nhân sự theo phạm vi quản lý của tôi',
      ...(hasEmployeeId
        ? [
            `Tôi còn bao nhiêu ngày phép năm nay (${year})?`,
            'Giải thích phiếu lương chính thức kỳ gần nhất của tôi',
          ]
        : ['Tra cứu đánh giá hiệu suất theo phạm vi phân quyền']),
      'Quy chế giờ làm việc và bán kính chấm công GPS hiện hành',
    ];
  } else {
    chips = [
      `Tôi còn bao nhiêu ngày phép năm nay (${year})?`,
      'Giải thích phiếu lương chính thức kỳ gần nhất của tôi',
      `Tổng hợp bảng chấm công kỳ ${prevMonth} của tôi`,
      'Quy chế giờ làm việc và bán kính chấm công GPS hiện hành',
    ];
  }

  return {
    id: 'welcome',
    sender: 'bot',
    responseType: 'greeting',
    text: 'Chào bạn! Tôi là Trợ Lý Nhân Sự AI NEXUS (chế độ chỉ đọc - Read-only). Tôi hỗ trợ tra cứu quỹ ngày phép cá nhân, bảng chấm công, giải thích & so sánh phiếu lương đã công bố, quy chế nội bộ hiện hành và thống kê theo đúng phân quyền tài khoản của bạn.',
    chips,
    time: 'Vừa xong',
  };
}

export function buildBotMessageFromCopilotPayload(payload, retryText = '', timeStr = '') {
  if (!payload || payload.success === false || typeof payload.answer !== 'string' || !payload.answer.trim()) {
    throw new Error(payload?.message || 'Không nhận được phản hồi hợp lệ từ máy chủ AI.');
  }

  const refusalCodes = Array.isArray(payload.refusalCodes) ? payload.refusalCodes.filter(Boolean) : [];
  const refused = Boolean(payload.refused) || refusalCodes.length > 0;
  const verified = Boolean(payload.verified) && !refused;
  const toolsUsed = Array.isArray(payload.toolsUsed) ? payload.toolsUsed : [];
  const sources = verified && Array.isArray(payload.sources) ? payload.sources : [];
  const structuredEvidence =
    verified && Array.isArray(payload.structuredEvidence) ? payload.structuredEvidence : [];
  const verifiedClaims =
    verified && Array.isArray(payload.verifiedClaims) ? payload.verifiedClaims : [];

  const responseType =
    payload.responseType ||
    (refused
      ? 'refusal'
      : verified
        ? 'answer'
        : toolsUsed.length > 0
          ? 'empty'
          : 'clarification');

  let verificationState = 'UNVERIFIED';
  let statusBadgeText =
    toolsUsed.length > 0
      ? 'Chưa có bản ghi chính thức / Dữ liệu trống'
      : 'Hội thoại / Cần làm rõ thông tin (chưa trích xuất dữ liệu)';

  if (refused) {
    verificationState = 'REFUSED';
    statusBadgeText = `Đã từ chối / Không đủ bằng chứng xác thực${
      refusalCodes.length > 0 ? ` (${refusalCodes.join(', ')})` : ''
    }`;
  } else if (verified) {
    verificationState = 'VERIFIED';
    statusBadgeText = 'Đã đối chiếu dữ liệu hệ thống';
  }

  const answerSections = Array.isArray(payload.answerSections) ? payload.answerSections : [];
  const clarification = !refused && payload.clarification ? payload.clarification : null;
  const followUpSuggestions =
    !refused && Array.isArray(payload.followUpSuggestions)
      ? payload.followUpSuggestions.filter(Boolean).slice(0, 3)
      : [];
  const navigationActions =
    !refused && Array.isArray(payload.navigationActions) ? payload.navigationActions : [];

  return {
    id: payload.requestId || `b-${Date.now()}`,
    sender: 'bot',
    text: payload.answer,
    responseType,
    intent: payload.intent || 'unknown',
    slots: payload.slots || {},
    answerSections,
    clarification,
    followUpSuggestions,
    navigationActions,
    payslipComparison: verified && payload.payslipComparison ? payload.payslipComparison : null,
    mode: payload.mode || 'gemini',
    verified,
    refused,
    refusalCodes,
    verificationState,
    statusBadgeText,
    toolsUsed,
    sources,
    structuredEvidence,
    verifiedClaims,
    scopeChangedMidConversation: Boolean(payload.scopeChangedMidConversation),
    scopeChangedDuringRequest: Boolean(payload.scopeChangedDuringRequest),
    retryText: refused ? String(retryText || '') : '',
    dataAsOf: payload.dataAsOf || null,
    clientGenerationId: payload.clientGenerationId || null,
    providerMeta: payload.providerMeta || null,
    time: timeStr || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };
}
