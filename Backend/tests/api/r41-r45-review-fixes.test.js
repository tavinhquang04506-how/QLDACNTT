const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { call, callWith, closeDb, tokenFor } = require('../helpers/api');
const { employeeSession } = require('../helpers/sessions');
const { deleteTestEmployees } = require('../helpers/employees');
const { deleteTestUsers } = require('../helpers/users');
const aiService = require('../../src/modules/ai/service');
const noticesService = require('../../src/modules/notices/service');

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

    const responses = fnRespParts.map((p) => p.functionResponse.response);
    const text = summarizeFn(responses.length === 1 ? responses[0] : responses);
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

describe('R41–R44 Review Fixes Verification (14-REVIEW-7b5fca3)', () => {
  let itEmpSession;
  let salesEmpSession;
  let hrActor;
  let ceoActor;
  let leaveTypeAlId;
  let prodStorageSnapshotBefore = [];

  before(async () => {
    await deleteTestUsers();
    await deleteTestEmployees();

    if (fs.existsSync(noticesService.PROD_DEFAULT_STORAGE_DIR)) {
      prodStorageSnapshotBefore = fs.readdirSync(noticesService.PROD_DEFAULT_STORAGE_DIR).sort();
    }

    const { rows: ltRows } = await db.query(
      `SELECT id, code FROM leave_types WHERE code = 'PHEP_NAM' LIMIT 1`
    );
    leaveTypeAlId = ltRows[0]?.id || 'LT-AL';

    itEmpSession = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
    salesEmpSession = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-MKT' });

    const { rows: hrRows } = await db.query(
      `SELECT u.id AS user_id, u.role_code, u.employee_id, e.department_id
       FROM users u LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.role_code = 'HR_DIRECTOR' AND u.is_active = TRUE LIMIT 1`
    );
    hrActor = {
      userId: hrRows[0].user_id,
      roleCode: hrRows[0].role_code,
      employeeId: hrRows[0].employee_id,
      departmentId: hrRows[0].department_id,
    };

    const { rows: ceoRows } = await db.query(
      `SELECT u.id AS user_id, u.role_code, u.employee_id, e.department_id
       FROM users u LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.role_code = 'CEO' AND u.is_active = TRUE LIMIT 1`
    );
    ceoActor = {
      userId: ceoRows[0].user_id,
      roleCode: ceoRows[0].role_code,
      employeeId: ceoRows[0].employee_id,
      departmentId: ceoRows[0].department_id,
    };
  });

  after(async () => {
    delete app.locals.aiTestOptions;
    aiService.clearAiRuntimeState();
    noticesService.cleanupTestStorageDir();
    await deleteTestUsers();
    await deleteTestEmployees();
    await closeDb();
  });

  it('R41: strips ungrounded/fabricated clauses and renders from server-owned templates when mixed with valid tool data, and refuses when no grounded clause exists', async () => {
    await db.query(
      `INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
       VALUES ($1, $2, 2026, 12, 7)
       ON CONFLICT (employee_id, leave_type_id, year)
       DO UPDATE SET total_days = 12, used_days = 7`,
      [itEmpSession.employeeId, leaveTypeAlId]
    );

    const mixedCases = [
      // 1. Exact reproduction from 14-REVIEW-7b5fca3
      {
        message: 'How many vacation days do I have?',
        modelReply: 'Your remaining balance is 5 days. Your employment contract is terminated.',
        expectedMustInclude: '5 days',
        forbiddenSubstrings: ['contract', 'terminated'],
      },
      // 2. Joined by coordinating conjunction "and" in a single sentence
      {
        message: 'How many vacation days do I have?',
        modelReply: 'Your remaining balance is 5 days and your employment contract is terminated.',
        expectedMustInclude: '5 days',
        forbiddenSubstrings: ['contract', 'terminated'],
      },
      // 3. Non-regex arbitrary hallucinated topic (office badge / security clearance)
      {
        message: 'How many vacation days do I have?',
        modelReply: 'Your remaining balance is 5 days. Your office access badge has been revoked.',
        expectedMustInclude: '5 days',
        forbiddenSubstrings: ['badge', 'revoked', 'office'],
      },
      // 4. Leave request approval/rejection mixed with leave balance
      {
        message: 'How many vacation days do I have?',
        modelReply: 'Your remaining balance is 5 days. Your leave request was rejected.',
        expectedMustInclude: '5 days',
        forbiddenSubstrings: ['rejected', 'request was'],
      },
      // 5. Vietnamese accented: valid balance + fabricated contract termination
      {
        message: 'Năm 2026 tôi còn bao nhiêu ngày phép năm?',
        modelReply: 'Năm 2026 bạn còn lại 5 ngày phép năm. Hợp đồng lao động của bạn đã chấm dứt.',
        expectedMustInclude: '5 ngày',
        forbiddenSubstrings: ['Hợp đồng', 'chấm dứt'],
      },
      // 6. Vietnamese accented: valid balance + fabricated leave request approval
      {
        message: 'Năm 2026 tôi còn bao nhiêu ngày phép năm?',
        modelReply: 'Năm 2026 bạn còn lại 5 ngày phép năm. Đơn xin nghỉ phép của bạn đã được phê duyệt.',
        expectedMustInclude: '5 ngày',
        forbiddenSubstrings: ['Đơn xin nghỉ phép', 'đã được phê duyệt'],
      },
    ];

    for (const tc of mixedCases) {
      aiService.clearAiRuntimeState();
      const convId = `conv-r41-${crypto.randomUUID()}`;
      const capturedTurn1 = [];
      app.locals.aiTestOptions = {
        apiKey: 'test-key-r41',
        model: 'gemini-2.5-flash',
        requestsPerMinute: 100,
        fetchImpl: createToolCallingTransport(
          { name: 'get_my_leave_balance', args: { year: 2026 } },
          () => tc.modelReply,
          capturedTurn1
        ),
      };

      const res = await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
        message: tc.message,
        conversationId: convId,
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.verified, true, `Expected verified=true for sanitized template on: ${tc.modelReply}`);
      assert.equal(res.body.refused, false);
      assert.ok(
        res.body.answer.includes(tc.expectedMustInclude),
        `Expected "${tc.expectedMustInclude}" in "${res.body.answer}"`
      );
      for (const forbidden of tc.forbiddenSubstrings) {
        assert.equal(
          res.body.answer.toLowerCase().includes(forbidden.toLowerCase()),
          false,
          `Forbidden claim "${forbidden}" leaked into verified answer: "${res.body.answer}"`
        );
      }

      // Verify conversation history does NOT store the fabricated clause on subsequent turn
      const capturedTurn2 = [];
      app.locals.aiTestOptions = {
        apiKey: 'test-key-r41',
        model: 'gemini-2.5-flash',
        requestsPerMinute: 100,
        fetchImpl: createToolCallingTransport(
          { name: 'get_my_leave_balance', args: { year: 2026 } },
          () => 'Your remaining balance is 5 days.',
          capturedTurn2
        ),
      };
      await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
        message: 'Check again',
        conversationId: convId,
      });
      const historySerialized = JSON.stringify(capturedTurn2[0]?.body?.contents || []);
      for (const forbidden of tc.forbiddenSubstrings) {
        assert.equal(
          historySerialized.toLowerCase().includes(forbidden.toLowerCase()),
          false,
          `Forbidden claim "${forbidden}" leaked into conversation history`
        );
      }
    }

    // Purely ungrounded reply even after calling get_my_leave_balance (0 grounded clauses) -> refused!
    aiService.clearAiRuntimeState();
    app.locals.aiTestOptions = {
      apiKey: 'test-key-r41',
      model: 'gemini-2.5-flash',
      requestsPerMinute: 100,
      fetchImpl: createToolCallingTransport(
        { name: 'get_my_leave_balance', args: { year: 2026 } },
        () => 'Your employment contract is terminated.'
      ),
    };
    const pureUngroundedWithTool = await callWith(itEmpSession.token, 'post', '/api/ai/copilot', {
      message: 'What is my employment status?',
    });
    assert.equal(pureUngroundedWithTool.status, 200);
    assert.equal(pureUngroundedWithTool.body.verified, false);
    assert.equal(pureUngroundedWithTool.body.refused, true);
    assert.ok(pureUngroundedWithTool.body.refusalCodes.includes('ANSWER_SOURCE_MISMATCH'));
    assert.equal(pureUngroundedWithTool.body.answer.toLowerCase().includes('terminated'), false);
  });

  it('R42: enforces live notice department/role/schedule authorization across notifications list, unreadCount, markRead, markAllRead, and reminders', async () => {
    const itUnreadBefore = (await callWith(itEmpSession.token, 'get', '/api/notifications/unread-count')).body.count;
    const salesUnreadBefore = (await callWith(salesEmpSession.token, 'get', '/api/notifications/unread-count')).body.count;

    // Upload an attachment and create a DEPT-IT targeted notice with targetRole = null
    const uploadRes = await call('HR_DIRECTOR', 'post', '/api/notices/attachments', {
      name: 'quy-che-dept-it-r42.pdf',
      type: 'application/pdf',
      contentBase64: Buffer.from('%PDF-1.4 R42 DEPT-IT ONLY ATTACHMENT\n').toString('base64'),
    });
    assert.equal(uploadRes.status, 201);
    const attR42 = uploadRes.body.data;

    const createRes = await call('HR_DIRECTOR', 'post', '/api/notices', {
      title: '[R42-TEST] Thông Báo Nội Bộ Riêng Khối Kỹ Thuật DEPT-IT',
      content: 'Nội dung mật chỉ dành cho nhân sự phòng DEPT-IT, không hiển thị cho DEPT-SALES.',
      category: 'policy',
      priority: 'high',
      targetRole: null,
      targetDepartmentId: 'DEPT-IT',
      isPinned: true,
      attachments: [{ id: attR42.id, name: attR42.name }],
    });
    assert.equal(createRes.status, 201);
    const noticeId = createRes.body.data.id;
    const notifId = `NOTIF-${noticeId}`;

    try {
      // 1. Verify raw DB row in `notifications` does NOT duplicate content or attachments
      const rawNotifDb = await db.query(
        'SELECT summary, action_payload FROM notifications WHERE id = $1',
        [notifId]
      );
      assert.equal(rawNotifDb.rows[0].summary, null);
      assert.equal(rawNotifDb.rows[0].action_payload.content, undefined);
      assert.equal(rawNotifDb.rows[0].action_payload.attachments, undefined);

      // 2. Out-of-scope employee (DEPT-MKT) receives zero leakage in unreadCount, list, markRead, markAllRead
      const salesUnreadAfter = (await callWith(salesEmpSession.token, 'get', '/api/notifications/unread-count')).body.count;
      assert.equal(salesUnreadAfter, salesUnreadBefore, 'Out-of-scope department unreadCount must not change');

      const salesListRes = await callWith(salesEmpSession.token, 'get', '/api/notifications?limit=50');
      assert.equal(salesListRes.status, 200);
      assert.equal(salesListRes.body.unreadCount, salesUnreadBefore);
      const salesSerialized = JSON.stringify(salesListRes.body);
      assert.equal(salesSerialized.includes(noticeId), false);
      assert.equal(salesSerialized.includes('[R42-TEST]'), false);
      assert.equal(salesSerialized.includes('Nội dung mật chỉ dành cho nhân sự phòng DEPT-IT'), false);
      assert.equal(salesSerialized.includes('quy-che-dept-it-r42.pdf'), false);

      const salesMarkReadRes = await callWith(
        salesEmpSession.token,
        'patch',
        `/api/notifications/${notifId}/read`
      );
      assert.equal(salesMarkReadRes.status, 404);

      const markAllRes = await callWith(salesEmpSession.token, 'post', '/api/notifications/read-all');
      assert.equal(markAllRes.status, 200);
      const readersCheck = await call('HR_DIRECTOR', 'get', `/api/notices/${noticeId}/readers`);
      assert.equal(
        readersCheck.body.data.readers.some((r) => r.id === salesEmpSession.employeeId),
        false
      );

      // 3. In-scope employee (DEPT-IT) sees the notification with live hydrated content & attachments
      const itUnreadAfter = (await callWith(itEmpSession.token, 'get', '/api/notifications/unread-count')).body.count;
      assert.equal(itUnreadAfter, itUnreadBefore + 1);

      const itListRes = await callWith(itEmpSession.token, 'get', '/api/notifications?limit=50');
      const itNotif = itListRes.body.data.find((n) => n.id === notifId);
      assert.ok(itNotif, 'In-scope DEPT-IT employee should receive the notice notification');
      assert.equal(itNotif.title, '[R42-TEST] Thông Báo Nội Bộ Riêng Khối Kỹ Thuật DEPT-IT');
      assert.match(itNotif.summary, /Nội dung mật chỉ dành cho nhân sự phòng DEPT-IT/);
      assert.equal(itNotif.action_payload.attachments.length, 1);
      assert.equal(itNotif.action_payload.attachments[0].id, attR42.id);

      // 4. Send reminder (`POST /api/notices/:id/remind`), then move IT employee to DEPT-SALES
      const remindRes = await call('HR_DIRECTOR', 'post', `/api/notices/${noticeId}/remind`);
      assert.equal(remindRes.status, 200);

      const itListWithRemind = await callWith(itEmpSession.token, 'get', '/api/notifications?limit=50');
      const remindItem = itListWithRemind.body.data.find(
        (n) => n.id.startsWith(`REMIND-${noticeId}-`)
      );
      assert.ok(remindItem, 'In-scope unread employee should receive reminder notification');

      // Change employee department to DEPT-MKT -> both NOTIF and REMIND must immediately become invisible
      await db.query(`UPDATE employees SET department_id = 'DEPT-MKT' WHERE id = $1`, [
        itEmpSession.employeeId,
      ]);
      const movedList = await callWith(itEmpSession.token, 'get', '/api/notifications?limit=50');
      assert.equal(
        movedList.body.data.some((n) => n.id === notifId || n.id === remindItem.id),
        false,
        'Transferred employee must lose access to old department notice & reminder notifications immediately'
      );
      const movedMarkRemind = await callWith(
        itEmpSession.token,
        'patch',
        `/api/notifications/${remindItem.id}/read`
      );
      assert.equal(movedMarkRemind.status, 404);

      // Restore employee back to DEPT-IT
      await db.query(`UPDATE employees SET department_id = 'DEPT-IT' WHERE id = $1`, [
        itEmpSession.employeeId,
      ]);

      // 5. Update notice targetRole to LINE_MANAGER -> EMPLOYEE in DEPT-IT loses visibility immediately
      await call('HR_DIRECTOR', 'put', `/api/notices/${noticeId}`, {
        targetRole: 'LINE_MANAGER',
      });
      const afterRoleChange = await callWith(itEmpSession.token, 'get', '/api/notifications?limit=50');
      assert.equal(afterRoleChange.body.data.some((n) => n.id === notifId), false);

      // 6. Reset targetRole=null, deactivate notice (isActive=false) -> remains invisible
      await call('HR_DIRECTOR', 'put', `/api/notices/${noticeId}`, {
        targetRole: null,
        isActive: false,
      });
      const afterDeactivate = await callWith(itEmpSession.token, 'get', '/api/notifications?limit=50');
      assert.equal(afterDeactivate.body.data.some((n) => n.id === notifId), false);

      // 7. Reactivate but schedule publishedAt in the future -> invisible until publishedAt
      const tomorrowIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      await call('HR_DIRECTOR', 'put', `/api/notices/${noticeId}`, {
        isActive: true,
        publishedAt: tomorrowIso,
      });
      const afterFutureSchedule = await callWith(itEmpSession.token, 'get', '/api/notifications?limit=50');
      assert.equal(afterFutureSchedule.body.data.some((n) => n.id === notifId), false);

      // 8. Simulate expired notice (published_at in past, expires_at in past) -> invisible
      await db.query(
        `UPDATE company_notices
         SET published_at = NOW() - INTERVAL '3 days',
             expires_at = NOW() - INTERVAL '1 hour',
             is_active = TRUE
         WHERE id = $1`,
        [noticeId]
      );
      const afterExpired = await callWith(itEmpSession.token, 'get', '/api/notifications?limit=50');
      assert.equal(afterExpired.body.data.some((n) => n.id === notifId), false);
    } finally {
      await call('HR_DIRECTOR', 'delete', `/api/notices/${noticeId}`);
    }

    // 9. After DELETE /api/notices/:id, both NOTIF and REMIND rows are gone from DB
    const remainingDbNotifs = await db.query(
      `SELECT id FROM notifications WHERE id = $1 OR id LIKE $2`,
      [notifId, `REMIND-${noticeId}-%`]
    );
    assert.equal(remainingDbNotifs.rowCount, 0);
  });

  it('R43: enforces attachment ownership, prevents concurrent double-bind, and preserves bound files across DB rollbacks on create, update, and remove', async () => {
    // 1. Ownership check: HR uploads staged attachment; CEO cannot delete or bind it
    const ownedBytes = Buffer.from('%PDF-1.4 R43 OWNERSHIP TEST\n', 'utf8');
    const uploadedByHr = await noticesService.uploadAttachment(hrActor, {
      name: 'hr-owned-staged.pdf',
      type: 'application/pdf',
      contentBase64: ownedBytes.toString('base64'),
    });

    await assert.rejects(
      () => noticesService.deleteAttachment(ceoActor, uploadedByHr.id),
      (err) => err.status === 403
    );

    await assert.rejects(
      () =>
        noticesService.create(
          ceoActor,
          {
            title: 'CEO attempting to bind HR staged attachment',
            content: 'Should fail with 403',
            category: 'general',
            priority: 'normal',
            isPinned: false,
            attachments: [{ id: uploadedByHr.id, name: uploadedByHr.name }],
          },
          null
        ),
      (err) => err.status === 403
    );

    // 2. Concurrent bind protection: two simultaneous create calls trying to bind `uploadedByHr`
    let releaseFirstCreateBarrier;
    const firstCreateBarrier = new Promise((resolve) => {
      releaseFirstCreateBarrier = resolve;
    });

    const p1 = noticesService.create(
      hrActor,
      {
        title: '[R43] Concurrent Bind Winner',
        content: 'First request holding lock',
        category: 'general',
        priority: 'normal',
        isPinned: false,
        attachments: [{ id: uploadedByHr.id, name: uploadedByHr.name }],
      },
      null,
      {
        beforeAuditHook: async () => {
          await firstCreateBarrier;
        },
      }
    );

    // Give p1 a tick to acquire the lock, then launch p2 concurrently
    await new Promise((r) => setTimeout(r, 25));
    await assert.rejects(
      () =>
        noticesService.create(
          hrActor,
          {
            title: '[R43] Concurrent Bind Contender',
            content: 'Second request must be rejected by lock',
            category: 'general',
            priority: 'normal',
            isPinned: false,
            attachments: [{ id: uploadedByHr.id, name: uploadedByHr.name }],
          },
          null
        ),
      (err) => err.status === 409 && err.code === 'ATTACHMENT_CONCURRENT_CONFLICT'
    );

    releaseFirstCreateBarrier();
    const createdWinner = await p1;
    await noticesService.remove(hrActor, createdWinner.id, null);

    // 3. Rollback on `create` before commit keeps staged attachment reusable (noticeId=null, state='staged')
    const stagedForCreate = await noticesService.uploadAttachment(hrActor, {
      name: 'r43-create-rollback.pdf',
      type: 'application/pdf',
      contentBase64: Buffer.from('%PDF-1.4 R43 CREATE ROLLBACK\n', 'utf8').toString('base64'),
    });

    await assert.rejects(
      () =>
        noticesService.create(
          hrActor,
          {
            title: '[R43] Failing Create',
            content: 'Will fail before commit',
            category: 'general',
            priority: 'normal',
            isPinned: false,
            attachments: [{ id: stagedForCreate.id, name: stagedForCreate.name }],
          },
          null,
          {
            beforeCommitHook: async () => {
              throw new Error('INJECTED_CREATE_COMMIT_FAILURE');
            },
          }
        ),
      /INJECTED_CREATE_COMMIT_FAILURE/
    );

    const metaAfterFailedCreate = noticesService.readAttachmentMeta(stagedForCreate.id);
    assert.ok(metaAfterFailedCreate);
    assert.equal(metaAfterFailedCreate.noticeId, null);
    assert.equal(metaAfterFailedCreate.state, 'staged');

    // Retry create with the exact same staged attachment -> succeeds!
    const createdNotice = await noticesService.create(
      hrActor,
      {
        title: '[R43] Succeeded Create After Retry',
        content: 'Attachment bound after commit',
        category: 'general',
        priority: 'normal',
        isPinned: false,
        attachments: [{ id: stagedForCreate.id, name: stagedForCreate.name }],
      },
      null
    );
    const metaAfterCommittedCreate = noticesService.readAttachmentMeta(stagedForCreate.id);
    assert.equal(metaAfterCommittedCreate.noticeId, createdNotice.id);
    assert.equal(metaAfterCommittedCreate.state, 'bound');

    // 4. Rollback on `update` at 3 failure points (before notifications update, before writeAudit, before commit)
    // must NEVER delete the existing bound file `stagedForCreate`!
    const replacementStaged = await noticesService.uploadAttachment(hrActor, {
      name: 'r43-replacement.pdf',
      type: 'application/pdf',
      contentBase64: Buffer.from('%PDF-1.4 R43 REPLACEMENT\n', 'utf8').toString('base64'),
    });

    for (const hookName of ['afterNoticeUpdateHook', 'beforeAuditHook', 'beforeCommitHook']) {
      await assert.rejects(
        () =>
          noticesService.update(
            hrActor,
            createdNotice.id,
            {
              title: `[R43] Update failing at ${hookName}`,
              attachments: [{ id: replacementStaged.id, name: replacementStaged.name }],
            },
            null,
            {
              [hookName]: async () => {
                throw new Error(`INJECTED_UPDATE_${hookName}_FAILURE`);
              },
            }
          ),
        new RegExp(`INJECTED_UPDATE_${hookName}_FAILURE`)
      );

      // Verify old attachment is STILL intact on disk, bound, and downloadable via HTTP!
      const dlCheck = await request(app)
        .get(`/api/notices/${createdNotice.id}/attachments/${stagedForCreate.id}/download`)
        .set('Authorization', `Bearer ${itEmpSession.token}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      assert.equal(dlCheck.status, 200, `Old file must remain downloadable after ${hookName} rollback`);
      assert.equal(
        crypto.createHash('sha256').update(dlCheck.body).digest('hex'),
        stagedForCreate.sha256
      );

      const repMeta = noticesService.readAttachmentMeta(replacementStaged.id);
      assert.equal(repMeta.noticeId, null);
      assert.equal(repMeta.state, 'staged');
    }

    // Now perform the update without failure -> old file is removed post-commit, replacement is bound!
    await noticesService.update(
      hrActor,
      createdNotice.id,
      {
        title: '[R43] Update Committed',
        attachments: [{ id: replacementStaged.id, name: replacementStaged.name }],
      },
      null
    );
    assert.equal(noticesService.readAttachmentMeta(stagedForCreate.id), null);
    assert.equal(noticesService.readAttachmentMeta(replacementStaged.id)?.state, 'bound');

    // 5. Rollback on `remove` at 3 failure points (afterNoticeDeleteHook, beforeAuditHook, beforeCommitHook)
    // must NEVER delete `replacementStaged`!
    for (const hookName of ['afterNoticeDeleteHook', 'beforeAuditHook', 'beforeCommitHook']) {
      await assert.rejects(
        () =>
          noticesService.remove(hrActor, createdNotice.id, null, {
            [hookName]: async () => {
              throw new Error(`INJECTED_REMOVE_${hookName}_FAILURE`);
            },
          }),
        new RegExp(`INJECTED_REMOVE_${hookName}_FAILURE`)
      );

      const dlCheckAfterRemoveRollback = await request(app)
        .get(`/api/notices/${createdNotice.id}/attachments/${replacementStaged.id}/download`)
        .set('Authorization', `Bearer ${itEmpSession.token}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      assert.equal(dlCheckAfterRemoveRollback.status, 200);
      assert.equal(
        crypto.createHash('sha256').update(dlCheckAfterRemoveRollback.body).digest('hex'),
        replacementStaged.sha256
      );
    }

    // Finally remove notice cleanly -> file is deleted post-commit
    await noticesService.remove(hrActor, createdNotice.id, null);
    assert.equal(noticesService.readAttachmentMeta(replacementStaged.id), null);
  });

  it('R44: isolates test storage from production storage, preserves sentinel files outside test root, and verifies ~5MB vs >5MB upload through reverse proxy enforcing nginx.conf client_max_body_size', async () => {
    // 1. Verify active test storage directory is isolated from production storage directory
    const activeTestDir = noticesService.getStorageDir();
    assert.notEqual(
      path.resolve(activeTestDir),
      path.resolve(noticesService.PROD_DEFAULT_STORAGE_DIR)
    );
    assert.throws(
      () => noticesService.assertSafeStorageDir(noticesService.PROD_DEFAULT_STORAGE_DIR),
      /UNSAFE_TEST_STORAGE_PATH/
    );

    // 2. Verify production storage directory was untouched by all test uploads/cleanups
    if (fs.existsSync(noticesService.PROD_DEFAULT_STORAGE_DIR)) {
      const prodStorageSnapshotAfter = fs
        .readdirSync(noticesService.PROD_DEFAULT_STORAGE_DIR)
        .sort();
      assert.deepEqual(prodStorageSnapshotAfter, prodStorageSnapshotBefore);
    }

    // 3. Parse `client_max_body_size` from `FrontEnd/nginx.conf` and verify Docker/Nginx configuration files
    const nginxConf = fs.readFileSync(
      path.join(__dirname, '../../../FrontEnd/nginx.conf'),
      'utf8'
    );
    const maxBodyMatch = nginxConf.match(/client_max_body_size\s+(\d+)m\s*;/i);
    assert.ok(maxBodyMatch, 'FrontEnd/nginx.conf must declare client_max_body_size in MB');
    const nginxMaxBodyBytes = Number(maxBodyMatch[1]) * 1024 * 1024;
    assert.ok(
      nginxMaxBodyBytes >= 10 * 1024 * 1024,
      'Nginx client_max_body_size must be at least 10MB to carry 5MB binary encoded as base64 JSON'
    );

    const composeYml = fs.readFileSync(
      path.join(__dirname, '../../../docker-compose.yml'),
      'utf8'
    );
    assert.match(composeYml, /nexus-storage-data:\/app\/storage/);
    const dockerignore = fs.readFileSync(path.join(__dirname, '../../.dockerignore'), 'utf8');
    assert.match(dockerignore, /^storage/m);

    // 4. Spin up a real HTTP reverse proxy server enforcing `nginxMaxBodyBytes` from `FrontEnd/nginx.conf`
    // forwarding to a real HTTP listener of `app`
    const backendServer = http.createServer(app);
    await new Promise((resolve) => backendServer.listen(0, '127.0.0.1', resolve));
    const backendPort = backendServer.address().port;

    const proxyServer = http.createServer((clientReq, clientRes) => {
      let receivedBytes = 0;
      const chunks = [];
      let aborted = false;

      clientReq.on('data', (chunk) => {
        if (aborted) return;
        receivedBytes += chunk.length;
        if (receivedBytes > nginxMaxBodyBytes) {
          aborted = true;
          clientRes.writeHead(413, { 'Content-Type': 'application/json' });
          clientRes.end(
            JSON.stringify({
              status: 'error',
              code: 'NGINX_CLIENT_MAX_BODY_SIZE_EXCEEDED',
              message: `413 Request Entity Too Large (exceeded ${maxBodyMatch[1]}m proxy limit)`,
            })
          );
          return;
        }
        chunks.push(chunk);
      });

      clientReq.on('end', () => {
        if (aborted) return;
        const bodyBuf = Buffer.concat(chunks);
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: backendPort,
            path: clientReq.url,
            method: clientReq.method,
            headers: {
              ...clientReq.headers,
              'content-length': bodyBuf.length,
            },
          },
          (proxyRes) => {
            clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(clientRes);
          }
        );
        proxyReq.on('error', (err) => {
          clientRes.writeHead(502);
          clientRes.end(err.message);
        });
        proxyReq.end(bodyBuf);
      });
    });

    await new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
    const proxyPort = proxyServer.address().port;

    try {
      const hrLogin = await call('HR_DIRECTOR', 'get', '/api/auth/me');
      assert.equal(hrLogin.status, 200);
      const { tokenFor } = require('../helpers/api');
      const hrToken = await tokenFor('HR_DIRECTOR');

      // 4A. Upload a ~4.85MB binary PDF (~6.47MB base64 JSON body) through the proxy -> 201 Created!
      const near5MbBuf = Buffer.concat([
        Buffer.from('%PDF-1.4 NEAR 5MB TEST\n'),
        Buffer.alloc(4.85 * 1024 * 1024, 0x41),
      ]);
      const near5MbSha = crypto.createHash('sha256').update(near5MbBuf).digest('hex');

      const near5MbRes = await fetch(`http://127.0.0.1:${proxyPort}/api/notices/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hrToken}`,
        },
        body: JSON.stringify({
          name: 'near-5mb-handbook.pdf',
          type: 'application/pdf',
          sizeBytes: near5MbBuf.length,
          contentBase64: near5MbBuf.toString('base64'),
        }),
      });
      assert.equal(near5MbRes.status, 201);
      const near5MbJson = await near5MbRes.json();
      assert.equal(near5MbJson.data.sha256, near5MbSha);
      await noticesService.deleteAttachment(hrActor, near5MbJson.data.id);

      // 4B. Upload a 5.2MB binary PDF (~6.93MB base64 JSON body) through the proxy -> 413 ATTACHMENT_TOO_LARGE
      const over5MbBuf = Buffer.alloc(Math.floor(5.2 * 1024 * 1024), 0x42);
      const over5MbRes = await fetch(`http://127.0.0.1:${proxyPort}/api/notices/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hrToken}`,
        },
        body: JSON.stringify({
          name: 'over-5mb.pdf',
          type: 'application/pdf',
          sizeBytes: over5MbBuf.length,
          contentBase64: over5MbBuf.toString('base64'),
        }),
      });
      assert.equal(over5MbRes.status, 413);
      const over5MbJson = await over5MbRes.json();
      assert.equal(over5MbJson.code, 'ATTACHMENT_TOO_LARGE');

      // 4C. Upload a >10MB request body through the proxy -> 413 rejected at the proxy threshold
      const overProxyLimitBuf = Buffer.alloc(8 * 1024 * 1024, 0x43); // ~10.67MB base64 JSON > 10MB proxy limit
      const overProxyRes = await fetch(`http://127.0.0.1:${proxyPort}/api/notices/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hrToken}`,
        },
        body: JSON.stringify({
          name: 'over-proxy-10mb.pdf',
          type: 'application/pdf',
          contentBase64: overProxyLimitBuf.toString('base64'),
        }),
      });
      assert.equal(overProxyRes.status, 413);
    } finally {
      await new Promise((resolve) => proxyServer.close(resolve));
      await new Promise((resolve) => backendServer.close(resolve));
    }
  });
});
