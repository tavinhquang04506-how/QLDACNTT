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
  await db.query("DELETE FROM system_policy_versions WHERE effective_from LIKE '2028-%'");
  await db.query("DELETE FROM ot_requests WHERE employee_id LIKE 'NV-T%'");
  await db.query("DELETE FROM payroll_periods WHERE period LIKE '2028-%'");
  await deleteTestLeaves();
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('R09 (Issue 1): 3 consecutive policy versions persist independently, calculate/recalculate by period, keep locked snapshots immutable, and reject missing historical policy (422)', async () => {
  const emp = await createTestEmployee({ status: 'DANG_LAM_VIEC', departmentId: 'DEPT-IT' });
  await db.query("UPDATE employees SET base_salary = 30000000, joined_date = '2020-01-01' WHERE id = $1", [emp.id]);

  for (const month of ['2028-01', '2028-02', '2028-03']) {
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ($2 || '-01')::date + g, 'DUNG_GIO', 0 FROM generate_series(0, 21) g`,
      [emp.id, month]
    );
  }

  const originalSettings = await settingsService.getSettings();
  try {
    // Save 3 consecutive policy versions: 2028-01, 2028-02, 2028-03
    const v1 = await call('HR_DIRECTOR', 'put', '/api/settings', {
      personal_income_tax_deduction: 11000000,
      dependent_deduction: 4400000,
      default_allowances: 1500000,
      max_ot_per_month: 40,
      policy_effective_from: '2028-01',
    });
    assert.equal(v1.status, 200);

    const v2 = await call('HR_DIRECTOR', 'put', '/api/settings', {
      personal_income_tax_deduction: 13000000,
      dependent_deduction: 5000000,
      default_allowances: 1800000,
      max_ot_per_month: 35,
      policy_effective_from: '2028-02',
    });
    assert.equal(v2.status, 200);

    const v3 = await call('HR_DIRECTOR', 'put', '/api/settings', {
      personal_income_tax_deduction: 15500000,
      dependent_deduction: 6200000,
      default_allowances: 2200000,
      max_ot_per_month: 30,
      policy_effective_from: '2028-03',
    });
    assert.equal(v3.status, 200);

    // Verify GET /api/settings/versions lists all 3 policy versions
    const versionsRes = await call('HR_DIRECTOR', 'get', '/api/settings/versions');
    assert.equal(versionsRes.status, 200);
    for (const eff of ['2028-01', '2028-02', '2028-03']) {
      assert.ok(versionsRes.body.data.some((row) => row.effective_from === eff), `Missing policy version ${eff}`);
    }

    // Calculate all 3 periods AFTER v3 was saved -> each period must select its own effective policy version
    for (const p of ['2028-01', '2028-02', '2028-03']) {
      const cRes = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: p });
      assert.equal(cRes.status, 200);
    }

    const slipJan = (await db.query("SELECT s.* FROM payslips s JOIN payroll_periods p ON p.id = s.period_id WHERE p.period = '2028-01' AND s.employee_id = $1", [emp.id])).rows[0];
    const slipFeb = (await db.query("SELECT s.* FROM payslips s JOIN payroll_periods p ON p.id = s.period_id WHERE p.period = '2028-02' AND s.employee_id = $1", [emp.id])).rows[0];
    const slipMar = (await db.query("SELECT s.* FROM payslips s JOIN payroll_periods p ON p.id = s.period_id WHERE p.period = '2028-03' AND s.employee_id = $1", [emp.id])).rows[0];

    assert.equal(Number(slipJan.pit_deduction), 11000000);
    assert.equal(Number(slipJan.allowances), 1500000);

    assert.equal(Number(slipFeb.pit_deduction), 13000000);
    assert.equal(Number(slipFeb.allowances), 1800000);

    assert.equal(Number(slipMar.pit_deduction), 15500000);
    assert.equal(Number(slipMar.allowances), 2200000);

    // Lock 2028-01
    const periodJan = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-01'")).rows[0];
    const lockJan = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${periodJan.id}/lock`, {
      acknowledgeAnomalies: true,
      note: 'Chốt kỳ 2028-01 kiểm thử bất biến R09',
    });
    assert.equal(lockJan.status, 200);

    // Update 2028-01 and 2028-02 policy versions; recalculate 2028-02 and verify locked 2028-01 is unchanged
    await call('HR_DIRECTOR', 'put', '/api/settings', {
      personal_income_tax_deduction: 19000000,
      default_allowances: 3500000,
      policy_effective_from: '2028-01',
    });
    await call('HR_DIRECTOR', 'put', '/api/settings', {
      personal_income_tax_deduction: 14000000,
      default_allowances: 1950000,
      policy_effective_from: '2028-02',
    });

    const recalcJan = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2028-01' });
    assert.equal(recalcJan.status, 409);
    assert.equal(recalcJan.body.code, 'PERIOD_LOCKED');

    const recalcFeb = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2028-02' });
    assert.equal(recalcFeb.status, 200);

    const slipJanAfter = (await db.query('SELECT * FROM payslips WHERE id = $1', [slipJan.id])).rows[0];
    assert.equal(Number(slipJanAfter.pit_deduction), 11000000, 'Locked 2028-01 PIT deduction must remain immutable');
    assert.equal(Number(slipJanAfter.allowances), 1500000, 'Locked 2028-01 allowances must remain immutable');
    assert.equal(Number(slipJanAfter.net_salary), Number(slipJan.net_salary), 'Locked 2028-01 net_salary must remain immutable');

    const slipFebAfter = (
      await db.query(
        "SELECT s.* FROM payslips s JOIN payroll_periods p ON p.id = s.period_id WHERE p.period = '2028-02' AND s.employee_id = $1",
        [emp.id]
      )
    ).rows[0];
    assert.equal(Number(slipFebAfter.pit_deduction), 14000000, 'Unlocked 2028-02 recalculates with updated 2028-02 policy');
    assert.equal(Number(slipFebAfter.allowances), 1950000);

    // Period prior to earliest recorded policy version ('2020-01') must fail with 422 POLICY_VERSION_NOT_FOUND
    const missingHist = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2019-06' });
    assert.equal(missingHist.status, 422);
    assert.equal(missingHist.body.code, 'POLICY_VERSION_NOT_FOUND');
  } finally {
    await db.query("DELETE FROM system_policy_versions WHERE effective_from LIKE '2028-%'");
    await settingsService.updateSettings({ employeeId: null, role: 'HR_DIRECTOR' }, originalSettings, null);
  }
});

