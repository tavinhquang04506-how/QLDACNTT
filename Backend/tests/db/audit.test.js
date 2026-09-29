const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { writeAudit } = require('../../src/utils/audit');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE action LIKE 'TEST_%'");
  await db.pool.end();
});
beforeEach(() => db.query("DELETE FROM audit_logs WHERE action LIKE 'TEST_%'"));

async function firstUser() {
  const { rows } = await db.query('SELECT id, employee_id FROM users ORDER BY created_at LIMIT 1');
  return { userId: rows[0].id, employeeId: rows[0].employee_id };
}

test('writes a row with user, table, record and JSON values', async () => {
  const user = await firstUser();
  await writeAudit(db, {
    user, action: 'TEST_UPDATE', table: 'employees', recordId: 'NV-0001',
    oldValues: { job_title: 'A' }, newValues: { job_title: 'B' },
    req: { ip: '::ffff:127.0.0.1', headers: { 'user-agent': 'node-test' } },
  });
  const { rows } = await db.query("SELECT * FROM audit_logs WHERE action = 'TEST_UPDATE'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, user.userId);
  assert.equal(rows[0].employee_id, user.employeeId);
  assert.equal(rows[0].record_id, 'NV-0001');
  assert.deepEqual(rows[0].old_values, { job_title: 'A' });
  assert.deepEqual(rows[0].new_values, { job_title: 'B' });
  assert.equal(rows[0].user_agent, 'node-test');
});

test('redacts secrets at any depth', async () => {
  await writeAudit(db, {
    user: null, action: 'TEST_SECRET', table: 'users', recordId: 1,
    newValues: { email: 'a@b.c', password_hash: 'xyz', nested: { token_hash: 'abc', face_encoding: 'bin', ok: 1 } },
  });
  const { rows } = await db.query("SELECT new_values, user_id, record_id FROM audit_logs WHERE action = 'TEST_SECRET'");
  assert.deepEqual(rows[0].new_values, {
    email: 'a@b.c', password_hash: '[REDACTED]', nested: { token_hash: '[REDACTED]', face_encoding: '[REDACTED]', ok: 1 },
  });
  assert.equal(rows[0].user_id, null);
  assert.equal(rows[0].record_id, '1');
});

test('works inside a transaction and rolls back with it', async () => {
  await assert.rejects(
    db.withTransaction(async (client) => {
      await writeAudit(client, { user: null, action: 'TEST_ROLLBACK', table: 'employees', recordId: 'X' });
      throw new Error('boom');
    }),
    /boom/
  );
  const { rows } = await db.query("SELECT 1 FROM audit_logs WHERE action = 'TEST_ROLLBACK'");
  assert.equal(rows.length, 0);
});

test('truncates an over-long ip to fit varchar(45)', async () => {
  await writeAudit(db, {
    user: null, action: 'TEST_IP', table: 'employees', recordId: 'X',
    req: { ip: 'x'.repeat(100), headers: {} },
  });
  const { rows } = await db.query("SELECT ip_address FROM audit_logs WHERE action = 'TEST_IP'");
  assert.equal(rows[0].ip_address.length, 45);
});

test('keeps Date values as ISO strings and Buffers as a placeholder (not empty objects)', async () => {
  const when = new Date('2026-09-25T10:00:00.000Z');
  await writeAudit(db, {
    user: null, action: 'TEST_DATE', table: 'employees', recordId: 'X',
    oldValues: { updated_at: when, face: Buffer.from('abc') },
    newValues: { joined: when },
  });
  const { rows } = await db.query("SELECT old_values, new_values FROM audit_logs WHERE action = 'TEST_DATE'");
  assert.deepEqual(rows[0].old_values, { updated_at: '2026-09-25T10:00:00.000Z', face: '[BINARY]' });
  assert.deepEqual(rows[0].new_values, { joined: '2026-09-25T10:00:00.000Z' });
});
