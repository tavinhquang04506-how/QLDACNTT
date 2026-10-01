const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, claimsFor, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');
const { giveBalance, deleteTestLeaves } = require('../helpers/leaves');

const startedAt = new Date(Date.now() - 1000);
after(async () => {
  await db.query('DELETE FROM notifications WHERE created_at >= $1', [startedAt]);
  await db.query("DELETE FROM audit_logs WHERE action = 'CREATE_NOTIFICATION'");
  await db.query("UPDATE departments SET manager_id = NULL WHERE id LIKE 'DEPT-TSTN%'");
  await deleteTestLeaves();
  await deleteTestUsers();
  await deleteTestEmployees();
  await db.query("DELETE FROM departments WHERE id LIKE 'DEPT-TSTN%'");
  await closeDb();
});

const tag = () => `N${Date.now().toString(36)}${Math.random().toString(16).slice(2, 5)}`;
const send = (role, body) => call(role, 'post', '/api/notifications', { type: 'system', title: `Test ${tag()}`, ...body });
const idsOf = (res) => res.body.data.map((n) => n.id);

test('create: HR/CEO send a personal or a role-wide notification, with sender details', async () => {
  const s = await employeeSession();
  const personal = await send('HR_DIRECTOR', { userId: s.user.id, title: 'Chào mừng', summary: 'Xin chào', priority: 'high', type: 'ceo_directive', category: 'Chỉ đạo' });
  assert.equal(personal.status, 201);
  assert.equal(personal.body.data.user_id, s.user.id);
  assert.equal(personal.body.data.type, 'ceo_directive');
  assert.equal(personal.body.data.priority, 'high');
  assert.ok(personal.body.data.sender_name);
  assert.equal(personal.body.data.sender_role, 'HR_DIRECTOR');

  const broadcast = await send('CEO', { roleTarget: 'EMPLOYEE' });
  assert.equal(broadcast.status, 201);
  assert.equal(broadcast.body.data.role_target, 'EMPLOYEE');
  assert.equal(broadcast.body.data.user_id, null);
});

test('create: validation, unknown user, and who may send', async () => {
  const s = await employeeSession();
  const bad = [
    {}, { userId: s.user.id, roleTarget: 'EMPLOYEE' }, { userId: s.user.id, type: 'gossip' }, { userId: s.user.id, title: '' },
    { userId: 'not-a-uuid' }, { roleTarget: 'WIZARD' }, { userId: s.user.id, priority: 'extreme' }, { userId: s.user.id, actionPayload: 'text' },
  ];
  for (const b of bad) assert.equal((await send('CEO', b)).status, 400, JSON.stringify(b));
  assert.equal((await send('CEO', { userId: '00000000-0000-0000-0000-000000000000' })).status, 404);
  assert.equal((await send('EMPLOYEE', { userId: s.user.id })).status, 403);
  assert.equal((await send('LINE_MANAGER', { userId: s.user.id })).status, 403);
});

test('list: personal plus role-wide notifications, never other people\'s', async () => {
  const a = await employeeSession();
  const b = await employeeSession();
  const mine = (await send('CEO', { userId: a.user.id, title: 'For A' })).body.data.id;
  const theirs = (await send('CEO', { userId: b.user.id, title: 'For B' })).body.data.id;
  const managers = (await send('CEO', { roleTarget: 'LINE_MANAGER', title: 'Managers only' })).body.data.id;
  const everyone = (await send('CEO', { roleTarget: 'EMPLOYEE', title: 'Employees' })).body.data.id;

  const res = await callWith(a.token, 'get', '/api/notifications?limit=200');
  assert.equal(res.status, 200);
  const ids = idsOf(res);
  assert.ok(ids.includes(mine) && ids.includes(everyone));
  assert.equal(ids.includes(theirs), false);
  assert.equal(ids.includes(managers), false);
  assert.ok(res.body.data.every((n) => typeof n.is_read === 'boolean'));
  assert.ok(res.body.unreadCount >= 2);
  assert.ok(res.body.pagination.total >= 2);
});

test('list: filters by unread and type, and clamps paging', async () => {
  const a = await employeeSession();
  const n1 = (await send('CEO', { userId: a.user.id, type: 'payroll' })).body.data.id;
  const n2 = (await send('CEO', { userId: a.user.id, type: 'system' })).body.data.id;
  await callWith(a.token, 'patch', `/api/notifications/${n1}/read`);

  const unread = await callWith(a.token, 'get', '/api/notifications?unread=true&limit=200');
  assert.ok(idsOf(unread).includes(n2) && !idsOf(unread).includes(n1));
  assert.ok(unread.body.data.every((n) => n.is_read === false));
  const payroll = await callWith(a.token, 'get', '/api/notifications?type=payroll&limit=200');
  assert.ok(payroll.body.data.every((n) => n.type === 'payroll'));
  assert.equal((await callWith(a.token, 'get', '/api/notifications?type=gossip')).status, 400);
  assert.equal((await callWith(a.token, 'get', '/api/notifications?unread=maybe')).status, 400);
  const clamp = await callWith(a.token, 'get', '/api/notifications?limit=100000&page=0');
  assert.equal(clamp.body.pagination.limit, 100);
  assert.equal(clamp.body.pagination.page, 1);
});

