const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');
const { giveBalance, deleteTestLeaves } = require('../helpers/leaves');
const settingsService = require('../../src/modules/settings/service');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE action IN ('CALCULATE_PAYROLL', 'LOCK_PAYROLL', 'UPDATE_PAYSLIP', 'UPDATE_SETTINGS')");
  await db.query("DELETE FROM ot_requests WHERE employee_id LIKE 'NV-T%'");
  await db.query("DELETE FROM payroll_periods WHERE period LIKE '2028-%'");
  await deleteTestLeaves();
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('R01 (F06): check-in and check-out reject empty body, manual/qr/kiosk self-punch, missing GPS or missing 6-digit code', async () => {
  const s = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });

  for (const invalid of [
    {},
    { method: 'manual' },
    { method: 'qr' },
    { method: 'kiosk' },
    { method: 'gps' },
    { method: 'gps', gpsLat: 10.77 },
    { method: 'code' },
    { method: 'code', code: '' },
    { method: 'code_gps', code: '123456' },
    { method: 'code_gps', gpsLat: 10.77, gpsLng: 106.7 },
  ]) {
    const res = await callWith(s.token, 'post', '/api/attendance/check-in', invalid);
    assert.equal(res.status, 400, `check-in must reject ${JSON.stringify(invalid)}`);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  }

  const inOk = await callWith(s.token, 'post', '/api/attendance/check-in', {
    method: 'gps',
    gpsLat: 10.77,
    gpsLng: 106.7,
  });
  assert.equal(inOk.status, 201);

  for (const invalid of [
    {},
    { method: 'manual' },
    { method: 'qr' },
    { method: 'gps' },
    { method: 'gps', gpsLat: 10.77 },
    { method: 'code' },
    { method: 'code', code: '' },
    { method: 'code_gps', code: '123456' },
  ]) {
    const res = await callWith(s.token, 'post', '/api/attendance/check-out', invalid);
    assert.equal(res.status, 400, `check-out must reject ${JSON.stringify(invalid)}`);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  }

  const { getCurrentKioskCode } = require('../../src/modules/attendance/kioskCode');
  const outOk = await callWith(s.token, 'post', '/api/attendance/check-out', {
    method: 'code_gps',
    code: getCurrentKioskCode().code,
    gpsLat: 10.77,
    gpsLng: 106.7,
  });
  assert.equal(outOk.status, 200);
});

