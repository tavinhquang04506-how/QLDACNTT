const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, loginUser, closeDb } = require('../helpers/api');
const { createTestUser, deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE action = 'ADJUST_ATTENDANCE'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

const today = async () => (await db.query('SELECT CURRENT_DATE::text AS d')).rows[0].d;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

test('check-in then check-out for the company-local day', async () => {
  const s = await employeeSession();
  const inRes = await callWith(s.token, 'post', '/api/attendance/check-in', { method: 'gps', gpsLat: 10.77, gpsLng: 106.7 });
  assert.equal(inRes.status, 201);
  assert.equal(inRes.body.data.work_date, await today());
  assert.equal(inRes.body.data.employee_id, s.employeeId);

  assert.equal((await callWith(s.token, 'post', '/api/attendance/check-in', {})).status, 409);

  const state = await callWith(s.token, 'get', '/api/attendance/me/today');
  assert.equal(state.body.checkedIn, true);
  assert.equal(state.body.checkedOut, false);

  const out = await callWith(s.token, 'post', '/api/attendance/check-out', { method: 'gps' });
  assert.equal(out.status, 200);
  assert.ok(out.body.data.check_out_time);
  assert.equal((await callWith(s.token, 'post', '/api/attendance/check-out', {})).status, 409);
  assert.equal((await callWith(s.token, 'get', '/api/attendance/me/today')).body.checkedOut, true);
});

test('check-out before check-in -> 400', async () => {
  const s = await employeeSession();
  assert.equal((await callWith(s.token, 'post', '/api/attendance/check-out', {})).status, 400);
});

test('check-in validates method and GPS; face_id is no longer accepted', async () => {
  const s = await employeeSession();
  for (const body of [{ method: 'telepathy' }, { method: 'face_id' }, { gpsLat: 200 }, { gpsLng: -500 }, { gpsLat: 'x' }]) {
    const res = await callWith(s.token, 'post', '/api/attendance/check-in', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  }
  assert.equal((await callWith(s.token, 'post', '/api/attendance/check-in', { method: 'qr' })).status, 201);
});

test('an account without an employee record cannot punch', async () => {
  const u = await createTestUser({ role: 'EMPLOYEE' });
  const { accessToken } = await loginUser(u);
  assert.equal((await callWith(accessToken, 'post', '/api/attendance/check-in', {})).status, 403);
  assert.equal((await callWith(accessToken, 'post', '/api/attendance/check-out', {})).status, 403);
  assert.equal((await callWith(accessToken, 'get', '/api/attendance/me/today')).status, 403);
});

test('list scope: employee sees only their own rows, manager their department, CEO everyone', async () => {
  const a = await employeeSession({ departmentId: 'DEPT-MKT' });
  const b = await employeeSession({ departmentId: 'DEPT-SALES' });
  await callWith(a.token, 'post', '/api/attendance/check-in', {});
  await callWith(b.token, 'post', '/api/attendance/check-in', {});

  const own = await callWith(a.token, 'get', '/api/attendance');
  assert.equal(own.status, 200);
  assert.ok(own.body.data.every((r) => r.employee_id === a.employeeId));
  const peek = await callWith(a.token, 'get', `/api/attendance?employeeId=${b.employeeId}`);
  assert.deepEqual(peek.body.data, []);

  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const dept = await callWith(mgr.token, 'get', '/api/attendance');
  assert.ok(dept.body.data.length >= 1);
  assert.ok(dept.body.data.every((r) => r.department_id === 'DEPT-MKT'));
  assert.ok(dept.body.data.some((r) => r.employee_id === a.employeeId));

  const all = await call('CEO', 'get', `/api/attendance?date=${await today()}&limit=200`);
  const ids = all.body.data.map((r) => r.employee_id);
  assert.ok(ids.includes(a.employeeId) && ids.includes(b.employeeId));
});

test('list filters are validated and paging is clamped', async () => {
  assert.equal((await call('CEO', 'get', '/api/attendance?month=2026-13')).status, 400);
  assert.equal((await call('CEO', 'get', '/api/attendance?month=junk')).status, 400);
  assert.equal((await call('CEO', 'get', '/api/attendance?date=2026-02-30')).status, 400);
  const res = await call('CEO', 'get', '/api/attendance?limit=100000&page=0');
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.limit, 200);
  assert.equal(res.body.pagination.page, 1);
});

test('my-qr: an employee gets a short-lived QR token; accounts without an employee cannot', async () => {
  const s = await employeeSession();
  const res = await callWith(s.token, 'get', '/api/attendance/qr');
  assert.equal(res.status, 200);
  assert.ok(res.body.qrToken.length > 20);
  assert.equal(res.body.expiresIn, 60);
  assert.equal(res.body.employeeId, s.employeeId);
  const kiosk = await createTestUser({ role: 'KIOSK' });
  const { accessToken } = await loginUser(kiosk);
  assert.equal((await callWith(accessToken, 'get', '/api/attendance/qr')).status, 403);
  assert.equal((await call(null, 'get', '/api/attendance/qr')).status, 401);
});

test('kiosk punch by QR: check-in, then check-out, then refused; only KIOSK and HR', async () => {
  const s = await employeeSession();
  const kiosk = await createTestUser({ role: 'KIOSK' });
  const { accessToken } = await loginUser(kiosk);
  const qr = async () => (await callWith(s.token, 'get', '/api/attendance/qr')).body.qrToken;
  const punch = async (token = accessToken, qrToken) => callWith(token, 'post', '/api/attendance/kiosk/punch', { qrToken: qrToken ?? (await qr()) });

  const first = await punch();
  assert.equal(first.status, 201);
  assert.equal(first.body.action, 'CHECK_IN');
  assert.equal(first.body.data.employee_id, s.employeeId);
  assert.equal(first.body.data.check_in_method, 'qr');
  const second = await punch();
  assert.equal(second.status, 200);
  assert.equal(second.body.action, 'CHECK_OUT');
  assert.equal(second.body.data.check_out_method, 'qr');
  assert.equal((await punch()).status, 409);

  assert.equal((await punch(s.token)).status, 403);
  assert.equal((await call('LINE_MANAGER', 'post', '/api/attendance/kiosk/punch', { qrToken: await qr() })).status, 403);
  const other = await employeeSession();
  const otherQr = (await callWith(other.token, 'get', '/api/attendance/qr')).body.qrToken;
  assert.equal((await call('HR_DIRECTOR', 'post', '/api/attendance/kiosk/punch', { qrToken: otherQr })).status, 201);
});

test('kiosk punch: a QR token works once, and forged, expired or wrong-kind tokens are rejected', async () => {
  const { signQrToken } = require('../../src/modules/attendance/qr');
  const s = await employeeSession();
  const kiosk = await createTestUser({ role: 'KIOSK' });
  const { accessToken } = await loginUser(kiosk);
  const send = (qrToken) => callWith(accessToken, 'post', '/api/attendance/kiosk/punch', qrToken === undefined ? {} : { qrToken });

  const token = (await callWith(s.token, 'get', '/api/attendance/qr')).body.qrToken;
  assert.equal((await send(token)).status, 201);
  const replay = await send(token);
  assert.equal(replay.status, 401);
  assert.equal(replay.body.code, 'QR_TOKEN_USED');

  assert.equal((await send('garbage')).body.code, 'INVALID_QR_TOKEN');
  assert.equal((await send(s.token)).status, 401); // an access token is not a QR token
  assert.equal((await send(signQrToken(s.employeeId, { expiresIn: -10 }))).body.code, 'INVALID_QR_TOKEN');
  assert.equal((await send()).status, 400);
  assert.equal((await send(42)).status, 400);
});

test('kiosk punch: a terminated or deleted employee cannot punch', async () => {
  const { signQrToken } = require('../../src/modules/attendance/qr');
  const kiosk = await createTestUser({ role: 'KIOSK' });
  const { accessToken } = await loginUser(kiosk);
  const gone = await createTestEmployee({ status: 'DA_NGHI_VIEC' });
  const res = await callWith(accessToken, 'post', '/api/attendance/kiosk/punch', { qrToken: signQrToken(gone.id) });
  assert.equal(res.status, 409);
  const ghost = await callWith(accessToken, 'post', '/api/attendance/kiosk/punch', { qrToken: signQrToken('NV-NOPE') });
  assert.equal(ghost.status, 404);
});

test('a QR token cannot be used as an access token', async () => {
  const s = await employeeSession();
  const qr = (await callWith(s.token, 'get', '/api/attendance/qr')).body.qrToken;
  assert.equal((await callWith(qr, 'get', '/api/departments')).status, 401);
});

test('kiosk punch: a second scan right after the first is refused when a minimum gap is configured', async () => {
  const config = require('../../src/config/env');
  const s = await employeeSession();
  const kiosk = await createTestUser({ role: 'KIOSK' });
  const { accessToken } = await loginUser(kiosk);
  const qr = async () => (await callWith(s.token, 'get', '/api/attendance/qr')).body.qrToken;
  const previous = config.punchMinGapSeconds;
  config.punchMinGapSeconds = 300;
  try {
    assert.equal((await callWith(accessToken, 'post', '/api/attendance/kiosk/punch', { qrToken: await qr() })).status, 201);
    const soon = await callWith(accessToken, 'post', '/api/attendance/kiosk/punch', { qrToken: await qr() });
    assert.equal(soon.status, 409);
    assert.equal(soon.body.code, 'PUNCH_TOO_SOON');
  } finally {
    config.punchMinGapSeconds = previous;
  }
});

test('a KIOSK account cannot read attendance or use employee endpoints', async () => {
  const kiosk = await createTestUser({ role: 'KIOSK' });
  const { accessToken } = await loginUser(kiosk);
  assert.equal((await callWith(accessToken, 'get', '/api/attendance')).status, 403);
  assert.equal((await callWith(accessToken, 'get', '/api/employees')).status, 403);
});

test('adjust: HR corrects a day, the trigger recomputes hours, and re-adjusting updates the same row', async () => {
  const emp = await createTestEmployee();
  const body = { employeeId: emp.id, workDate: '2026-02-10', checkIn: '2026-02-10T08:10:00+07:00', checkOut: '2026-02-10T17:30:00+07:00', note: 'Quên chấm công' };
  const res = await call('HR_DIRECTOR', 'post', '/api/attendance/adjust', body);
  assert.equal(res.status, 201);
  assert.equal(res.body.data.late_minutes, 10);
  assert.equal(res.body.data.status, 'DI_MUON');
  assert.equal(Number(res.body.data.work_hours), 9.33);
  assert.equal(Number(res.body.data.ot_hours), 1.33);
  assert.equal(res.body.data.work_date, '2026-02-10');

  const again = await call('CEO', 'post', '/api/attendance/adjust', { ...body, checkIn: '2026-02-10T07:55:00+07:00' });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.late_minutes, 0);
  assert.equal(again.body.data.status, 'DUNG_GIO');
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM attendance_logs WHERE employee_id = $1', [emp.id]);
  assert.equal(rows[0].n, 1);
});

