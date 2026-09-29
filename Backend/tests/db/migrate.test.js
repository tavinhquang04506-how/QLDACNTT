const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../../src/config/db');
const { runMigrations } = require('../../scripts/migrate');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
const write = (name, sql) => fs.writeFileSync(path.join(dir, name), sql);

after(async () => {
  await db.query('DROP TABLE IF EXISTS zz_mig_a, zz_mig_b, zz_mig_c');
  await db.query("DELETE FROM schema_migrations WHERE name LIKE '900%\_zz\_%'");
  await db.pool.end();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('applies pending files in order, then is idempotent', async () => {
  write('9001_zz_a.sql', 'CREATE TABLE zz_mig_a (id int);');
  write('9002_zz_b.sql', 'CREATE TABLE zz_mig_b (id int);');
  write('README.txt', 'ignored: not a migration');

  const first = await runMigrations({ pool: db.pool, dir });
  assert.deepEqual(first, ['9001_zz_a.sql', '9002_zz_b.sql']);

  const second = await runMigrations({ pool: db.pool, dir });
  assert.deepEqual(second, []);

  const { rows } = await db.query("SELECT name FROM schema_migrations WHERE name LIKE '900%\_zz\_%' ORDER BY name");
  assert.deepEqual(rows.map((r) => r.name), ['9001_zz_a.sql', '9002_zz_b.sql']);
});

test('a failing migration rolls back fully and is not recorded', async () => {
  write('9003_zz_bad.sql', 'CREATE TABLE zz_mig_c (id int); SELECT * FROM table_that_does_not_exist;');

  await assert.rejects(runMigrations({ pool: db.pool, dir }), /9003_zz_bad\.sql/);

  const table = await db.query("SELECT to_regclass('public.zz_mig_c') AS t");
  assert.equal(table.rows[0].t, null);
  const rec = await db.query("SELECT 1 FROM schema_migrations WHERE name = '9003_zz_bad.sql'");
  assert.equal(rec.rows.length, 0);
});

test('a missing directory means nothing to apply', async () => {
  const applied = await runMigrations({ pool: db.pool, dir: path.join(dir, 'does-not-exist') });
  assert.deepEqual(applied, []);
});
