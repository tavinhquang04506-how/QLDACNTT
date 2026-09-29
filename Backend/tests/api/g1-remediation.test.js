const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const WebSocket = require('ws');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { initSocket } = require('../../src/socket');
const { clearDashboardCache } = require('../../src/middleware/dashboardCache');
const { callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');

after(async () => {
  clearDashboardCache();
  await db.query("DELETE FROM squad_messages WHERE sender_id LIKE 'NV-T%'");
  await db.query("DELETE FROM squad_members WHERE employee_id LIKE 'NV-T%'");
  await db.query("DELETE FROM attendance_appeals WHERE employee_id LIKE 'NV-T%'");
  await db.query("DELETE FROM attendance_logs WHERE employee_id LIKE 'NV-T%'");
  await db.query("DELETE FROM audit_logs WHERE record_id LIKE 'APL-%' OR record_id LIKE 'NV-T%'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('F01: dashboard cache with cache enabled isolates two managers in different departments and two employees', async () => {
  clearDashboardCache();
  const mgrIt = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const mgrSales = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-SALES' });
  const empA = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
  const empB = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-SALES' });

  // First request from IT Manager -> MISS
  const resIt1 = await request(app)
    .get('/api/dashboard/stats')
    .set('Authorization', `Bearer ${mgrIt.token}`)
    .set('x-enable-cache', '1');
  assert.equal(resIt1.status, 200);
  assert.equal(resIt1.headers['x-cache-status'], 'MISS');

  // Repeat request from IT Manager -> HIT
  const resIt2 = await request(app)
    .get('/api/dashboard/stats')
    .set('Authorization', `Bearer ${mgrIt.token}`)
    .set('x-enable-cache', '1');
  assert.equal(resIt2.status, 200);
  assert.equal(resIt2.headers['x-cache-status'], 'HIT');

  // Request with identical URL from Sales Manager -> MISS (isolated cache key!)
  const resSales = await request(app)
    .get('/api/dashboard/stats')
    .set('Authorization', `Bearer ${mgrSales.token}`)
    .set('x-enable-cache', '1');
  assert.equal(resSales.status, 200);
  assert.equal(resSales.headers['x-cache-status'], 'MISS');
  assert.notDeepEqual(resIt1.body.data.departmentStats, resSales.body.data.departmentStats);

  // Two employees with same roleCode -> isolated cache keys
  const resEmpA = await request(app)
    .get('/api/dashboard/stats')
    .set('Authorization', `Bearer ${empA.token}`)
    .set('x-enable-cache', '1');
  assert.equal(resEmpA.status, 200);
  assert.equal(resEmpA.headers['x-cache-status'], 'MISS');

  const resEmpB = await request(app)
    .get('/api/dashboard/stats')
    .set('Authorization', `Bearer ${empB.token}`)
    .set('x-enable-cache', '1');
  assert.equal(resEmpB.status, 200);
  assert.equal(resEmpB.headers['x-cache-status'], 'MISS');
});

test('F02-F05: attendance appeals enforce actor identity, scope, transactions, 404/403/409, and concurrent ID uniqueness', async () => {
  const empIt = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
  const empSales = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-SALES' });
  const mgrIt = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const mgrSales = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-SALES' });

  // Seed a late attendance log for empIt on 2026-09-15
  await db.query(
    `INSERT INTO attendance_logs (employee_id, work_date, check_in_time, check_out_time, work_hours, late_minutes, status, check_in_method)
     VALUES ($1, '2026-09-15', '2026-09-15T08:45:00Z', '2026-09-15T17:30:00Z', 7.25, 45, 'DI_MUON', 'gps')`,
    [empIt.employeeId]
  );

  // 1. Unauthenticated request -> 401
  const unauth = await request(app).post('/api/attendance/appeals').send({
    date: '2026-09-15',
    appeal_type: 'DI_MUON',
    reason: 'Kẹt xe',
  });
  assert.equal(unauth.status, 401);

  // 2. Spoofed employee_id -> 403
  const spoofed = await callWith(empIt.token, 'post', '/api/attendance/appeals', {
    employee_id: empSales.employeeId,
    date: '2026-09-15',
    appeal_type: 'DI_MUON',
    reason: 'Thử mạo danh nhân viên khác',
  });
  assert.equal(spoofed.status, 403);

  // 3. Concurrent creation -> unique IDs from seq_appeal_id
  const [c1, c2] = await Promise.all([
    callWith(empIt.token, 'post', '/api/attendance/appeals', {
      date: '2026-09-15',
      appeal_type: 'DI_MUON',
      reason: 'Sự cố kẹt xe tuyến Xa Lộ Hà Nội',
    }),
    callWith(empSales.token, 'post', '/api/attendance/appeals', {
      date: '2026-09-16',
      appeal_type: 'QUEN_CHAM_CONG',
      reason: 'Quên quẹt thẻ khi họp khách hàng sáng sớm',
    }),
  ]);
  assert.equal(c1.status, 201);
  assert.equal(c2.status, 201);
  const appealItId = c1.body.data.id;
  const appealSalesId = c2.body.data.id;
  assert.notEqual(appealItId, appealSalesId);

  // 4. Scope filtering on GET /api/attendance/appeals
  const listEmpIt = await callWith(empIt.token, 'get', '/api/attendance/appeals');
  assert.equal(listEmpIt.status, 200);
  assert.ok(listEmpIt.body.data.every((a) => a.employee_id === empIt.employeeId));

  const listMgrIt = await callWith(mgrIt.token, 'get', '/api/attendance/appeals');
  assert.equal(listMgrIt.status, 200);
  assert.ok(listMgrIt.body.data.some((a) => a.id === appealItId));
  assert.ok(!listMgrIt.body.data.some((a) => a.id === appealSalesId));

  // 5. Cross-department review -> 403
  const crossDeptReview = await callWith(mgrSales.token, 'patch', `/api/attendance/appeals/${appealItId}/review`, {
    status: 'DA_DUYET',
    review_note: 'Duyệt hộ phòng khác',
  });
  assert.equal(crossDeptReview.status, 403);

  // 6. Self-approval by manager -> 403
  const mgrAppeal = await callWith(mgrIt.token, 'post', '/api/attendance/appeals', {
    date: '2026-09-17',
    appeal_type: 'DI_MUON',
    reason: 'Trưởng phòng đi muộn',
  });
  assert.equal(mgrAppeal.status, 201);
  const selfReview = await callWith(mgrIt.token, 'patch', `/api/attendance/appeals/${mgrAppeal.body.data.id}/review`, {
    status: 'DA_DUYET',
    review_note: 'Tự duyệt',
  });
  assert.equal(selfReview.status, 403);

  // 7. Non-existent ID -> 404
  const notFoundRes = await callWith(mgrIt.token, 'patch', '/api/attendance/appeals/APL-999999/review', {
    status: 'DA_DUYET',
  });
  assert.equal(notFoundRes.status, 404);

  // 8. Valid approval by IT Manager updates appeal, attendance_logs, and audit_logs in one transaction
  const approveRes = await callWith(mgrIt.token, 'patch', `/api/attendance/appeals/${appealItId}/review`, {
    status: 'DA_DUYET',
    review_note: 'Xác nhận kẹt xe',
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.data.status, 'DA_DUYET');
  assert.equal(approveRes.body.data.reviewer_id, mgrIt.employeeId);

  const attRow = (
    await db.query(
      "SELECT status, late_minutes, work_hours FROM attendance_logs WHERE employee_id = $1 AND work_date = '2026-09-15'",
      [empIt.employeeId]
    )
  ).rows[0];
  assert.equal(attRow.status, 'DUNG_GIO');
  assert.equal(Number(attRow.late_minutes), 0);
  assert.ok(Number(attRow.work_hours) >= 8);

  const auditRows = (
    await db.query(
      "SELECT action, record_id FROM audit_logs WHERE table_name = 'attendance_appeals' AND record_id = $1 ORDER BY id ASC",
      [appealItId]
    )
  ).rows;
  assert.deepEqual(
    auditRows.map((r) => r.action),
    ['CREATE_ATTENDANCE_APPEAL', 'APPROVE_ATTENDANCE_APPEAL']
  );

  // 9. Re-reviewing an already reviewed appeal -> 409
  const reReview = await callWith(mgrIt.token, 'patch', `/api/attendance/appeals/${appealItId}/review`, {
    status: 'TU_CHOI',
    review_note: 'Đổi trạng thái sau khi đã duyệt',
  });
  assert.equal(reReview.status, 409);

  // 10. Transaction rollback: if attendance_logs update fails during approval, appeal remains CHO_DUYET
  const origWithTx = db.withTransaction;
  try {
    db.withTransaction = async (fn) =>
      origWithTx(async (client) => {
        const origClientQuery = client.query;
        client.query = async (sql, params) => {
          if (String(sql).includes('INSERT INTO attendance_logs') || String(sql).includes('UPDATE attendance_logs')) {
            throw new Error('SIMULATED_ATTENDANCE_LOG_WRITE_FAILURE');
          }
          return origClientQuery.call(client, sql, params);
        };
        try {
          return await fn(client);
        } finally {
          client.query = origClientQuery;
        }
      });

    const rollbackRes = await callWith(mgrSales.token, 'patch', `/api/attendance/appeals/${appealSalesId}/review`, {
      status: 'DA_DUYET',
      review_note: 'Thử nghiệm rollback khi ghi log lỗi',
    });
    assert.equal(rollbackRes.status, 500);
  } finally {
    db.withTransaction = origWithTx;
  }

  const afterRollback = (
    await db.query('SELECT status, reviewer_id FROM attendance_appeals WHERE id = $1', [appealSalesId])
  ).rows[0];
  assert.equal(afterRollback.status, 'CHO_DUYET');
  assert.equal(afterRollback.reviewer_id, null);
});

test('F08 & F31: WebSocket enforces JWT auth, squad membership, and persists messages without spoofing', async () => {
  const member = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-IT' });
  const outsider = await employeeSession({ role: 'EMPLOYEE', departmentId: 'DEPT-SALES' });

  // Add `member` to SQ-01
  await db.query(
    `INSERT INTO squad_members (squad_id, employee_id, role_in_squad)
     VALUES ('SQ-01', $1, 'Developer')
     ON CONFLICT (squad_id, employee_id) DO NOTHING`,
    [member.employeeId]
  );

  const server = http.createServer(app);
  const wss = initSocket(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Unauthenticated connection rejected
    await assert.rejects(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', resolve);
        ws.on('error', reject);
      })
    );

    // 2. Outsider connects with valid JWT but cannot join SQ-01
    const wsOutsider = new WebSocket(`ws://localhost:${port}?token=${encodeURIComponent(outsider.token)}`);
    const outsiderErrorPromise = new Promise((resolve) => {
      wsOutsider.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'error') resolve(msg);
      });
    });
    const outsiderClosePromise = new Promise((resolve) => wsOutsider.on('close', resolve));
    await new Promise((resolve, reject) => {
      wsOutsider.on('open', resolve);
      wsOutsider.on('error', reject);
    });
    wsOutsider.send(JSON.stringify({ type: 'join-squad', squadId: 'SQ-01' }));
    const errMsg = await outsiderErrorPromise;
    assert.equal(errMsg.code, 'FORBIDDEN');
    wsOutsider.close();
    await outsiderClosePromise;

    // 3. Squad member joins SQ-01 and posts message; spoofed senderId is ignored and message persists in DB
    const wsMember = new WebSocket(`ws://localhost:${port}?token=${encodeURIComponent(member.token)}`);
    const chatBroadcastPromise = new Promise((resolve) => {
      wsMember.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'squad-message') resolve(msg.message);
      });
    });
    const historyPromise = new Promise((resolve) => {
      wsMember.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'squad-history') resolve(msg);
      });
    });
    const memberClosePromise = new Promise((resolve) => wsMember.on('close', resolve));

    await new Promise((resolve, reject) => {
      wsMember.on('open', resolve);
      wsMember.on('error', reject);
    });
    wsMember.send(JSON.stringify({ type: 'join-squad', squadId: 'SQ-01' }));
    await historyPromise;

    wsMember.send(
      JSON.stringify({
        type: 'squad-message',
        squadId: 'SQ-01',
        senderId: 'NV-SPOOF-9999',
        senderName: 'Fake CEO',
        text: 'Tin nhắn kiểm thử lưu DB thật',
      })
    );
    const broadcast = await chatBroadcastPromise;
    assert.equal(broadcast.senderId, member.employeeId);
    assert.equal(broadcast.text, 'Tin nhắn kiểm thử lưu DB thật');
    wsMember.close();
    await memberClosePromise;

    const dbMsg = (
      await db.query('SELECT sender_id, content FROM squad_messages WHERE id = $1', [broadcast.id])
    ).rows[0];
    assert.ok(dbMsg);
    assert.equal(dbMsg.sender_id, member.employeeId);
    assert.equal(dbMsg.content, 'Tin nhắn kiểm thử lưu DB thật');
  } finally {
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
});
