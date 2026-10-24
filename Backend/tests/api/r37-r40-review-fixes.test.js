const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { employeeSession } = require('../helpers/sessions');
const { deleteTestEmployees } = require('../helpers/employees');
const { deleteTestUsers } = require('../helpers/users');
const aiService = require('../../src/modules/ai/service');

function createToolCallingTransport(toolCallsList, summarizeFn, capturedCalls = []) {
  const callsArray = Array.isArray(toolCallsList) ? toolCallsList : [toolCallsList];
  return async (url, init) => {
    const body = JSON.parse(init.body);
    capturedCalls.push({ url, headers: init.headers, body });

    const lastContent = body.contents[body.contents.length - 1];
    const fnRespParts = (lastContent?.parts || []).filter((p) => p.functionResponse);

    if (fnRespParts.length === 0) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: callsArray.map((tc) => ({
                  functionCall: { name: tc.name, args: tc.args || {} },
                })),
              },
            },
          ],
        }),
      };
    }

    const results = fnRespParts.map((p) => p.functionResponse.response.result);
    const text = summarizeFn(results.length === 1 ? results[0] : results);
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

describe('R37–R40 Review Fixes Verification (13-REVIEW-f8de997)', () => {
  let itEmpSession;
  let mktEmpSession;
  let leaveTypeAlId;
  let leaveTypeSlId;
  const noticeMarker = `TST-R39-${Date.now().toString(36)}`;

  before(async () => {
    const { rows: dbRows } = await db.query('SELECT current_database() AS db_name');
    assert.equal(dbRows[0].db_name, 'nexus_hrms_test');

    itEmpSession = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
    mktEmpSession = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-MKT' });

    const { rows: alRows } = await db.query("SELECT id FROM leave_types WHERE code = 'PHEP_NAM' LIMIT 1");
    leaveTypeAlId = alRows[0]?.id || 'LT-AL';
    const { rows: slRows } = await db.query("SELECT id FROM leave_types WHERE code = 'NGHI_OM' LIMIT 1");
    leaveTypeSlId = slRows[0]?.id || 'LT-SL';
  });

  beforeEach(() => {
    aiService.clearAiRuntimeState();
    app.locals.aiTestOptions = undefined;
  });

  after(async () => {
    app.locals.aiTestOptions = undefined;
    await db.query('DELETE FROM company_notices WHERE title LIKE $1', [`${noticeMarker}%`]);
    await db.query("DELETE FROM payroll_periods WHERE period IN ('2027-03', '2027-04')");
    await deleteTestUsers();
    await deleteTestEmployees();
    await closeDb();
  });

  it('R37: blocks tool-less ungrounded HR assertions even when combined with a question ("?") or triggered by a greeting ("Hello")', async () => {
    const ungroundedToollessCases = [
      // Exact reproduction 1 from 13-REVIEW-f8de997
      {
        message: 'Is my leave request rejected?',
        modelReply: 'Your request was rejected. Would you like help?',
        forbiddenSubstring: 'Your request was rejected',
      },
      // Exact reproduction 2 from 13-REVIEW-f8de997
      {
        message: 'Hello',
        modelReply: 'Your employment contract is terminated.',
        forbiddenSubstring: 'terminated',
      },
      // Greeting + mixed assertion in English
      {
        message: 'Hi there',
        modelReply: 'Hello! Your leave request was approved.',
        forbiddenSubstring: 'approved',
      },
      // Vietnamese accented question + assertion + follow-up question
      {
        message: 'Đơn nghỉ phép của tôi có bị từ chối không?',
        modelReply: 'Đơn nghỉ phép của bạn đã bị từ chối. Bạn có cần hỗ trợ gì thêm không?',
        forbiddenSubstring: 'đã bị từ chối',
      },
      // Vietnamese unaccented greeting + contract termination claim
      {
        message: 'Xin chao',
        modelReply: 'Hop dong lao dong cua ban da cham dut.',
        forbiddenSubstring: 'cham dut',
      },
    ];

    for (const tc of ungroundedToollessCases) {
      aiService.clearAiRuntimeState();
      app.locals.aiTestOptions = {
        apiKey: 'test-key-r37',
        model: 'gemini-2.5-flash',
        requestsPerMinute: 100,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: tc.modelReply }],
                },
              },
            ],
          }),
        }),
      };

      const res = await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
        message: tc.message,
        conversationId: 'conv-r37-check',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.verified, false, `Expected verified=false for: ${tc.modelReply}`);
      assert.equal(res.body.refused, true, `Expected refused=true for: ${tc.modelReply}`);
      assert.ok(
        res.body.refusalCodes.includes('UNGROUNDED_ANSWER_REJECTED'),
        `Expected UNGROUNDED_ANSWER_REJECTED for: ${tc.modelReply}`
      );
      assert.equal(
        res.body.answer.includes(tc.forbiddenSubstring),
        false,
        `Forbidden text leaked in answer: ${res.body.answer}`
      );
    }

    // Valid greeting and valid parameter clarification still work normally
    app.locals.aiTestOptions = {
      apiKey: 'test-key-r37',
      model: 'gemini-2.5-flash',
      requestsPerMinute: 100,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Hello! How can I help you today?' }],
              },
            },
          ],
        }),
      }),
    };
    const validGreet = await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
      message: 'Hello',
    });
    assert.equal(validGreet.status, 200);
    assert.equal(validGreet.body.refused, false);
    assert.equal(validGreet.body.verified, false);
    assert.deepEqual(validGreet.body.refusalCodes, []);

    app.locals.aiTestOptions = {
      apiKey: 'test-key-r37',
      model: 'gemini-2.5-flash',
      requestsPerMinute: 100,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Please specify which year or payroll period (YYYY-MM) you want to check?' }],
              },
            },
          ],
        }),
      }),
    };
    const validClarify = await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
      message: 'Check my payslip',
    });
    assert.equal(validClarify.status, 200);
    assert.equal(validClarify.body.refused, false);
    assert.equal(validClarify.body.verified, false);
    assert.deepEqual(validClarify.body.refusalCodes, []);
  });

  it('R38: enforces positive field ownership across single/multiple leave types, multiple payroll periods, and non-numeric fields before granting VERIFIED', async () => {
    // Seed 2 leave types for itEmpSession: PHEP_NAM (total=12, used=7, remaining=5) and NGHI_OM (total=30, used=2, remaining=28)
    await db.query(
      `INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
       VALUES ($1, $2, 2026, 12, 7), ($1, $3, 2026, 30, 2)
       ON CONFLICT (employee_id, leave_type_id, year)
       DO UPDATE SET total_days = EXCLUDED.total_days, used_days = EXCLUDED.used_days`,
      [itEmpSession.employeeId, leaveTypeAlId, leaveTypeSlId]
    );

    const badLeaveAnswers = [
      // 1. Exact reproduction from 13-REVIEW-f8de997: "You can take 12 days off; 5 is your balance."
      'You can take 12 days off; 5 is your balance.',
      // 2. Unlabeled entitlement (12) in first clause without regex keyword "available"
      '12 days are ready for your trip; 5 is your remaining balance.',
      // 3. Unlabeled used_days (7) in first clause
      '7 days are ready for your trip; 5 is your remaining balance.',
      // 4. Cross-leave-type swap: attributing SICK leave remaining (28) to annual vacation
      'You have 28 vacation days remaining in 2026.',
      'Năm 2026 bạn còn lại 28 ngày phép năm.',
      // 5. Non-numeric paid status mismatch: claiming paid annual leave is unpaid
      'Năm 2026 bạn còn lại 5 ngày phép năm không hưởng lương.',
    ];

    for (const badAns of badLeaveAnswers) {
      aiService.clearAiRuntimeState();
      app.locals.aiTestOptions = {
        apiKey: 'test-key-r38',
        model: 'gemini-2.5-flash',
        requestsPerMinute: 100,
        fetchImpl: createToolCallingTransport(
          { name: 'get_my_leave_balance', args: { year: 2026 } },
          () => badAns
        ),
      };
      const res = await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
        message: 'How many vacation days do I have?',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.verified, false, `Expected verified=false for: ${badAns}`);
      assert.equal(res.body.refused, true, `Expected refused=true for: ${badAns}`);
      assert.ok(
        res.body.refusalCodes.includes('ANSWER_SOURCE_MISMATCH'),
        `Expected ANSWER_SOURCE_MISMATCH for: ${badAns}`
      );
      assert.equal(res.body.verifiedClaims.length, 0);
    }

    // Valid multi-leave-type comparison passes with verified=true and structured verifiedClaims
    aiService.clearAiRuntimeState();
    app.locals.aiTestOptions = {
      apiKey: 'test-key-r38',
      model: 'gemini-2.5-flash',
      requestsPerMinute: 100,
      fetchImpl: createToolCallingTransport(
        { name: 'get_my_leave_balance', args: { year: 2026 } },
        () =>
          'Năm 2026 bạn có tổng định mức 12 ngày phép năm, đã dùng 7 ngày, còn lại 5 ngày phép năm; ngoài ra nghỉ ốm còn lại 28 ngày.'
      ),
    };
    const validMultiLeave = await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
      message: 'How many vacation days do I have?',
    });
    assert.equal(validMultiLeave.status, 200);
    assert.equal(validMultiLeave.body.verified, true);
    assert.equal(validMultiLeave.body.refused, false);
    assert.ok(validMultiLeave.body.verifiedClaims.length >= 6);

    // Multi-period payslip test (2027-03 net=18,000,000 vs 2027-04 net=19,500,000)
    const { rows: p3Rows } = await db.query(
      `INSERT INTO payroll_periods (period, status) VALUES ('2027-03', 'DA_CHOT')
       ON CONFLICT (period) DO UPDATE SET status = 'DA_CHOT' RETURNING id`
    );
    const { rows: p4Rows } = await db.query(
      `INSERT INTO payroll_periods (period, status) VALUES ('2027-04', 'DA_CHOT')
       ON CONFLICT (period) DO UPDATE SET status = 'DA_CHOT' RETURNING id`
    );
    await db.query(
      `INSERT INTO payslips (
         period_id, employee_id, base_salary, standard_work_days, actual_work_days,
         allowances, ot_pay, gross_income, bhxh_amount, bhyt_amount, bhtn_amount,
         pit_taxable, pit_deduction, pit_amount, total_deductions, net_salary, status
       ) VALUES
         ($1, $3, 20000000, 22, 22, 1000000, 0, 21000000, 1600000, 300000, 200000, 7900000, 11000000, 900000, 3000000, 18000000, 'DA_CHOT'),
         ($2, $3, 20000000, 22, 22, 2500000, 0, 22500000, 1600000, 300000, 200000, 9400000, 11000000, 900000, 3000000, 19500000, 'DA_CHOT')
       ON CONFLICT (period_id, employee_id) DO UPDATE SET net_salary = EXCLUDED.net_salary, gross_income = EXCLUDED.gross_income`,
      [p3Rows[0].id, p4Rows[0].id, itEmpSession.employeeId]
    );

    // Cross-period swap (claiming 2027-03 has 19,500,000 and 2027-04 has 18,000,000) -> rejected
    aiService.clearAiRuntimeState();
    app.locals.aiTestOptions = {
      apiKey: 'test-key-r38',
      model: 'gemini-2.5-flash',
      requestsPerMinute: 100,
      fetchImpl: createToolCallingTransport(
        [
          { name: 'get_my_payslip', args: { period: '2027-03' } },
          { name: 'get_my_payslip', args: { period: '2027-04' } },
        ],
        () =>
          'Kỳ 2027-03 lương thực lĩnh của bạn là 19.500.000 đồng. Kỳ 2027-04 lương thực lĩnh của bạn là 18.000.000 đồng.'
      ),
    };
    const swappedPeriodsRes = await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
      message: 'So sánh lương thực lĩnh kỳ 2027-03 và 2027-04',
    });
    assert.equal(swappedPeriodsRes.status, 200);
    assert.equal(swappedPeriodsRes.body.verified, false);
    assert.equal(swappedPeriodsRes.body.refused, true);
    assert.ok(swappedPeriodsRes.body.refusalCodes.includes('ANSWER_SOURCE_MISMATCH'));

    // Non-numeric periodStatus mismatch (claiming DA_CHOT is already disbursed/transferred) -> rejected
    aiService.clearAiRuntimeState();
    app.locals.aiTestOptions = {
      apiKey: 'test-key-r38',
      model: 'gemini-2.5-flash',
      requestsPerMinute: 100,
      fetchImpl: createToolCallingTransport(
        { name: 'get_my_payslip', args: { period: '2027-03' } },
        () => 'Kỳ 2027-03 lương thực lĩnh 18.000.000 đồng đã chuyển khoản thanh toán hoàn tất.'
      ),
    };
    const badStatusPayslipRes = await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
      message: 'Lương thực lĩnh kỳ 2027-03 của tôi',
    });
    assert.equal(badStatusPayslipRes.status, 200);
    assert.equal(badStatusPayslipRes.body.verified, false);
    assert.equal(badStatusPayslipRes.body.refused, true);
    assert.ok(badStatusPayslipRes.body.refusalCodes.includes('ANSWER_SOURCE_MISMATCH'));

    // Accurate multi-period payslip comparison -> verified=true
    aiService.clearAiRuntimeState();
    app.locals.aiTestOptions = {
      apiKey: 'test-key-r38',
      model: 'gemini-2.5-flash',
      requestsPerMinute: 100,
      fetchImpl: createToolCallingTransport(
        [
          { name: 'get_my_payslip', args: { period: '2027-03' } },
          { name: 'get_my_payslip', args: { period: '2027-04' } },
        ],
        () =>
          'Kỳ 2027-03 lương thực lĩnh là 18.000.000 đồng. Kỳ 2027-04 lương thực lĩnh là 19.500.000 đồng.'
      ),
    };
    const validMultiPeriodRes = await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
      message: 'So sánh lương thực lĩnh kỳ 2027-03 và 2027-04',
    });
    assert.equal(validMultiPeriodRes.status, 200);
    assert.equal(validMultiPeriodRes.body.verified, true);
    assert.equal(validMultiPeriodRes.body.refused, false);
  });

  it('R39: uploads real notice attachments, enforces audience download authorization (200 in-scope vs 403 out-of-scope), rejects blob:/preset URLs & oversize files, and marks legacy DB attachments unavailable', async () => {
    // 1. Rejects blob: URLs, example.com URLs, and unuploaded attachment IDs on POST /api/notices
    const rejectBlob = await call('HR_DIRECTOR', 'post', '/api/notices', {
      title: `${noticeMarker} blob reject`,
      content: 'Nội dung',
      attachments: [{ id: 'att-123', name: 'fake.pdf', url: 'blob:http://localhost:5173/abc' }],
    });
    assert.equal(rejectBlob.status, 400);

    const rejectExample = await call('HR_DIRECTOR', 'post', '/api/notices', {
      title: `${noticeMarker} preset reject`,
      content: 'Nội dung',
      attachments: [
        {
          id: 'NATT-123456-abcd',
          name: 'Van_Ban_Quyet_Dinh_Chinh_Thuc.pdf',
          url: 'https://example.com/docs/Quyet_Dinh_2026.pdf',
        },
      ],
    });
    assert.equal(rejectExample.status, 400);

    const rejectUnuploaded = await call('HR_DIRECTOR', 'post', '/api/notices', {
      title: `${noticeMarker} missing file on disk`,
      content: 'Nội dung',
      attachments: [{ id: 'NATT-999999999-missing', name: 'ghost.pdf' }],
    });
    assert.equal(rejectUnuploaded.status, 400);

    // 2. Rejects unsupported extension (.exe) with 400 and oversized file (>5MB) with 413
    const badExtRes = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
      name: 'malware.exe',
      type: 'application/octet-stream',
      contentBase64: Buffer.from('MZ-fake').toString('base64'),
    });
    assert.equal(badExtRes.status, 400);

    const oversizeRes = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
      name: 'oversize_report.pdf',
      type: 'application/pdf',
      sizeBytes: 6 * 1024 * 1024,
      contentBase64: Buffer.from('PDF-header').toString('base64'),
    });
    assert.equal(oversizeRes.status, 413);

    // 3. Account A (HR_DIRECTOR) uploads a real file, verifies SHA-256, and publishes a notice scoped to DEPT-IT
    const fileContent = Buffer.from(
      `QUYẾT ĐỊNH NỘI BỘ KỸ THUẬT ${noticeMarker}\nNội dung kiểm thử tải tệp thực R39.\nDòng 3: Kiểm chứng SHA-256.`,
      'utf8'
    );
    const expectedSha256 = crypto.createHash('sha256').update(fileContent).digest('hex');

    const uploadRes = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
      name: 'Quyet_Dinh_Ky_Thuat_R39.pdf',
      type: 'application/pdf',
      sizeBytes: fileContent.length,
      contentBase64: fileContent.toString('base64'),
    });
    assert.equal(uploadRes.status, 201);
    const uploadedAtt = uploadRes.body.data;
    assert.match(uploadedAtt.id, /^NATT-/);
    assert.equal(uploadedAtt.sha256, expectedSha256);
    assert.equal(uploadedAtt.available, true);

    const createNoticeRes = await call('HR_DIRECTOR', 'post', '/api/notices', {
      title: `${noticeMarker} Thông báo riêng phòng IT`,
      content: 'Văn bản kèm tệp thực cho DEPT-IT',
      category: 'policy',
      priority: 'high',
      targetDepartmentId: 'DEPT-IT',
      attachments: [{ id: uploadedAtt.id, name: uploadedAtt.name }],
    });
    assert.equal(createNoticeRes.status, 201);
    const createdNotice = createNoticeRes.body.data;
    assert.equal(createdNotice.attachments.length, 1);
    assert.equal(createdNotice.attachments[0].id, uploadedAtt.id);
    assert.equal(createdNotice.attachments[0].sha256, expectedSha256);
    assert.equal(
      createdNotice.attachments[0].url,
      `/api/notices/${createdNotice.id}/attachments/${uploadedAtt.id}/download`
    );

    // 4. Account B (itEmpSession in DEPT-IT) downloads the attachment and verifies exact binary content & SHA-256
    const dlRes = await request(app)
      .get(`/api/notices/${createdNotice.id}/attachments/${uploadedAtt.id}/download`)
      .set('Authorization', `Bearer ${itEmpSession.token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(dlRes.status, 200);
    assert.equal(dlRes.headers['x-attachment-sha256'], expectedSha256);
    assert.equal(
      crypto.createHash('sha256').update(dlRes.body).digest('hex'),
      expectedSha256
    );
    assert.equal(dlRes.body.equals(fileContent), true);

    // 5. Account C (mktEmpSession in DEPT-MKT, outside DEPT-IT) is blocked with 403 FORBIDDEN
    const forbiddenDlRes = await callWith(
      mktEmpSession.token,
      'get',
      `/api/notices/${createdNotice.id}/attachments/${uploadedAtt.id}/download`
    );
    assert.equal(forbiddenDlRes.status, 403);

    // 6. Account A updates the notice to remove the attachment -> file is cleaned up and download returns 404
    const updateNoticeRes = await call('HR_DIRECTOR', 'put', `/api/notices/${createdNotice.id}`, {
      attachments: [],
    });
    assert.equal(updateNoticeRes.status, 200);
    assert.equal(updateNoticeRes.body.data.attachments.length, 0);

    const afterRemoveDlRes = await callWith(
      itEmpSession.token,
      'get',
      `/api/notices/${createdNotice.id}/attachments/${uploadedAtt.id}/download`
    );
    assert.equal(afterRemoveDlRes.status, 404);

    // 7. Legacy notice row in DB containing blob: or example.com URL is reported honestly as legacyUnavailable=true
    const { rows: legacyRows } = await db.query(
      `INSERT INTO company_notices (title, content, category, priority, attachments)
       VALUES ($1, 'Legacy notice content', 'general', 'normal', $2::jsonb)
       RETURNING id`,
      [
        `${noticeMarker} Legacy Notice`,
        JSON.stringify([
          {
            id: 'att-legacy-blob',
            name: 'Old_Blob_File.pdf',
            size: '1.1 MB',
            type: 'application/pdf',
            url: 'blob:http://localhost:5173/old-blob-uuid',
          },
        ]),
      ]
    );
    const legacyId = legacyRows[0].id;
    const getLegacyRes = await callWith(itEmpSession.token, 'get', `/api/notices/${legacyId}`);
    assert.equal(getLegacyRes.status, 200);
    assert.equal(getLegacyRes.body.data.attachments.length, 1);
    assert.equal(getLegacyRes.body.data.attachments[0].available, false);
    assert.equal(getLegacyRes.body.data.attachments[0].legacyUnavailable, true);
    assert.equal(getLegacyRes.body.data.attachments[0].url, null);

    const dlLegacyRes = await callWith(
      itEmpSession.token,
      'get',
      `/api/notices/${legacyId}/attachments/att-legacy-blob/download`
    );
    assert.equal(dlLegacyRes.status, 404);
  });
});
