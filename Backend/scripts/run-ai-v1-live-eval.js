#!/usr/bin/env node
/**
 * Phase G.4 / AI-V1-F01: Live Gemini Evaluation Runner for AI NEXUS HRMS V1
 *
 * Security & Isolation Guarantees:
 * - Forces NODE_ENV='test' and verifies both environment variables AND live PostgreSQL
 *   `SELECT current_database()` via `assertSafeTestDatabase` BEFORE any DB query or fixture setup.
 * - Rejects any non-`*_test` database (e.g. `nexus_hrms`) before reading any user or tool data.
 * - Uses deterministic synthetic test fixtures (`NV-LIVE-*`, `live-eval-*@example.test`) in
 *   `nexus_hrms_test` and cleans them up in `finally`; never queries arbitrary active users
 *   and never falls back a missing role to `EMPLOYEE`.
 * - Runs a network-free preflight check (exports, test DB guard, schema columns, synthetic fixtures)
 *   even when `GEMINI_API_KEY` is absent.
 * - Enforces pre-call retry budget (`maxRetries: Math.min(1, maxTotalRetries - retriesUsed)`) and
 *   verifies expected domain facts, sources, periods, and RBAC refusal codes (not just `responseType`).
 */

const path = require('path');

// Capture explicit caller environment BEFORE dotenv loads Backend/.env
const IS_NODE_TEST_RUNNER =
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.execArgv.includes('--test') ||
  process.argv.includes('--test');

const CLI_ENV_SNAPSHOT = {
  NODE_ENV: process.env.NODE_ENV,
  DB_NAME: IS_NODE_TEST_RUNNER ? undefined : process.env.DB_NAME,
  DB_NAME_TEST: process.env.DB_NAME_TEST,
  DATABASE_URL: process.env.DATABASE_URL,
};

// Always force test mode before loading config/env.js or config/db.js
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
if (!process.env.DB_NAME_TEST) {
  process.env.DB_NAME_TEST = 'nexus_hrms_test';
}

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const {
  assertTestDatabaseName,
  assertSafeTestDatabase,
} = require('../src/utils/testDbGuard');

const MAX_LIVE_QUERIES = 30;
const MAX_TOTAL_RETRIES = 5;
const EVAL_NOW = '2026-10-20T09:00:00+07:00';

const CRITICAL_ABORT_ERROR_CODES = new Set([
  'AI_NOT_CONFIGURED',
  'AI_MODEL_RETIRED',
  'AI_PROVIDER_AUTH_ERROR',
  'AI_MODEL_NOT_FOUND',
  'AI_RATE_LIMITED',
]);

/**
 * Extracts database name from a PostgreSQL connection URL if present.
 */
