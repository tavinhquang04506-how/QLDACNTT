process.env.NODE_ENV = 'test';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { call, closeDb } = require('../helpers/api');
const db = require('../../src/config/db');
const { deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { giveBalance, deleteTestLeaves } = require('../helpers/leaves');
const settingsService = require('../../src/modules/settings/service');
const payrollService = require('../../src/modules/payroll/service');
const { checkSchemaReadiness } = require('../../src/utils/schemaReadiness');
const { assertSafeTestDatabase } = require('../../src/utils/testDbGuard');
const {
  reconcilePayrollReportCsv,
  reconcileBankTransferCsv,
} = require('../../src/utils/csvReconciler');

after(async () => {
  await assertSafeTestDatabase(db, 'r16-r19 after() cleanup');
  await db.query(
    "DELETE FROM audit_logs WHERE action IN ('CALCULATE_PAYROLL', 'LOCK_PAYROLL', 'UPDATE_PAYSLIP', 'UPDATE_SETTINGS')"
  );
  await db.query("DELETE FROM system_policy_versions WHERE effective_from LIKE '2028-%'");
  await db.query("DELETE FROM ot_requests WHERE employee_id LIKE 'NV-T%'");
  await db.query("DELETE FROM payroll_periods WHERE period LIKE '2028-%'");
  await deleteTestLeaves();
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('R16: GET /api/health/ready and checkSchemaReadiness detect schema readiness vs DEPLOYMENT_PENDING', async () => {
  const readyRes = await call('HR_DIRECTOR', 'get', '/api/health/ready');
  assert.equal(readyRes.status, 200);
  assert.equal(readyRes.body.ready, true);
  assert.equal(readyRes.body.status, 'READY');
  assert.equal(readyRes.body.expectedMigrationsCount, 11);
  assert.equal(readyRes.body.appliedMigrationsCount, 11);
  assert.deepEqual(readyRes.body.pendingMigrations, []);
  assert.deepEqual(readyRes.body.missingStructures, []);

  // Simulate an unmigrated database missing 010 & 011
  const mockUnmigratedPool = {
    async query(sql, params) {
      if (sql.includes("to_regclass('public.schema_migrations')")) {
        return { rows: [{ reg: 'schema_migrations', db: 'nexus_hrms_simulated' }] };
      }
      if (sql.includes('SELECT name FROM schema_migrations')) {
        return {
          rows: [
            { name: '001_initial_schema.sql' },
            { name: '007_pip_workflow.sql' },
            { name: '008_appeal_resolution_tx.sql' },
            { name: '009_audit_log_immutability.sql' },
          ],
        };
      }
      if (sql.includes('SELECT to_regclass($1) AS reg')) {
        const tbl = params[0];
        if (tbl === 'public.public_holidays' || tbl === 'public.system_policy_versions') {
          return { rows: [{ reg: null }] };
        }
        return { rows: [{ reg: tbl }] };
      }
      if (sql.includes('FROM information_schema.columns')) {
        return { rows: [{ ok: false }] };
      }
      return { rows: [] };
    },
  };

  const pendingReport = await checkSchemaReadiness(mockUnmigratedPool);
  assert.equal(pendingReport.ready, false);
  assert.equal(pendingReport.status, 'DEPLOYMENT_PENDING');
  assert.ok(pendingReport.pendingMigrations.includes('010_payroll_policy_snapshot_and_holidays.sql'));
  assert.ok(pendingReport.pendingMigrations.includes('011_system_policy_versions.sql'));
  assert.ok(pendingReport.missingStructures.includes('table:public.public_holidays'));
  assert.ok(pendingReport.missingStructures.includes('table:public.system_policy_versions'));
  assert.ok(pendingReport.missingStructures.includes('column:public.payroll_periods.policy_snapshot'));
});

test('R17: PUT /api/settings supports partial patch and enforces expectedUpdatedAt optimistic concurrency (409 SETTINGS_STALE)', async () => {
  const originalSettings = await settingsService.getSettings();
  try {
    const get1 = await call('HR_DIRECTOR', 'get', '/api/settings');
    assert.equal(get1.status, 200);
    const baselineUpdatedAt = get1.body.data.updated_at;
    assert.ok(baselineUpdatedAt, 'GET /api/settings must return updated_at');

    // Partial patch of a single field with matching expectedUpdatedAt succeeds
    const put1 = await call('HR_DIRECTOR', 'put', '/api/settings', {
      max_ot_per_month: 36,
      expectedUpdatedAt: baselineUpdatedAt,
    });
    assert.equal(put1.status, 200);
    assert.equal(Number(put1.body.data.max_ot_per_month), 36);
    // Unmentioned fields in partial patch remain intact
    assert.equal(
      Number(put1.body.data.personal_income_tax_deduction),
      Number(get1.body.data.personal_income_tax_deduction)
    );

    // Second update changes updated_at on server
    await new Promise((r) => setTimeout(r, 15));
    const put2 = await call('HR_DIRECTOR', 'put', '/api/settings', {
      max_ot_per_month: 38,
    });
    assert.equal(put2.status, 200);
    assert.notEqual(put2.body.data.updated_at, baselineUpdatedAt);

    // Attempt to save using stale expectedUpdatedAt must fail with 409 SETTINGS_STALE
    const stalePut = await call('HR_DIRECTOR', 'put', '/api/settings', {
      max_ot_per_month: 20,
      expectedUpdatedAt: baselineUpdatedAt,
    });
    assert.equal(stalePut.status, 409);
    assert.equal(stalePut.body.code, 'SETTINGS_STALE');

    // Verify DB kept 38, not overwritten by stale 20
    const verifyGet = await call('HR_DIRECTOR', 'get', '/api/settings');
    assert.equal(Number(verifyGet.body.data.max_ot_per_month), 38);
  } finally {
    await settingsService.updateSettings({ id: 'EMP001', role: 'HR_DIRECTOR' }, originalSettings);
  }
});

test('R18: Service-level mock executor and DB/API integration reject locking stale payroll (409 PAYROLL_STALE) even with acknowledgeAnomalies=true, and preserve HR manual adjustments on recalculation', async () => {
  // 1. Service-level reproduction with mock executor (exact R18 scenario from review report)
  const origWithTx = db.withTransaction;
  db.withTransaction = async (fn) => {
    const mockClient = {
      async query(sql) {
        const s = String(sql).replace(/\s+/g, ' ').trim();
        if (s.includes('FROM payroll_periods WHERE id = $1')) {
          return { rows: [{ id: 901, period: '2028-11', status: 'DU_THAO', policy_snapshot: null }] };
        }
        if (s.includes('SELECT COUNT(*)::int AS n FROM payslips')) {
          return { rows: [{ n: 1 }] };
        }
        if (s.includes('FROM system_policy_versions')) {
          return {
            rows: [{ id: 1, effective_from: '2020-01', policy: { max_ot_per_month: 40, standard_work_days: 22 } }],
          };
        }
        if (s.includes('FROM payslips ps JOIN employees e')) {
          return {
            rows: [
              {
                employee_id: 'NV-MOCK-1',
                full_name: 'Mock Stale Employee',
                actual_work_days: 0,
                ot_hours: 0,
                bank_account: '0071001234567',
                bank_name: 'Vietcombank',
                att_days: 1,
                absent_days: 0,
                approved_ot: 0,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    return fn(mockClient);
  };

  try {
    await assert.rejects(
      () => payrollService.lock({ employeeId: 'NV-0001', role: 'HR_DIRECTOR' }, 901, { acknowledgeAnomalies: false }),
      (err) => err.status === 409 && err.code === 'PAYROLL_STALE'
    );
  } finally {
    db.withTransaction = origWithTx;
  }

  // 2. Full DB/API integration across all 4 stale triggers + HR manual adjustment preservation
  const originalSettings = await settingsService.getSettings();
  const emp = await createTestEmployee({ status: 'DANG_LAM_VIEC', departmentId: 'DEPT-IT' });
  const period = '2028-06';

  try {
    await db.query("UPDATE employees SET base_salary = 22000000, joined_date = '2020-01-01' WHERE id = $1", [emp.id]);
    await call('HR_DIRECTOR', 'put', '/api/settings', {
      personal_income_tax_deduction: 11000000,
      default_allowances: 1500000,
      policy_effective_from: period,
    });

    // Step 2a: Calculate period 2028-06 when emp has 0 attendance logs
    const calc0 = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period });
    assert.equal(calc0.status, 200);

    const periodRow = (await db.query('SELECT * FROM payroll_periods WHERE period = $1', [period])).rows[0];
    const slip0 = (
      await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [periodRow.id, emp.id])
    ).rows[0];
    assert.equal(Number(slip0.actual_work_days), 0);

    // HR manually adds a bonus & note on the draft payslip via PUT /api/payroll/payslips/:id
    const adjustRes = await call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${slip0.id}`, {
      bonus: 2500000,
      note: 'Thưởng dự án đặc biệt R18',
    });
    assert.equal(adjustRes.status, 200);
    assert.equal(Number(adjustRes.body.data.bonus), 2500000);

    // Trigger A: Add attendance log AFTER calculate()
    await db.query(
      "INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours) VALUES ($1, '2028-06-05', 'DUNG_GIO', 2)",
      [emp.id]
    );

    // Check anomalies endpoint reports stale items
    const anomA = await call('HR_DIRECTOR', 'get', `/api/payroll/periods/${periodRow.id}/anomalies`);
    assert.equal(anomA.status, 200);
    assert.ok(Array.isArray(anomA.body.data));
    assert.ok(anomA.body.data.some((a) => a.type === 'PAYROLL_STALE' && a.category === 'stale'));

    // Attempt lock with acknowledgeAnomalies: false -> 409 PAYROLL_STALE
    const lockAFalse = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${periodRow.id}/lock`, {
      acknowledgeAnomalies: false,
    });
    assert.equal(lockAFalse.status, 409);
    assert.equal(lockAFalse.body.code, 'PAYROLL_STALE');

    // Attempt lock with acknowledgeAnomalies: true -> MUST STILL FAIL with 409 PAYROLL_STALE!
    const lockATrue = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${periodRow.id}/lock`, {
      acknowledgeAnomalies: true,
      note: 'Cố tình bỏ qua bất thường khi dữ liệu nguồn đã cũ',
    });
    assert.equal(lockATrue.status, 409);
    assert.equal(lockATrue.body.code, 'PAYROLL_STALE');

    // Recalculate -> must update actual_work_days to 1 AND preserve HR manual bonus (2,500,000) & note!
    const calc1 = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period });
    assert.equal(calc1.status, 200);
    const slip1 = (
      await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [periodRow.id, emp.id])
    ).rows[0];
    assert.equal(Number(slip1.actual_work_days), 1);
    assert.equal(Number(slip1.bonus), 2500000, 'HR manual bonus must be preserved across recalculation');
    assert.equal(slip1.note, 'Thưởng dự án đặc biệt R18', 'HR manual note must be preserved across recalculation');

    // Verify audit log recorded preserved_adjustments
    const auditRes = await db.query(
      "SELECT new_values FROM audit_logs WHERE action = 'CALCULATE_PAYROLL' AND record_id = $1 ORDER BY id DESC LIMIT 1",
      [String(periodRow.id)]
    );
    assert.ok(auditRes.rows[0]?.new_values?.preserved_adjustments?.[emp.id], 'CALCULATE_PAYROLL audit log must record preserved_adjustments');
    assert.equal(Number(auditRes.rows[0].new_values.preserved_adjustments[emp.id].bonus), 2500000);

    // Trigger B: Approve a paid leave request in 2028-06 AFTER calculate()
    await giveBalance(emp.id, 2028, 12, 'LT-AL');
    const leaveId = `LP-2028-${Date.now().toString().slice(-5)}`;
    await db.query(
      `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
       VALUES ($1, $2, 'LT-AL', '2028-06-06', '2028-06-07', 2, 'Nghỉ phép có lương R18', 'CHO_HR_PHE_CHUAN')`,
      [leaveId, emp.id]
    );
    const approveRes = await call('HR_DIRECTOR', 'patch', `/api/leaves/${leaveId}/approve`, {});
    assert.equal(approveRes.status, 200);
    const lockB = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${periodRow.id}/lock`, {
      acknowledgeAnomalies: true,
      note: 'Thử chốt khi nghỉ phép có lương vừa thay đổi',
    });
    assert.equal(lockB.status, 409);
    assert.equal(lockB.body.code, 'PAYROLL_STALE');
    assert.ok(lockB.body.details.some((r) => r.reason === 'WORKDAYS_CHANGED' && r.employee_id === emp.id));

    // Recalculate -> actual_work_days becomes 1 + 2 = 3, bonus still 2,500,000
    await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period });
    const slip2 = (
      await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [periodRow.id, emp.id])
    ).rows[0];
    assert.equal(Number(slip2.actual_work_days), 3);
    assert.equal(Number(slip2.bonus), 2500000);

    // Trigger C: Change employee base_salary AFTER calculate()
    await db.query('UPDATE employees SET base_salary = 26400000 WHERE id = $1', [emp.id]);
    const lockC = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${periodRow.id}/lock`, {
      acknowledgeAnomalies: true,
      note: 'Thử chốt khi lương cơ bản nhân viên vừa đổi',
    });
    assert.equal(lockC.status, 409);
    assert.equal(lockC.body.code, 'PAYROLL_STALE');
    assert.ok(lockC.body.details.some((r) => r.reason === 'BASE_SALARY_CHANGED' && r.employee_id === emp.id));

    // Recalculate -> base_salary updated to 26,400,000, bonus still 2,500,000
    await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period });

    // Trigger D: Change effective policy in system_settings for 2028-06 AFTER calculate()
    await call('HR_DIRECTOR', 'put', '/api/settings', {
      default_allowances: 1900000,
      policy_effective_from: period,
    });
    const lockD = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${periodRow.id}/lock`, {
      acknowledgeAnomalies: true,
      note: 'Thử chốt khi chính sách lương hiệu lực vừa đổi',
    });
    assert.equal(lockD.status, 409);
    assert.equal(lockD.body.code, 'PAYROLL_STALE');
    assert.ok(lockD.body.details.some((r) => r.reason === 'POLICY_CHANGED'));

    // Recalculate once more and add full 22 days so there are 0 anomalies for emp, then lock
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-06-08'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 18) g
       ON CONFLICT DO NOTHING`,
      [emp.id]
    );
    await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period });

    // Concurrent race test: Promise.all between updating employee salary via API and locking period
    const [empPutRes, lockRaceRes] = await Promise.all([
      call('HR_DIRECTOR', 'put', `/api/employees/${emp.id}`, { baseSalary: 28000000 }),
      call('HR_DIRECTOR', 'post', `/api/payroll/periods/${periodRow.id}/lock`, {
        acknowledgeAnomalies: true,
        note: 'Kiểm thử đua đồng thời cập nhật nguồn và chốt lương R18',
      }),
    ]);
    assert.equal(empPutRes.status, 200);
    if (lockRaceRes.status === 409) {
      // Update acquired lock first -> lock() detected PAYROLL_STALE and aborted!
      assert.equal(lockRaceRes.body.code, 'PAYROLL_STALE');
      const recalcAfterRace = await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', { period });
      assert.equal(recalcAfterRace.status, 200);
      const lockFinal = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${periodRow.id}/lock`, {
        acknowledgeAnomalies: true,
        note: 'Chốt kỳ sau khi tính lại bản mới nhất R18',
      });
      assert.equal(lockFinal.status, 200);
      assert.equal(lockFinal.body.data.status, 'DA_CHOT');
    } else {
      // Lock acquired FOR UPDATE first -> locked snapshot before salary update committed
      assert.equal(lockRaceRes.status, 200);
      assert.equal(lockRaceRes.body.data.status, 'DA_CHOT');
    }
  } finally {
    await settingsService.updateSettings({ id: 'EMP001', role: 'HR_DIRECTOR' }, originalSettings);
  }
});

