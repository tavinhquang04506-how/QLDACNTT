const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');

after(async () => {
  await db.query("DELETE FROM payroll_periods WHERE period = '2099-01'");
  await db.pool.end();
});

test('seed rows with explicit ids do not collide with newly generated ones', async () => {
  const { rows } = await db.query("INSERT INTO payroll_periods (period) VALUES ('2099-01') RETURNING id");
  const max = (await db.query('SELECT MAX(id) AS m FROM payroll_periods')).rows[0].m;
  assert.equal(rows[0].id, max);
  assert.ok(Number(rows[0].id) > 2);
});

test('every serial sequence is ahead of the highest id in its table', async () => {
  const { rows: cols } = await db.query(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'id' AND column_default LIKE 'nextval(%'`);
  const behind = [];
  for (const { table_name: t } of cols) {
    const seq = (await db.query('SELECT pg_get_serial_sequence($1, $2) AS s', [t, 'id'])).rows[0].s;
    if (!seq) continue;
    const { rows } = await db.query(`SELECT COALESCE(MAX(id), 0) AS m, (SELECT last_value FROM ${seq}) AS last FROM ${t}`);
    if (Number(rows[0].last) < Number(rows[0].m)) behind.push(t);
  }
  assert.deepEqual(behind, []);
});