test('unread count follows reads', async () => {
  const a = await employeeSession();
  const before = (await callWith(a.token, 'get', '/api/notifications/unread-count')).body.count;
  const id = (await send('CEO', { userId: a.user.id })).body.data.id;
  assert.equal((await callWith(a.token, 'get', '/api/notifications/unread-count')).body.count, before + 1);
  await callWith(a.token, 'patch', `/api/notifications/${id}/read`);
  assert.equal((await callWith(a.token, 'get', '/api/notifications/unread-count')).body.count, before);
});

test('read state of a role-wide notification is per user', async () => {
  const a = await employeeSession();
  const b = await employeeSession();
  const id = (await send('CEO', { roleTarget: 'EMPLOYEE', title: 'Shared' })).body.data.id;
  assert.equal((await callWith(a.token, 'patch', `/api/notifications/${id}/read`)).status, 200);
  const asA = (await callWith(a.token, 'get', '/api/notifications?limit=200')).body.data.find((n) => n.id === id);
  const asB = (await callWith(b.token, 'get', '/api/notifications?limit=200')).body.data.find((n) => n.id === id);
  assert.equal(asA.is_read, true);
  assert.equal(asB.is_read, false);
  assert.equal((await callWith(a.token, 'patch', `/api/notifications/${id}/read`)).status, 200); // idempotent
});

test('mark read: only notifications addressed to you', async () => {
  const a = await employeeSession();
  const b = await employeeSession();
  const forB = (await send('CEO', { userId: b.user.id })).body.data.id;
  assert.equal((await callWith(a.token, 'patch', `/api/notifications/${forB}/read`)).status, 404);
  const managersOnly = (await send('CEO', { roleTarget: 'LINE_MANAGER' })).body.data.id;
  assert.equal((await callWith(a.token, 'patch', `/api/notifications/${managersOnly}/read`)).status, 404);
  assert.equal((await callWith(a.token, 'patch', '/api/notifications/NOTIF-NOPE/read')).status, 404);
  const still = (await callWith(b.token, 'get', '/api/notifications?limit=200')).body.data.find((n) => n.id === forB);
  assert.equal(still.is_read, false);
});

test('read-all marks everything visible to you and nothing else', async () => {
  const a = await employeeSession();
  const b = await employeeSession();
  await send('CEO', { userId: a.user.id });
  await send('CEO', { roleTarget: 'EMPLOYEE' });
  const forB = (await send('CEO', { userId: b.user.id })).body.data.id;
  const res = await callWith(a.token, 'post', '/api/notifications/read-all');
  assert.equal(res.status, 200);
  assert.ok(res.body.updated >= 2);
  assert.equal((await callWith(a.token, 'get', '/api/notifications/unread-count')).body.count, 0);
  assert.equal((await callWith(b.token, 'get', '/api/notifications?unread=true&limit=200')).body.data.some((n) => n.id === forB), true);
});

test('delete: your own personal notification only', async () => {
  const a = await employeeSession();
  const b = await employeeSession();
  const mine = (await send('CEO', { userId: a.user.id })).body.data.id;
  const theirs = (await send('CEO', { userId: b.user.id })).body.data.id;
  const shared = (await send('CEO', { roleTarget: 'EMPLOYEE' })).body.data.id;
  assert.equal((await callWith(a.token, 'delete', `/api/notifications/${theirs}`)).status, 404);
  assert.equal((await callWith(a.token, 'delete', `/api/notifications/${shared}`)).status, 403);
  assert.equal((await callWith(a.token, 'delete', `/api/notifications/${mine}`)).status, 200);
  assert.equal(idsOf(await callWith(a.token, 'get', '/api/notifications?limit=200')).includes(mine), false);
  assert.equal((await callWith(a.token, 'delete', `/api/notifications/${mine}`)).status, 404);
});

test('legacy GET /api/dashboard/notifications keeps its shape', async () => {
  const a = await employeeSession();
  await send('CEO', { userId: a.user.id });
  const res = await callWith(a.token, 'get', '/api/dashboard/notifications');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.unreadCount >= 1);
});

