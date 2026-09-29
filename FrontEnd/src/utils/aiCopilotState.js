/**
 * Pure state adapter for AI Copilot responses on the Frontend.
 * Maps the backend `/api/ai/copilot` contract (`verified`, `refused`, `refusalCodes`,
 * `sources`, `structuredEvidence`, `toolsUsed`, `scopeChangedDuringRequest`) into explicit
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

  return {
    id: payload.requestId || `b-${Date.now()}`,
    sender: 'bot',
    text: payload.answer,
    mode: payload.mode || 'gemini',
    verified,
    refused,
    refusalCodes,
    verificationState,
    statusBadgeText,
    toolsUsed,
    sources,
    structuredEvidence,
    scopeChangedMidConversation: Boolean(payload.scopeChangedMidConversation),
    scopeChangedDuringRequest: Boolean(payload.scopeChangedDuringRequest),
    retryText: refused ? String(retryText || '') : '',
    dataAsOf: payload.dataAsOf || null,
    time: timeStr || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };
}
