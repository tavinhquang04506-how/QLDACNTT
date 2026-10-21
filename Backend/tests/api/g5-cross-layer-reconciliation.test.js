const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { employeeSession } = require('../helpers/sessions');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');

after(async () => {
  app.locals.aiTestOptions = undefined;
  await db.query("UPDATE system_settings SET value = '250'::jsonb WHERE key = 'gps_radius_meters'");
  await db.query("DELETE FROM audit_logs WHERE action IN ('CALCULATE_PAYROLL', 'LOCK_PAYROLL', 'UPDATE_SYSTEM_SETTINGS')");
  await db.query("DELETE FROM payroll_periods WHERE period = '2027-08'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('G5.1 [F27]: GET /api/health and Nginx/Vite proxy configuration are aligned', async () => {
  const healthRes = await call(null, 'get', '/api/health');
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.body.status, 'OK');
  assert.equal(healthRes.body.database, 'nexus_hrms_test');

  const nginxConf = fs.readFileSync(path.resolve(__dirname, '../../../FrontEnd/nginx.conf'), 'utf8');
  assert.match(nginxConf, /location\s+\/api\//);
  assert.match(nginxConf, /location\s+\/ws/);
  assert.match(nginxConf, /proxy_set_header\s+Upgrade\s+\$http_upgrade/);
});

test('G5.2: Cross-layer Settings -> Attendance Geofence -> AI Policy Retrieval reconciliation', async () => {
  // 1. Update gps_radius_meters via PUT /api/settings as HR_DIRECTOR
  const putRes = await call('HR_DIRECTOR', 'put', '/api/settings', {
    gps_radius_meters: 350,
  });
  assert.equal(putRes.status, 200);
  assert.equal(Number(putRes.body.data.gps_radius_meters), 350);

  // 2. Verify DB row matches API response
  const { rows: dbRows } = await db.query("SELECT value FROM system_settings WHERE key = 'gps_radius_meters'");
  assert.equal(Number(dbRows[0].value), 350);

  // 3. Verify GET /api/settings after reload returns 350
  const getRes = await call('EMPLOYEE', 'get', '/api/settings');
  assert.equal(getRes.status, 200);
  assert.equal(Number(getRes.body.data.gps_radius_meters), 350);

  // 4. Verify AI search_policies tool reflects updated 350m radius from PostgreSQL
  app.locals.aiTestOptions = {
    apiKey: 'test-g5-key',
    model: 'gemini-2.5-flash',
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      const last = body.contents[body.contents.length - 1];
      const fnResp = last?.parts?.find((p) => p.functionResponse);
      if (!fnResp) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ functionCall: { name: 'search_policies', args: { query: 'bán kính chấm công GPS' } } }],
                },
              },
            ],
          }),
        };
      }
      const res = fnResp.functionResponse.response.result;
      const gps = res.systemSettings.find((s) => s.key === 'gps_radius_meters');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ text: `Bán kính cấu hình hiện tại: ${gps.value}m` }] } }],
        }),
      };
    },
  };

  const aiRes = await call('EMPLOYEE', 'post', '/api/ai/copilot', {
    message: 'Bán kính chấm công GPS hiện tại là bao nhiêu mét?',
  });
  assert.equal(aiRes.status, 200);
  assert.match(aiRes.body.answer, /350m/);
});

test('G5.3: Cross-layer Attendance -> Payroll Calculation -> Lock -> Payslip API -> AI Payslip Tool reconciliation', async () => {
  const emp = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
  await db.query("UPDATE employees SET base_salary = 22000000, joined_date = '2024-01-01' WHERE id = $1", [
    emp.employeeId,
  ]);

  // Log 11 working days of DUNG_GIO and 11 days of VANG_KHONG_PHEP in 2027-08
  await db.query(
    `INSERT INTO attendance_logs (employee_id, work_date, status, work_hours, ot_hours)
     SELECT $1, ('2027-08-01'::date + g), CASE WHEN g < 11 THEN 'DUNG_GIO'::attendance_status_enum ELSE 'VANG_KHONG_PHEP'::attendance_status_enum END,
            CASE WHEN g < 11 THEN 8 ELSE 0 END, 0
       FROM generate_series(0, 21) g`,
    [emp.employeeId]
  );

  // 1. Calculate payroll for 2027-08
  const calcRes = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2027-08' });
  assert.equal(calcRes.status, 200);
  const { rows: ppRows } = await db.query("SELECT id FROM payroll_periods WHERE period = '2027-08'");
  const periodId = ppRows[0].id;

  // 2. Lock period (DA_CHOT) so payslip is officially published
  const lockRes = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${periodId}/lock`, {
    acknowledgeAnomalies: true,
  });
  assert.equal(lockRes.status, 200);
  assert.equal(lockRes.body.data.status, 'DA_CHOT');

  // 3. Query DB payslip directly
  const { rows: dbSlips } = await db.query(
    `SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2`,
    [periodId, emp.employeeId]
  );
  assert.equal(dbSlips.length, 1);
  const dbSlip = dbSlips[0];
  assert.equal(Number(dbSlip.actual_work_days), 11);

  // 4. Query REST API /api/payroll/me as the employee
  const apiSlipsRes = await callWith(emp.token, 'get', '/api/payroll/me');
  assert.equal(apiSlipsRes.status, 200);
  const apiSlip = apiSlipsRes.body.data.find((s) => s.period === '2027-08');
  assert.ok(apiSlip);
  assert.equal(Number(apiSlip.actual_work_days), Number(dbSlip.actual_work_days));
  assert.equal(Number(apiSlip.gross_income), Number(dbSlip.gross_income));
  assert.equal(Number(apiSlip.net_salary), Number(dbSlip.net_salary));
  assert.equal(Number(apiSlip.pit_amount), Number(dbSlip.pit_amount));

  // 5. Query AI Copilot get_my_payslip tool as the employee and verify 100% numeric parity
  app.locals.aiTestOptions = {
    apiKey: 'test-g5-key',
    model: 'gemini-2.5-flash',
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      const last = body.contents[body.contents.length - 1];
      const fnResp = last?.parts?.find((p) => p.functionResponse);
      if (!fnResp) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ functionCall: { name: 'get_my_payslip', args: { period: '2027-08' } } }],
                },
              },
            ],
          }),
        };
      }
      const res = fnResp.functionResponse.response.result;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    text: JSON.stringify({
                      actualWorkDays: res.actualWorkDays,
                      grossIncome: res.grossIncome,
                      pitAmount: res.pitAmount,
                      netSalary: res.netSalary,
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    },
  };

  const aiRes = await callWith(emp.token, 'post', '/api/ai/copilot', {
    message: 'Đối chiếu phiếu lương tháng 2027-08',
  });
  assert.equal(aiRes.status, 200);
  const aiNumbers = JSON.parse(aiRes.body.answer);
  assert.equal(aiNumbers.actualWorkDays, Number(dbSlip.actual_work_days));
  assert.equal(aiNumbers.grossIncome, Number(dbSlip.gross_income));
  assert.equal(aiNumbers.pitAmount, Number(dbSlip.pit_amount));
  assert.equal(aiNumbers.netSalary, Number(dbSlip.net_salary));
});
