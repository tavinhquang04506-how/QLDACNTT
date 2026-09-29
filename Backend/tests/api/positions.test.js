const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, closeDb } = require('../helpers/api');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE table_name = 'positions' AND record_id LIKE 'POS-TST%'");
  await deleteTestEmployees();
  await db.query("DELETE FROM positions WHERE id LIKE 'POS-TST%'");
  await closeDb();
});

let n = 0;
const body = (extra = {}) => {
  const code = `TST${Date.now().toString(36)}${++n}`.toUpperCase().slice(-10);
  return { code, name: `Test Position ${code}`, level: 4, description: 'temp', ...extra };
};

test('GET /api/positions lists active positions for any authenticated user', async () => {
  const res = await call('EMPLOYEE', 'get', '/api/positions');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 8);
  assert.equal((await call(null, 'get', '/api/positions')).status, 401);
});

test('create: CEO/HRD succeed (201), EMPLOYEE/LINE_MANAGER 403', async () => {
  const a = body();
  const res = await call('HR_DIRECTOR', 'post', '/api/positions', a);
  assert.equal(res.status, 201);
  assert.equal(res.body.data.id, `POS-${a.code}`);
  assert.equal(res.body.data.level, 4);
  assert.equal((await call('EMPLOYEE', 'post', '/api/positions', body())).status, 403);
  assert.equal((await call('LINE_MANAGER', 'post', '/api/positions', body())).status, 403);
});

test('create: duplicate code 409, validation 400 (code, level range)', async () => {
  const a = body();
  assert.equal((await call('CEO', 'post', '/api/positions', a)).status, 201);
  assert.equal((await call('CEO', 'post', '/api/positions', { ...a, name: 'Other' })).status, 409);
  assert.equal((await call('CEO', 'post', '/api/positions', body({ code: 'no spaces' }))).status, 400);
  assert.equal((await call('CEO', 'post', '/api/positions', body({ level: 11 }))).status, 400);
  assert.equal((await call('CEO', 'post', '/api/positions', body({ level: -1 }))).status, 400);
  assert.equal((await call('CEO', 'post', '/api/positions', body({ level: 2.5 }))).status, 400);
});

test('get one, update, 404s', async () => {
  const created = (await call('CEO', 'post', '/api/positions', body())).body.data;
  assert.equal((await call('EMPLOYEE', 'get', `/api/positions/${created.id}`)).body.data.name, created.name);
  const upd = await call('HR_DIRECTOR', 'put', `/api/positions/${created.id}`, { name: 'Renamed', level: 6 });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.data.name, 'Renamed');
  assert.equal(upd.body.data.level, 6);
  assert.equal((await call('CEO', 'get', '/api/positions/POS-NOPE')).status, 404);
  assert.equal((await call('CEO', 'put', '/api/positions/POS-NOPE', { name: 'x' })).status, 404);
  assert.equal((await call('CEO', 'put', `/api/positions/${created.id}`, {})).status, 400);
});

test('delete: refused while active employees hold the position, then deactivated', async () => {
  const pos = (await call('CEO', 'post', '/api/positions', body())).body.data;
  const emp = await createTestEmployee({ positionId: pos.id });
  const refused = await call('CEO', 'delete', `/api/positions/${pos.id}`);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'POSITION_IN_USE');
  await db.query("UPDATE employees SET status = 'DA_NGHI_VIEC' WHERE id = $1", [emp.id]);
  assert.equal((await call('CEO', 'delete', `/api/positions/${pos.id}`)).status, 200);
});

test('inactive positions are hidden unless includeInactive is requested', async () => {
  const pos = (await call('CEO', 'post', '/api/positions', body())).body.data;
  await call('CEO', 'delete', `/api/positions/${pos.id}`);
  const hidden = await call('EMPLOYEE', 'get', '/api/positions');
  assert.equal(hidden.body.data.some((p) => p.id === pos.id), false);
  const shown = await call('HR_DIRECTOR', 'get', '/api/positions?includeInactive=true');
  assert.equal(shown.body.data.some((p) => p.id === pos.id), true);
  assert.equal((await call('EMPLOYEE', 'delete', `/api/positions/${pos.id}`)).status, 403);
});

test('writes are audited', async () => {
  const pos = (await call('CEO', 'post', '/api/positions', body())).body.data;
  await call('CEO', 'put', `/api/positions/${pos.id}`, { level: 5 });
  await call('CEO', 'delete', `/api/positions/${pos.id}`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'positions' AND record_id = $1 ORDER BY id", [pos.id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_POSITION', 'UPDATE_POSITION', 'DEACTIVATE_POSITION']);
});