test('a leave request notifies the department manager, then HR, then tells the employee the outcome', async () => {
  const code = tag().toUpperCase().slice(0, 8);
  const deptId = `DEPT-TSTN${code}`.slice(0, 20);
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  await db.query('INSERT INTO departments (id, name, manager_id) VALUES ($1, $2, $3)', [deptId, `Notify ${code}`, mgr.employeeId]);
  await db.query('UPDATE employees SET department_id = $1 WHERE id = $2', [deptId, mgr.employeeId]); // the manager belongs to the department they run
  const emp = await employeeSession({ departmentId: deptId });
  await giveBalance(emp.employeeId, 2027, 12);

  const submit = await callWith(emp.token, 'post', '/api/leaves', { leaveTypeId: 'LT-AL', startDate: '2027-03-01', endDate: '2027-03-02', reason: 'Việc gia đình' });
  assert.equal(submit.status, 201);
  const leaveId = submit.body.data.id;

  const managerInbox = (await callWith(mgr.token, 'get', '/api/notifications?limit=200')).body.data;
  const toManager = managerInbox.find((n) => n.action_payload?.id === leaveId);
  assert.ok(toManager, 'manager should be notified');
  assert.equal(toManager.type, 'approval');
  assert.match(toManager.title, new RegExp(leaveId));
  assert.equal(toManager.is_read, false);

  const hrBefore = (await call('HR_DIRECTOR', 'get', '/api/notifications?limit=200')).body.data.filter((n) => n.action_payload?.id === leaveId).length;
  assert.equal(hrBefore, 0);
  await callWith(mgr.token, 'patch', `/api/leaves/${leaveId}/approve`, { note: 'OK' });
  const hrInbox = (await call('HR_DIRECTOR', 'get', '/api/notifications?limit=200')).body.data;
  assert.equal(hrInbox.filter((n) => n.action_payload?.id === leaveId).length, 1);

  await call('HR_DIRECTOR', 'patch', `/api/leaves/${leaveId}/approve`, {});
  const empInbox = (await callWith(emp.token, 'get', '/api/notifications?limit=200')).body.data;
  const outcome = empInbox.filter((n) => n.action_payload?.id === leaveId);
  assert.ok(outcome.some((n) => /phê duyệt|phê chuẩn/i.test(n.title)));
});

test('a rejection notifies the employee; manager and CEO requests go straight to the CEO', async () => {
  const emp = await employeeSession({ departmentId: 'DEPT-IT' });
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  await giveBalance(emp.employeeId, 2027, 12);
  await giveBalance(mgr.employeeId, 2027, 12);

  const id = (await callWith(emp.token, 'post', '/api/leaves', { leaveTypeId: 'LT-AL', startDate: '2027-04-05', endDate: '2027-04-06', reason: 'r' })).body.data.id;
  await callWith(mgr.token, 'patch', `/api/leaves/${id}/reject`, { note: 'Trùng deadline' });
  const inbox = (await callWith(emp.token, 'get', '/api/notifications?limit=200')).body.data.filter((n) => n.action_payload?.id === id);
  assert.ok(inbox.some((n) => /từ chối/i.test(n.title)));
  assert.ok(inbox.some((n) => /Trùng deadline/.test(n.summary ?? '')));

  const mid = (await callWith(mgr.token, 'post', '/api/leaves', { leaveTypeId: 'LT-AL', startDate: '2027-05-03', endDate: '2027-05-04', reason: 'r' })).body.data.id;
  const ceoInbox = (await call('CEO', 'get', '/api/notifications?limit=200')).body.data.filter((n) => n.action_payload?.id === mid);
  assert.equal(ceoInbox.length, 1);
  const hrInbox = (await call('HR_DIRECTOR', 'get', '/api/notifications?limit=200')).body.data.filter((n) => n.action_payload?.id === mid);
  assert.equal(hrInbox.length, 0);
});

test('overtime requests and medical claims notify the approver too', async () => {
  const code = tag().toUpperCase().slice(0, 8);
  const deptId = `DEPT-TSTN${code}`.slice(0, 20);
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  await db.query('INSERT INTO departments (id, name, manager_id) VALUES ($1, $2, $3)', [deptId, `Notify ${code}`, mgr.employeeId]);
  await db.query('UPDATE employees SET department_id = $1 WHERE id = $2', [deptId, mgr.employeeId]); // the manager belongs to the department they run
  const emp = await employeeSession({ departmentId: deptId });

  const ot = await callWith(emp.token, 'post', '/api/ot-requests', { workDate: '2027-07-20', startTime: '18:00', endTime: '20:00', reason: 'Release' });
  const claim = await callWith(emp.token, 'post', '/api/medical-claims', { claimDate: (await db.query('SELECT CURRENT_DATE::text AS d')).rows[0].d, amount: 500000, description: 'Khám' });
  const inbox = (await callWith(mgr.token, 'get', '/api/notifications?limit=200')).body.data;
  const otN = inbox.find((n) => n.action_payload?.id === ot.body.data.id);
  const claimN = inbox.find((n) => n.action_payload?.id === claim.body.data.id);
  assert.equal(otN.type, 'ot_request');
  assert.equal(claimN.type, 'c65_claim');

  await callWith(mgr.token, 'patch', `/api/ot-requests/${ot.body.data.id}/reject`, { note: 'Không cần' });
  const empInbox = (await callWith(emp.token, 'get', '/api/notifications?limit=200')).body.data;
  assert.ok(empInbox.some((n) => n.action_payload?.id === ot.body.data.id && /từ chối/i.test(n.title)));
});

test('creating a notification is audited', async () => {
  const s = await employeeSession();
  const id = (await send('HR_DIRECTOR', { userId: s.user.id })).body.data.id;
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'notifications' AND record_id = $1", [id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_NOTIFICATION']);
});
