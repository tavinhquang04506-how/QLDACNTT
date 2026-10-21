const aiService = require('../src/modules/ai/service');
const db = require('../src/config/db');
const app = require('../src/app');
const { callWith, closeDb } = require('../tests/helpers/api');
const { employeeSession } = require('../tests/helpers/sessions');
const { deleteTestUsers } = require('../tests/helpers/users');
const { deleteTestEmployees } = require('../tests/helpers/employees');

async function main() {
  console.log('=== [R35-R36 REPRODUCTION BEFORE FIX ON fe918e1] ===');
  const { rows: dbRows } = await db.query('SELECT current_database() AS db_name');
  console.log('CURRENT_DB=', dbRows[0].db_name);

  const throwingExecutor = {
    query: async () => {
      throw new Error('Executor should not be called');
    },
  };

  // 1. R35a: English query + ungrounded English answer without calling tools
  const r35a = await aiService.runCopilot({
    actor: {
      userId: 'USR-R35',
      employeeId: 'NV-R35',
      roleCode: 'EMPLOYEE',
      departmentId: 'DEPT-IT',
    },
    message: 'How many vacation days do I have?',
    executor: throwingExecutor,
    options: {
      apiKey: 'mock-key',
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
  console.log('R35a_ENGLISH_UNGROUNDED=', JSON.stringify({
    answer: r35a.answer,
    toolsUsed: r35a.toolsUsed,
    verified: r35a.verified,
    refused: r35a.refused,
    refusalCodes: r35a.refusalCodes,
  }));

  // 2. R35b: Unaccented Vietnamese query + written number words without calling tools
  const r35b = await aiService.runCopilot({
    actor: {
      userId: 'USR-R35',
      employeeId: 'NV-R35',
      roleCode: 'EMPLOYEE',
      departmentId: 'DEPT-IT',
    },
    message: 'Toi con bao nhieu ngay phep?',
    executor: throwingExecutor,
    options: {
      apiKey: 'mock-key',
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
  console.log('R35b_VI_NO_ACCENT_WORD_NUMBER=', JSON.stringify({
    answer: r35b.answer,
    toolsUsed: r35b.toolsUsed,
    verified: r35b.verified,
    refused: r35b.refused,
    refusalCodes: r35b.refusalCodes,
  }));

  // 3. R35c: Semantic field swap (total_days=12 vs remaining_days=5 -> model says "còn 12 ngày")
  const mgrSession = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const { rows: ltRows } = await db.query("SELECT id FROM leave_types WHERE code = 'PHEP_NAM' LIMIT 1");
  const leaveTypeAlId = ltRows[0]?.id || 'LT-AL';
  await db.query(
    `INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
     VALUES ($1, $2, 2026, 12, 7)
     ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE SET total_days = 12, used_days = 7`,
    [mgrSession.employeeId, leaveTypeAlId]
  );

  let round = 0;
  const r35c = await callWith(mgrSession.token, 'post', '/api/ai/copilot', {
    message: 'Tôi còn bao nhiêu ngày phép năm 2026?',
  });
  app.locals.aiTestOptions = {
    apiKey: 'mock-key',
    model: 'gemini-2.5-flash',
    fetchImpl: async () => {
      round += 1;
      if (round === 1) {
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
                parts: [{ text: 'Năm 2026 bạn còn lại 12 ngày phép (tổng định mức 12 ngày, đã dùng 7 ngày).' }],
              },
            },
          ],
        }),
      };
    },
  };
  const r35cRes = await callWith(mgrSession.token, 'post', '/api/ai/copilot', {
    message: 'Tôi còn bao nhiêu ngày phép năm 2026?',
  });
  console.log('R35c_SEMANTIC_SWAP_TOTAL_AS_REMAINING=', JSON.stringify({
    answer: r35cRes.body.answer,
    verified: r35cRes.body.verified,
    refused: r35cRes.body.refused,
    refusalCodes: r35cRes.body.refusalCodes,
  }));

  // 4. R36: Mid-flight DB scope change while provider is waiting on a barrier
  let markProviderEntered;
  const providerEntered = new Promise((r) => {
    markProviderEntered = r;
  });
  let releaseBarrier;
  const barrier = new Promise((r) => {
    releaseBarrier = r;
  });

  app.locals.aiTestOptions = {
    apiKey: 'mock-key',
    model: 'gemini-2.5-flash',
    fetchImpl: async () => {
      markProviderEntered();
      await barrier;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Xin chào Trưởng phòng DEPT-IT! Đây là phản hồi theo scope cũ.' }],
              },
            },
          ],
        }),
      };
    },
  };

  const inFlightPromise = callWith(mgrSession.token, 'post', '/api/ai/copilot', {
    message: 'Xin chào',
    conversationId: 'conv-r36-repro',
  }).then((r) => r);

  await providerEntered;
  // Change department to NULL in DB while provider is waiting
  await db.query(`UPDATE employees SET department_id = NULL WHERE id = $1`, [mgrSession.employeeId]);
  releaseBarrier();

  const r36Res = await inFlightPromise;
  console.log('R36_IN_FLIGHT_DB_SCOPE_CHANGE=', JSON.stringify({
    status: r36Res.status,
    answer: r36Res.body.answer,
    verified: r36Res.body.verified,
    refused: r36Res.body.refused,
    refusalCodes: r36Res.body.refusalCodes,
  }));

  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
