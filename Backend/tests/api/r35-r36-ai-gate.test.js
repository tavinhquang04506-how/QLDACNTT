const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { callWith, loginUser, closeDb } = require('../helpers/api');
const { employeeSession } = require('../helpers/sessions');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const aiService = require('../../src/modules/ai/service');

function createToolCallingTransport(toolName, toolArgs, summarizeFn, capturedCalls = []) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    capturedCalls.push({ url, headers: init.headers, body });

    const lastContent = body.contents[body.contents.length - 1];
    const fnRespPart = lastContent?.parts?.find((p) => p.functionResponse);

    if (!fnRespPart) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: toolName, args: toolArgs } }],
              },
            },
          ],
        }),
      };
    }

    const toolResult = fnRespPart.functionResponse.response.result;
    const text = summarizeFn(toolResult);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text }],
            },
          },
        ],
      }),
    };
  };
}

describe('R35 & R36 AI Gate Verification (12-REVIEW-fe918e1-AI-GATE)', () => {
  let empSession;
  let mgrSession;
  let otherEmpSession;
  let secondEmp;
  let leaveTypeAlId;

  before(async () => {
    const { rows: dbRows } = await db.query('SELECT current_database() AS db_name');
    assert.equal(dbRows[0].db_name, 'nexus_hrms_test');

    empSession = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
    mgrSession = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
    otherEmpSession = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-HR' });
    secondEmp = await createTestEmployee({ departmentId: 'DEPT-SALES' });

    const { rows: ltRows } = await db.query("SELECT id FROM leave_types WHERE code = 'PHEP_NAM' LIMIT 1");
    leaveTypeAlId = ltRows[0]?.id || 'LT-AL';
  });

  beforeEach(() => {
    aiService.clearAiRuntimeState();
    app.locals.aiTestOptions = undefined;
  });

  after(async () => {
    app.locals.aiTestOptions = undefined;
    await db.query("DELETE FROM payroll_periods WHERE period IN ('2027-08')");
    await deleteTestUsers();
    await deleteTestEmployees();
    await closeDb();
  });

  it('R35: blocks ungrounded claims across English, unaccented Vietnamese, written number words, and enforces structured field/entity/period semantics', async () => {
    const throwingExecutor = {
      query: async () => {
        throw new Error('DB executor must not be called when model skips tools');
      },
    };

    // 1. Exact reproduction 1 from 12-REVIEW-fe918e1: English query + English ungrounded claim without tools
    const reproEn = await aiService.runCopilot({
      actor: {
        userId: empSession.user.id,
        employeeId: empSession.employeeId,
        roleCode: 'EMPLOYEE',
        departmentId: 'DEPT-IT',
      },
      message: 'How many vacation days do I have?',
      executor: throwingExecutor,
      options: {
        apiKey: 'test-key-r35',
        model: 'gemini-2.5-flash',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { role: 'model', parts: [{ text: 'You have 99 days available.' }] } }],
          }),
        }),
      },
    });
    assert.equal(reproEn.verified, false);
    assert.equal(reproEn.refused, true);
    assert.ok(reproEn.refusalCodes.includes('UNGROUNDED_ANSWER_REJECTED'));
    assert.equal(reproEn.toolsUsed.length, 0);
    assert.equal(reproEn.sources.length, 0);
    assert.equal(reproEn.answer.includes('99'), false);

    // 2. Exact reproduction 2 from 12-REVIEW-fe918e1: Unaccented Vietnamese + written number words ("chin muoi chin")
    const reproViNoAccent = await aiService.runCopilot({
      actor: {
        userId: empSession.user.id,
        employeeId: empSession.employeeId,
        roleCode: 'EMPLOYEE',
        departmentId: 'DEPT-IT',
      },
      message: 'Toi con bao nhieu ngay phep?',
      executor: throwingExecutor,
      options: {
        apiKey: 'test-key-r35',
        model: 'gemini-2.5-flash',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { role: 'model', parts: [{ text: 'Ban con chin muoi chin ngay.' }] } }],
          }),
        }),
      },
    });
    assert.equal(reproViNoAccent.verified, false);
    assert.equal(reproViNoAccent.refused, true);
    assert.ok(reproViNoAccent.refusalCodes.includes('UNGROUNDED_ANSWER_REJECTED'));
    assert.equal(reproViNoAccent.toolsUsed.length, 0);
    assert.equal(reproViNoAccent.sources.length, 0);
    assert.equal(reproViNoAccent.answer.toLowerCase().includes('chin muoi chin'), false);

    // 3. Additional paraphrased / English / written-number ungrounded claims via HTTP route POST /api/ai/copilot
    const ungroundedCases = [
      {
        msg: 'Could you check my net salary for this month?',
        reply: 'Your net salary is twenty five million VND.',
        forbiddenToken: 'twenty five',
      },
      {
        msg: 'Don xin nghi cua toi da duoc duyet chua?',
        reply: 'Don cua ban da duoc phe duyet.',
        forbiddenToken: 'da duoc phe duyet',
      },
      {
        msg: 'Cho hỏi phép năm của mình',
        reply: 'Bạn còn mười lăm ngày phép.',
        forbiddenToken: 'mười lăm',
      },
      {
        msg: 'What is my current PTO status?',
        reply: 'Everything is approved and you have twelve days left.',
        forbiddenToken: 'twelve',
      },
    ];

    for (const uc of ungroundedCases) {
      aiService.clearAiRuntimeState();
      app.locals.aiTestOptions = {
        apiKey: 'test-key-r35',
        model: 'gemini-2.5-flash',
        requestsPerMinute: 100,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { role: 'model', parts: [{ text: uc.reply }] } }],
          }),
        }),
      };
      const res = await callWith(empSession.token, 'post', '/api/ai/copilot', {
        message: uc.msg,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.verified, false);
      assert.equal(res.body.refused, true);
      assert.ok(res.body.refusalCodes.includes('UNGROUNDED_ANSWER_REJECTED'));
      assert.equal(res.body.answer.toLowerCase().includes(uc.forbiddenToken), false);
    }

    // 4. Pure greetings and pure clarification questions without tools still work normally
    app.locals.aiTestOptions = {
      apiKey: 'test-key-r35',
      model: 'gemini-2.5-flash',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Xin chào! Tôi là Trợ lý Nhân sự NEXUS. Bạn cần tra cứu thông tin gì hôm nay?' }],
              },
            },
          ],
        }),
      }),
    };
    const greetRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
      message: 'Hello trợ lý!',
    });
    assert.equal(greetRes.status, 200);
    assert.equal(greetRes.body.refused, false);
    assert.equal(greetRes.body.verified, false);
    assert.deepEqual(greetRes.body.refusalCodes, []);

    app.locals.aiTestOptions = {
      apiKey: 'test-key-r35',
      model: 'gemini-2.5-flash',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Bạn muốn tra cứu phiếu lương của kỳ nào (YYYY-MM) hay quỹ phép của năm nào?' }],
              },
            },
          ],
        }),
      }),
    };
    const clarifyRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
      message: 'Tra cứu giúp tôi',
    });
    assert.equal(clarifyRes.status, 200);
    assert.equal(clarifyRes.body.refused, false);
    assert.equal(clarifyRes.body.verified, false);
    assert.deepEqual(clarifyRes.body.refusalCodes, []);

    // 5. Semantic field mismatch tests when tool IS called:
    // Setup leave balance: year=2026, total_days (entitlement)=12, used_days=7, remaining_days=5, pending=2, available=3
    await db.query(
      `INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
       VALUES ($1, $2, 2026, 12, 7)
       ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE SET total_days = 12, used_days = 7`,
      [empSession.employeeId, leaveTypeAlId]
    );
    await db.query(
      `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
       VALUES ('LR-R35-PEND', $1, $2, '2026-12-01', '2026-12-02', 2, 'Việc riêng', 'CHO_TRUONG_PHONG_DUYET')
       ON CONFLICT (id) DO UPDATE SET total_days = 2, stage = 'CHO_TRUONG_PHONG_DUYET'`,
      [empSession.employeeId, leaveTypeAlId]
    );

    const semanticMismatchReplies = [
      // Swapping total_days (12) into remaining (5)
      'Năm 2026 bạn còn lại 12 ngày phép (tổng định mức 12 ngày, đã dùng 7 ngày).',
      // Unaccented Vietnamese with written number word ("muoi hai" = 12) for remaining
      'Nam 2026 ban con lai muoi hai ngay phep.',
      // English swapping total_days (12) into remaining (5)
      'In 2026 you have twelve days remaining.',
      // Swapping remaining (5) into used (7)
      'Năm 2026 bạn còn lại 5 ngày phép và đã dùng 5 ngày.',
      // Swapping remaining (5) into available (3)
      'Năm 2026 bạn còn lại 5 ngày phép, số ngày khả dụng là 5 ngày.',
      // Swapping year (2026) into remaining (5)
      'Số dư phép còn lại của bạn là 2026 ngày.',
      // Answering a "remaining" question with only total entitlement (12)
      'Tổng định mức phép năm 2026 của bạn là 12 ngày.',
    ];

    for (const badReply of semanticMismatchReplies) {
      aiService.clearAiRuntimeState();
      app.locals.aiTestOptions = {
        apiKey: 'test-key-r35',
        model: 'gemini-2.5-flash',
        requestsPerMinute: 100,
        fetchImpl: createToolCallingTransport(
          'get_my_leave_balance',
          { year: 2026, leaveType: 'PHEP_NAM' },
          () => badReply
        ),
      };
      const badRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
        message: 'Tôi còn bao nhiêu ngày phép năm 2026?',
      });
      assert.equal(badRes.status, 200);
      assert.equal(badRes.body.verified, false, `Expected verified=false for reply: ${badReply}`);
      assert.equal(badRes.body.refused, true, `Expected refused=true for reply: ${badReply}`);
      assert.ok(
        badRes.body.refusalCodes.includes('ANSWER_SOURCE_MISMATCH'),
        `Expected ANSWER_SOURCE_MISMATCH for reply: ${badReply}`
      );
      assert.equal(badRes.body.sources.length, 0);
    }

    // 6. Payslip semantic field/period/entity mismatch tests (swapping grossIncome 21.5M into netSalary 18.81M)
    const { rows: ppRows } = await db.query(
      `INSERT INTO payroll_periods (period, status) VALUES ('2027-08', 'DA_CHOT')
       ON CONFLICT (period) DO UPDATE SET status = 'DA_CHOT' RETURNING id`
    );
    await db.query(
      `INSERT INTO payslips (
         period_id, employee_id, base_salary, standard_work_days, actual_work_days,
         allowances, ot_pay, gross_income,
         bhxh_amount, bhyt_amount, bhtn_amount, pit_taxable, pit_deduction,
         pit_amount, total_deductions, net_salary, status
       ) VALUES ($1, $2, 20000000, 22, 22, 1500000, 0, 21500000, 1600000, 300000, 200000, 8400000, 11000000, 590000, 2690000, 18810000, 'DA_CHOT')
       ON CONFLICT (period_id, employee_id) DO NOTHING`,
      [ppRows[0].id, empSession.employeeId]
    );

    const badPayslipReplies = [
      // Swapping Gross (21,500,000) into Net (18,810,000)
      'Kỳ lương 2027-08: lương thực lĩnh của bạn là 21.500.000 đồng.',
      // Claiming wrong period (2027-09) when tool returned 2027-08
      'Kỳ lương 2027-09: lương thực lĩnh của bạn là 18.810.000 đồng.',
      // Claiming wrong employee ID
      `Phiếu lương của ${otherEmpSession.employeeId} kỳ 2027-08 có thực lĩnh 18.810.000 đồng.`,
    ];

    for (const badPayReply of badPayslipReplies) {
      aiService.clearAiRuntimeState();
      app.locals.aiTestOptions = {
        apiKey: 'test-key-r35',
        model: 'gemini-2.5-flash',
        requestsPerMinute: 100,
        fetchImpl: createToolCallingTransport(
          'get_my_payslip',
          { period: '2027-08' },
          () => badPayReply
        ),
      };
      const badPayRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
        message: 'Lương thực lĩnh kỳ 2027-08 của tôi là bao nhiêu?',
      });
      assert.equal(badPayRes.status, 200);
      assert.equal(badPayRes.body.verified, false);
      assert.equal(badPayRes.body.refused, true);
      assert.ok(badPayRes.body.refusalCodes.includes('ANSWER_SOURCE_MISMATCH'));
    }

    // 7. Accurate grounded response with correct field bindings, period, and sources succeeds with verified=true
    aiService.clearAiRuntimeState();
    app.locals.aiTestOptions = {
      apiKey: 'test-key-r35',
      model: 'gemini-2.5-flash',
      requestsPerMinute: 100,
      fetchImpl: createToolCallingTransport(
        'get_my_leave_balance',
        { year: 2026, leaveType: 'PHEP_NAM' },
        (res) => {
          const al = res.balances.find((b) => b.leaveTypeCode === 'PHEP_NAM');
          return `Năm ${res.year}: tổng định mức ${al.entitlement} ngày, đã dùng ${al.used} ngày, còn lại ${al.remaining} ngày (đang chờ duyệt ${al.pending} ngày, khả dụng ${al.available} ngày).`;
        }
      ),
    };
    const validLeaveRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
      message: 'Tôi còn bao nhiêu ngày phép năm 2026?',
    });
    assert.equal(validLeaveRes.status, 200);
    assert.equal(validLeaveRes.body.verified, true);
    assert.equal(validLeaveRes.body.refused, false);
    assert.deepEqual(validLeaveRes.body.refusalCodes, []);
    assert.ok(validLeaveRes.body.sources.some((s) => s.id === `leave-balance:${empSession.employeeId}:2026`));
    assert.equal(validLeaveRes.body.structuredEvidence.length, 1);
    assert.equal(validLeaveRes.body.structuredEvidence[0].period.year, 2026);
    assert.equal(validLeaveRes.body.structuredEvidence[0].fields.balances[0].remaining, 5);
    assert.equal(validLeaveRes.body.structuredEvidence[0].fields.balances[0].available, 3);

    await db.query(`DELETE FROM leave_requests WHERE id = 'LR-R35-PEND'`);
  });

  it('R36: re-verifies DB scope and account status before issuing response and discards in-flight answers when department, role, employee binding, or active state changes', async () => {
    // Helper to run an in-flight request paused inside the mock provider while a DB mutation occurs
    async function runBarrierMutationScenario({
      token,
      conversationId,
      mutateDbWhileInFlight,
      concurrentRequestWhileInFlight = null,
    }) {
      let notifyProviderEntered;
      const providerEntered = new Promise((resolve) => {
        notifyProviderEntered = resolve;
      });
      let releaseProviderBarrier;
      const providerBarrier = new Promise((resolve) => {
        releaseProviderBarrier = resolve;
      });

      let callIndex = 0;
      app.locals.aiTestOptions = {
        apiKey: 'test-key-r36',
        model: 'gemini-2.5-flash',
        fetchImpl: async () => {
          callIndex += 1;
          if (callIndex === 1) {
            notifyProviderEntered();
            await providerBarrier;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      role: 'model',
                      parts: [{ text: 'Xin chào! Đây là nội dung theo phạm vi cũ trước khi đổi quyền.' }],
                    },
                  },
                ],
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [{ text: 'Xin chào từ phạm vi mới!' }],
                  },
                },
              ],
            }),
          };
        },
      };

      const reqAPromise = callWith(token, 'post', '/api/ai/copilot', {
        message: 'Xin chào trợ lý',
        conversationId,
      }).then((r) => r);

      await providerEntered;
      await mutateDbWhileInFlight();

      let reqBResult = null;
      if (concurrentRequestWhileInFlight) {
        reqBResult = await concurrentRequestWhileInFlight();
      }

      releaseProviderBarrier();
      const reqAResult = await reqAPromise;
      return { reqAResult, reqBResult };
    }

    // 1. Department changes DEPT-IT -> NULL while Request A is waiting on provider (NO second AI request)
    await db.query(`UPDATE employees SET department_id = 'DEPT-IT' WHERE id = $1`, [mgrSession.employeeId]);
    await db.query(`UPDATE users SET employee_id = $1, role_code = 'LINE_MANAGER', is_active = TRUE WHERE id = $2`, [
      mgrSession.employeeId,
      mgrSession.user.id,
    ]);

    const { reqAResult: deptNullRes } = await runBarrierMutationScenario({
      token: mgrSession.token,
      conversationId: 'conv-r36-dept-null',
      mutateDbWhileInFlight: async () => {
        await db.query(`UPDATE employees SET department_id = NULL WHERE id = $1`, [mgrSession.employeeId]);
      },
    });
    assert.equal(deptNullRes.status, 200);
    assert.equal(deptNullRes.body.verified, false);
    assert.equal(deptNullRes.body.refused, true);
    assert.equal(deptNullRes.body.scopeChangedDuringRequest, true);
    assert.ok(deptNullRes.body.refusalCodes.includes('SCOPE_CHANGED_DURING_REQUEST'));
    assert.equal(deptNullRes.body.answer.includes('nội dung theo phạm vi cũ'), false);

    // Ownership of conv-r36-dept-null must still belong to mgrSession.user.id (other user gets 403)
    const crossOwnerCheck = await callWith(empSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào',
      conversationId: 'conv-r36-dept-null',
    });
    assert.equal(crossOwnerCheck.status, 403);
    assert.equal(crossOwnerCheck.body.code, 'FORBIDDEN_CONVERSATION');

    // 2. Department changes NULL -> DEPT-SALES while Request A is waiting on provider
    const { reqAResult: deptSalesRes } = await runBarrierMutationScenario({
      token: mgrSession.token,
      conversationId: 'conv-r36-dept-sales',
      mutateDbWhileInFlight: async () => {
        await db.query(`UPDATE employees SET department_id = 'DEPT-SALES' WHERE id = $1`, [mgrSession.employeeId]);
      },
    });
    assert.equal(deptSalesRes.status, 200);
    assert.equal(deptSalesRes.body.verified, false);
    assert.equal(deptSalesRes.body.refused, true);
    assert.ok(deptSalesRes.body.refusalCodes.includes('SCOPE_CHANGED_DURING_REQUEST'));
    assert.equal(deptSalesRes.body.answer.includes('nội dung theo phạm vi cũ'), false);

    // 3. Role changes LINE_MANAGER -> EMPLOYEE while Request A is waiting on provider
    const { reqAResult: roleDowngradeRes } = await runBarrierMutationScenario({
      token: mgrSession.token,
      conversationId: 'conv-r36-role-downgrade',
      mutateDbWhileInFlight: async () => {
        await db.query(`UPDATE users SET role_code = 'EMPLOYEE' WHERE id = $1`, [mgrSession.user.id]);
      },
    });
    assert.equal(roleDowngradeRes.status, 200);
    assert.equal(roleDowngradeRes.body.refused, true);
    assert.ok(roleDowngradeRes.body.refusalCodes.includes('SCOPE_CHANGED_DURING_REQUEST'));
    assert.equal(roleDowngradeRes.body.answer.includes('nội dung theo phạm vi cũ'), false);

    // 4. Employee binding changes in DB while Request A is waiting on provider
    const { reqAResult: empRebindRes } = await runBarrierMutationScenario({
      token: mgrSession.token,
      conversationId: 'conv-r36-emp-rebind',
      mutateDbWhileInFlight: async () => {
        await db.query(`UPDATE users SET employee_id = $1 WHERE id = $2`, [
          secondEmp.id,
          mgrSession.user.id,
        ]);
      },
    });
    assert.equal(empRebindRes.status, 200);
    assert.equal(empRebindRes.body.refused, true);
    assert.ok(empRebindRes.body.refusalCodes.includes('SCOPE_CHANGED_DURING_REQUEST'));
    assert.equal(empRebindRes.body.answer.includes('nội dung theo phạm vi cũ'), false);

    // 5. Concurrent Request B runs under new scope while Request A is waiting on provider:
    // Request A must NOT return its stale answer to caller AND must NOT overwrite Request B's history
    await db.query(`UPDATE users SET employee_id = $1, role_code = 'LINE_MANAGER' WHERE id = $2`, [
      mgrSession.employeeId,
      mgrSession.user.id,
    ]);
    await db.query(`UPDATE employees SET department_id = 'DEPT-IT' WHERE id = $1`, [mgrSession.employeeId]);

    const { reqAResult: concARes, reqBResult: concBRes } = await runBarrierMutationScenario({
      token: mgrSession.token,
      conversationId: 'conv-r36-concurrent-b',
      mutateDbWhileInFlight: async () => {
        await db.query(`UPDATE employees SET department_id = 'DEPT-HR' WHERE id = $1`, [mgrSession.employeeId]);
      },
      concurrentRequestWhileInFlight: async () =>
        callWith(mgrSession.token, 'post', '/api/ai/copilot', {
          message: 'Xin chào từ Request B trong phòng HR',
          conversationId: 'conv-r36-concurrent-b',
        }),
    });
    assert.equal(concBRes.status, 200);
    assert.equal(concBRes.body.refused, false);
    assert.equal(concBRes.body.answer, 'Xin chào từ phạm vi mới!');

    assert.equal(concARes.status, 200);
    assert.equal(concARes.body.refused, true);
    assert.ok(concARes.body.refusalCodes.includes('SCOPE_CHANGED_DURING_REQUEST'));
    assert.equal(concARes.body.answer.includes('nội dung theo phạm vi cũ'), false);

    // 6. Account locked (is_active = FALSE) while Request A is waiting on provider -> fails closed (401)
    const { reqAResult: lockedRes } = await runBarrierMutationScenario({
      token: mgrSession.token,
      conversationId: 'conv-r36-locked',
      mutateDbWhileInFlight: async () => {
        await db.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [mgrSession.user.id]);
      },
    });
    assert.equal(lockedRes.status, 401);
    assert.equal(lockedRes.body.success, false);
    assert.equal(JSON.stringify(lockedRes.body).includes('nội dung theo phạm vi cũ'), false);

    // Restore mgrSession
    await db.query(`UPDATE users SET is_active = TRUE, employee_id = $1, role_code = 'LINE_MANAGER' WHERE id = $2`, [
      mgrSession.employeeId,
      mgrSession.user.id,
    ]);
    await db.query(`UPDATE employees SET department_id = 'DEPT-IT' WHERE id = $1`, [mgrSession.employeeId]);

    // 7. User row deleted in DB while Request A is waiting on provider -> fails closed (401)
    const tempEmp = await createTestEmployee({ departmentId: 'DEPT-IT' });
    const tempUser = await createTestUser({ role: 'EMPLOYEE', employeeId: tempEmp.id });
    const tempLogin = await loginUser(tempUser);

    const { reqAResult: deletedUserRes } = await runBarrierMutationScenario({
      token: tempLogin.accessToken,
      conversationId: 'conv-r36-deleted-user',
      mutateDbWhileInFlight: async () => {
        await db.query(`DELETE FROM users WHERE id = $1`, [tempUser.id]);
      },
    });
    assert.equal(deletedUserRes.status, 401);
    assert.equal(deletedUserRes.body.success, false);

    // 8. Same-scope normal request passes cleanly
    app.locals.aiTestOptions = {
      apiKey: 'test-key-r36',
      model: 'gemini-2.5-flash',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ text: 'Xin chào Trưởng phòng IT!' }] } }],
        }),
      }),
    };
    const sameScopeRes = await callWith(mgrSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào',
      conversationId: 'conv-r36-same-scope',
    });
    assert.equal(sameScopeRes.status, 200);
    assert.equal(sameScopeRes.body.refused, false);
    assert.equal(sameScopeRes.body.scopeChangedDuringRequest, false);
    assert.equal(sameScopeRes.body.answer, 'Xin chào Trưởng phòng IT!');
  });
});