test('adjust: a status-only day (paid leave) needs no times', async () => {
  const emp = await createTestEmployee();
  const res = await call('HR_DIRECTOR', 'post', '/api/attendance/adjust', { employeeId: emp.id, workDate: '2026-02-11', status: 'NGHI_PHEP', note: 'Phép năm' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'NGHI_PHEP');
  assert.equal(res.body.data.check_in_time, null);
});

test('adjust: validation, unknown employee, permissions, audit', async () => {
  const emp = await createTestEmployee();
  const ok = { employeeId: emp.id, workDate: '2026-02-12', checkIn: '2026-02-12T08:00:00+07:00' };
  assert.equal((await call('CEO', 'post', '/api/attendance/adjust', { ...ok, checkOut: '2026-02-12T07:00:00+07:00' })).status, 400);
  assert.equal((await call('CEO', 'post', '/api/attendance/adjust', { employeeId: emp.id, workDate: '2026-02-12' })).status, 400);
  assert.equal((await call('CEO', 'post', '/api/attendance/adjust', { ...ok, workDate: '12/02/2026' })).status, 400);
  assert.equal((await call('CEO', 'post', '/api/attendance/adjust', { ...ok, checkIn: 'yesterday' })).status, 400);
  assert.equal((await call('CEO', 'post', '/api/attendance/adjust', { ...ok, status: 'SLEEPING' })).status, 400);
  assert.equal((await call('CEO', 'post', '/api/attendance/adjust', { ...ok, employeeId: 'NV-NOPE' })).status, 404);
  assert.equal((await call('EMPLOYEE', 'post', '/api/attendance/adjust', ok)).status, 403);
  assert.equal((await call('LINE_MANAGER', 'post', '/api/attendance/adjust', ok)).status, 403);
  const res = await call('CEO', 'post', '/api/attendance/adjust', ok);
  assert.equal(res.status, 201);
  const { rows } = await db.query("SELECT 1 FROM audit_logs WHERE action = 'ADJUST_ATTENDANCE' AND record_id = $1", [String(res.body.data.id)]);
  assert.equal(rows.length, 1);
});

test('timesheet: a month matrix with per-day status and totals, scoped by role', async () => {
  const emp = await createTestEmployee({ departmentId: 'DEPT-ACC' });
  await call('HR_DIRECTOR', 'post', '/api/attendance/adjust', { employeeId: emp.id, workDate: '2026-04-06', checkIn: '2026-04-06T08:30:00+07:00', checkOut: '2026-04-06T18:00:00+07:00' });
  await call('HR_DIRECTOR', 'post', '/api/attendance/adjust', { employeeId: emp.id, workDate: '2026-04-07', checkIn: '2026-04-07T07:50:00+07:00', checkOut: '2026-04-07T16:50:00+07:00' });

  const res = await call('HR_DIRECTOR', 'get', '/api/attendance/timesheet?month=2026-04&department=DEPT-ACC');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.month, '2026-04');
  assert.equal(res.body.data.days, 30);
  const row = res.body.data.rows.find((r) => r.employee_id === emp.id);
  assert.equal(row.cells['2026-04-06'], 'DI_MUON');
  assert.equal(row.cells['2026-04-07'], 'DUNG_GIO');
  assert.equal(row.totals.work_days, 2);
  assert.equal(row.totals.late_days, 1);
  assert.ok(row.totals.ot_hours > 0);

  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-SALES' });
  const scoped = await callWith(mgr.token, 'get', '/api/attendance/timesheet?month=2026-04');
  assert.equal(scoped.status, 200);
  assert.ok(scoped.body.data.rows.every((r) => r.department_id === 'DEPT-SALES'));

  const self = await employeeSession();
  const mine = await callWith(self.token, 'get', '/api/attendance/timesheet?month=2026-04');
  assert.deepEqual(mine.body.data.rows.map((r) => r.employee_id), [self.employeeId]);

  assert.equal((await call('CEO', 'get', '/api/attendance/timesheet?month=2026-4')).status, 400);
  assert.equal((await call('CEO', 'get', '/api/attendance/timesheet')).status, 400);
});

