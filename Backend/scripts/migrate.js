const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.resolve(__dirname, '../migrations');

async function runMigrations({ pool, dir = DEFAULT_DIR, log = () => {} }) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(200) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
    : [];
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  const applied = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
      log(`applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      err.message = `Migration ${file} failed: ${err.message}`;
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}

if (require.main === module) {
  const db = require('../src/config/db');
  runMigrations({ pool: db.pool, log: console.log })
    .then((applied) => {
      console.log(applied.length ? `✅ ${applied.length} migration(s) applied` : '✅ Database is up to date');
      return db.pool.end();
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exit(1);
    });
}

module.exports = { runMigrations };
