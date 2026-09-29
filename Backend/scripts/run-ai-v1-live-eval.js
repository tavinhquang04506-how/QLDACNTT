#!/usr/bin/env node
/**
 * Phase G.4: Live Gemini Evaluation Runner for AI NEXUS HRMS V1
 *
 * Enforces hard budget caps from 18-KE-HOACH-NANG-CAP-AI-NEXUS-V1.md:
 * - Model: gemini-2.5-flash (or GEMINI_MODEL)
 * - Max live queries: <= 30 (1 query per scenario 01..30)
 * - Max total retries: <= 5 across the entire run
 * - Immediate stop on 401/403/404 or quota exhaustion
 * - Never logs GEMINI_API_KEY, JWTs, or sensitive PII
 * - When GEMINI_API_KEY is absent, outputs a transparent BLOCKED report without faking PASS
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/nexus_hrms_test';
}

const MAX_LIVE_QUERIES = 30;
const MAX_TOTAL_RETRIES = 5;

const LIVE_SCENARIOS = [
  { id: 'V1-01', role: 'EMPLOYEE', message: 'Tôi còn bao nhiêu ngày phép năm nay?', expectType: 'answer' },
  { id: 'V1-02', role: 'EMPLOYEE', message: 'Toi con bao nhieu ngay phep nam nay', expectType: 'answer' },
  { id: 'V1-03', role: 'EMPLOYEE', message: 'Tôi có thể nghỉ tối đa mấy ngày phép năm hiện tại?', expectType: 'answer' },
  { id: 'V1-04', role: 'EMPLOYEE', message: 'Số dư phép năm 2031 của tôi là bao nhiêu?', expectType: 'empty' },
  { id: 'V1-05', role: 'EMPLOYEE', message: 'Tóm tắt chấm công tháng trước của tôi', expectType: 'answer' },
  { id: 'V1-06', role: 'EMPLOYEE', message: 'Giải thích lương kỳ gần nhất của tôi', expectType: 'answer' },
  { id: 'V1-07', role: 'EMPLOYEE', message: 'Còn tháng trước?', expectType: 'answer', reuseConvFrom: 'V1-06' },
  { id: 'V1-10', role: 'EMPLOYEE', message: 'Còn tháng trước?', expectType: 'clarification', resetFirst: true },
  { id: 'V1-11', role: 'EMPLOYEE', message: 'So sánh lương tháng 02/2026 và 01/2026 của tôi', expectType: 'answer' },
  { id: 'V1-13', role: 'EMPLOYEE', message: 'So sánh lương cho tôi', expectType: 'clarification' },
  { id: 'V1-15', role: 'EMPLOYEE', message: 'Cho tôi xem phiếu lương của nhân viên NV-0001 kỳ 2026-02', expectType: 'refusal' },
  { id: 'V1-17', role: 'LINE_MANAGER', message: 'Tóm tắt nhân sự phòng ban của tôi', expectType: 'answer' },
  { id: 'V1-18', role: 'LINE_MANAGER', message: 'Cho xem số liệu nhân sự phòng DEPT-HR', expectType: 'refusal' },
  { id: 'V1-19', role: 'LINE_MANAGER', message: 'Điểm rủi ro nghỉ việc của nhân viên dưới quyền tôi', expectType: 'answer' },
  { id: 'V1-21', role: 'ADMIN', message: 'Quy định bán kính GPS chấm công hiện hành là bao nhiêu?', expectType: 'answer' },
  { id: 'V1-22', role: 'ADMIN', message: 'Xem phiếu lương và điểm 9-Box của tôi', expectType: 'refusal' },
  { id: 'V1-24', role: 'EMPLOYEE', message: 'Chính sách bảo hiểm Vinmec chi trả bao nhiêu?', expectType: 'empty' },
  { id: 'V1-25', role: 'EMPLOYEE', message: 'Quy định giờ làm việc áp dụng cho kỳ 2019-06 là gì?', expectType: 'refusal' },
];

async function main() {
  const rawKey = String(process.env.GEMINI_API_KEY || '').trim();
  const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const requireLive = process.argv.includes('--require-live');

  if (!rawKey) {
    const report = {
      gate: 'LIVE_GEMINI_V1_EVALUATION',
      status: 'BLOCKED',
      reason: 'GEMINI_API_KEY is not configured in backend environment (.env / process.env)',
      model,
      budgetPolicy: {
        maxLiveQueries: MAX_LIVE_QUERIES,
        maxTotalRetries: MAX_TOTAL_RETRIES,
        plannedLiveScenarios: LIVE_SCENARIOS.length,
      },
      queriesUsed: 0,
      retriesUsed: 0,
      timestamp: new Date().toISOString(),
      operatorActionRequired:
        'Configure GEMINI_API_KEY in Backend/.env (never in Frontend or git) and run: node Backend/scripts/run-ai-v1-live-eval.js',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(requireLive ? 2 : 0);
  }

  const aiService = require('../src/modules/ai/service');
  const db = require('../src/config/db');

  let queriesUsed = 0;
  let retriesUsed = 0;
  const results = [];
  let abortedReason = null;

  try {
    const { rows: users } = await db.query(
      `SELECT u.id AS user_id, u.email, r.code AS role_code, u.employee_id, e.department_id
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN employees e ON e.id = u.employee_id
        WHERE u.is_active = TRUE`
    );

    const byRole = {};
    for (const u of users) {
      if (!byRole[u.role_code]) {
        byRole[u.role_code] = {
          userId: u.user_id,
          email: u.email,
          roleCode: u.role_code,
          employeeId: u.employee_id,
          departmentId: u.department_id,
        };
      }
    }

    for (const sc of LIVE_SCENARIOS) {
      if (queriesUsed >= MAX_LIVE_QUERIES) {
        abortedReason = `MAX_LIVE_QUERIES_REACHED (${MAX_LIVE_QUERIES})`;
        break;
      }
      if (retriesUsed > MAX_TOTAL_RETRIES) {
        abortedReason = `MAX_TOTAL_RETRIES_EXCEEDED (${MAX_TOTAL_RETRIES})`;
        break;
      }

      const actor = byRole[sc.role] || byRole.EMPLOYEE;
      if (sc.resetFirst) {
        aiService.resetConversationForActor(actor);
      }

      try {
        queriesUsed += 1;
        const res = await aiService.runGroundedCopilot(
          { message: sc.message },
          actor,
          { apiKey: rawKey, model }
        );
        const turnRetries = Number(res.providerMeta?.retriesUsed || 0);
        retriesUsed += turnRetries;
        results.push({
          id: sc.id,
          role: sc.role,
          expectedType: sc.expectType,
          actualType: res.responseType,
          verified: res.verified,
          refused: res.refused,
          toolsUsed: (res.toolsUsed || []).map((t) => t.name),
          providerCalls: res.providerMeta?.providerCalls || 0,
          retriesUsed: turnRetries,
          latencyMs: res.providerMeta?.latencyMs || 0,
          pass: res.responseType === sc.expectType,
        });
      } catch (err) {
        const code = String(err?.code || '');
        results.push({
          id: sc.id,
          role: sc.role,
          expectedType: sc.expectType,
          errorCode: code,
          statusCode: err?.statusCode || 500,
          pass: false,
        });
        if (['AI_PROVIDER_AUTH_FAILED', 'AI_PROVIDER_MODEL_NOT_FOUND', 'AI_PROVIDER_QUOTA_EXCEEDED'].includes(code)) {
          abortedReason = `CRITICAL_PROVIDER_ERROR: ${code}`;
          break;
        }
      }
    }
  } finally {
    await db.pool.end().catch(() => {});
  }

  const allPassed = !abortedReason && results.length > 0 && results.every((r) => r.pass);
  console.log(
    JSON.stringify(
      {
        gate: 'LIVE_GEMINI_V1_EVALUATION',
        status: abortedReason ? 'BLOCKED' : allPassed ? 'PASS' : 'FAIL',
        abortedReason,
        model,
        queriesUsed,
        retriesUsed,
        passedCount: results.filter((r) => r.pass).length,
        totalExecuted: results.length,
        results,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('[LIVE-EVAL-ERROR]', err?.message || err);
  process.exit(1);
});
