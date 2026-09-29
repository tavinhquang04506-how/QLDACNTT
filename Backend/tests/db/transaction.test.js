const { test, mock, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');

after(() => db.pool.end());

test('withTransaction hands a broken client back to the pool with the error, and rethrows the original', async () => {
  const released = [];
  const fake = {
    async query(sql) {
      if (sql === 'ROLLBACK') throw new Error('connection lost');
      return { rows: [] };
    },
    release(err) { released.push(err); },
  };
  const spy = mock.method(db.pool, 'connect', async () => fake);
  try {
    await assert.rejects(db.withTransaction(async () => { throw new Error('original failure'); }), /original failure/);
  } finally {
    spy.mock.restore();
  }
  assert.equal(released.length, 1);
  assert.ok(released[0] instanceof Error);
});

test('withTransaction releases a healthy client without an error after a normal rollback', async () => {
  const released = [];
  const fake = {
    async query() { return { rows: [] }; },
    release(err) { released.push(err); },
  };
  const spy = mock.method(db.pool, 'connect', async () => fake);
  try {
    await assert.rejects(db.withTransaction(async () => { throw new Error('boom'); }), /boom/);
  } finally {
    spy.mock.restore();
  }
  assert.deepEqual(released, [undefined]);
});