test('exceptions: late and absent lists for a weekday; nothing absent on a weekend', async () => {
  const late = await createTestEmployee({ departmentId: 'DEPT-ACC' });
  const absent = await createTestEmployee({ departmentId: 'DEPT-ACC' });
  const onLeave = await createTestEmployee({ departmentId: 'DEPT-ACC' });
  await db.query("UPDATE employees SET joined_date = '2020-01-01' WHERE id = ANY($1)", [[late.id, absent.id, onLeave.id]]);
  await call('HR_DIRECTOR', 'post', '/api/attendance/adjust', { employeeId: late.id, workDate: '2026-05-05', checkIn: '2026-05-05T09:00:00+07:00' });
  await db.query(
    `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
     VALUES ($1, $2, 'LT-AL', '2026-05-05', '2026-05-05', 1, 'test', 'DA_PHE_DUYET')`, [`LP-T-${Date.now()}`, onLeave.id]);

  const res = await call('HR_DIRECTOR', 'get', '/api/attendance/exceptions?date=2026-05-05');
  assert.equal(res.status, 200);
  assert.ok(res.body.late.some((r) => r.employee_id === late.id && r.late_minutes === 60));
  assert.ok(res.body.absent.some((r) => r.employee_id === absent.id));
  assert.equal(res.body.absent.some((r) => r.employee_id === onLeave.id), false);
  assert.equal(res.body.absent.some((r) => r.employee_id === late.id), false);

  const weekend = await call('HR_DIRECTOR', 'get', '/api/attendance/exceptions?date=2026-05-09');
  assert.deepEqual(weekend.body.absent, []);

  assert.equal((await call('EMPLOYEE', 'get', '/api/attendance/exceptions?date=2026-05-05')).status, 403);
  assert.equal((await call('CEO', 'get', '/api/attendance/exceptions?date=bad')).status, 400);
  await db.query("DELETE FROM leave_requests WHERE id LIKE 'LP-T-%'");
});