test('R02 (F09) & R03: missing attendance gets 0 workdays/0 net, blocks lock with 409, and note-only updatePayslip never mutates amounts', async () => {
  const noLogEmp = await createTestEmployee({ status: 'DANG_LAM_VIEC', departmentId: 'DEPT-IT' });
  const absentLogEmp = await createTestEmployee({ status: 'DANG_LAM_VIEC', departmentId: 'DEPT-IT' });
  await db.query("UPDATE employees SET base_salary = 22000000, joined_date = '2020-01-01' WHERE id = ANY($1)", [[noLogEmp.id, absentLogEmp.id]]);

  // absentLogEmp has 3 attendance logs, all VANG_KHONG_PHEP; noLogEmp has 0 attendance logs
  await db.query(
    `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
     SELECT $1, ('2028-01-03'::date + g), 'VANG_KHONG_PHEP', 0 FROM generate_series(0, 2) g`,
    [absentLogEmp.id]
  );

  const calcRes = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2028-01' });
  assert.equal(calcRes.status, 200);

  const period = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-01'")).rows[0];
  const noLogSlip = (await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [period.id, noLogEmp.id])).rows[0];
  const absentSlip = (await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [period.id, absentLogEmp.id])).rows[0];

  // R02: noLogEmp has 0 workdays (not 22)
  assert.equal(Number(noLogSlip.actual_work_days), 0);
  assert.equal(Number(noLogSlip.allowances), 0);
  assert.equal(Number(noLogSlip.gross_income), 0);
  assert.equal(Number(noLogSlip.bhxh_amount), 0);
  assert.equal(Number(noLogSlip.total_deductions), 0);
  assert.equal(Number(noLogSlip.net_salary), 0);

  // R02: anomalies distinguish NO_ATTENDANCE (Cao, violation) from ZERO_WORKDAYS (Trung bình, data)
  const anomRes = await call('HR_DIRECTOR', 'get', `/api/payroll/periods/${period.id}/anomalies`);
  assert.equal(anomRes.status, 200);
  const noAttAnom = anomRes.body.data.find((a) => a.employee_id === noLogEmp.id && a.type === 'NO_ATTENDANCE');
  const zeroWorkAnom = anomRes.body.data.find((a) => a.employee_id === absentLogEmp.id && a.type === 'ZERO_WORKDAYS');
  assert.ok(noAttAnom);
  assert.equal(noAttAnom.severity, 'Cao');
  assert.equal(noAttAnom.category, 'violation');
  assert.ok(zeroWorkAnom);
  assert.equal(zeroWorkAnom.severity, 'Trung bình');
  assert.equal(zeroWorkAnom.category, 'data');

  // R02: lock without acknowledgeAnomalies is blocked with 409 ANOMALIES_PENDING
  const lockBlocked = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, {});
  assert.equal(lockBlocked.status, 409);
  assert.equal(lockBlocked.body.code, 'ANOMALIES_PENDING');

  // R03: updating only `note` on a 0-workday payslip never mutates allowances, gross_income, deductions, or net_salary
  const noteUpdate = await call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${noLogSlip.id}`, {
    note: 'Ghi chú kiểm toán R03: nghỉ không lương cả tháng',
  });
  assert.equal(noteUpdate.status, 200);
  assert.equal(noteUpdate.body.data.note, 'Ghi chú kiểm toán R03: nghỉ không lương cả tháng');
  assert.equal(Number(noteUpdate.body.data.allowances), 0);
  assert.equal(Number(noteUpdate.body.data.gross_income), 0);
  assert.equal(Number(noteUpdate.body.data.bhxh_amount), 0);
  assert.equal(Number(noteUpdate.body.data.total_deductions), 0);
  assert.equal(Number(noteUpdate.body.data.net_salary), 0);
});

test('R04 (F17/F20): leave creation rejects forged client totalDays and excludes public_holidays + weekends', async () => {
  const s = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
  await giveBalance(s.employeeId, 2026, 12);
  await giveBalance(s.employeeId, 2028, 12);

  // Forged totalDays: 0.5 on a 5-day range -> 400 BAD_REQUEST / VALIDATION_ERROR
  const forged = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2028-03-06',
    endDate: '2028-03-10',
    totalDays: 0.5,
    reason: 'Giả mạo totalDays',
  });
  assert.equal(forged.status, 400);
  assert.ok(['BAD_REQUEST', 'VALIDATION_ERROR'].includes(forged.body.code));

  // Range across 2026-04-30 (Thu holiday) + 2026-05-01 (Fri holiday) + 2026-05-02..03 (Sat/Sun) + 2026-05-04 (Mon workday) = 1.0 day
  const holidayLeave = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2026-04-30',
    endDate: '2026-05-04',
    reason: 'Nghỉ kết hợp kỳ lễ 30/4 - 1/5',
  });
  assert.equal(holidayLeave.status, 201);
  assert.equal(Number(holidayLeave.body.data.total_days), 1);

  // Half-day on a single working day -> 0.5 day
  const halfDay = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2028-03-13',
    endDate: '2028-03-13',
    shiftType: 'afternoon',
    reason: 'Nghỉ buổi chiều',
  });
  assert.equal(halfDay.status, 201);
  assert.equal(Number(halfDay.body.data.total_days), 0.5);
});

test('R05 (F12/F13/F26): system_settings drive payroll/OT by effective period and locked periods keep their snapshot', async () => {
  const emp = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
  await db.query("UPDATE employees SET base_salary = 22000000, joined_date = '2020-01-01' WHERE id = $1", [emp.employeeId]);

  // 22 workdays in 2028-05 and 2028-06
  for (const month of ['2028-05', '2028-06']) {
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ($2 || '-01')::date + g, 'DUNG_GIO', CASE WHEN g = 0 THEN 35 ELSE 0 END FROM generate_series(0, 21) g`,
      [emp.employeeId, month]
    );
  }

  const originalSettings = await settingsService.getSettings();
  try {
    // Configure new policy effective from 2028-06
    const putRes = await call('HR_DIRECTOR', 'put', '/api/settings', {
      personal_income_tax_deduction: 15500000,
      dependent_deduction: 6200000,
      default_allowances: 2000000,
      max_ot_per_month: 30,
      policy_effective_from: '2028-06',
    });
    assert.equal(putRes.status, 200);

    // 2028-05 is prior to policy_effective_from ('2028-06') -> uses baseline 11,000,000 deduction & 1,500,000 allowances
    await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2028-05' });
    const pMay = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-05'")).rows[0];
    const slipMay = (await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [pMay.id, emp.employeeId])).rows[0];
    assert.equal(Number(slipMay.pit_deduction), 11000000);
    assert.equal(Number(slipMay.allowances), 1500000);

    // Lock 2028-05
    const lockMay = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${pMay.id}/lock`, { acknowledgeAnomalies: true });
    assert.equal(lockMay.status, 200);

    // 2028-06 is on/after policy_effective_from ('2028-06') -> uses 15,500,000 PIT deduction, 2,000,000 allowances, and 30h OT limit
    await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2028-06' });
    const pJune = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-06'")).rows[0];
    const slipJune = (await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [pJune.id, emp.employeeId])).rows[0];
    assert.equal(Number(slipJune.pit_deduction), 15500000);
    assert.equal(Number(slipJune.allowances), 2000000);

    // Anomaly check on 2028-06 flags 35h > 30h limit as OT_OVER_LIMIT
    const anomJune = await call('HR_DIRECTOR', 'get', `/api/payroll/periods/${pJune.id}/anomalies`);
    const otViolation = anomJune.body.data.find((a) => a.employee_id === emp.employeeId && a.type === 'OT_OVER_LIMIT');
    assert.ok(otViolation);
    assert.equal(Number(otViolation.limit), 30);

    // OT submission in 2028-06 exceeding 30h limit is rejected by OT service
    await db.query(
      `INSERT INTO ot_requests (employee_id, work_date, start_time, end_time, hours, reason, stage)
       SELECT $1, ('2028-06-01'::date + g), '18:00', '22:00', 4, 'OT test', 'DA_PHE_DUYET'
         FROM generate_series(0, 6) g`,
      [emp.employeeId]
    );
    const otOverRes = await callWith(emp.token, 'post', '/api/ot-requests', {
      workDate: '2028-06-15',
      startTime: '18:00',
      endTime: '22:00',
      reason: 'Vượt ngưỡng 30h theo cấu hình mới',
    });
    assert.equal(otOverRes.status, 409);
    assert.equal(otOverRes.body.code, 'OT_MONTHLY_LIMIT');

    // Verify locked 2028-05 payslip and snapshot remain untouched even if policy_effective_from is moved to 2020-01
    await call('HR_DIRECTOR', 'put', '/api/settings', { policy_effective_from: '2020-01' });
    const slipMayAfter = (await db.query('SELECT * FROM payslips WHERE id = $1', [slipMay.id])).rows[0];
    assert.equal(Number(slipMayAfter.pit_deduction), 11000000);
    assert.equal(Number(slipMayAfter.allowances), 1500000);
    assert.equal(Number(slipMayAfter.net_salary), Number(slipMay.net_salary));
  } finally {
    await db.query("DELETE FROM system_policy_versions WHERE effective_from LIKE '2028-%'");
    await settingsService.updateSettings({ employeeId: null, role: 'HR_DIRECTOR' }, originalSettings, null);
  }
});

test('R06: settingsService.getSettings propagates database errors instead of silently returning DEFAULT_SETTINGS', async () => {
  const failingExecutor = {
    query: async () => {
      throw new Error('SIMULATED_DB_FAILURE_R06');
    },
  };
  await assert.rejects(
    async () => settingsService.getSettings(failingExecutor),
    /SIMULATED_DB_FAILURE_R06/
  );
});

test('Concurrency: simultaneous updatePayslip and lock serialize on payroll_periods FOR UPDATE without totals drift', async () => {
  const emp = await createTestEmployee({ status: 'DANG_LAM_VIEC', departmentId: 'DEPT-IT' });
  await db.query("UPDATE employees SET base_salary = 22000000, joined_date = '2020-01-01' WHERE id = $1", [emp.id]);
  await db.query(
    `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
     SELECT $1, ('2028-08-01'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 21) g`,
    [emp.id]
  );

  await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2028-08' });
  const period = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-08'")).rows[0];
  const slip = (await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [period.id, emp.id])).rows[0];

  const [updateRes, lockRes] = await Promise.all([
    call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${slip.id}`, { bonus: 3000000, note: 'Concurrent bonus' }),
    call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, { acknowledgeAnomalies: true }),
  ]);

  assert.equal(lockRes.status, 200);
  assert.ok([200, 409].includes(updateRes.status), `updateRes status was ${updateRes.status}`);

  const finalPeriod = (await db.query('SELECT * FROM payroll_periods WHERE id = $1', [period.id])).rows[0];
  const sumSlips = (await db.query('SELECT COALESCE(SUM(net_salary), 0) AS net, COUNT(*) FILTER (WHERE status <> \'DA_CHOT\')::int AS unlocked FROM payslips WHERE period_id = $1', [period.id])).rows[0];
  assert.equal(finalPeriod.status, 'DA_CHOT');
  assert.equal(sumSlips.unlocked, 0, 'Every payslip in locked period must have status DA_CHOT');
  assert.equal(Number(finalPeriod.total_net), Number(sumSlips.net), 'Period total_net must equal SUM(payslips.net_salary)');
});