test('R10 (Issue 2): 0-attendance period blocks lock by default (acknowledgeAnomalies=false) and audits explicit acknowledgement when confirmed', async () => {
  const zeroAttEmp = await createTestEmployee({ status: 'DANG_LAM_VIEC', departmentId: 'DEPT-IT' });
  await db.query("UPDATE employees SET base_salary = 20000000, joined_date = '2020-01-01' WHERE id = $1", [zeroAttEmp.id]);

  const calcRes = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2028-09' });
  assert.equal(calcRes.status, 200);
  const period = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-09'")).rows[0];

  // 1. Default body {} or { acknowledgeAnomalies: false } must be rejected with 409 ANOMALIES_PENDING
  const lockDefault = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, {});
  assert.equal(lockDefault.status, 409);
  assert.equal(lockDefault.body.code, 'ANOMALIES_PENDING');

  const lockExplicitFalse = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, {
    acknowledgeAnomalies: false,
  });
  assert.equal(lockExplicitFalse.status, 409);
  assert.equal(lockExplicitFalse.body.code, 'ANOMALIES_PENDING');

  const periodStillDraft = (await db.query('SELECT status FROM payroll_periods WHERE id = $1', [period.id])).rows[0];
  assert.equal(periodStillDraft.status, 'DU_THAO');

  // 2. Explicit acknowledgement with note succeeds and writes full details to audit_logs
  const lockConfirmed = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, {
    acknowledgeAnomalies: true,
    note: 'Đã kiểm tra nhân sự nghỉ không chấm công, xác nhận khóa sổ kỳ 2028-09',
  });
  assert.equal(lockConfirmed.status, 200);
  assert.equal(lockConfirmed.body.data.status, 'DA_CHOT');

  const auditRow = (
    await db.query(
      "SELECT * FROM audit_logs WHERE action = 'LOCK_PAYROLL' AND record_id = $1 ORDER BY created_at DESC LIMIT 1",
      [String(period.id)]
    )
  ).rows[0];
  assert.ok(auditRow, 'Audit log must be created for LOCK_PAYROLL');
  assert.equal(auditRow.new_values.acknowledge_anomalies, true);
  assert.equal(auditRow.new_values.note, 'Đã kiểm tra nhân sự nghỉ không chấm công, xác nhận khóa sổ kỳ 2028-09');
  assert.ok(Number(auditRow.new_values.acknowledged_violations) >= 1);
  assert.ok(
    Array.isArray(auditRow.new_values.acknowledged_violation_items) &&
      auditRow.new_values.acknowledged_violation_items.some(
        (v) => v.employeeId === zeroAttEmp.id && v.type === 'NO_ATTENDANCE'
      ),
    'Audit log must record acknowledged NO_ATTENDANCE violation item'
  );
});