test('live: latest punches of today, HR/CEO/manager only', async () => {
  const s = await employeeSession();
  await callWith(s.token, 'post', '/api/attendance/check-in', {});
  const res = await call('HR_DIRECTOR', 'get', '/api/attendance/live');
  assert.equal(res.status, 200);
  const mine = res.body.data.find((r) => r.employee_id === s.employeeId);
  assert.equal(mine.event, 'CHECK_IN');
  assert.ok(res.body.data.length <= 50);
  assert.equal((await callWith(s.token, 'get', '/api/attendance/live')).status, 403);
  assert.equal(has(mine, 'face_encoding'), false);
});

test('adjust: an explicit status is kept even when punch times are given', async () => {
  const emp = await createTestEmployee();
  const res = await call('HR_DIRECTOR', 'post', '/api/attendance/adjust', {
    employeeId: emp.id, workDate: '2027-04-19', checkIn: '2027-04-19T09:00:00+07:00', checkOut: '2027-04-19T17:00:00+07:00', status: 'CONG_TAC',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'CONG_TAC');
  assert.equal(res.body.data.late_minutes, 60);
  const again = await call('HR_DIRECTOR', 'post', '/api/attendance/adjust', { employeeId: emp.id, workDate: '2027-04-19', checkIn: '2027-04-19T08:30:00+07:00' });
  assert.equal(again.body.data.status, 'CONG_TAC');
  const back = await call('HR_DIRECTOR', 'post', '/api/attendance/adjust', { employeeId: emp.id, workDate: '2027-04-19', status: 'DUNG_GIO' });
  assert.equal(back.body.data.status, 'DI_MUON'); // automatic again
});

test('an employee can still punch on a day HR pre-marked without times', async () => {
  const s = await employeeSession();
  const day = await today();
  const pre = await call('HR_DIRECTOR', 'post', '/api/attendance/adjust', { employeeId: s.employeeId, workDate: day, status: 'NGHI_LE', note: 'Nghỉ lễ' });
  assert.equal(pre.status, 201);

  const first = await callWith(s.token, 'post', '/api/attendance/check-in', { method: 'gps' });
  assert.equal(first.status, 201);
  assert.ok(first.body.data.check_in_time);
  assert.notEqual(first.body.data.status, 'NGHI_LE');
  assert.equal((await callWith(s.token, 'post', '/api/attendance/check-in', {})).status, 409); // now really checked in
  assert.equal((await callWith(s.token, 'post', '/api/attendance/check-out', {})).status, 200);
});

test('a pre-marked business-trip day keeps its status when the employee punches; the kiosk works too', async () => {
  const s = await employeeSession();
  const day = await today();
  await call('HR_DIRECTOR', 'post', '/api/attendance/adjust', { employeeId: s.employeeId, workDate: day, status: 'CONG_TAC' });
  const kiosk = await createTestUser({ role: 'KIOSK' });
  const { accessToken } = await loginUser(kiosk);
  const qr = (await callWith(s.token, 'get', '/api/attendance/qr')).body.qrToken;
  const res = await callWith(accessToken, 'post', '/api/attendance/kiosk/punch', { qrToken: qr });
  assert.equal(res.status, 201);
  assert.equal(res.body.action, 'CHECK_IN');
  assert.equal(res.body.data.status, 'CONG_TAC');
});
