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
  renderNaturalVerifiedAnswer,
} = require('../../src/modules/ai/claimRenderer');
const { callGeminiGenerateContent } = require('../../src/modules/ai/geminiProvider');
const { validateLiveEvalDatabaseEnvironment } = require('../../scripts/run-ai-v1-live-eval');

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

  it('AI-V1-F02: resolveIntentAndSlots does not guess calendar [prevMonth, currentMonth] for "hai kỳ gần nhất" and resolves DB publishedPeriods when provided', () => {
    const octClock = {
      timeZone: 'Asia/Ho_Chi_Minh',
      date: '2026-10-20',
      month: '2026-10',
      year: 2026,
    };
    const empActor = { userId: 'U-1', employeeId: 'NV-0008', roleCode: 'EMPLOYEE' };

    // Pure call without DB periods: keeps relativePeriodType='latest_two_published' and leaves comparisonPeriods=[] (never ['2026-09','2026-10'])
    const pureRes = resolveIntentAndSlots({
      message: 'So sánh lương hai kỳ gần nhất',
      clock: octClock,
      actor: empActor,
    });
    assert.equal(pureRes.intent, 'payslip_comparison');
    assert.equal(pureRes.slots.relativePeriodType, 'latest_two_published');
    assert.deepEqual(pureRes.slots.comparisonPeriods, []);
    assert.equal(pureRes.needsClarification, false);

    // With DB-resolved publishedPeriods (e.g. non-consecutive ['2026-08', '2026-06'] while 2026-10 is draft)
    const dbResolvedRes = resolveIntentAndSlots({
      message: 'So sánh lương hai kỳ gần nhất',
      clock: octClock,
      actor: empActor,
      publishedPeriods: ['2026-08', '2026-06'],
    });
    assert.equal(dbResolvedRes.intent, 'payslip_comparison');
    assert.equal(dbResolvedRes.slots.relativePeriodType, 'latest_two_published');
    assert.deepEqual(dbResolvedRes.slots.comparisonPeriods, ['2026-08', '2026-06']);

    // Explicit calendar request "So sánh lương tháng này và tháng trước" preserves ['2026-09', '2026-10']
    const explicitCalendarRes = resolveIntentAndSlots({
      message: 'So sánh lương tháng này và tháng trước',
      clock: octClock,
      actor: empActor,
    });
    assert.equal(explicitCalendarRes.intent, 'payslip_comparison');
    assert.equal(explicitCalendarRes.slots.relativePeriodType, 'current_and_previous_month');
    assert.deepEqual(explicitCalendarRes.slots.comparisonPeriods, ['2026-09', '2026-10']);

    // Follow-up "Còn kỳ trước?" after "Giải thích lương kỳ gần nhất" (where latest published was 2026-08 and previous published was 2026-06)
    const followUpAfterLatest = resolveIntentAndSlots({
      message: 'Còn tháng trước?',
      clock: octClock,
      actor: empActor,
      priorContext: {
        lastIntent: 'payslip_explanation',
        lastSlots: { period: null, relativePeriodType: 'latest_published' },
      },
      hasConversationHistory: true,
      publishedPeriods: ['2026-08', '2026-06'],
    });
    assert.equal(followUpAfterLatest.intent, 'payslip_explanation');
    assert.equal(followUpAfterLatest.slots.period, '2026-06');
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

  it('AI-V1-F03: computePayslipComparison preserves null/undefined as unavailable (never 0), keeps true 0 values, and rejects invalid/unpublished/mismatched pairs', () => {
    const evEarlier = {
      tool: 'get_my_payslip',
      entity: { employeeId: 'NV-0008', payslipId: 'PS-06' },
      period: { period: '2026-06', periodStatus: 'DA_CHUYEN_KHOAN' },
      fields: {
        baseSalary: 20000000,
        totalAllowances: 1500000,
        bonus: 0,
        otPay: 0,
        grossIncome: 21500000,
        bhxhEmp: 1600000,
        bhytEmp: 300000,
        bhtnEmp: 200000,
        pitAmount: null, // missing on one side
        totalDeductions: 2690000,
        netSalary: null, // missing on both sides (repro from review 19)
      },
      sourceId: 'payslip:PS-06',
    };
    const evLater = {
      tool: 'get_my_payslip',
      entity: { employeeId: 'NV-0008', payslipId: 'PS-08' },
      period: { period: '2026-08', periodStatus: 'DA_CHOT' },
      fields: {
        baseSalary: 20000000,
        totalAllowances: 1500000,
        bonus: 0,
        otPay: 800000,
        grossIncome: 22300000,
        bhxhEmp: 1600000,
        bhytEmp: 300000,
        bhtnEmp: 200000,
        pitAmount: 690000,
        totalDeductions: 2790000,
        netSalary: null,
      },
      sourceId: 'payslip:PS-08',
    };

    const comp = computePayslipComparison(evEarlier, evLater);
    assert.ok(comp);
    // netSalary is null on both -> unavailable=true, earlierValue=null, laterValue=null, delta=null (never 0!)
    assert.equal(comp.deltas.netSalary.earlierValue, null);
    assert.equal(comp.deltas.netSalary.laterValue, null);
    assert.equal(comp.deltas.netSalary.delta, null);
    assert.equal(comp.deltas.netSalary.available, false);
    assert.equal(comp.deltas.netSalary.unavailable, true);

    // pitAmount is null on one side -> unavailable=true, earlierValue=null, laterValue=690000, delta=null
    assert.equal(comp.deltas.pitAmount.earlierValue, null);
    assert.equal(comp.deltas.pitAmount.laterValue, 690000);
    assert.equal(comp.deltas.pitAmount.delta, null);
    assert.equal(comp.deltas.pitAmount.available, false);
    assert.equal(comp.deltas.pitAmount.unavailable, true);

    // True 0 values still compute exact deltas
    assert.equal(comp.deltas.bonus.earlierValue, 0);
    assert.equal(comp.deltas.bonus.laterValue, 0);
    assert.equal(comp.deltas.bonus.delta, 0);
    assert.equal(comp.deltas.bonus.available, true);
    assert.equal(comp.deltas.otPay.earlierValue, 0);
    assert.equal(comp.deltas.otPay.laterValue, 800000);
    assert.equal(comp.deltas.otPay.delta, 800000);
    assert.equal(comp.deltas.otPay.available, true);

    // No calculationClaims or changedComponents for unavailable fields, and no NaN anywhere
    assert.equal(comp.calculationClaims.some((c) => c.metric === 'netSalaryDelta'), false);
    assert.equal(comp.calculationClaims.some((c) => c.metric === 'pitAmountDelta'), false);
    assert.equal(comp.changedComponents.some((c) => c.key === 'netSalary' || c.key === 'pitAmount'), false);
    assert.equal(JSON.stringify(comp).includes('NaN'), false);

    // Section & answer rendering states "Chưa đủ dữ liệu đối chiếu" / "chưa đủ dữ liệu để tính chênh lệch"
    const rendered = buildAnswerSectionsAndClaims({
      intent: 'payslip_comparison',
      structuredEvidence: [evEarlier, evLater],
      sources: [
        { id: 'payslip:PS-06', title: 'Phiếu lương 2026-06' },
        { id: 'payslip:PS-08', title: 'Phiếu lương 2026-08' },
      ],
    });
    const compSec = rendered.answerSections.find((s) => s.type === 'comparison');
    assert.ok(compSec);
    assert.match(compSec.text, /Chưa đủ dữ liệu đối chiếu/);
    assert.equal(compSec.text.includes('NaN'), false);
    const naturalText = renderNaturalVerifiedAnswer('So sánh lương hai kỳ gần nhất', [evEarlier, evLater], []);
    assert.match(naturalText, /chưa đủ dữ liệu để tính chênh lệch/);

    // Rejects mismatched employeeId, duplicate period, or unpublished periodStatus
    assert.equal(
      computePayslipComparison(evEarlier, { ...evLater, entity: { employeeId: 'NV-OTHER' } }),
      null
    );
    assert.equal(
      computePayslipComparison(evEarlier, { ...evLater, period: { period: '2026-06', periodStatus: 'DA_CHOT' } }),
      null
    );
    assert.equal(
      computePayslipComparison(evEarlier, { ...evLater, period: { period: '2026-08', periodStatus: 'DU_THAO' } }),
      null
    );
  });

  it('AI-V1-F01: validateLiveEvalDatabaseEnvironment rejects non-test DB_NAME, DB_NAME_TEST, DATABASE_URL, or NODE_ENV before any DB query', () => {
    assert.throws(
      () => validateLiveEvalDatabaseEnvironment({ DB_NAME: 'nexus_hrms' }),
      (err) => err.code === 'TEST_DB_GUARD_FORBIDDEN'
    );
    assert.throws(
      () => validateLiveEvalDatabaseEnvironment({ DB_NAME_TEST: 'nexus_hrms' }),
      (err) => err.code === 'TEST_DB_GUARD_FORBIDDEN'
    );
    assert.throws(
      () => validateLiveEvalDatabaseEnvironment({ DATABASE_URL: 'postgres://postgres:pass@localhost:5432/nexus_hrms' }),
      (err) => err.code === 'TEST_DB_GUARD_FORBIDDEN'
    );
    assert.throws(
      () => validateLiveEvalDatabaseEnvironment({ NODE_ENV: 'production', DB_NAME_TEST: 'nexus_hrms_test' }),
      (err) => err.code === 'TEST_DB_GUARD_FORBIDDEN'
    );
    assert.equal(
      validateLiveEvalDatabaseEnvironment({ NODE_ENV: 'test', DB_NAME_TEST: 'nexus_hrms_test' }),
      true
    );
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
