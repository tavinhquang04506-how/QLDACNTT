const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { call, callWith, loginUser, closeDb } = require('../helpers/api');
const { employeeSession } = require('../helpers/sessions');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { createProject, deleteTestProjects } = require('../helpers/projects');
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

describe('R31–R34 Independent Review Fixes Verification (9c25e85 Follow-up)', () => {
  let mgrSession;
  let secondEmp;
  let empSession;
  let kioskToken;
  let leaveTypeAlId;

  before(async () => {
    const { rows: dbRows } = await db.query('SELECT current_database() AS db_name');
    assert.equal(dbRows[0].db_name, 'nexus_hrms_test');

    mgrSession = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
    secondEmp = await createTestEmployee({ departmentId: 'DEPT-HR' });
    empSession = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });

    const kioskUser = await createTestUser({ role: 'KIOSK', employeeId: null });
    const kioskLogin = await loginUser(kioskUser);
    kioskToken = kioskLogin.accessToken;

    const { rows: ltRows } = await db.query("SELECT id FROM leave_types WHERE code = 'PHEP_NAM' LIMIT 1");
    leaveTypeAlId = ltRows[0]?.id || 'LT-AL';
  });

  beforeEach(() => {
    aiService.clearAiRuntimeState();
    app.locals.aiTestOptions = undefined;
  });

  after(async () => {
    app.locals.aiTestOptions = undefined;
    await deleteTestProjects();
    await deleteTestUsers();
    await deleteTestEmployees();
    await closeDb();
  });

  it('R31: resolves user scope from DB on POST /api/ai/copilot and invalidates conversation history across department, null, employeeId, and role transitions', async () => {
    const convId = 'conv-r31-route-transitions';
    const capturedRequests = [];

    app.locals.aiTestOptions = {
      apiKey: 'test-gemini-key-r31',
      model: 'gemini-2.5-flash',
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        capturedRequests.push(body.contents);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 'Xin chào! Tôi sẵn sàng hỗ trợ.' }],
                },
              },
            ],
          }),
        };
      },
    };

    // Turn 1: LINE_MANAGER in DEPT-IT
    const turn1 = await callWith(mgrSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào, đây là phiên làm việc tại phòng IT',
      conversationId: convId,
    });
    assert.equal(turn1.status, 200);
    assert.equal(capturedRequests.length, 1);
    assert.equal(capturedRequests[0].length, 1);

    // Turn 2: Same user, same role (LINE_MANAGER), same department (DEPT-IT) -> preserves history
    const turn2 = await callWith(mgrSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào lần 2 trong cùng phòng IT',
      conversationId: convId,
    });
    assert.equal(turn2.status, 200);
    assert.equal(turn2.body.scopeChangedMidConversation, false);
    assert.equal(capturedRequests.length, 2);
    assert.equal(capturedRequests[1].length, 3); // Turn 1 user + Turn 1 model + Turn 2 user

    // Another user trying to access convId must receive HTTP 403 FORBIDDEN_CONVERSATION
    const crossUserRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào từ tài khoản khác',
      conversationId: convId,
    });
    assert.equal(crossUserRes.status, 403);
    assert.equal(crossUserRes.body.code, 'FORBIDDEN_CONVERSATION');

    // Transition 1: Same user & LINE_MANAGER role, but employee moves DEPT-IT -> DEPT-SALES in DB
    await db.query(`UPDATE employees SET department_id = 'DEPT-SALES' WHERE id = $1`, [
      mgrSession.employeeId,
    ]);

    const turn3 = await callWith(mgrSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào sau khi chuyển sang phòng Sales',
      conversationId: convId,
    });
    assert.equal(turn3.status, 200);
    assert.equal(turn3.body.scopeChangedMidConversation, true);
    assert.equal(capturedRequests[2].length, 1);
    assert.equal(JSON.stringify(capturedRequests[2]).includes('phòng IT'), false);

    // Transition 2: Department changes from DEPT-SALES -> NULL in DB
    await db.query(`UPDATE employees SET department_id = NULL WHERE id = $1`, [
      mgrSession.employeeId,
    ]);

    const turn4 = await callWith(mgrSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào khi chưa gán phòng ban (null)',
      conversationId: convId,
    });
    assert.equal(turn4.status, 200);
    assert.equal(turn4.body.scopeChangedMidConversation, true);
    assert.equal(capturedRequests[3].length, 1);
    assert.equal(JSON.stringify(capturedRequests[3]).includes('phòng Sales'), false);

    // Transition 3: User account is rebound to a different employeeId in DB
    await db.query(`UPDATE users SET employee_id = $1 WHERE id = $2`, [
      secondEmp.id,
      mgrSession.user.id,
    ]);

    const turn5 = await callWith(mgrSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào sau khi đổi hồ sơ nhân viên liên kết',
      conversationId: convId,
    });
    assert.equal(turn5.status, 200);
    assert.equal(turn5.body.scopeChangedMidConversation, true);
    assert.equal(capturedRequests[4].length, 1);

    // Transition 4: Role downgraded from LINE_MANAGER -> EMPLOYEE in DB
    await db.query(`UPDATE users SET role_code = 'EMPLOYEE' WHERE id = $1`, [mgrSession.user.id]);

    const turn6 = await callWith(mgrSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào sau khi hạ quyền xuống nhân viên',
      conversationId: convId,
    });
    assert.equal(turn6.status, 200);
    assert.equal(turn6.body.scopeChangedMidConversation, true);
    assert.equal(capturedRequests[5].length, 1);

    // Restore mgrSession DB state
    await db.query(`UPDATE employees SET department_id = 'DEPT-IT' WHERE id = $1`, [
      mgrSession.employeeId,
    ]);
    await db.query(`UPDATE users SET employee_id = $1, role_code = 'LINE_MANAGER' WHERE id = $2`, [
      mgrSession.employeeId,
      mgrSession.user.id,
    ]);

    // Service-level reproduction from 11-REVIEW-9c25e85: registerConversationOwner with DEPT-IT,
    // followed by runCopilot with actor missing departmentId -> must discard history
    aiService.clearAiRuntimeState();
    aiService.registerConversationOwner(
      'conv-r31-service-repro',
      'USR-MGR-SYNTH',
      [{ role: 'user', parts: [{ text: 'OLD_DEPARTMENT_SECRET_FIXTURE' }] }],
      { roleCode: 'LINE_MANAGER', departmentId: 'DEPT-IT' }
    );

    let serviceCapturedContents = null;
    await aiService.runCopilot({
      actor: {
        userId: 'USR-MGR-SYNTH',
        employeeId: 'NV-SYNTH-02',
        roleCode: 'LINE_MANAGER',
      },
      message: 'Xin chào trợ lý',
      conversationId: 'conv-r31-service-repro',
      options: {
        apiKey: 'test-gemini-key-r31',
        model: 'gemini-2.5-flash',
        fetchImpl: async (_url, init) => {
          serviceCapturedContents = JSON.parse(init.body).contents;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [{ content: { role: 'model', parts: [{ text: 'Xin chào!' }] } }],
            }),
          };
        },
      },
    });
    assert.equal(serviceCapturedContents.length, 1);
    assert.equal(
      JSON.stringify(serviceCapturedContents).includes('OLD_DEPARTMENT_SECRET_FIXTURE'),
      false
    );

    // Concurrent scope change test: Request A starts in DEPT-IT and finishes AFTER Request B in DEPT-HR.
    // Request A's stale scope completion must not overwrite Request B's new scope history.
    aiService.clearAiRuntimeState();
    let releaseReqA;
    const reqABarrier = new Promise((resolve) => {
      releaseReqA = resolve;
    });

    const reqAPromise = aiService.runCopilot({
      actor: {
        userId: 'USR-CONC-1',
        employeeId: 'NV-CONC-1',
        roleCode: 'LINE_MANAGER',
        departmentId: 'DEPT-IT',
      },
      message: 'Xin chào từ scope cũ DEPT-IT',
      conversationId: 'conv-r31-concurrent',
      options: {
        apiKey: 'test-gemini-key-r31',
        model: 'gemini-2.5-flash',
        fetchImpl: async () => {
          await reqABarrier;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [{ content: { role: 'model', parts: [{ text: 'Phản hồi cũ DEPT-IT' }] } }],
            }),
          };
        },
      },
    });

    // While Request A is in flight, Request B runs with new scope DEPT-HR
    await aiService.runCopilot({
      actor: {
        userId: 'USR-CONC-1',
        employeeId: 'NV-CONC-1',
        roleCode: 'LINE_MANAGER',
        departmentId: 'DEPT-HR',
      },
      message: 'Xin chào từ scope mới DEPT-HR',
      conversationId: 'conv-r31-concurrent',
      options: {
        apiKey: 'test-gemini-key-r31',
        model: 'gemini-2.5-flash',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { role: 'model', parts: [{ text: 'Phản hồi mới DEPT-HR' }] } }],
          }),
        }),
      },
    });

    // Now let Request A complete
    releaseReqA();
    await reqAPromise;

    // Follow-up Request C in DEPT-HR must see Request B's history, NOT Request A's stale DEPT-IT history
    let followUpContents = null;
    await aiService.runCopilot({
      actor: {
        userId: 'USR-CONC-1',
        employeeId: 'NV-CONC-1',
        roleCode: 'LINE_MANAGER',
        departmentId: 'DEPT-HR',
      },
      message: 'Tiếp tục trong scope mới DEPT-HR',
      conversationId: 'conv-r31-concurrent',
      options: {
        apiKey: 'test-gemini-key-r31',
        model: 'gemini-2.5-flash',
        fetchImpl: async (_url, init) => {
          followUpContents = JSON.parse(init.body).contents;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [{ content: { role: 'model', parts: [{ text: 'OK DEPT-HR' }] } }],
            }),
          };
        },
      },
    });
    assert.equal(followUpContents.length, 3);
    assert.equal(JSON.stringify(followUpContents).includes('DEPT-IT'), false);
    assert.equal(JSON.stringify(followUpContents).includes('Phản hồi mới DEPT-HR'), true);
  });

  it('R32: blocks ungrounded HR/policy claims when model skips tools, when tools fail/return empty, when numbers mismatch tool output, or when tool rounds are exceeded', async () => {
    await db.query(
      `INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
       VALUES ($1, $2, 2026, 12, 8)
       ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE SET total_days = 12, used_days = 8`,
      [empSession.employeeId, leaveTypeAlId]
    );

    // 1. Exact reproduction from 11-REVIEW-9c25e85: model skips tool and says "Bạn còn 99 ngày phép."
    // while DB executor throws if called.
    const throwingExecutor = {
      query: async () => {
        throw new Error('DB should not be queried when model skips tools');
      },
    };
    const skippedToolRes = await aiService.runCopilot({
      actor: {
        userId: empSession.user.id,
        employeeId: empSession.employeeId,
        roleCode: 'EMPLOYEE',
        departmentId: 'DEPT-IT',
      },
      message: 'Tôi còn bao nhiêu ngày phép năm 2026?',
      executor: throwingExecutor,
      options: {
        apiKey: 'test-gemini-key-r32',
        model: 'gemini-2.5-flash',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 'Bạn còn 99 ngày phép.' }],
                },
              },
            ],
          }),
        }),
      },
    });
    assert.equal(skippedToolRes.refused, true);
    assert.equal(skippedToolRes.verified, false);
    assert.ok(skippedToolRes.refusalCodes.includes('UNGROUNDED_ANSWER_REJECTED'));
    assert.equal(skippedToolRes.sources.length, 0);
    assert.equal(skippedToolRes.answer.includes('99'), false);

    // 2. Non-numeric status claim when model skips tool -> rejected
    app.locals.aiTestOptions = {
      apiKey: 'test-gemini-key-r32',
      model: 'gemini-2.5-flash',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Đơn nghỉ phép của bạn đã được phê duyệt hoàn tất.' }],
              },
            },
          ],
        }),
      }),
    };
    const skippedStatusRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
      message: 'Đơn nghỉ phép của tôi đã được duyệt chưa?',
    });
    assert.equal(skippedStatusRes.status, 200);
    assert.equal(skippedStatusRes.body.refused, true);
    assert.ok(skippedStatusRes.body.refusalCodes.includes('UNGROUNDED_ANSWER_REJECTED'));
    assert.equal(skippedStatusRes.body.answer.includes('đã được phê duyệt hoàn tất'), false);

    // 3. Tool called and succeeds (remaining=4), but model hallucinates "99 ngày phép" -> ANSWER_SOURCE_MISMATCH
    app.locals.aiTestOptions = {
      apiKey: 'test-gemini-key-r32',
      model: 'gemini-2.5-flash',
      fetchImpl: createToolCallingTransport(
        'get_my_leave_balance',
        { year: 2026, leaveType: 'PHEP_NAM' },
        () => 'Bạn còn 99 ngày phép trong năm 2026.'
      ),
    };
    const mismatchRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
      message: 'Tôi còn mấy ngày phép năm 2026?',
    });
    assert.equal(mismatchRes.status, 200);
    assert.equal(mismatchRes.body.refused, true);
    assert.equal(mismatchRes.body.verified, false);
    assert.ok(mismatchRes.body.refusalCodes.includes('ANSWER_SOURCE_MISMATCH'));
    assert.equal(mismatchRes.body.answer.includes('99'), false);

    // 4. Tool returns found=false (non-existent policy), model tries to claim a policy amount -> rejected
    app.locals.aiTestOptions = {
      apiKey: 'test-gemini-key-r32',
      model: 'gemini-2.5-flash',
      fetchImpl: createToolCallingTransport(
        'search_policies',
        { query: 'bảo hiểm sức khỏe Vinmec' },
        () => 'Chính sách bảo hiểm Vinmec đang có hiệu lực với mức chi trả 120.000.000 đồng/năm.'
      ),
    };
    const fakePolicyRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
      message: 'Chính sách bảo hiểm Vinmec chi trả bao nhiêu?',
    });
    assert.equal(fakePolicyRes.status, 200);
    assert.equal(fakePolicyRes.body.refused, true);
    assert.equal(fakePolicyRes.body.verified, false);
    assert.equal(fakePolicyRes.body.sources.length, 0);
    assert.ok(fakePolicyRes.body.refusalCodes.includes('UNGROUNDED_ANSWER_REJECTED'));
    assert.equal(fakePolicyRes.body.answer.includes('120.000.000'), false);

    // 5. Exhausting maxToolRounds -> TOOL_ROUNDS_EXCEEDED
    app.locals.aiTestOptions = {
      apiKey: 'test-gemini-key-r32',
      model: 'gemini-2.5-flash',
      maxToolRounds: 1,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'get_my_leave_balance',
                      args: { year: 2026 },
                    },
                  },
                  {
                    text: 'Bạn còn 88 ngày phép chưa xác minh.',
                  },
                ],
              },
            },
          ],
        }),
      }),
    };
    const roundsExceededRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
      message: 'Kiểm tra phép năm 2026',
    });
    assert.equal(roundsExceededRes.status, 200);
    assert.equal(roundsExceededRes.body.refused, true);
    assert.equal(roundsExceededRes.body.verified, false);
    assert.ok(roundsExceededRes.body.refusalCodes.includes('TOOL_ROUNDS_EXCEEDED'));
    assert.equal(roundsExceededRes.body.sources.length, 0);
    assert.equal(roundsExceededRes.body.answer.includes('88'), false);

    // 6. Greeting / clarification prompt works normally without requiring a tool call
    app.locals.aiTestOptions = {
      apiKey: 'test-gemini-key-r32',
      model: 'gemini-2.5-flash',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    text: 'Xin chào! Bạn vui lòng cho biết kỳ lương hoặc loại thông tin cần tra cứu để tôi hỗ trợ.',
                  },
                ],
              },
            },
          ],
        }),
      }),
    };
    const greetingRes = await callWith(empSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào bạn',
    });
    assert.equal(greetingRes.status, 200);
    assert.equal(greetingRes.body.refused, false);
    assert.equal(greetingRes.body.toolsUsed.length, 0);
    assert.match(greetingRes.body.answer, /Xin chào/);
  });

  it('R33: GET /api/tasks/:id/logs returns authoritative task_logs across mutations, preserves kpi_weight = 0, and stays identical across different viewers', async () => {
    const project = await createProject('CEO', {
      departmentId: 'DEPT-IT',
      managerId: mgrSession.employeeId,
    });

    // Create task with kpiWeight = 0
    const createRes = await callWith(mgrSession.token, 'post', `/api/projects/${project.id}/tasks`, {
      title: 'Nhiệm vụ R33 KPI = 0',
      description: 'Kiểm tra lịch sử thật từ CSDL',
      assigneeId: empSession.employeeId,
      priority: 'Cao',
      kpiWeight: 0,
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.body.data.id;
    assert.equal(Number(createRes.body.data.kpi_weight), 0);

    // Newly created task has 0 logs in task_logs (no fabricated 09:00 log)
    const initialLogsRes = await callWith(empSession.token, 'get', `/api/tasks/${taskId}/logs`);
    assert.equal(initialLogsRes.status, 200);
    assert.equal(initialLogsRes.body.data.length, 0);

    // Assignee moves todo -> in_progress, updates progress + deliverableNote, and moves to review
    assert.equal(
      (
        await callWith(empSession.token, 'patch', `/api/tasks/${taskId}/stage`, {
          stage: 'in_progress',
          note: 'Bắt đầu triển khai module R33',
        })
      ).status,
      200
    );
    assert.equal(
      (
        await callWith(empSession.token, 'put', `/api/tasks/${taskId}`, {
          progress: 65,
          deliverableNote: 'Đã hoàn thành 65% khối lượng',
        })
      ).status,
      200
    );
    assert.equal(
      (
        await callWith(empSession.token, 'patch', `/api/tasks/${taskId}/stage`, {
          stage: 'review',
          note: 'Bàn giao PR chờ nghiệm thu',
        })
      ).status,
      200
    );

    // Line Manager reviews and accepts the task
    assert.equal(
      (
        await callWith(mgrSession.token, 'post', `/api/tasks/${taskId}/review`, {
          decision: 'accept',
          note: 'Nghiệm thu đạt yêu cầu R33',
        })
      ).status,
      200
    );

    // Fetch logs as Employee, Line Manager, and CEO -> must be 100% identical
    const logsByEmp = await callWith(empSession.token, 'get', `/api/tasks/${taskId}/logs`);
    const logsByMgr = await callWith(mgrSession.token, 'get', `/api/tasks/${taskId}/logs`);
    const logsByCeo = await call('CEO', 'get', `/api/tasks/${taskId}/logs`);

    assert.equal(logsByEmp.status, 200);
    assert.equal(logsByMgr.status, 200);
    assert.equal(logsByCeo.status, 200);
    assert.deepEqual(logsByEmp.body.data, logsByMgr.body.data);
    assert.deepEqual(logsByMgr.body.data, logsByCeo.body.data);

    const actions = logsByEmp.body.data.map((l) => l.action);
    assert.ok(actions.includes('STAGE_CHANGE'));
    assert.ok(actions.includes('PROGRESS_UPDATE'));
    assert.ok(actions.includes('REVIEW_ACCEPTED'));

    const progressLog = logsByEmp.body.data.find((l) => l.action === 'PROGRESS_UPDATE');
    assert.equal(progressLog.actor_id, empSession.employeeId);
    assert.match(progressLog.note, /Đã hoàn thành 65% khối lượng/);

    const reviewLog = logsByEmp.body.data.find((l) => l.action === 'REVIEW_ACCEPTED');
    assert.equal(reviewLog.actor_id, mgrSession.employeeId);
    assert.equal(reviewLog.note, 'Nghiệm thu đạt yêu cầu R33');
  });

  it('R34: executes positive KIOSK QR attendance punch flow (GET /api/attendance/qr -> POST /api/attendance/kiosk/punch) and enforces negative KIOSK route boundaries', async () => {
    // 1. Employee generates personal QR token via GET /api/attendance/qr
    const qrRes = await callWith(empSession.token, 'get', '/api/attendance/qr');
    assert.equal(qrRes.status, 200);
    assert.equal(qrRes.body.success, true);
    const qrToken = qrRes.body.qrToken || qrRes.body.data?.qrToken;
    assert.ok(qrToken);

    // 2. KIOSK account punches attendance using the employee's QR token via POST /api/attendance/kiosk/punch
    const punchInRes = await callWith(kioskToken, 'post', '/api/attendance/kiosk/punch', {
      qrToken,
    });
    assert.equal(punchInRes.status, 201);
    assert.equal(punchInRes.body.success, true);
    assert.equal(punchInRes.body.action, 'CHECK_IN');
    assert.equal(punchInRes.body.data.employee_id, empSession.employeeId);
    assert.equal(punchInRes.body.data.check_in_method, 'qr');

    // Reusing the same single-use QR token must be rejected with 401
    const replayRes = await callWith(kioskToken, 'post', '/api/attendance/kiosk/punch', {
      qrToken,
    });
    assert.equal(replayRes.status, 401);

    // Move check_in_time back 10 minutes and issue a fresh QR token for KIOSK check-out
    await db.query(
      `UPDATE attendance_logs
          SET check_in_time = NOW() - INTERVAL '10 minutes'
        WHERE employee_id = $1 AND work_date = CURRENT_DATE`,
      [empSession.employeeId]
    );
    const qrOutRes = await callWith(empSession.token, 'get', '/api/attendance/qr');
    assert.equal(qrOutRes.status, 200);

    const punchOutRes = await callWith(kioskToken, 'post', '/api/attendance/kiosk/punch', {
      qrToken: qrOutRes.body.qrToken,
    });
    assert.equal(punchOutRes.status, 200);
    assert.equal(punchOutRes.body.success, true);
    assert.equal(punchOutRes.body.action, 'CHECK_OUT');
    assert.equal(punchOutRes.body.data.employee_id, empSession.employeeId);
    assert.equal(punchOutRes.body.data.check_out_method, 'qr');

    // 3. KIOSK account can read its own session via GET /api/auth/me
    const meRes = await callWith(kioskToken, 'get', '/api/auth/me');
    assert.equal(meRes.status, 200);
    assert.equal(
      meRes.body.user?.roleCode || meRes.body.user?.role_code || meRes.body.data?.role_code,
      'KIOSK'
    );

    // 4. Negative permission tests: KIOSK is blocked from GPS check-in/out, AI copilot, and payroll
    const checkInForbidden = await callWith(kioskToken, 'post', '/api/attendance/check-in', {});
    assert.equal(checkInForbidden.status, 403);

    const checkOutForbidden = await callWith(kioskToken, 'post', '/api/attendance/check-out', {});
    assert.equal(checkOutForbidden.status, 403);

    const aiForbidden = await callWith(kioskToken, 'post', '/api/ai/copilot', {
      message: 'Xin chào',
    });
    assert.equal(aiForbidden.status, 403);

    const payrollForbidden = await callWith(kioskToken, 'get', '/api/payroll/periods');
    assert.equal(payrollForbidden.status, 403);
  });
});