test('R19: csvReconciler validates multi-employee payroll report & bank transfer CSVs and fails on swapped amounts or dropped rows', async () => {
  const dbPayslips = [
    {
      employee_id: 'EMP101',
      full_name: 'Nguyễn Văn A',
      job_title: 'Senior Backend Engineer',
      actual_work_days: 22,
      standard_work_days: 22,
      base_salary: 20000000,
      ot_pay: 1500000,
      allowances: 1500000,
      bonus: 1000000,
      bhxh_amount: 1600000,
      bhyt_amount: 300000,
      bhtn_amount: 200000,
      pit_amount: 945000,
      net_salary: 20955000,
      bank_account: '101000111',
      bank_name: 'Vietcombank',
    },
    {
      employee_id: 'EMP102',
      full_name: 'Trần Thị B',
      job_title: 'Product Manager',
      actual_work_days: 20,
      standard_work_days: 22,
      base_salary: 33000000,
      ot_pay: 0,
      allowances: 1500000,
      bonus: 500000,
      bhxh_amount: 2640000,
      bhyt_amount: 495000,
      bhtn_amount: 330000,
      pit_amount: 1850000,
      net_salary: 26685000,
      bank_account: '202000222',
      bank_name: 'Techcombank',
    },
    {
      employee_id: 'EMP103',
      full_name: 'Lê Hoàng C',
      job_title: 'QA Engineer',
      actual_work_days: 22,
      standard_work_days: 22,
      base_salary: 15000000,
      ot_pay: 500000,
      allowances: 1500000,
      bonus: 0,
      bhxh_amount: 1200000,
      bhyt_amount: 225000,
      bhtn_amount: 150000,
      pit_amount: 221250,
      net_salary: 15203750,
      bank_account: '303000333',
      bank_name: 'MB Bank',
    },
    // Employee with 0 net salary -> included in full payroll report, excluded from bank transfer CSV
    {
      employee_id: 'EMP104',
      full_name: 'Phạm Vắng Mặt',
      job_title: 'Frontend Developer',
      actual_work_days: 0,
      standard_work_days: 22,
      base_salary: 18000000,
      ot_pay: 0,
      allowances: 0,
      bonus: 0,
      bhxh_amount: 0,
      bhyt_amount: 0,
      bhtn_amount: 0,
      pit_amount: 0,
      net_salary: 0,
      bank_account: '404000444',
      bank_name: 'ACB',
    },
    // Employee with missing bank account -> included in full payroll report, excluded from bank transfer CSV
    {
      employee_id: 'EMP105',
      full_name: 'Đỗ Thiếu Ngân Hàng',
      job_title: 'HR Specialist',
      actual_work_days: 22,
      standard_work_days: 22,
      base_salary: 12000000,
      ot_pay: 0,
      allowances: 1500000,
      bonus: 0,
      bhxh_amount: 960000,
      bhyt_amount: 180000,
      bhtn_amount: 120000,
      pit_amount: 62000,
      net_salary: 12178000,
      bank_account: '',
      bank_name: '',
    },
  ];

  const validReportCsv =
    '\uFEFF' +
    [
      'Mã NV,Họ Và Tên,Chức Vụ,Lương Cơ Bản,Ngày Công,Làm Thêm (OT),Thưởng KPI & Phụ Cấp,BHXH,Thuế TNCN,Thực Lĩnh (Net)',
      'EMP101,"Nguyễn Văn A","Senior Backend Engineer",20000000,22/22,1500000,2500000,2100000,945000,20955000',
      'EMP102,"Trần Thị B","Product Manager",33000000,20/22,0,2000000,3465000,1850000,26685000',
      'EMP103,"Lê Hoàng C","QA Engineer",15000000,22/22,500000,1500000,1575000,221250,15203750',
      'EMP104,"Phạm Vắng Mặt","Frontend Developer",18000000,0/22,0,0,0,0,0',
      'EMP105,"Đỗ Thiếu Ngân Hàng","HR Specialist",12000000,22/22,0,1500000,1260000,62000,12178000',
    ].join('\n');

  const validBankCsv =
    '\uFEFF' +
    [
      'STT,Mã Nhân Viên,Họ Và Tên,Số Tài Khoản,Ngân Hàng Thụ Hưởng,Số Tiền Thực Nhận (VNĐ),Trạng Thái',
      '1,EMP101,"Nguyễn Văn A","101000111","Vietcombank",20955000,"Hợp lệ"',
      '2,EMP102,"Trần Thị B","202000222","Techcombank",26685000,"Hợp lệ"',
      '3,EMP103,"Lê Hoàng C","303000333","MB Bank",15203750,"Hợp lệ"',
    ].join('\n');

  // Positive reconciliation passes
  const reportResult = reconcilePayrollReportCsv(validReportCsv, dbPayslips);
  assert.equal(reportResult.rowCount, 5);
  assert.equal(reportResult.sums.netSalary, 75021750);

  const bankResult = reconcileBankTransferCsv(validBankCsv, dbPayslips);
  assert.equal(bankResult.payableRowCount, 3);
  assert.equal(bankResult.excludedRowCount, 2);
  assert.equal(bankResult.totalAmount, 62843750);

  // Negative Test 1: Swap net_salary between EMP101 and EMP102 (keeping total sum identical!) -> MUST FAIL
  const swappedReportCsv = validReportCsv
    .replace('EMP101,"Nguyễn Văn A","Senior Backend Engineer",20000000,22/22,1500000,2500000,2100000,945000,20955000', 'EMP101,"Nguyễn Văn A","Senior Backend Engineer",20000000,22/22,1500000,2500000,2100000,945000,26685000')
    .replace('EMP102,"Trần Thị B","Product Manager",33000000,20/22,0,2000000,3465000,1850000,26685000', 'EMP102,"Trần Thị B","Product Manager",33000000,20/22,0,2000000,3465000,1850000,20955000');

  assert.throws(
    () => reconcilePayrollReportCsv(swappedReportCsv, dbPayslips),
    /Net salary mismatch for EMP101/
  );

  const swappedBankCsv = validBankCsv
    .replace('20955000', '__TMP__')
    .replace('26685000', '20955000')
    .replace('__TMP__', '26685000');

  assert.throws(
    () => reconcileBankTransferCsv(swappedBankCsv, dbPayslips),
    /Bank transfer net amount mismatch for EMP101/
  );

  // Negative Test 2: Drop 1 employee row from CSV -> MUST FAIL
  const droppedRowReportCsv = validReportCsv
    .split('\n')
    .filter((line) => !line.startsWith('EMP103,'))
    .join('\n');

  assert.throws(
    () => reconcilePayrollReportCsv(droppedRowReportCsv, dbPayslips),
    /Payroll report CSV row count/
  );

  const droppedRowBankCsv = validBankCsv
    .split('\n')
    .filter((line) => !line.includes(',EMP103,'))
    .join('\n');

  assert.throws(
    () => reconcileBankTransferCsv(droppedRowBankCsv, dbPayslips),
    /Bank transfer CSV row count/
  );
});
