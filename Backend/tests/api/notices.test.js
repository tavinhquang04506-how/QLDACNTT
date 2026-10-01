const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');

const marker = `TSTN-${Date.now().toString(36)}`;
after(async () => {
  await db.query('DELETE FROM company_notices WHERE title LIKE $1', [`${marker}%`]);
  await db.query("DELETE FROM audit_logs WHERE table_name = 'company_notices'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

let n = 0;
const make = (role, extra = {}) => call(role, 'post', '/api/notices', { title: `${marker} #${++n}`, content: 'Nội dung thông báo', ...extra });
const seen = async (session, query = '') => (await callWith(session.token, 'get', `/api/notices?limit=100${query}`)).body.data.filter((x) => x.title.startsWith(marker));

test('create: HR and CEO publish; the author is recorded; defaults apply', async () => {
  const res = await make('HR_DIRECTOR');
  assert.equal(res.status, 201);
  assert.match(res.body.data.id, /^NT-\d+$/);
  assert.equal(res.body.data.category, 'general');
  assert.equal(res.body.data.priority, 'normal');
  assert.equal(res.body.data.is_pinned, false);
  assert.equal(res.body.data.is_active, true);
  assert.ok(res.body.data.author_id);
  assert.ok(res.body.data.author_name);
  assert.equal((await make('CEO', { category: 'urgent', priority: 'high', isPinned: true })).status, 201);
  assert.equal((await make('EMPLOYEE')).status, 403);
  assert.equal((await make('LINE_MANAGER')).status, 403);
});

test('create: validation', async () => {
  const bad = [
    { title: '' }, { title: undefined }, { content: '' }, { category: 'gossip' }, { priority: 'extreme' }, { targetRole: 'WIZARD' },
    { publishedAt: 'tomorrow' }, { expiresAt: '2000-01-01T00:00:00Z' }, { isPinned: 'yes' },
  ];
  for (const extra of bad) assert.equal((await make('CEO', extra)).status, 400, JSON.stringify(extra));
  assert.equal((await make('CEO', { targetDepartmentId: 'DEPT-NOPE' })).status, 404);
});

test('audience: everyone, a role, a department, or a role in a department', async () => {
  const it = await employeeSession({ departmentId: 'DEPT-IT' });
  const mktMgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const all = (await make('CEO', { title: `${marker} all` })).body.data.id;
  const managers = (await make('CEO', { title: `${marker} managers`, targetRole: 'LINE_MANAGER' })).body.data.id;
  const mkt = (await make('CEO', { title: `${marker} mkt`, targetDepartmentId: 'DEPT-MKT' })).body.data.id;
  const mktManagers = (await make('CEO', { title: `${marker} mkt managers`, targetRole: 'LINE_MANAGER', targetDepartmentId: 'DEPT-MKT' })).body.data.id;

  const idsIt = (await seen(it)).map((x) => x.id);
  assert.ok(idsIt.includes(all));
  for (const hidden of [managers, mkt, mktManagers]) assert.equal(idsIt.includes(hidden), false);
  const idsMgr = (await seen(mktMgr)).map((x) => x.id);
  for (const shown of [all, managers, mkt, mktManagers]) assert.ok(idsMgr.includes(shown));

  assert.equal((await callWith(it.token, 'get', `/api/notices/${mkt}`)).status, 404); // not addressed to them: not even acknowledged
  assert.equal((await callWith(mktMgr.token, 'get', `/api/notices/${mkt}`)).status, 200);
});

test('visibility window: scheduled, expired and deactivated notices are hidden from staff, visible to HR with all=true', async () => {
  const s = await employeeSession();
  const future = (await make('CEO', { title: `${marker} future`, publishedAt: new Date(Date.now() + 86400000).toISOString() })).body.data.id;
  const expiring = (await make('CEO', { title: `${marker} expiring`, expiresAt: new Date(Date.now() + 3600000).toISOString() })).body.data.id;
  const off = (await make('CEO', { title: `${marker} off` })).body.data.id;
  await call('CEO', 'put', `/api/notices/${off}`, { isActive: false });
  await db.query("UPDATE company_notices SET expires_at = NOW() - INTERVAL '1 minute', published_at = NOW() - INTERVAL '2 hours' WHERE id = $1", [expiring]);

  const staff = (await seen(s)).map((x) => x.id);
  for (const id of [future, expiring, off]) assert.equal(staff.includes(id), false, id);
  const hr = (await call('HR_DIRECTOR', 'get', '/api/notices?all=true&limit=100')).body.data.map((x) => x.id);
  for (const id of [future, expiring, off]) assert.ok(hr.includes(id), id);
  assert.equal((await callWith(s.token, 'get', '/api/notices?all=true')).status, 403);
});

test('ordering: pinned first, then the newest; filters and paging', async () => {
  const s = await employeeSession();
  const older = (await make('CEO', { title: `${marker} old`, category: 'policy' })).body.data.id;
  await db.query("UPDATE company_notices SET published_at = NOW() - INTERVAL '3 days' WHERE id = $1", [older]);
  const newer = (await make('CEO', { title: `${marker} new`, category: 'event' })).body.data.id;
  const pinned = (await make('CEO', { title: `${marker} pinned`, isPinned: true })).body.data.id;
  await db.query("UPDATE company_notices SET published_at = NOW() - INTERVAL '5 days' WHERE id = $1", [pinned]);

  const ids = (await seen(s)).map((x) => x.id);
  assert.ok(ids.indexOf(pinned) < ids.indexOf(newer));
  assert.ok(ids.indexOf(newer) < ids.indexOf(older));
  const policy = await seen(s, '&category=policy');
  assert.ok(policy.length >= 1 && policy.every((x) => x.category === 'policy'));
  assert.equal((await callWith(s.token, 'get', '/api/notices?category=gossip')).status, 400);
  const clamp = await callWith(s.token, 'get', '/api/notices?limit=100000&page=0');
  assert.equal(clamp.body.pagination.limit, 100);
  assert.equal(clamp.body.pagination.page, 1);
});

test('detail: content for those addressed, 404 for unknown', async () => {
  const s = await employeeSession();
  const id = (await make('CEO', { content: 'Chi tiết đầy đủ' })).body.data.id;
  const res = await callWith(s.token, 'get', `/api/notices/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.content, 'Chi tiết đầy đủ');
  assert.equal((await call('CEO', 'get', '/api/notices/NT-NOPE')).status, 404);
});

test('update and delete: HR and CEO only, with validation', async () => {
  const s = await employeeSession();
  const id = (await make('HR_DIRECTOR')).body.data.id;
  const res = await call('CEO', 'put', `/api/notices/${id}`, { title: `${marker} renamed`, isPinned: true, priority: 'high', targetRole: 'EMPLOYEE' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.is_pinned, true);
  assert.equal(res.body.data.target_role, 'EMPLOYEE');
  const cleared = await call('CEO', 'put', `/api/notices/${id}`, { targetRole: null });
  assert.equal(cleared.body.data.target_role, null);
  assert.equal((await call('CEO', 'put', `/api/notices/${id}`, {})).status, 400);
  assert.equal((await call('CEO', 'put', `/api/notices/${id}`, { expiresAt: '2000-01-01T00:00:00Z' })).status, 400);
  assert.equal((await call('CEO', 'put', '/api/notices/NT-NOPE', { title: 'x' })).status, 404);
  assert.equal((await callWith(s.token, 'put', `/api/notices/${id}`, { title: 'x' })).status, 403);
  assert.equal((await callWith(s.token, 'delete', `/api/notices/${id}`)).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'delete', `/api/notices/${id}`)).status, 200);
  assert.equal((await call('HR_DIRECTOR', 'delete', `/api/notices/${id}`)).status, 404);
});

test('notice writes are audited', async () => {
  const id = (await make('CEO')).body.data.id;
  await call('CEO', 'put', `/api/notices/${id}`, { isPinned: true });
  await call('CEO', 'delete', `/api/notices/${id}`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'company_notices' AND record_id = $1 ORDER BY id", [id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_NOTICE', 'UPDATE_NOTICE', 'DELETE_NOTICE']);
});