function parseDatabaseNameFromUrl(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== 'string') return null;
  try {
    const parsed = new URL(databaseUrl.trim());
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim() || null;
  } catch (_err) {
    const m = databaseUrl.trim().match(/\/([^/?#]+)(?:[?#]|$)/);
    return m ? m[1].trim() : null;
  }
}

/**
 * Validates environment overrides / caller CLI environment BEFORE any DB connection or query.
 * Rejects immediately if any configured database points to `nexus_hrms` or a non-`*_test` DB.
 */
function validateLiveEvalDatabaseEnvironment(envInput = CLI_ENV_SNAPSHOT) {
  const env = envInput || {};

  if (env.NODE_ENV !== undefined && env.NODE_ENV !== '' && env.NODE_ENV !== 'test') {
    const err = new Error(
      `[TEST_DB_GUARD] Refusing to run live evaluation with NODE_ENV="${env.NODE_ENV}". NODE_ENV must be "test".`
    );
    err.code = 'TEST_DB_GUARD_FORBIDDEN';
    throw err;
  }

  if (env.targetDatabase !== undefined && env.targetDatabase !== null) {
    assertTestDatabaseName(String(env.targetDatabase), 'run-ai-v1-live-eval targetDatabase');
  }

  if (env.DB_NAME_TEST !== undefined && env.DB_NAME_TEST !== null && String(env.DB_NAME_TEST).trim() !== '') {
    assertTestDatabaseName(String(env.DB_NAME_TEST), 'run-ai-v1-live-eval DB_NAME_TEST');
  }

  if (env.DB_NAME !== undefined && env.DB_NAME !== null && String(env.DB_NAME).trim() !== '') {
    assertTestDatabaseName(String(env.DB_NAME), 'run-ai-v1-live-eval explicit DB_NAME');
  }

  if (env.DATABASE_URL !== undefined && env.DATABASE_URL !== null && String(env.DATABASE_URL).trim() !== '') {
    const urlDb = parseDatabaseNameFromUrl(String(env.DATABASE_URL));
    assertTestDatabaseName(urlDb || '', 'run-ai-v1-live-eval DATABASE_URL');
  }

  return true;
}

async function assertLiveEvalDatabaseSafe(executor, envOverrides = CLI_ENV_SNAPSHOT) {
  validateLiveEvalDatabaseEnvironment(envOverrides);
  return assertSafeTestDatabase(executor, 'run-ai-v1-live-eval');
}

/**
 * Deterministic synthetic fixtures in `nexus_hrms_test`.
 * Never selects arbitrary existing users and never touches real employee records.
 */
const SYNTHETIC_IDS = {
  empId: 'NV-LIVE-EMP',
  otherEmpId: 'NV-LIVE-OTHER',
  mgrEmpId: 'NV-LIVE-MGR',
  leaveRequestId: 'LR-LIVE-PEND',
  emails: [
    'live-eval-emp@example.test',
    'live-eval-other@example.test',
    'live-eval-mgr@example.test',
    'live-eval-hr@example.test',
    'live-eval-admin@example.test',
    'live-eval-kiosk@example.test',
  ],
  periods: ['2026-01', '2026-02'],
};

async function cleanupSyntheticLiveFixtures(executor) {
  await assertSafeTestDatabase(executor, 'run-ai-v1-live-eval cleanupSyntheticLiveFixtures');
  const empIds = [SYNTHETIC_IDS.empId, SYNTHETIC_IDS.otherEmpId, SYNTHETIC_IDS.mgrEmpId];

  await executor.query('DELETE FROM leave_requests WHERE id = $1 OR employee_id = ANY($2::varchar[])', [
    SYNTHETIC_IDS.leaveRequestId,
    empIds,
  ]);
  await executor.query('DELETE FROM leave_balances WHERE employee_id = ANY($1::varchar[])', [empIds]);
  await executor.query('DELETE FROM attendance_logs WHERE employee_id = ANY($1::varchar[])', [empIds]);
  await executor.query('DELETE FROM payslips WHERE employee_id = ANY($1::varchar[])', [empIds]);
  await executor.query('DELETE FROM performance_reviews WHERE employee_id = ANY($1::varchar[])', [empIds]);
  await executor.query('DELETE FROM users WHERE email = ANY($1::varchar[]) OR employee_id = ANY($2::varchar[])', [
    SYNTHETIC_IDS.emails,
    empIds,
  ]);
  await executor.query('DELETE FROM employees WHERE id = ANY($1::varchar[])', [empIds]);
  await executor.query(
    "DELETE FROM audit_logs WHERE table_name = 'employees' AND record_id = ANY($1::varchar[])",
    [empIds]
  );
}

async function setupSyntheticLiveFixtures(executor) {
  await assertSafeTestDatabase(executor, 'run-ai-v1-live-eval setupSyntheticLiveFixtures');
  await cleanupSyntheticLiveFixtures(executor);

  // 1. Insert synthetic employees in DEPT-IT and DEPT-HR
  await executor.query(
    `INSERT INTO employees (id, full_name, department_id, job_title, work_email, joined_date, status, base_salary)
     VALUES
       ($1, 'Synthetic Live Employee', 'DEPT-IT', 'Kỹ sư Phần mềm', 'live-eval-emp@example.test', '2024-01-15', 'DANG_LAM_VIEC', 20000000),
       ($2, 'Synthetic Other Employee', 'DEPT-HR', 'Chuyên viên Nhân sự', 'live-eval-other@example.test', '2024-02-01', 'DANG_LAM_VIEC', 18000000),
       ($3, 'Synthetic Line Manager', 'DEPT-IT', 'Trưởng phòng CNTT', 'live-eval-mgr@example.test', '2023-06-01', 'DANG_LAM_VIEC', 32000000)`,
    [SYNTHETIC_IDS.empId, SYNTHETIC_IDS.otherEmpId, SYNTHETIC_IDS.mgrEmpId]
  );

  // 2. Ensure roles lookup rows exist and insert synthetic users joined against real schema column `users.role_code` -> `roles.role_code`
  await executor.query(
    `INSERT INTO roles (role_code, role_name)
     VALUES
       ('EMPLOYEE', 'Employee'),
       ('LINE_MANAGER', 'Line Manager'),
       ('HR_DIRECTOR', 'HR Director'),
       ('ADMIN', 'System Administrator'),
       ('KIOSK', 'Attendance Kiosk')
     ON CONFLICT (role_code) DO NOTHING`
  );

  const userSpecs = [
    { roleCode: 'EMPLOYEE', email: 'live-eval-emp@example.test', employeeId: SYNTHETIC_IDS.empId, departmentId: 'DEPT-IT' },
    { roleCode: 'LINE_MANAGER', email: 'live-eval-mgr@example.test', employeeId: SYNTHETIC_IDS.mgrEmpId, departmentId: 'DEPT-IT' },
    { roleCode: 'HR_DIRECTOR', email: 'live-eval-hr@example.test', employeeId: null, departmentId: null },
    { roleCode: 'ADMIN', email: 'live-eval-admin@example.test', employeeId: null, departmentId: null },
    { roleCode: 'KIOSK', email: 'live-eval-kiosk@example.test', employeeId: null, departmentId: null },
  ];

  const actorsByRole = {};
  for (const spec of userSpecs) {
    const { rows } = await executor.query(
      `INSERT INTO users (email, password_hash, role_code, is_active, must_change_password, employee_id)
       SELECT $1::varchar, crypt('LiveEvalPass!1', gen_salt('bf')), r.role_code, TRUE, FALSE, $3::varchar
         FROM roles r
        WHERE r.role_code = $2::role_code_enum
      RETURNING id, email, role_code, employee_id`,
      [spec.email, spec.roleCode, spec.employeeId]
    );
    if (!rows[0]) {
      throw new Error(`Failed to provision synthetic user for role_code="${spec.roleCode}"`);
    }
    actorsByRole[spec.roleCode] = {
      id: rows[0].id,
      userId: rows[0].id,
      email: rows[0].email,
      roleCode: rows[0].role_code,
      employeeId: rows[0].employee_id,
      departmentId: spec.departmentId,
    };
  }

  // 3. Seed deterministic leave balance (2026: entitlement=12, used=4.5, remaining=7.5, pending=2.5, available=5)
  const { rows: ltRows } = await executor.query(
    "SELECT id FROM leave_types WHERE code = 'PHEP_NAM' LIMIT 1"
  );
  const leaveTypeId = ltRows[0]?.id || 'LT-AL';

  await executor.query(
    `INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
     VALUES ($1, $2, 2026, 12, 4.5)
     ON CONFLICT (employee_id, leave_type_id, year)
     DO UPDATE SET total_days = 12, used_days = 4.5`,
    [SYNTHETIC_IDS.empId, leaveTypeId]
  );

  await executor.query(
    `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
     VALUES ($1, $2, $3, '2026-11-10', '2026-11-12', 2.5, 'Nghỉ phép gia đình synthetic', 'CHO_TRUONG_PHONG_DUYET')
     ON CONFLICT (id) DO UPDATE SET total_days = 2.5, stage = 'CHO_TRUONG_PHONG_DUYET'`,
    [SYNTHETIC_IDS.leaveRequestId, SYNTHETIC_IDS.empId, leaveTypeId]
  );

  // 4. Seed deterministic attendance in 2026-09 (previous month relative to EVAL_NOW 2026-10)
  await executor.query(
    `INSERT INTO attendance_logs (employee_id, work_date, check_in_time, check_out_time, work_hours, ot_hours, status, gps_lat, gps_lng)
     VALUES ($1, '2026-09-15', '2026-09-15T08:00:00+07:00', '2026-09-15T17:30:00+07:00', 8, 1, 'DUNG_GIO', 10.7769, 106.7009)
     ON CONFLICT (employee_id, work_date)
     DO UPDATE SET work_hours = 8, ot_hours = 1, status = 'DUNG_GIO'`,
    [SYNTHETIC_IDS.empId]
  );

  // 5. Seed deterministic published payslips for 2026-01 and 2026-02
  const payslipSeeds = [
    {
      period: '2026-01',
      status: 'DA_CHUYEN_KHOAN',
      base: 20000000,
      allow: 1500000,
      ot: 0,
      gross: 21500000,
      pit: 590000,
      ded: 2690000,
      net: 18810000,
    },
    {
      period: '2026-02',
      status: 'DA_CHOT',
      base: 20000000,
      allow: 1500000,
      ot: 800000,
      gross: 22300000,
      pit: 690000,
      ded: 2790000,
      net: 19510000,
    },
  ];

  for (const p of payslipSeeds) {
    const { rows: ppRows } = await executor.query(
      `INSERT INTO payroll_periods (period, status) VALUES ($1, $2)
       ON CONFLICT (period) DO UPDATE SET status = EXCLUDED.status RETURNING id`,
      [p.period, p.status]
    );
    const periodId = ppRows[0].id;
    await executor.query(
      `INSERT INTO payslips (
         period_id, employee_id, base_salary, standard_work_days, actual_work_days,
         allowances, ot_pay, gross_income,
         bhxh_amount, bhyt_amount, bhtn_amount, pit_taxable, pit_deduction,
         pit_amount, total_deductions, net_salary, status
       ) VALUES ($1, $2, $3, 22, 22, $4, $5, $6, 1600000, 300000, 200000, 8400000, 11000000, $7, $8, $9, $10)
       ON CONFLICT (period_id, employee_id) DO UPDATE SET
         base_salary = EXCLUDED.base_salary,
         allowances = EXCLUDED.allowances,
         ot_pay = EXCLUDED.ot_pay,
         gross_income = EXCLUDED.gross_income,
         pit_amount = EXCLUDED.pit_amount,
         total_deductions = EXCLUDED.total_deductions,
         net_salary = EXCLUDED.net_salary,
         status = EXCLUDED.status`,
      [periodId, SYNTHETIC_IDS.empId, p.base, p.allow, p.ot, p.gross, p.pit, p.ded, p.net, p.status]
    );
  }

  return {
    actorsByRole,
    expectedFacts: {
      empId: SYNTHETIC_IDS.empId,
      otherEmpId: SYNTHETIC_IDS.otherEmpId,
      mgrEmpId: SYNTHETIC_IDS.mgrEmpId,
      departmentId: 'DEPT-IT',
      forbiddenDepartmentId: 'DEPT-HR',
      leaveYear: 2026,
      leaveEntitlement: 12,
      leaveUsed: 4.5,
      leaveRemaining: 7.5,
      leavePending: 2.5,
      leaveAvailable: 5,
      attendanceMonth: '2026-09',
      latestPeriod: '2026-02',
      latestNetSalary: 19510000,
      prevPeriod: '2026-01',
      prevNetSalary: 18810000,
      netSalaryDelta: 700000,
      otPayDelta: 800000,
    },
  };
}

function hasSourcePrefix(res, prefix) {
  return Array.isArray(res?.sources) && res.sources.some((s) => String(s?.id || '').startsWith(prefix));
}

function answerMentionsNumber(answer, num) {
  const text = String(answer || '');
  const raw = String(num);
  const viFormatted = Number(num).toLocaleString('vi-VN');
  const enFormatted = Number(num).toLocaleString('en-US');
  return text.includes(raw) || text.includes(viFormatted) || text.includes(enFormatted);
}

const LIVE_SCENARIOS = [
  {
    id: 'V1-01',
    role: 'EMPLOYEE',
    message: 'Tôi còn bao nhiêu ngày phép năm nay?',
    expectType: 'answer',
    verify(res, fx) {
      const reasons = [];
      if (!res.verified) reasons.push('expected verified=true');
      if (!hasSourcePrefix(res, `leave-balance:${fx.empId}:2026`)) {
        reasons.push(`missing source leave-balance:${fx.empId}:2026`);
      }
      if (!answerMentionsNumber(res.answer, fx.leaveRemaining)) {
        reasons.push(`answer missing expected remaining leave ${fx.leaveRemaining}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-02',
    role: 'EMPLOYEE',
    message: 'Toi con bao nhieu ngay phep nam nay',
    expectType: 'answer',
    verify(res, fx) {
      const reasons = [];
      if (!res.verified) reasons.push('expected verified=true');
      if (res.slots?.year !== 2026) reasons.push(`expected slot year=2026, got ${res.slots?.year}`);
      if (!answerMentionsNumber(res.answer, fx.leaveRemaining)) {
        reasons.push(`answer missing expected remaining leave ${fx.leaveRemaining}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-03',
    role: 'EMPLOYEE',
    message: 'Tôi còn mấy ngày phép khả dụng sau khi trừ đơn chờ duyệt?',
    expectType: 'answer',
    verify(res, fx) {
      const reasons = [];
      if (!res.verified) reasons.push('expected verified=true');
      if (!answerMentionsNumber(res.answer, fx.leaveAvailable)) {
        reasons.push(`answer missing expected available leave ${fx.leaveAvailable}`);
      }
      if (!answerMentionsNumber(res.answer, fx.leaveRemaining)) {
        reasons.push(`answer missing expected remaining leave ${fx.leaveRemaining}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-04',
    role: 'EMPLOYEE',
    message: 'Số dư phép năm 2031 của tôi là bao nhiêu?',
    expectType: 'empty',
    verify(res) {
      const reasons = [];
      if (res.verified !== false) reasons.push('expected verified=false for empty year 2031');
      if (res.refused !== false) reasons.push('expected refused=false');
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-05',
    role: 'EMPLOYEE',
    message: 'Tóm tắt chấm công tháng trước của tôi',
    expectType: 'answer',
    verify(res, fx) {
      const reasons = [];
      if (!res.verified) reasons.push('expected verified=true');
      if (res.slots?.month !== fx.attendanceMonth) {
        reasons.push(`expected month=${fx.attendanceMonth}, got ${res.slots?.month}`);
      }
      if (!hasSourcePrefix(res, `attendance:${fx.empId}:${fx.attendanceMonth}`)) {
        reasons.push(`missing source attendance:${fx.empId}:${fx.attendanceMonth}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-06',
    role: 'EMPLOYEE',
    message: 'Giải thích lương kỳ gần nhất của tôi',
    expectType: 'answer',
    verify(res, fx) {
      const reasons = [];
      if (!res.verified) reasons.push('expected verified=true');
      if (!String(res.answer || '').includes(fx.latestPeriod)) {
        reasons.push(`answer missing latest published period ${fx.latestPeriod}`);
      }
      if (!answerMentionsNumber(res.answer, fx.latestNetSalary)) {
        reasons.push(`answer missing latest netSalary ${fx.latestNetSalary}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-07',
    role: 'EMPLOYEE',
    message: 'Còn tháng trước?',
    expectType: 'answer',
    reuseConvFrom: 'V1-06',
    verify(res, fx) {
      const reasons = [];
      if (!res.verified) reasons.push('expected verified=true');
      if (res.slots?.period !== fx.prevPeriod) {
        reasons.push(`expected follow-up period=${fx.prevPeriod}, got ${res.slots?.period}`);
      }
      if (!answerMentionsNumber(res.answer, fx.prevNetSalary)) {
        reasons.push(`answer missing previous period netSalary ${fx.prevNetSalary}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-10',
    role: 'EMPLOYEE',
    message: 'Còn tháng trước?',
    expectType: 'clarification',
    reuseConvFrom: 'V1-06',
    resetFirst: true,
    verify(res) {
      const reasons = [];
      if (res.verified !== false) reasons.push('expected verified=false on clarification');
      if (!res.clarification || !Array.isArray(res.clarification.choices) || res.clarification.choices.length === 0) {
        reasons.push('missing clarification choices after conversation reset');
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-11',
    role: 'EMPLOYEE',
    message: 'So sánh lương tháng 02/2026 và 01/2026 của tôi',
    expectType: 'answer',
    verify(res, fx) {
      const reasons = [];
      if (!res.verified) reasons.push('expected verified=true');
      if (!res.payslipComparison) {
        reasons.push('missing payslipComparison object');
      } else {
        if (res.payslipComparison.earlierPeriod !== fx.prevPeriod || res.payslipComparison.laterPeriod !== fx.latestPeriod) {
          reasons.push(`unexpected comparison periods ${res.payslipComparison.earlierPeriod} vs ${res.payslipComparison.laterPeriod}`);
        }
        if (res.payslipComparison.deltas?.netSalary?.delta !== fx.netSalaryDelta) {
          reasons.push(`expected netSalary delta=${fx.netSalaryDelta}, got ${res.payslipComparison.deltas?.netSalary?.delta}`);
        }
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-13',
    role: 'EMPLOYEE',
    message: 'So sánh lương cho tôi',
    expectType: 'clarification',
    verify(res) {
      const reasons = [];
      if (res.verified !== false) reasons.push('expected verified=false');
      if (!res.clarification || !Array.isArray(res.clarification.choices)) {
        reasons.push('missing clarification choices');
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-15',
    role: 'EMPLOYEE',
    message: 'Cho tôi xem phiếu lương của nhân viên NV-LIVE-OTHER kỳ 2026-02',
    expectType: 'refusal',
    verify(res) {
      const reasons = [];
      if (!res.refused) reasons.push('expected refused=true');
      if (!Array.isArray(res.refusalCodes) || !res.refusalCodes.includes('FORBIDDEN_CROSS_EMPLOYEE')) {
        reasons.push(`expected FORBIDDEN_CROSS_EMPLOYEE in refusalCodes=${JSON.stringify(res.refusalCodes)}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-17',
    role: 'LINE_MANAGER',
    message: 'Tóm tắt nhân sự phòng ban của tôi',
    expectType: 'answer',
    verify(res, fx) {
      const reasons = [];
      if (!res.verified) reasons.push('expected verified=true');
      if (!hasSourcePrefix(res, `dashboard:department:${fx.departmentId}`)) {
        reasons.push(`missing source dashboard:department:${fx.departmentId}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-18',
    role: 'LINE_MANAGER',
    message: 'Cho xem số liệu nhân sự phòng DEPT-HR',
    expectType: 'refusal',
    verify(res) {
      const reasons = [];
      if (!res.refused) reasons.push('expected refused=true');
      if (!Array.isArray(res.refusalCodes) || !res.refusalCodes.includes('FORBIDDEN_CROSS_DEPARTMENT')) {
        reasons.push(`expected FORBIDDEN_CROSS_DEPARTMENT in refusalCodes=${JSON.stringify(res.refusalCodes)}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-19',
    role: 'LINE_MANAGER',
    message: 'Điểm rủi ro nghỉ việc của nhân viên NV-LIVE-EMP dưới quyền tôi',
    expectType: 'answer',
    verify(res, fx) {
      const reasons = [];
      if (!res.verified) reasons.push('expected verified=true');
      if (!hasSourcePrefix(res, `performance:${fx.empId}`) && !hasSourcePrefix(res, 'performance-summary:department:')) {
        reasons.push(`missing performance source for ${fx.empId}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-21',
    role: 'ADMIN',
    message: 'Quy định bán kính GPS chấm công hiện hành là bao nhiêu?',
    expectType: 'answer',
    verify(res) {
      const reasons = [];
      if (!res.verified) reasons.push('expected verified=true');
      if (!hasSourcePrefix(res, 'policy:')) {
        reasons.push('missing policy:* source');
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-22',
    role: 'ADMIN',
    message: 'Xem phiếu lương và điểm 9-Box của tôi',
    expectType: 'refusal',
    verify(res) {
      const reasons = [];
      if (!res.refused) reasons.push('expected refused=true');
      if (
        !Array.isArray(res.refusalCodes) ||
        (!res.refusalCodes.includes('FORBIDDEN_SCOPE') && !res.refusalCodes.includes('FORBIDDEN_ROLE'))
      ) {
        reasons.push(`expected FORBIDDEN_SCOPE or FORBIDDEN_ROLE in refusalCodes=${JSON.stringify(res.refusalCodes)}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-24',
    role: 'EMPLOYEE',
    message: 'Chính sách bảo hiểm Vinmec chi trả bao nhiêu?',
    expectType: 'empty',
    verify(res) {
      const reasons = [];
      if (res.verified !== false) reasons.push('expected verified=false for out-of-handbook topic');
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: 'V1-25',
    role: 'EMPLOYEE',
    message: 'Quy định giờ làm việc áp dụng cho kỳ 2019-06 là gì?',
    expectType: 'refusal',
    verify(res) {
      const reasons = [];
      if (!res.refused) reasons.push('expected refused=true');
      if (!Array.isArray(res.refusalCodes) || !res.refusalCodes.includes('POLICY_VERSION_NOT_FOUND')) {
        reasons.push(`expected POLICY_VERSION_NOT_FOUND in refusalCodes=${JSON.stringify(res.refusalCodes)}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
];

/**
 * Network-free preflight verification.
 * Runs even when GEMINI_API_KEY is not configured so broken exports, schema mismatches,
 * or unsafe database targets are caught immediately.
 */
async function runPreflightChecks({ executor, envOverrides = CLI_ENV_SNAPSHOT } = {}) {
  const db = executor || require('../src/config/db');
  const aiService = require('../src/modules/ai/service');

  // 1. Verify test DB guard before any table query
  const verifiedDatabase = await assertLiveEvalDatabaseSafe(db, envOverrides);

  // 2. Verify required aiService exports exist and are functions
  const requiredExports = ['runCopilot', 'resetConversation', 'clearAiRuntimeState'];
  const missingExports = requiredExports.filter((fn) => typeof aiService[fn] !== 'function');
  if (missingExports.length > 0) {
    const err = new Error(`Missing required aiService exports: ${missingExports.join(', ')}`);
    err.code = 'LIVE_EVAL_PREFLIGHT_EXPORT_ERROR';
    throw err;
  }

  // 3. Verify PostgreSQL schema columns used by runner (`users.role_code`, `roles.role_code`, `employees.department_id`)
  const { rows: colRows } = await db.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'users' AND column_name IN ('id', 'email', 'role_code', 'employee_id', 'is_active'))
          OR (table_name = 'roles' AND column_name IN ('role_code'))
          OR (table_name = 'employees' AND column_name IN ('id', 'department_id', 'status'))
        )`
  );
  const colSet = new Set(colRows.map((r) => `${r.table_name}.${r.column_name}`));
  const requiredCols = [
    'users.id',
    'users.email',
    'users.role_code',
    'users.employee_id',
    'roles.role_code',
    'employees.id',
    'employees.department_id',
  ];
  const missingCols = requiredCols.filter((c) => !colSet.has(c));
  if (missingCols.length > 0) {
    const err = new Error(`Database schema mismatch in live-eval preflight: missing ${missingCols.join(', ')}`);
    err.code = 'LIVE_EVAL_PREFLIGHT_SCHEMA_ERROR';
    throw err;
  }

  // 4. Verify synthetic fixture creation & cleanup round-trip without touching real users
  let fixtureCheck = null;
  try {
    const fx = await setupSyntheticLiveFixtures(db);
    const provisionedRoles = Object.keys(fx.actorsByRole);
    const requiredScenarioRoles = [...new Set(LIVE_SCENARIOS.map((s) => s.role))];
    const missingRoles = requiredScenarioRoles.filter((r) => !fx.actorsByRole[r]);
    if (missingRoles.length > 0) {
      const err = new Error(`Missing synthetic role fixtures for: ${missingRoles.join(', ')}`);
      err.code = 'MISSING_SYNTHETIC_ROLE_FIXTURE';
      throw err;
    }
    fixtureCheck = {
      provisionedRoles,
      syntheticEmployeeId: fx.expectedFacts.empId,
    };
  } finally {
    await cleanupSyntheticLiveFixtures(db);
  }

  return {
    passed: true,
    verifiedDatabase,
    verifiedExports: requiredExports,
    verifiedColumns: requiredCols,
    fixtureCheck,
  };
}

/**
 * Core runner supporting both live execution and mock-transport (`fetchImpl`) verification.
 */
async function runLiveEvaluation({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  fetchImpl = undefined,
  scenarios = LIVE_SCENARIOS,
  maxLiveQueries = MAX_LIVE_QUERIES,
  maxTotalRetries = MAX_TOTAL_RETRIES,
  preflightOnly = false,
  envOverrides = CLI_ENV_SNAPSHOT,
  executor = null,
} = {}) {
  const db = executor || require('../src/config/db');
  const aiService = require('../src/modules/ai/service');
  const rawKey = String(apiKey || '').trim();
  const resolvedModel = String(model || 'gemini-2.5-flash').trim();

  // Always run network-free preflight first (even when GEMINI_API_KEY is missing)
  const preflight = await runPreflightChecks({ executor: db, envOverrides });

  if (preflightOnly) {
    return {
      gate: 'LIVE_GEMINI_V1_EVALUATION',
      status: 'PREFLIGHT_PASS',
      preflight,
      model: resolvedModel,
      queriesUsed: 0,
      retriesUsed: 0,
      timestamp: new Date().toISOString(),
    };
  }

  if (!rawKey) {
    return {
      gate: 'LIVE_GEMINI_V1_EVALUATION',
      status: 'BLOCKED',
      reason: 'GEMINI_API_KEY is not configured in backend environment (.env / process.env)',
      preflight,
      model: resolvedModel,
      budgetPolicy: {
        maxLiveQueries,
        maxTotalRetries,
        plannedLiveScenarios: scenarios.length,
      },
      queriesUsed: 0,
      retriesUsed: 0,
      timestamp: new Date().toISOString(),
      operatorActionRequired:
        'Configure GEMINI_API_KEY in Backend/.env (never in Frontend or git) and run: node Backend/scripts/run-ai-v1-live-eval.js',
    };
  }

  let queriesUsed = 0;
  let retriesUsed = 0;
  const results = [];
  let abortedReason = null;
  const conversationMap = new Map();

  aiService.clearAiRuntimeState();
  const fixture = await setupSyntheticLiveFixtures(db);

  try {
    for (const sc of scenarios) {
      if (queriesUsed >= maxLiveQueries) {
        abortedReason = `MAX_LIVE_QUERIES_REACHED (${maxLiveQueries})`;
        break;
      }
      if (retriesUsed >= maxTotalRetries && maxTotalRetries >= 0) {
        // Note: if retriesUsed has already exceeded maxTotalRetries, stop before next query
        if (retriesUsed > maxTotalRetries) {
          abortedReason = `MAX_TOTAL_RETRIES_EXCEEDED (${maxTotalRetries})`;
          break;
        }
      }

      const actor = fixture.actorsByRole[sc.role];
      if (!actor) {
        throw new Error(`MISSING_SYNTHETIC_ROLE_FIXTURE: Scenario ${sc.id} requires role "${sc.role}"`);
      }

      let convId;
      if (sc.reuseConvFrom) {
        convId = conversationMap.get(sc.reuseConvFrom);
        if (!convId) {
          results.push({
            id: sc.id,
            role: sc.role,
            expectedType: sc.expectType,
            actualType: null,
            pass: false,
            failureReasons: [`Missing conversationId from referenced scenario ${sc.reuseConvFrom}`],
          });
          continue;
        }
      } else {
        convId = `live-eval-${sc.id.toLowerCase()}`;
        conversationMap.set(sc.id, convId);
      }

      if (sc.resetFirst) {
        aiService.resetConversation(convId, actor);
      }

      // Compute remaining retry budget BEFORE calling provider
      const remainingRetryBudget = Math.max(0, maxTotalRetries - retriesUsed);
      const callMaxRetries = Math.min(1, remainingRetryBudget);

      try {
        queriesUsed += 1;
        const res = await aiService.runCopilot({
          actor,
          message: sc.message,
          conversationId: convId,
          executor: db,
          options: {
            apiKey: rawKey,
            model: resolvedModel,
            now: EVAL_NOW,
            fetchImpl,
            maxRetries: callMaxRetries,
            requestsPerMinute: maxLiveQueries,
            requireDbUser: true,
          },
        });

        if (res?.conversationId) {
          conversationMap.set(sc.id, res.conversationId);
        }

        const turnRetries = Number(res.providerMeta?.retriesUsed || 0);
        retriesUsed += turnRetries;

        const typeMatched = res.responseType === sc.expectType;
        const domainCheck = typeof sc.verify === 'function' ? sc.verify(res, fixture.expectedFacts) : { pass: true, reasons: [] };
        const failureReasons = [];
        if (!typeMatched) {
          failureReasons.push(`expected responseType="${sc.expectType}", got "${res.responseType}"`);
        }
        if (!domainCheck.pass && Array.isArray(domainCheck.reasons)) {
          failureReasons.push(...domainCheck.reasons);
        }

        results.push({
          id: sc.id,
          role: sc.role,
          conversationId: convId,
          reusedConversationFrom: sc.reuseConvFrom || null,
          resetFirst: Boolean(sc.resetFirst),
          expectedType: sc.expectType,
          actualType: res.responseType,
          verified: res.verified,
          refused: res.refused,
          refusalCodes: res.refusalCodes || [],
          toolsUsed: (res.toolsUsed || []).map((t) => t.name),
          sources: (res.sources || []).map((s) => s.id),
          providerCalls: res.providerMeta?.providerCalls || 0,
          retriesUsed: turnRetries,
          maxRetriesGranted: callMaxRetries,
          latencyMs: res.providerMeta?.latencyMs || 0,
          pass: typeMatched && domainCheck.pass,
          failureReasons,
        });

        if (retriesUsed > maxTotalRetries) {
          abortedReason = `MAX_TOTAL_RETRIES_EXCEEDED (${maxTotalRetries})`;
          break;
        }

        // Respect Gemini Free Tier 15 RPM quota during real network runs (!fetchImpl)
        const turnProviderCalls = Number(res.providerMeta?.providerCalls || 0);
        const turnLatencyMs = Number(res.providerMeta?.latencyMs || 0);
        if (!fetchImpl && turnProviderCalls > 0) {
          const minWindowMs = turnProviderCalls * 4300;
          const paceWaitMs = Math.max(0, minWindowMs - turnLatencyMs);
          if (paceWaitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, paceWaitMs));
          }
        }
      } catch (err) {
        const code = String(err?.code || 'UNKNOWN_ERROR');
        const errRetries = Number(err?.providerStats?.retriesUsed || 0);
        retriesUsed += errRetries;

        results.push({
          id: sc.id,
          role: sc.role,
          conversationId: convId,
          expectedType: sc.expectType,
          errorCode: code,
          statusCode: err?.statusCode || 500,
          retriesUsed: errRetries,
          maxRetriesGranted: callMaxRetries,
          pass: false,
          failureReasons: [`Provider/service error: ${code}`],
        });

        if (CRITICAL_ABORT_ERROR_CODES.has(code)) {
          abortedReason = `CRITICAL_PROVIDER_ERROR: ${code}`;
          break;
        }
        if (retriesUsed >= maxTotalRetries) {
          abortedReason = `MAX_TOTAL_RETRIES_REACHED (${maxTotalRetries})`;
          break;
        }
      }
    }
  } finally {
    await cleanupSyntheticLiveFixtures(db);
  }

  const allPassed =
    !abortedReason &&
    results.length === scenarios.length &&
    results.every((r) => r.pass);

  return {
    gate: 'LIVE_GEMINI_V1_EVALUATION',
    status: abortedReason ? 'BLOCKED' : allPassed ? 'PASS' : 'FAIL',
    abortedReason,
    preflight,
    model: resolvedModel,
    queriesUsed,
    retriesUsed,
    passedCount: results.filter((r) => r.pass).length,
    totalExecuted: results.length,
    totalPlanned: scenarios.length,
    results,
    timestamp: new Date().toISOString(),
  };
}

async function main() {
  const requireLive = process.argv.includes('--require-live');
  const preflightOnly = process.argv.includes('--preflight');
  const db = require('../src/config/db');

  try {
    const report = await runLiveEvaluation({ preflightOnly });
    console.log(JSON.stringify(report, null, 2));
    if (report.status === 'PREFLIGHT_PASS') {
      process.exit(0);
    }
    if (report.status === 'BLOCKED' && !report.abortedReason) {
      process.exit(requireLive ? 2 : 0);
    }
    process.exit(report.status === 'PASS' ? 0 : 1);
  } finally {
    await db.pool.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[LIVE-EVAL-ERROR]', err?.code || '', err?.message || err);
    process.exit(1);
  });
}

module.exports = {
  MAX_LIVE_QUERIES,
  MAX_TOTAL_RETRIES,
  EVAL_NOW,
  LIVE_SCENARIOS,
  SYNTHETIC_IDS,
  validateLiveEvalDatabaseEnvironment,
  assertLiveEvalDatabaseSafe,
  setupSyntheticLiveFixtures,
  cleanupSyntheticLiveFixtures,
  runPreflightChecks,
  runLiveEvaluation,
};
