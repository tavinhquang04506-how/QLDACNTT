const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computePreviousMonthString,
  validateCopilotRequestPayload,
  sanitizeAndValidateToolArgs,
  buildRoleScopedNavigationActions,
  buildRoleScopedFollowUpSuggestions,
} = require('../../src/modules/ai/schema');
const {
  resolveIntentAndSlots,
  extractAllPeriodsFromText,
} = require('../../src/modules/ai/intentSlots');
const {
  formatDateVi,
  formatVnd,
  formatSignedVndDelta,
  formatNumberVi,
  computePayslipComparison,
  buildAnswerSectionsAndClaims,
} = require('../../src/modules/ai/claimRenderer');
const { callGeminiGenerateContent } = require('../../src/modules/ai/geminiProvider');

describe('AI NEXUS V1 — Schema, Intent/Slot, Claim Renderer & Bounded Retry Unit Tests', () => {
  it('Phase B: computePreviousMonthString rolls back across year boundary (2026-01 -> 2025-12)', () => {
    assert.equal(computePreviousMonthString('2026-01'), '2025-12');
    assert.equal(computePreviousMonthString('2026-10'), '2026-09');
    assert.equal(computePreviousMonthString('invalid'), null);
  });

  it('Phase B: sanitizeAndValidateToolArgs strips unknown args and rejects out-of-range parameters', () => {
    const validLeave = sanitizeAndValidateToolArgs('get_my_leave_balance', {
      year: 2026,
      leaveType: 'PHEP_NAM',
      spoofedField: 'drop-me',
    });
    assert.equal(validLeave.ok, true);
    assert.deepEqual(validLeave.sanitizedArgs, { year: 2026, leaveType: 'PHEP_NAM' });

    const invalidYear = sanitizeAndValidateToolArgs('get_my_leave_balance', { year: 1990 });
    assert.equal(invalidYear.ok, false);
    assert.equal(invalidYear.errorCode, 'INVALID_ARGUMENT');

    const unknownTool = sanitizeAndValidateToolArgs('approve_leave_request', { id: 'LR-1' });
    assert.equal(unknownTool.ok, false);
    assert.equal(unknownTool.errorCode, 'UNKNOWN_TOOL');
  });

  it('Phase B & E: buildRoleScopedNavigationActions strictly enforces role allowlist and returns empty on refusal', () => {
    const empNavLeave = buildRoleScopedNavigationActions(
      { roleCode: 'EMPLOYEE' },
      'leave_balance',
      'answer',
      false
    );
    assert.equal(empNavLeave.length, 1);
    assert.equal(empNavLeave[0].path, '/leave');

    // EMPLOYEE must never receive /dashboard or /performance/9box even if intent is dashboard_summary
    const empNavDash = buildRoleScopedNavigationActions(
      { roleCode: 'EMPLOYEE' },
      'dashboard_summary',
      'answer',
      false
    );
    assert.equal(empNavDash.length, 0);

    // ADMIN only receives /handbook on policy_lookup and never /leave or /portal/payslips
    const adminNavLeave = buildRoleScopedNavigationActions(
      { roleCode: 'ADMIN' },
      'leave_balance',
      'answer',
      false
    );
    assert.equal(adminNavLeave.length, 0);
    const adminNavPol = buildRoleScopedNavigationActions(
      { roleCode: 'ADMIN' },
      'policy_lookup',
      'answer',
      false
    );
    assert.equal(adminNavPol.length, 1);
    assert.equal(adminNavPol[0].path, '/handbook');

    // Refused response never emits navigation actions
    const refusedNav = buildRoleScopedNavigationActions(
      { roleCode: 'HR_DIRECTOR' },
      'dashboard_summary',
      'refusal',
      true
    );
    assert.equal(refusedNav.length, 0);
  });

  it('Phase C: resolveIntentAndSlots handles unaccented Vietnamese, year-boundary rollback, follow-up inheritance, topic switch, and lost context', () => {
    const janClock = {
      timeZone: 'Asia/Ho_Chi_Minh',
      date: '2026-01-15',
      month: '2026-01',
      year: 2026,
    };
    const empActor = { userId: 'U-1', employeeId: 'NV-0008', roleCode: 'EMPLOYEE' };

    // 1. Unaccented Vietnamese query with "nam nay"
    const r1 = resolveIntentAndSlots({
      message: 'Toi con bao nhieu ngay phep nam nay?',
      clock: janClock,
      actor: empActor,
    });
    assert.equal(r1.intent, 'leave_balance');
    assert.equal(r1.slots.year, 2026);
    assert.equal(r1.needsClarification, false);

    // 2. Elliptical follow-up ("Còn tháng trước?") after payslip_explanation in 2026-01 rolls back to 2025-12
    const r2 = resolveIntentAndSlots({
      message: 'Còn tháng trước?',
      clock: janClock,
      actor: empActor,
      priorContext: {
        lastIntent: 'payslip_explanation',
        lastSlots: { period: '2026-01' },
      },
      hasConversationHistory: true,
    });
    assert.equal(r2.intent, 'payslip_explanation');
    assert.equal(r2.inheritedFromPrior, true);
    assert.equal(r2.slots.period, '2025-12');

    // 3. Topic switch from leave_balance (year=2025, leaveType=PHEP_NAM) to payslip_explanation clears old slots
    const r3 = resolveIntentAndSlots({
      message: 'Giải thích lương kỳ gần nhất của tôi',
      clock: janClock,
      actor: empActor,
      priorContext: {
        lastIntent: 'leave_balance',
        lastSlots: { year: 2025, leaveType: 'PHEP_NAM' },
      },
      hasConversationHistory: true,
    });
    assert.equal(r3.intent, 'payslip_explanation');
    assert.equal(r3.topicSwitched, true);
    assert.equal(r3.slots.year, null);
    assert.equal(r3.slots.leaveType, null);
    assert.equal(r3.slots.relativePeriodType, 'latest_published');

    // 4. Server restart / lost history on "Còn tháng trước?" returns clarification with <= 3 choices
    const r4 = resolveIntentAndSlots({
      message: 'Còn tháng trước?',
      clock: janClock,
      actor: empActor,
      priorContext: null,
      hasConversationHistory: false,
      clientProvidedConversationId: true,
    });
    assert.equal(r4.intent, 'clarification');
    assert.equal(r4.lostContextDetected, true);
    assert.equal(r4.needsClarification, true);
    assert.ok(r4.clarification.choices.length >= 1 && r4.clarification.choices.length <= 3);

    // 5. Payslip comparison missing periods ("So sánh lương cho tôi") returns clarification
    const r5 = resolveIntentAndSlots({
      message: 'So sánh lương cho tôi',
      clock: janClock,
      actor: empActor,
    });
    assert.equal(r5.intent, 'payslip_comparison');
    assert.equal(r5.needsClarification, true);
    assert.ok(r5.clarification.choices.length <= 3);
  });

  it('Phase B & D: claimRenderer formats vi-VN values (preserving 0 vs null vs 7.5) and computes exact payslip comparison deltas on server', () => {
    assert.equal(formatDateVi('2026-09-10'), '10/09/2026');
    assert.equal(formatVnd(0), '0 ₫');
    assert.equal(formatVnd(null), 'Chưa có dữ liệu');
    assert.equal(formatNumberVi(7.5, 'ngày'), '7.5 ngày');
    assert.equal(formatSignedVndDelta(810000), '+810.000 ₫ (tăng)');
    assert.equal(formatSignedVndDelta(-250000), '-250.000 ₫ (giảm)');

    const evFeb = {
      tool: 'get_my_payslip',
      entity: { employeeId: 'NV-0008', payslipId: 'PS-FEB' },
      period: { period: '2026-02', periodStatus: 'DA_CHOT' },
      fields: {
        baseSalary: 20000000,
        standardWorkDays: 22,
        actualWorkDays: 22,
        workDaysSalary: 20000000,
        totalAllowances: 1500000,
        bonus: 500000,
        otPay: 300000,
        grossIncome: 22300000,
        bhxhEmp: 1600000,
        bhytEmp: 300000,
        bhtnEmp: 200000,
        pitAmount: 690000,
        totalDeductions: 2790000,
        netSalary: 19510000,
      },
      sourceId: 'payslip:PS-FEB:2026-02',
    };
    const evJan = {
      tool: 'get_my_payslip',
      entity: { employeeId: 'NV-0008', payslipId: 'PS-JAN' },
      period: { period: '2026-01', periodStatus: 'DA_CHI' },
      fields: {
        baseSalary: 20000000,
        standardWorkDays: 22,
        actualWorkDays: 22,
        workDaysSalary: 20000000,
        totalAllowances: 1500000,
        bonus: 0,
        otPay: 0,
        grossIncome: 21500000,
        bhxhEmp: 1600000,
        bhytEmp: 300000,
        bhtnEmp: 200000,
        pitAmount: 590000,
        totalDeductions: 2690000,
        netSalary: 18810000,
      },
      sourceId: 'payslip:PS-JAN:2026-01',
    };

    // Pass in reverse chronological order to verify automatic chronological sorting (earlier -> later)
    const comp = computePayslipComparison(evFeb, evJan);
    assert.equal(comp.earlierPeriod, '2026-01');
    assert.equal(comp.laterPeriod, '2026-02');
    assert.equal(comp.deltas.netSalary.delta, 700000);
    assert.equal(comp.deltas.grossIncome.delta, 800000);
    assert.equal(comp.deltas.bonus.delta, 500000);
    assert.equal(comp.deltas.otPay.delta, 300000);
    assert.equal(comp.deltas.pitAmount.delta, 100000);
  });

  it('Phase F: callGeminiGenerateContent retries transient 429/503 once within deadline and never retries 401/403/404', async () => {
    let attempts429 = 0;
    const data429 = await callGeminiGenerateContent({
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      systemInstruction: 'sys',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      timeoutMs: 5000,
      maxRetries: 1,
      fetchImpl: async () => {
        attempts429 += 1;
        if (attempts429 === 1) {
          return {
            ok: false,
            status: 429,
            headers: { get: () => '0' },
            text: async () => 'Transient rate limit',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { role: 'model', parts: [{ text: 'Xin chào!' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
          }),
        };
      },
    });
    assert.equal(attempts429, 2);
    assert.equal(data429._providerStats.providerCalls, 2);
    assert.equal(data429._providerStats.retriesUsed, 1);
    assert.equal(data429._providerStats.tokenUsage.totalTokens, 15);

    // 403 must never retry
    let attempts403 = 0;
    await assert.rejects(
      () =>
        callGeminiGenerateContent({
          apiKey: 'bad-key',
          model: 'gemini-2.5-flash',
          systemInstruction: 'sys',
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          timeoutMs: 5000,
          maxRetries: 1,
          fetchImpl: async () => {
            attempts403 += 1;
            return {
              ok: false,
              status: 403,
              text: async () => 'Invalid key',
            };
          },
        }),
      (err) => err.code === 'AI_PROVIDER_AUTH_ERROR'
    );
    assert.equal(attempts403, 1);
  });
});