test('R11 (Issue 3): leave creation never trusts client totalDays=0.5 when shiftType is full or omitted', async () => {
  const s = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
  await giveBalance(s.employeeId, 2028, 12);

  // 1. shiftType="full" + totalDays=0.5 on 1 working day -> 400 BAD_REQUEST
  const fullWithHalf = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2028-07-03',
    endDate: '2028-07-03',
    shiftType: 'full',
    totalDays: 0.5,
    reason: 'Client gửi shiftType=full nhưng totalDays=0.5',
  });
  assert.equal(fullWithHalf.status, 400);

  // 2. Omitted shiftType + totalDays=0.5 on 1 working day -> 400 BAD_REQUEST
  const omittedShiftWithHalf = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2028-07-03',
    endDate: '2028-07-03',
    totalDays: 0.5,
    reason: 'Client không gửi shiftType nhưng ép totalDays=0.5',
  });
  assert.equal(omittedShiftWithHalf.status, 400);

  // 3. shiftType="morning" + totalDays=1 on 1 working day -> 400 BAD_REQUEST
  const halfShiftWithFull = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2028-07-03',
    endDate: '2028-07-03',
    shiftType: 'morning',
    totalDays: 1,
    reason: 'Client gửi shiftType=morning nhưng totalDays=1',
  });
  assert.equal(halfShiftWithFull.status, 400);

  // 4. shiftType="full" + totalDays=1 on 1 working day -> 201, total_days=1
  const fullDayOk = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2028-07-03',
    endDate: '2028-07-03',
    shiftType: 'full',
    totalDays: 1,
    reason: 'Nghỉ cả ngày hợp lệ',
  });
  assert.equal(fullDayOk.status, 201);
  assert.equal(Number(fullDayOk.body.data.total_days), 1);

  // 5. Omitted shiftType and omitted totalDays on 1 working day -> 201, defaults to full (1 day)
  const omittedShiftOk = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2028-07-04',
    endDate: '2028-07-04',
    reason: 'Nghỉ 1 ngày từ client cũ không gửi shiftType',
  });
  assert.equal(omittedShiftOk.status, 201);
  assert.equal(Number(omittedShiftOk.body.data.total_days), 1);

  // 6. shiftType="morning" and shiftType="afternoon" on single working days -> 201, total_days=0.5
  const morningOk = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2028-07-05',
    endDate: '2028-07-05',
    shiftType: 'morning',
    reason: 'Nghỉ buổi sáng',
  });
  assert.equal(morningOk.status, 201);
  assert.equal(Number(morningOk.body.data.total_days), 0.5);

  const afternoonOk = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2028-07-06',
    endDate: '2028-07-06',
    shiftType: 'afternoon',
    totalDays: 0.5,
    reason: 'Nghỉ buổi chiều',
  });
  assert.equal(afternoonOk.status, 201);
  assert.equal(Number(afternoonOk.body.data.total_days), 0.5);

  // 7. Multi-day range across weekend (2028-07-07 Fri to 2028-07-10 Mon = 2 working days)
  const multiDayOk = await callWith(s.token, 'post', '/api/leaves', {
    leaveTypeId: 'LT-AL',
    startDate: '2028-07-07',
    endDate: '2028-07-10',
    shiftType: 'full',
    reason: 'Nghỉ thứ Sáu và thứ Hai qua cuối tuần',
  });
  assert.equal(multiDayOk.status, 201);
  assert.equal(Number(multiDayOk.body.data.total_days), 2);
});

