const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');

const marker = `TSTH-${Date.now().toString(36)}`;
after(async () => {
  await db.query('DELETE FROM handbook_docs WHERE title LIKE $1', [`${marker}%`]);
  await db.query("DELETE FROM audit_logs WHERE table_name = 'handbook_docs'");
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

let n = 0;
const make = (role, extra = {}) => call(role, 'post', '/api/handbook', { title: `${marker} #${++n}`, category: 'Nội quy', content: 'Điều 1. Giờ làm việc từ 08:00.', ...extra });

test('create: HR and CEO write; version starts at 1; the editor is recorded', async () => {
  const res = await make('HR_DIRECTOR');
  assert.equal(res.status, 201);
  assert.match(res.body.data.id, /^HB-\d+$/);
  assert.equal(res.body.data.version, 1);
  assert.equal(res.body.data.is_active, true);
  assert.ok(res.body.data.updated_by);
  assert.equal((await make('CEO', { category: undefined })).body.data.category, 'Chung');
  assert.equal((await make('EMPLOYEE')).status, 403);
  assert.equal((await make('LINE_MANAGER')).status, 403);
});

test('create: validation', async () => {
  for (const extra of [{ title: '' }, { title: undefined }, { content: '' }, { content: undefined }, { category: 'x'.repeat(101) }]) {
    assert.equal((await make('CEO', extra)).status, 400, JSON.stringify(extra));
  }
});

test('read: list shows titles without the full text, detail shows the content', async () => {
  const s = await employeeSession();
  const id = (await make('CEO', { content: 'Nội dung rất dài '.repeat(50) })).body.data.id;
  const list = await callWith(s.token, 'get', `/api/handbook?search=${marker}&limit=100`);
  assert.equal(list.status, 200);
  const row = list.body.data.find((d) => d.id === id);
  assert.ok(row);
  assert.equal('content' in row, false);
  assert.ok(row.excerpt.length <= 200);
  const detail = await callWith(s.token, 'get', `/api/handbook/${id}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.body.data.content.length > 200);
  assert.equal((await call('CEO', 'get', '/api/handbook/HB-NOPE')).status, 404);
});

test('list: category and search filters, paging', async () => {
  const s = await employeeSession();
  await make('CEO', { title: `${marker} an toàn`, category: 'An toàn lao động' });
  await make('CEO', { title: `${marker} phúc lợi`, category: 'Phúc lợi' });
  const byCat = (await callWith(s.token, 'get', '/api/handbook?category=Phúc lợi&limit=100')).body.data;
  assert.ok(byCat.length >= 1 && byCat.every((d) => d.category === 'Phúc lợi'));
  const found = (await callWith(s.token, 'get', `/api/handbook?search=${encodeURIComponent(`${marker} an toàn`)}`)).body.data;
  assert.equal(found.length, 1);
  const cats = (await callWith(s.token, 'get', '/api/handbook/categories')).body.data;
  assert.ok(cats.includes('Phúc lợi'));
  const clamp = await callWith(s.token, 'get', '/api/handbook?limit=100000&page=0');
  assert.equal(clamp.body.pagination.limit, 100);
});

test('update: the version rises only when the content changes', async () => {
  const id = (await make('HR_DIRECTOR')).body.data.id;
  const title = await call('CEO', 'put', `/api/handbook/${id}`, { title: `${marker} retitled` });
  assert.equal(title.body.data.version, 1);
  const content = await call('CEO', 'put', `/api/handbook/${id}`, { content: 'Nội dung mới' });
  assert.equal(content.body.data.version, 2);
  const same = await call('CEO', 'put', `/api/handbook/${id}`, { content: 'Nội dung mới' });
  assert.equal(same.body.data.version, 2);
  assert.equal((await call('CEO', 'put', `/api/handbook/${id}`, {})).status, 400);
  assert.equal((await call('CEO', 'put', `/api/handbook/${id}`, { content: '' })).status, 400);
  assert.equal((await call('CEO', 'put', '/api/handbook/HB-NOPE', { title: 'x' })).status, 404);
  const s = await employeeSession();
  assert.equal((await callWith(s.token, 'put', `/api/handbook/${id}`, { title: 'x' })).status, 403);
});

test('delete deactivates: hidden from staff, still visible to HR with all=true, and can be restored', async () => {
  const s = await employeeSession();
  const id = (await make('CEO')).body.data.id;
  assert.equal((await callWith(s.token, 'delete', `/api/handbook/${id}`)).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'delete', `/api/handbook/${id}`)).status, 200);
  assert.equal((await callWith(s.token, 'get', `/api/handbook/${id}`)).status, 404);
  assert.equal((await callWith(s.token, 'get', `/api/handbook?search=${marker}&limit=100`)).body.data.some((d) => d.id === id), false);
  assert.ok((await call('HR_DIRECTOR', 'get', `/api/handbook?all=true&search=${marker}&limit=100`)).body.data.some((d) => d.id === id));
  assert.equal((await callWith(s.token, 'get', '/api/handbook?all=true')).status, 403);
  assert.equal((await call('CEO', 'put', `/api/handbook/${id}`, { isActive: true })).body.data.is_active, true);
  assert.equal((await callWith(s.token, 'get', `/api/handbook/${id}`)).status, 200);
  assert.equal((await call('CEO', 'delete', '/api/handbook/HB-NOPE')).status, 404);
});

test('handbook writes are audited', async () => {
  const id = (await make('CEO')).body.data.id;
  await call('CEO', 'put', `/api/handbook/${id}`, { content: 'v2' });
  await call('CEO', 'delete', `/api/handbook/${id}`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'handbook_docs' AND record_id = $1 ORDER BY id", [id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_HANDBOOK', 'UPDATE_HANDBOOK', 'DEACTIVATE_HANDBOOK']);
});
