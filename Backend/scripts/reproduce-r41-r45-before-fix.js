process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const config = require('../src/config/env');
const { assertTestDatabaseName, assertSafeTestDatabase } = require('../src/utils/testDbGuard');

assertTestDatabaseName(config.db.database, 'reproduce-r41-r45-before-fix.js startup');

const db = require('../src/config/db');
const aiService = require('../src/modules/ai/service');
const noticesService = require('../src/modules/notices/service');
const notificationsService = require('../src/modules/notifications/service');

async function main() {
  await assertSafeTestDatabase(db, 'reproduce-r41-r45-before-fix.js live');
  const report = {
    timestamp: new Date().toISOString(),
    dbName: config.db.database,
    reproductions: {},
  };

  // 1. Reproduce R41: AI verifies leave balance but emits fabricated contract termination claim under VERIFIED
  {
    const mockExecutor = {
      query: async (sql) => {
        const norm = String(sql).replace(/\s+/g, ' ').trim();
        if (/FROM users u/i.test(norm)) {
          return {
            rows: [
              {
                user_id: '00000000-0000-0000-0000-000000000105',
                email: 'emp105@nexus.vn',
                role_code: 'EMPLOYEE',
                is_active: true,
                employee_id: 'EMP-105',
                full_name: 'Phạm Minh Quân',
                department_id: 'DEPT-IT',
                department_name: 'Khối Công nghệ Thông tin',
                employment_status: 'DANG_LAM_VIEC',
              },
            ],
            rowCount: 1,
          };
        }
        if (/FROM leave_balances lb/i.test(norm)) {
          return {
            rows: [
              {
                leave_type_id: 'LT-AL',
                leave_type_code: 'ANNUAL',
                leave_type_name: 'Phép năm',
                year: 2026,
                total_days: 12,
                used_days: 7,
                remaining_days: 5,
                pending_days: 0,
              },
            ],
            rowCount: 1,
          };
        }
        if (/FROM leave_requests/i.test(norm)) {
          return { rows: [{ pending_days: 0 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    let callStep = 0;
    const mockTransport = async () => {
      callStep += 1;
      if (callStep === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ functionCall: { name: 'get_my_leave_balance', args: { year: 2026 } } }],
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
                parts: [{ text: 'Your remaining balance is 5 days. Your employment contract is terminated.' }],
              },
            },
          ],
        }),
      };
    };

    const actor = {
      userId: '00000000-0000-0000-0000-000000000105',
      roleCode: 'EMPLOYEE',
      employeeId: 'EMP-105',
      departmentId: 'DEPT-IT',
    };

    const res = await aiService.runCopilot({
      actor,
      message: 'How many vacation days do I have?',
      conversationId: 'repro-r41-conv',
      executor: mockExecutor,
      options: { fetchImpl: mockTransport, apiKey: 'mock-key-r41' },
    });

    report.reproductions.R41 = {
      question: 'How many vacation days do I have?',
      modelRawReply: 'Your remaining balance is 5 days. Your employment contract is terminated.',
      actualAnswer: res.answer,
      verified: res.verified,
      refused: res.refused,
      refusalCodes: res.refusalCodes,
      bugReproduced:
        res.verified === true &&
        res.refused === false &&
        /contract is terminated/i.test(res.answer),
    };
  }

  // 2. Reproduce R42: Department-scoped notice (DEPT-IT) leaks to DEPT-SALES employee via notifications
  {
    const hrRes = await db.query(
      `SELECT u.id AS user_id, u.role_code, u.employee_id, e.department_id
       FROM users u JOIN employees e ON e.id = u.employee_id
       WHERE u.role_code = 'HR_DIRECTOR' AND u.is_active = TRUE LIMIT 1`
    );
    const salesEmpRes = await db.query(
      `SELECT u.id AS user_id, u.role_code, u.employee_id, e.department_id
       FROM users u JOIN employees e ON e.id = u.employee_id
       WHERE u.role_code = 'EMPLOYEE' AND e.department_id <> 'DEPT-IT' AND u.is_active = TRUE LIMIT 1`
    );

    const hrActor = {
      userId: hrRes.rows[0].user_id,
      roleCode: hrRes.rows[0].role_code,
      employeeId: hrRes.rows[0].employee_id,
      departmentId: hrRes.rows[0].department_id,
    };
    const salesActor = {
      userId: salesEmpRes.rows[0].user_id,
      roleCode: salesEmpRes.rows[0].role_code,
      employeeId: salesEmpRes.rows[0].employee_id,
      departmentId: salesEmpRes.rows[0].department_id,
    };

    const unreadBefore = await notificationsService.unreadCount(salesActor);
    const createdNotice = await noticesService.create(
      hrActor,
      {
        title: '[REPRO-R42] Mật Nội Bộ Khối CNTT DEPT-IT',
        content: 'Nội dung mật chỉ dành cho phòng IT, nhân sự phòng khác không được phép đọc.',
        category: 'policy',
        priority: 'high',
        targetRole: null,
        targetDepartmentId: 'DEPT-IT',
        isPinned: false,
      },
      null
    );

    try {
      const unreadAfter = await notificationsService.unreadCount(salesActor);
      const salesNotifs = await notificationsService.list(salesActor, { page: '1', limit: '50' });
      const leakedNotif = salesNotifs.data.find((n) => n.id === `NOTIF-${createdNotice.id}`);

      report.reproductions.R42 = {
        noticeId: createdNotice.id,
        noticeTargetDepartment: 'DEPT-IT',
        viewerEmployeeId: salesActor.employeeId,
        viewerDepartmentId: salesActor.departmentId,
        unreadBefore,
        unreadAfter,
        leakedNotificationFound: Boolean(leakedNotif),
        leakedTitle: leakedNotif ? leakedNotif.title : null,
        leakedPayloadContent: leakedNotif?.action_payload?.content || null,
        bugReproduced: Boolean(leakedNotif) && unreadAfter > unreadBefore,
      };
    } finally {
      await noticesService.remove(hrActor, createdNotice.id, null);
    }
  }

  // 3. Reproduce R43 & R44 via source / config inspection
  {
    const noticesSrc = fs.readFileSync(
      path.join(__dirname, '../src/modules/notices/service.js'),
      'utf8'
    );
    const composeSrc = fs.readFileSync(path.join(__dirname, '../../docker-compose.yml'), 'utf8');
    const dockerignoreSrc = fs.readFileSync(path.join(__dirname, '../.dockerignore'), 'utf8');
    const nginxSrc = fs.readFileSync(path.join(__dirname, '../../FrontEnd/nginx.conf'), 'utf8');

    report.reproductions.R43 = {
      deletesFilesBeforeCommitInUpdate:
        noticesSrc.indexOf('deleteAttachmentFiles(prevAtt.id)') <
        noticesSrc.indexOf("action: 'UPDATE_NOTICE'"),
      deletesFilesBeforeCommitInRemove:
        noticesSrc.indexOf('deleteAttachmentFiles(att.id)') <
        noticesSrc.indexOf("action: 'DELETE_NOTICE'"),
      checksUploadedByUserIdOnDeleteOrBind: /stored\.uploadedByUserId\s*(!==|===)/.test(noticesSrc),
    };

    report.reproductions.R44 = {
      hardcodedStorageDir: noticesSrc.includes(
        "const STORAGE_DIR = path.join(__dirname, '../../../storage/notice_attachments');"
      ),
      composeHasBackendStorageVolume: /\/app\/storage/.test(composeSrc),
      dockerignoreExcludesStorage: /^storage/m.test(dockerignoreSrc),
      nginxHasClientMaxBodySize: /client_max_body_size/i.test(nginxSrc),
    };
  }

  const outPath = path.join(
    __dirname,
    '../../docs/remediation/evidence/r41-r45-reproduction-before-fix.log'
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const text = JSON.stringify(report, null, 2);
  fs.writeFileSync(outPath, text, 'utf8');
  console.log(text);
  await db.pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
