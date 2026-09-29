const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { createAuthLimiter, authLimiter } = require('../../src/middleware/rateLimit');

test('createAuthLimiter answers 429 with a JSON body after the limit', async () => {
  const app = express();
  app.use(createAuthLimiter({ limit: 2, windowMs: 60000 }));
  app.post('/x', (req, res) => res.json({ ok: true }));

  assert.equal((await request(app).post('/x')).status, 200);
  assert.equal((await request(app).post('/x')).status, 200);
  const blocked = await request(app).post('/x');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'RATE_LIMITED');
  assert.equal(blocked.body.success, false);
});

test('authLimiter is a no-op in the test environment', async () => {
  const app = express();
  app.use(authLimiter);
  app.post('/x', (req, res) => res.json({ ok: true }));
  for (let i = 0; i < 40; i++) {
    assert.equal((await request(app).post('/x')).status, 200);
  }
});