test('R12 (Issue 6): payroll calculation integrates approved paid leaves without double-counting and ignores pending/unpaid leaves', async () => {
  const emp = await createTestEmployee({ status: 'DANG_LAM_VIEC', departmentId: 'DEPT-IT' });
  await db.query("UPDATE employees SET base_salary = 22000000, joined_date = '2020-01-01' WHERE id = $1", [emp.id]);

  // 5 attendance workdays: 2028-04-03 (Mon) .. 2028-04-07 (Fri)
  await db.query(
    `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
     SELECT $1, ('2028-04-03'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 4) g`,
    [emp.id]
  );

  // 1) Approved PAID leave for 2 non-overlapping working days: 2028-04-10..2028-04-11 (+2.0 days)
  await db.query(
    `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
     VALUES ($1, $2, 'LT-AL', '2028-04-10', '2028-04-11', 2, 'Nghỉ phép năm có lương 2 ngày', 'DA_PHE_DUYET')`,
    [`LR-T-PAID2-${Date.now()}`, emp.id]
  );

  // 2) Approved PAID half-day leave on 2028-04-12 (+0.5 day)
  await db.query(
    `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
     VALUES ($1, $2, 'LT-AL', '2028-04-12', '2028-04-12', 0.5, 'Nghỉ phép nửa ngày có lương', 'DA_PHE_DUYET')`,
    [`LR-T-PAIDHALF-${Date.now()}`, emp.id]
  );

  // 3) Approved PAID leave overlapping an existing attendance day 2028-04-03 (+0.0 day, deduplicated)
  await db.query(
    `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
     VALUES ($1, $2, 'LT-AL', '2028-04-03', '2028-04-03', 1, 'Nghỉ trùng ngày đã chấm công', 'DA_PHE_DUYET')`,
    [`LR-T-OVERLAP-${Date.now()}`, emp.id]
  );

  // 4) Unapproved (pending) PAID leave on 2028-04-13 (+0.0 day)
  await db.query(
    `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
     VALUES ($1, $2, 'LT-AL', '2028-04-13', '2028-04-13', 1, 'Đơn chờ duyệt', 'CHO_TRUONG_PHONG_DUYET')`,
    [`LR-T-PENDING-${Date.now()}`, emp.id]
  );

  // 5) Approved UNPAID leave (LT-UL, is_paid = FALSE) on 2028-04-14 (+0.0 day)
  await db.query(
    `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
     VALUES ($1, $2, 'LT-UL', '2028-04-14', '2028-04-14', 1, 'Nghỉ việc riêng không lương', 'DA_PHE_DUYET')`,
    [`LR-T-UNPAID-${Date.now()}`, emp.id]
  );

  const calcRes = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period: '2028-04' });
  assert.equal(calcRes.status, 200);

  const period = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-04'")).rows[0];
  const slip = (await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [period.id, emp.id])).rows[0];

  assert.equal(Number(slip.actual_work_days), 7.5, 'actual_work_days must equal 5 attendance + 2.5 non-overlapping approved paid leave days');
});
