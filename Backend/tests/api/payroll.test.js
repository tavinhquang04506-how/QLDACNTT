const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, loginUser, claimsFor, closeDb } = require('../helpers/api');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE action LIKE '%\\_PAYROLL' OR action LIKE 'LOCK\\_PAYROLL%'");
  await db.query("DELETE FROM ot_requests WHERE employee_id LIKE 'NV-T%'");
  await db.query("DELETE FROM payroll_periods WHERE period LIKE '2027-%'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const calc = (period, role = 'HR_DIRECTOR') => call(role, 'post', '/api/payroll/calculate', { period });
const payslipOf = async (period, employeeId) => (await db.query(
  `SELECT ps.* FROM payslips ps JOIN payroll_periods pp ON pp.id = ps.period_id WHERE pp.period = $1 AND ps.employee_id = $2`,
  [period, employeeId])).rows[0];
const periodRow = async (period) => (await db.query('SELECT * FROM payroll_periods WHERE period = $1', [period])).rows[0];

async function worker({ base = 22000000, status = 'DANG_LAM_VIEC', days = 0, otHours = 0, month = '2027-01' } = {}) {
  const emp = await createTestEmployee({ status });
  await db.query('UPDATE employees SET base_salary = $2, joined_date = $3 WHERE id = $1', [emp.id, base, '2020-01-01']);
  if (days > 0) {
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ($2 || '-01')::date + g, 'DUNG_GIO', CASE WHEN g = 0 THEN $4::numeric ELSE 0 END FROM generate_series(0, $3 - 1) g`,
      [emp.id, month, days, otHours]);
  }
  return emp;
}

test('calculate: a full month at 22 million nets 20,411,500', async () => {
  const emp = await worker({ days: 22 });
  const res = await calc('2027-01');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.period, '2027-01');
  const p = await payslipOf('2027-01', emp.id);
  assert.equal(Number(p.actual_work_days), 22);
  assert.equal(Number(p.gross_income), 23500000);
  assert.equal(Number(p.pit_amount), 778500);
  assert.equal(Number(p.net_salary), 20411500);
  assert.equal(p.status, 'DU_THAO');
});

test('calculate: worked days above 22 are capped, overtime is paid separately', async () => {
  const emp = await worker({ days: 25, otHours: 8, month: '2027-01' });
  await calc('2027-01');
  const p = await payslipOf('2027-01', emp.id);
  assert.equal(Number(p.actual_work_days), 22);
  assert.equal(Number(p.ot_hours), 8);
  assert.equal(Number(p.ot_pay), 1500000);
});

test('calculate: probation staff are paid, terminated staff and late joiners are not', async () => {
  const probation = await worker({ status: 'THU_VIEC', days: 22 });
  const gone = await worker({ status: 'DA_NGHI_VIEC', days: 22 });
  const late = await worker({ days: 0 });
  await db.query("UPDATE employees SET joined_date = '2027-03-01' WHERE id = $1", [late.id]);
  await calc('2027-01');
  assert.ok(await payslipOf('2027-01', probation.id));
  assert.equal(await payslipOf('2027-01', gone.id), undefined);
  assert.equal(await payslipOf('2027-01', late.id), undefined);
});

test('calculate: joiners and leavers without attendance are prorated by working days, not paid a full month', async () => {
  const joiner = await worker({ days: 0 });
  await db.query("UPDATE employees SET joined_date = '2027-01-28' WHERE id = $1", [joiner.id]); // Thu, Fri = 2 working days
  const leaver = await worker({ status: 'DA_NGHI_VIEC', days: 0 });
  await db.query("UPDATE employees SET termination_date = '2027-01-05' WHERE id = $1", [leaver.id]); // Fri 1, Mon 4, Tue 5 = 3 days
  const stayer = await worker({ days: 0 });
  await calc('2027-01');
  assert.equal(Number((await payslipOf('2027-01', joiner.id)).actual_work_days), 2);
  assert.equal(Number((await payslipOf('2027-01', leaver.id)).actual_work_days), 3);
  assert.equal(Number((await payslipOf('2027-01', stayer.id)).actual_work_days), 22);
  const j = await payslipOf('2027-01', joiner.id);
  assert.equal(Number(j.gross_income) - Number(j.allowances), 2000000);
});

test('calculate: recalculating a draft replaces the payslips without duplicating them', async () => {
  const emp = await worker({ days: 10 });
  await calc('2027-01');
  await db.query('UPDATE employees SET base_salary = 30000000 WHERE id = $1', [emp.id]);
  await calc('2027-01');
  const { rows } = await db.query(
    "SELECT COUNT(*)::int AS n FROM payslips ps JOIN payroll_periods pp ON pp.id = ps.period_id WHERE pp.period = '2027-01' AND ps.employee_id = $1", [emp.id]);
  assert.equal(rows[0].n, 1);
  assert.equal(Number((await payslipOf('2027-01', emp.id)).base_salary), 30000000);
  const period = await periodRow('2027-01');
  const total = (await db.query('SELECT COUNT(*)::int AS n, SUM(net_salary) AS net FROM payslips WHERE period_id = $1', [period.id])).rows[0];
  assert.equal(period.total_headcount, total.n);
  assert.equal(Number(period.total_net), Number(total.net));
});

test('calculate: validation and permissions', async () => {
  assert.equal((await calc('2027-13')).status, 400);
  assert.equal((await calc('2027-1')).status, 400);
  assert.equal((await call('HR_DIRECTOR', 'post', '/api/payroll/calculate', {})).status, 400);
  assert.equal((await calc('2027-04', 'EMPLOYEE')).status, 403);
  assert.equal((await calc('2027-04', 'LINE_MANAGER')).status, 403);
  assert.equal((await calc('2027-04', 'CEO')).status, 200);
});

test('lock: freezes the period; it can no longer be recalculated and its payslips survive', async () => {
  const emp = await worker({ days: 22, month: '2027-02' });
  await calc('2027-02');
  const period = await periodRow('2027-02');
  const before = (await db.query('SELECT COUNT(*)::int AS n FROM payslips WHERE period_id = $1', [period.id])).rows[0].n;
  const hrd = await claimsFor('HR_DIRECTOR');

  assert.equal((await call('EMPLOYEE', 'post', `/api/payroll/periods/${period.id}/lock`, {})).status, 403);
  assert.equal((await call('LINE_MANAGER', 'post', `/api/payroll/periods/${period.id}/lock`, {})).status, 403);
  const res = await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'DA_CHOT');
  assert.equal(res.body.data.locked_by, hrd.employeeId);
  assert.equal((await payslipOf('2027-02', emp.id)).status, 'DA_CHOT');

  const again = await calc('2027-02');
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'PERIOD_LOCKED');
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM payslips WHERE period_id = $1', [period.id])).rows[0].n, before);
  assert.equal((await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, {})).status, 409);
});

test('lock: an empty period, unknown period and overtime violations', async () => {
  await db.query("INSERT INTO payroll_periods (period) VALUES ('2027-05') ON CONFLICT DO NOTHING");
  const empty = await periodRow('2027-05');
  const noSlips = await call('CEO', 'post', `/api/payroll/periods/${empty.id}/lock`, {});
  assert.equal(noSlips.status, 409);
  assert.equal(noSlips.body.code, 'NO_PAYSLIPS');
  assert.equal((await call('CEO', 'post', '/api/payroll/periods/999999999/lock', {})).status, 404);

  await worker({ days: 22, otHours: 45, month: '2027-06' });
  await calc('2027-06');
  const p6 = await periodRow('2027-06');
  const blocked = await call('CEO', 'post', `/api/payroll/periods/${p6.id}/lock`, {});
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, 'ANOMALIES_PENDING');
  assert.equal((await periodRow('2027-06')).status, 'DU_THAO');
  const forced = await call('CEO', 'post', `/api/payroll/periods/${p6.id}/lock`, { acknowledgeAnomalies: true });
  assert.equal(forced.status, 200);
});

test('transfer: needs a locked period and bank details, then marks everything paid', async () => {
  const emp = await worker({ days: 22, month: '2027-07' });
  await calc('2027-07');
  const period = await periodRow('2027-07');
  const url = `/api/payroll/periods/${period.id}/transfer`;

  assert.equal((await call('HR_DIRECTOR', 'post', url, {})).status, 409); // still a draft
  await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, {});

  const noBank = await call('HR_DIRECTOR', 'post', url, {});
  assert.equal(noBank.status, 409);
  assert.equal(noBank.body.code, 'MISSING_BANK_ACCOUNT');
  assert.ok(noBank.body.details.some((d) => d.employee_id === emp.id));
  assert.equal((await call('EMPLOYEE', 'post', url, {})).status, 403);

  await db.query("UPDATE payslips SET bank_account = '0123456789', bank_name = 'Vietcombank' WHERE period_id = $1", [period.id]);
  const ok = await call('CEO', 'post', url, {});
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.status, 'DA_CHUYEN_KHOAN');
  const slip = await payslipOf('2027-07', emp.id);
  assert.equal(slip.status, 'DA_CHUYEN_KHOAN');
  assert.equal(slip.paid_date, (await db.query('SELECT CURRENT_DATE::text AS d')).rows[0].d);
  assert.equal((await call('CEO', 'post', url, {})).status, 409);
  assert.equal((await call('CEO', 'post', '/api/payroll/periods/999999999/transfer', {})).status, 404);
});

test('bank-transfer export: only for locked periods, and the batch total is the sum of its lines', async () => {
  await worker({ days: 22, month: '2027-08' });
  await calc('2027-08');
  const period = await periodRow('2027-08');
  const url = `/api/payroll/periods/${period.id}/bank-transfer`;
  assert.equal((await call('HR_DIRECTOR', 'get', url)).status, 409);
  await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, {});

  const res = await call('HR_DIRECTOR', 'get', url);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.count, res.body.data.items.length);
  const lineSum = res.body.data.items.reduce((s, i) => s + i.amount, 0);
  assert.equal(res.body.data.totalAmount, lineSum); // the batch total is the sum of its lines
  assert.equal(res.body.data.periodTotalNet, Number((await periodRow('2027-08')).total_net));
  assert.ok(res.body.data.totalAmount < res.body.data.periodTotalNet); // some employees still lack bank details
  assert.ok(res.body.data.items.every((i) => i.memo.includes('2027-08') && Number(i.amount) > 0));
  assert.ok(res.body.data.missingBank.length >= 1);
  assert.equal((await call('EMPLOYEE', 'get', url)).status, 403);
  assert.equal((await call('LINE_MANAGER', 'get', url)).status, 403);
});

test('anomalies: overtime over the legal limit, unapproved overtime, missing bank, no attendance', async () => {
  const over = await worker({ days: 22, otHours: 44.5, month: '2027-09' });
  const unapproved = await worker({ days: 22, otHours: 3, month: '2027-09' });
  const approved = await worker({ days: 22, otHours: 3, month: '2027-09' });
  const absent = await worker({ days: 0, month: '2027-09' });
  await db.query(
    `INSERT INTO ot_requests (employee_id, work_date, start_time, end_time, hours, reason, stage)
     VALUES ($1, '2027-09-01', '18:00', '21:00', 3, 't', 'DA_PHE_DUYET')`, [approved.id]);
  await calc('2027-09');
  const period = await periodRow('2027-09');

  const res = await call('HR_DIRECTOR', 'get', `/api/payroll/periods/${period.id}/anomalies`);
  assert.equal(res.status, 200);
  const of = (id, type) => res.body.data.find((a) => a.employee_id === id && a.type === type);
  const violation = of(over.id, 'OT_OVER_LIMIT');
  assert.ok(violation);
  assert.equal(violation.severity, 'Cao');
  assert.equal(Number(violation.metric_value), 44.5);
  assert.equal(violation.limit, 40);
  assert.ok(of(unapproved.id, 'OT_UNAPPROVED'));
  assert.equal(of(approved.id, 'OT_UNAPPROVED'), undefined);
  assert.ok(of(absent.id, 'NO_ATTENDANCE'));
  assert.ok(of(over.id, 'MISSING_BANK'));
  assert.equal((await call('EMPLOYEE', 'get', `/api/payroll/periods/${period.id}/anomalies`)).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'get', '/api/payroll/periods/999999999/anomalies')).status, 404);
});

test('period detail and list are for HR and CEO only', async () => {
  await calc('2027-10');
  const period = await periodRow('2027-10');
  const res = await call('HR_DIRECTOR', 'get', `/api/payroll/periods/${period.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.period, '2027-10');
  assert.equal((await call('EMPLOYEE', 'get', `/api/payroll/periods/${period.id}`)).status, 403);
  assert.equal((await call('LINE_MANAGER', 'get', `/api/payroll/periods/${period.id}`)).status, 403);
  assert.equal((await call('CEO', 'get', '/api/payroll/periods/999999999')).status, 404);
  assert.equal((await call('CEO', 'get', '/api/payroll/periods/abc')).status, 400);
  assert.equal((await call('EMPLOYEE', 'get', '/api/payroll/periods')).status, 403);
});

test('payslip visibility: employees see only their own, and only after the period is locked', async () => {
  const s = await employeeSession();
  await db.query('UPDATE employees SET base_salary = 20000000, joined_date = $2 WHERE id = $1', [s.employeeId, '2020-01-01']);
  const other = await employeeSession();
  await db.query('UPDATE employees SET base_salary = 20000000, joined_date = $2 WHERE id = $1', [other.employeeId, '2020-01-01']);
  await calc('2027-11');
  const period = await periodRow('2027-11');

  assert.deepEqual((await callWith(s.token, 'get', '/api/payroll/me')).body.data, []); // draft
  assert.deepEqual((await callWith(s.token, 'get', '/api/payroll/payslips?period=2027-11')).body.data, []);
  const slipId = (await payslipOf('2027-11', s.employeeId)).id;
  assert.equal((await callWith(s.token, 'get', `/api/payroll/payslips/${slipId}`)).status, 403);

  await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, { acknowledgeAnomalies: true });

  const mine = await callWith(s.token, 'get', '/api/payroll/me');
  assert.equal(mine.body.data.length, 1);
  assert.equal(mine.body.data[0].period, '2027-11');
  const list = await callWith(s.token, 'get', '/api/payroll/payslips?period=2027-11');
  assert.ok(list.body.data.every((r) => r.employee_id === s.employeeId));
  const detail = await callWith(s.token, 'get', `/api/payroll/payslips/${slipId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.employee_id, s.employeeId);
  const otherSlip = (await payslipOf('2027-11', other.employeeId)).id;
  assert.equal((await callWith(s.token, 'get', `/api/payroll/payslips/${otherSlip}`)).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'get', `/api/payroll/payslips/${otherSlip}`)).status, 200);
  assert.equal((await call('CEO', 'get', '/api/payroll/payslips/999999999')).status, 404);
});

test('HR sees drafts and everyone; a LINE_MANAGER only ever sees their own payslip', async () => {
  const a = await employeeSession({ departmentId: 'DEPT-ACC' });
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-ACC' });
  for (const s of [a, mgr]) await db.query('UPDATE employees SET base_salary = 20000000, joined_date = $2 WHERE id = $1', [s.employeeId, '2020-01-01']);
  await calc('2027-12');

  const hr = await call('HR_DIRECTOR', 'get', '/api/payroll/payslips?period=2027-12&limit=500');
  assert.ok(hr.body.data.some((r) => r.employee_id === a.employeeId));
  assert.ok(hr.body.data.some((r) => r.employee_id === mgr.employeeId));

  const asMgr = await callWith(mgr.token, 'get', '/api/payroll/payslips?period=2027-12');
  assert.equal(asMgr.status, 200);
  assert.ok(asMgr.body.data.every((r) => r.employee_id === mgr.employeeId));
  assert.equal(JSON.stringify(asMgr.body).includes(a.employeeId), false);
  const aSlip = (await payslipOf('2027-12', a.employeeId)).id;
  assert.equal((await callWith(mgr.token, 'get', `/api/payroll/payslips/${aSlip}`)).status, 403);
});

test('ADMIN and KIOSK accounts cannot read any payslip', async () => {
  const admin = await createTestUser({ role: 'ADMIN' });
  const kiosk = await createTestUser({ role: 'KIOSK' });
  for (const u of [admin, kiosk]) {
    const { accessToken } = await loginUser(u);
    assert.equal((await callWith(accessToken, 'get', '/api/payroll/payslips')).status, 403, u.role);
    assert.equal((await callWith(accessToken, 'get', '/api/payroll/me')).status, 403, u.role);
    assert.equal((await callWith(accessToken, 'get', '/api/payroll/periods')).status, 403, u.role);
  }
});

test('payslip list validates the period and clamps paging', async () => {
  assert.equal((await call('HR_DIRECTOR', 'get', '/api/payroll/payslips?period=2027-13')).status, 400);
  assert.equal((await call('HR_DIRECTOR', 'get', '/api/payroll/payslips?limit=100000')).body.pagination.limit, 500);
});

test('payroll writes are audited', async () => {
  await calc('2027-03');
  const period = await periodRow('2027-03');
  await call('HR_DIRECTOR', 'post', `/api/payroll/periods/${period.id}/lock`, { acknowledgeAnomalies: true });
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'payroll_periods' AND record_id = $1 ORDER BY id", [String(period.id)]);
  assert.deepEqual(rows.map((r) => r.action), ['CALCULATE_PAYROLL', 'LOCK_PAYROLL']);
});

test('HR can manually adjust a payslip before lock, recalculating totals', async () => {
  await calc('2027-04');
  const period = await periodRow('2027-04');
  const slipsRes = await call('HR_DIRECTOR', 'get', `/api/payroll/payslips?period=2027-04`);
  assert.equal(slipsRes.status, 200);
  const slip = slipsRes.body.data[0];
  assert.ok(slip);

  // Manual adjustment: add 5,000,000 bonus and adjust actualWorkDays to 20
  const updateRes = await call('HR_DIRECTOR', 'put', `/api/payroll/payslips/${slip.id}`, {
    bonus: 5000000,
    actualWorkDays: 20,
    note: 'Thưởng nóng KPI quý'
  });
  assert.equal(updateRes.status, 200);
  assert.equal(Number(updateRes.body.data.bonus), 5000000);
  assert.equal(Number(updateRes.body.data.actual_work_days), 20);
  assert.equal(updateRes.body.data.note, 'Thưởng nóng KPI quý');

  // Verify non-HR cannot adjust payslip
  assert.equal((await call('EMPLOYEE', 'put', `/api/payroll/payslips/${slip.id}`, { bonus: 1000000 })).status, 403);
});

