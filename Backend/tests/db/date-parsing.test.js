const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');

after(() => db.pool.end());

test('DATE columns come back as YYYY-MM-DD strings, not timezone-shifted Dates', async () => {
  const { rows } = await db.query("SELECT DATE '2026-09-30' AS d, DATE '2026-01-01' AS e");
  assert.equal(rows[0].d, '2026-09-30');
  assert.equal(rows[0].e, '2026-01-01');
});

test('a DATE survives JSON serialization unchanged', async () => {
  const { rows } = await db.query("SELECT DATE '2026-09-30' AS d");
  assert.equal(JSON.parse(JSON.stringify(rows[0])).d, '2026-09-30');
});

test('timestamps are still Dates', async () => {
  const { rows } = await db.query('SELECT NOW() AS t');
  assert.ok(rows[0].t instanceof Date);
});
