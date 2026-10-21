import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBotMessageFromCopilotPayload,
  buildUserScopeWatchKey,
} from '../src/utils/aiCopilotState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('R35 & R36 — AI Copilot UI State & Contract Verification', () => {
  it('R35: buildBotMessageFromCopilotPayload maps VERIFIED, REFUSED, and UNVERIFIED responses according to real backend contract (verified, refused, refusalCodes)', () => {
    // 1. Verified response with structuredEvidence and sources
    const verifiedMsg = buildBotMessageFromCopilotPayload(
      {
        success: true,
        answer: 'Năm 2026: còn lại 5 ngày phép (khả dụng 3 ngày).',
        verified: true,
        refused: false,
        refusalCodes: [],
        toolsUsed: [{ name: 'get_my_leave_balance', ok: true }],
        sources: [{ id: 'leave-balance:NV-0008:2026', title: 'Quỹ phép cá nhân năm 2026' }],
        structuredEvidence: [
          {
            tool: 'get_my_leave_balance',
            entity: { employeeId: 'NV-0008' },
            period: { year: 2026 },
            fields: { balances: [{ remaining: 5, available: 3, used: 7, entitlement: 12 }] },
          },
        ],
        requestId: 'req-v1',
      },
      'Tôi còn mấy ngày phép?'
    );
    assert.equal(verifiedMsg.verified, true);
    assert.equal(verifiedMsg.refused, false);
    assert.equal(verifiedMsg.verificationState, 'VERIFIED');
    assert.match(verifiedMsg.statusBadgeText, /Đã đối chiếu dữ liệu hệ thống/);
    assert.equal(verifiedMsg.sources.length, 1);
    assert.equal(verifiedMsg.structuredEvidence.length, 1);
    assert.equal(verifiedMsg.retryText, '');

    // 2. Refused response (UNGROUNDED_ANSWER_REJECTED / ANSWER_SOURCE_MISMATCH / SCOPE_CHANGED_DURING_REQUEST)
    const refusedMsg = buildBotMessageFromCopilotPayload(
      {
        success: true,
        answer:
          'Không thể xác minh thông tin nhân sự hoặc chính sách do chưa truy xuất được bằng chứng từ công cụ hệ thống được phân quyền (UNGROUNDED_ANSWER_REJECTED).',
        verified: false,
        refused: true,
        refusalCodes: ['UNGROUNDED_ANSWER_REJECTED'],
        toolsUsed: [],
        sources: [{ id: 'should-be-stripped', title: 'Should not appear on refused message' }],
        requestId: 'req-r1',
      },
      'How many vacation days do I have?'
    );
    assert.equal(refusedMsg.verified, false);
    assert.equal(refusedMsg.refused, true);
    assert.equal(refusedMsg.verificationState, 'REFUSED');
    assert.match(refusedMsg.statusBadgeText, /UNGROUNDED_ANSWER_REJECTED/);
    assert.equal(refusedMsg.sources.length, 0);
    assert.equal(refusedMsg.retryText, 'How many vacation days do I have?');

    // 3. Unverified response (e.g. hasRecord=false or greeting/clarification without tools)
    const unverifiedEmptyToolMsg = buildBotMessageFromCopilotPayload(
      {
        success: true,
        answer: 'Chưa có dữ liệu quỹ phép cho năm 2030.',
        verified: false,
        refused: false,
        refusalCodes: [],
        toolsUsed: [{ name: 'get_my_leave_balance', ok: true }],
        sources: [],
        requestId: 'req-u1',
      },
      'Tra cứu phép năm 2030'
    );
    assert.equal(unverifiedEmptyToolMsg.verified, false);
    assert.equal(unverifiedEmptyToolMsg.refused, false);
    assert.equal(unverifiedEmptyToolMsg.verificationState, 'UNVERIFIED');
    assert.match(unverifiedEmptyToolMsg.statusBadgeText, /Chưa có bản ghi chính thức/);
    assert.equal(unverifiedEmptyToolMsg.sources.length, 0);

    const unverifiedGreetingMsg = buildBotMessageFromCopilotPayload(
      {
        success: true,
        answer: 'Xin chào! Bạn muốn tra cứu kỳ lương nào?',
        verified: false,
        refused: false,
        refusalCodes: [],
        toolsUsed: [],
        sources: [],
        requestId: 'req-u2',
      },
      'Xin chào'
    );
    assert.equal(unverifiedGreetingMsg.verificationState, 'UNVERIFIED');
    assert.match(unverifiedGreetingMsg.statusBadgeText, /Hội thoại \/ Cần làm rõ thông tin/);
  });

  it('R36: buildUserScopeWatchKey changes whenever id, roleCode, departmentId, or employeeId changes (including null transitions)', () => {
    const k1 = buildUserScopeWatchKey({
      id: 'u1',
      roleCode: 'LINE_MANAGER',
      departmentId: 'DEPT-IT',
      employeeId: 'NV-01',
    });
    const k2 = buildUserScopeWatchKey({
      id: 'u1',
      roleCode: 'LINE_MANAGER',
      departmentId: 'DEPT-SALES',
      employeeId: 'NV-01',
    });
    const k3 = buildUserScopeWatchKey({
      id: 'u1',
      roleCode: 'LINE_MANAGER',
      departmentId: null,
      employeeId: 'NV-01',
    });
    const k4 = buildUserScopeWatchKey({
      id: 'u1',
      roleCode: 'EMPLOYEE',
      departmentId: null,
      employeeId: 'NV-01',
    });

    assert.notEqual(k1, k2);
    assert.notEqual(k2, k3);
    assert.notEqual(k3, k4);
  });

  it('R35 & R36: AiCopilotDrawerModal.jsx renders verified, refused, and unverified badges and watches full scope key', () => {
    const modalSource = fs.readFileSync(
      path.join(__dirname, '../src/modals/analytics/AiCopilotDrawerModal.jsx'),
      'utf8'
    );
    assert.equal(modalSource.includes('data-testid="ai-msg-refused-badge"'), true);
    assert.equal(modalSource.includes('data-testid="ai-msg-verified-badge"'), true);
    assert.equal(modalSource.includes('data-testid="ai-msg-unverified-badge"'), true);
    assert.equal(modalSource.includes('buildBotMessageFromCopilotPayload'), true);
    assert.equal(modalSource.includes('buildUserScopeWatchKey'), true);
  });
});
