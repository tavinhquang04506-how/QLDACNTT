/**
 * Reproduction script for R31–R34 BEFORE fix on commit 9c25e85.
 * Verifies current behavior without modifying nexus_hrms.
 */
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const { assertSafeTestDatabase } = require('../src/utils/testDbGuard');
const db = require('../src/config/db');
const app = require('../src/app');
const { callWith, loginUser, closeDb } = require('../tests/helpers/api');
const { employeeSession } = require('../tests/helpers/sessions');
const { deleteTestUsers } = require('../tests/helpers/users');
const { deleteTestEmployees } = require('../tests/helpers/employees');
const { runCopilot, clearAiRuntimeState, registerConversationOwner } = require('../src/modules/ai/service');

async function main() {
  await assertSafeTestDatabase(db, 'reproduce-r31-r34-before-fix');
  console.log('=== [R31-R34 REPRODUCTION BEFORE FIX START] ===');
  console.log(`TIMESTAMP=${new Date().toISOString()}`);

  try {
    // -------------------------------------------------------------------------
    // 1. R31 Reproduction: Route POST /api/ai/copilot does not resolve departmentId
    //    and service.js requires both existingConv.departmentId && actor.departmentId truthy.
    // -------------------------------------------------------------------------
    clearAiRuntimeState();
    const mgrSession = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
    const convId = 'conv-r31-repro-route';
    registerConversationOwner(
      convId,
      mgrSession.user.id,
      [
        { role: 'user', parts: [{ text: 'OLD_DEPARTMENT_SECRET_FIXTURE' }] },
        { role: 'model', parts: [{ text: 'Bí mật phòng IT cũ' }] },
      ],
      { roleCode: 'LINE_MANAGER', departmentId: 'DEPT-IT' }
    );

    // Move manager in DB from DEPT-IT to DEPT-SALES while keeping role LINE_MANAGER
    await db.query(`UPDATE employees SET department_id = 'DEPT-SALES' WHERE id = $1`, [mgrSession.employeeId]);

    let capturedContents = [];
    app.locals.aiTestOptions = {
      apiKey: 'test-key-r31',
      model: 'gemini-2.5-flash',
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        capturedContents = body.contents || [];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { role: 'model', parts: [{ text: 'Xin chào' }] } }],
          }),
        };
      },
    };

    await callWith(mgrSession.token, 'post', '/api/ai/copilot', {
      message: 'Xin chào',
      conversationId: convId,
    });

    const historySent = JSON.stringify(capturedContents).includes('OLD_DEPARTMENT_SECRET_FIXTURE');
    console.log(
      `[R31 BEFORE FIX] Manager moved DEPT-IT -> DEPT-SALES on POST /api/ai/copilot: historySent=${historySent} (expected false after fix)`
    );

    // -------------------------------------------------------------------------
    // 2. R32 Reproduction: Model skipping tool returns fabricated HR facts as verified
    // -------------------------------------------------------------------------
    clearAiRuntimeState();
    const r32NoToolResult = await runCopilot({
      actor: { userId: mgrSession.user.id, employeeId: mgrSession.employeeId, roleCode: 'LINE_MANAGER' },
      message: 'Tôi còn bao nhiêu ngày phép?',
      options: {
        apiKey: 'test-key-r32',
        model: 'gemini-2.5-flash',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { role: 'model', parts: [{ text: 'Bạn còn 99 ngày phép.' }] } }],
          }),
        }),
      },
      executor: {
        query: async () => {
          throw new Error('DB_MUST_NOT_BE_CALLED_WHEN_MODEL_SKIPS_TOOL');
        },
      },
    });
    console.log(
      `[R32 BEFORE FIX] Model skipped tool for leave balance question: ${JSON.stringify({
        answer: r32NoToolResult.answer,
        sources: r32NoToolResult.sources,
        toolsUsed: r32NoToolResult.toolsUsed,
        success: r32NoToolResult.success,
      })}`
    );

    // -------------------------------------------------------------------------
    // 3. R33 Reproduction: mapServerTask fabricates 09:00 log with viewer role name and turns kpi_weight=0 into 20
    // -------------------------------------------------------------------------
    const projectsTasksStatePath = path.resolve(__dirname, '../../FrontEnd/src/utils/projectsTasksState.js');
    const { mapServerTask } = await import(`file:///${projectsTasksStatePath.replace(/\\/g, '/')}`);
    const mappedByMgr = mapServerTask(
      { id: 'TSK-1001', title: 'Task A', kpi_weight: 0, created_at: null },
      'Dự án X',
      'Trưởng phòng IT'
    );
    const mappedByEmp = mapServerTask(
      { id: 'TSK-1001', title: 'Task A', kpi_weight: 0, created_at: null },
      'Dự án X',
      'Nhân viên B'
    );
    console.log(
      `[R33 BEFORE FIX] mapServerTask(kpi_weight=0): kpiWeight=${mappedByMgr.kpiWeight} (expected 0), viewer1Author="${mappedByMgr.logs?.[0]?.author}", viewer2Author="${mappedByEmp.logs?.[0]?.author}", fabricatedNote="${mappedByMgr.logs?.[0]?.note}"`
    );

    // -------------------------------------------------------------------------
    // 4. R34 Reproduction: UAT_MATRIX.md KIOSK row references wrong routes
    // -------------------------------------------------------------------------
    const uatMatrixContent = fs.readFileSync(
      path.resolve(__dirname, '../../docs/remediation/UAT_MATRIX.md'),
      'utf8'
    );
    const kioskLine = uatMatrixContent
      .split(/\r?\n/)
      .find((line) => line.includes('KIOSK'));
    console.log(`[R34 BEFORE FIX] UAT_MATRIX KIOSK row: ${kioskLine}`);
  } finally {
    app.locals.aiTestOptions = undefined;
    await deleteTestUsers();
    await deleteTestEmployees();
    await closeDb();
  }
  console.log('=== [R31-R34 REPRODUCTION BEFORE FIX END] ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
