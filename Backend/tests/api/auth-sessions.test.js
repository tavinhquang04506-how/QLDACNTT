const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { createTestUser, deleteTestUsers } = require('../helpers/users');

after(async () => {
  await deleteTestUsers();
  await db.pool.end();
});

const login = (u, password = u.password) => request(app).post('/api/auth/login').send({ email: u.email, password });
const refresh = (refreshToken) => request(app).post('/api/auth/refresh').send({ refreshToken });

test('login returns access + refresh tokens and keeps the legacy token field', async () => {
  const u = await createTestUser();
  const res = await login(u);
  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken);
  assert.equal(res.body.token, res.body.accessToken);
  assert.ok(res.body.refreshToken.length >= 40);
  assert.equal(typeof res.body.expiresIn, 'number');
  assert.equal(res.body.mustChangePassword, false);
});

test('login reports mustChangePassword for accounts flagged by an admin', async () => {
  const u = await createTestUser({ mustChange: true });
  const res = await login(u);
  assert.equal(res.body.mustChangePassword, true);
});

test('refresh rotates the pair and the old refresh token stops working', async () => {
  const u = await createTestUser();
  const first = (await login(u)).body;
  const res = await refresh(first.refreshToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken);
  assert.notEqual(res.body.refreshToken, first.refreshToken);
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
  assert.equal(me.status, 200);
});

test('replaying a rotated refresh token revokes the whole family', async () => {
  const u = await createTestUser();
  const first = (await login(u)).body;
  const second = (await refresh(first.refreshToken)).body;

  const replay = await refresh(first.refreshToken);
  assert.equal(replay.status, 401);
  assert.equal(replay.body.code, 'REFRESH_TOKEN_REUSED');

  const afterReplay = await refresh(second.refreshToken);
  assert.equal(afterReplay.status, 401);
});

test('refresh with a garbage token -> 401', async () => {
  const res = await refresh('not-a-real-token');
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'INVALID_REFRESH_TOKEN');
});

test('refresh without a body -> 400', async () => {
  const res = await request(app).post('/api/auth/refresh').send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'VALIDATION_ERROR');
});

test('a deactivated user cannot refresh', async () => {
  const u = await createTestUser();
  const first = (await login(u)).body;
  await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [u.id]);
  const res = await refresh(first.refreshToken);
  assert.equal(res.status, 401);
});

test('a locked user cannot refresh', async () => {
  const u = await createTestUser();
  const first = (await login(u)).body;
  await db.query("UPDATE users SET locked_until = NOW() + INTERVAL '10 minutes' WHERE id = $1", [u.id]);
  const res = await refresh(first.refreshToken);
  assert.equal(res.status, 401);
});

test('logout revokes the refresh token and is idempotent', async () => {
  const u = await createTestUser();
  const first = (await login(u)).body;
  const out1 = await request(app).post('/api/auth/logout').send({ refreshToken: first.refreshToken });
  assert.equal(out1.status, 200);
  assert.equal((await refresh(first.refreshToken)).status, 401);
  const out2 = await request(app).post('/api/auth/logout').send({ refreshToken: first.refreshToken });
  assert.equal(out2.status, 200);
});

test('change-password rejects weak passwords', async () => {
  const u = await createTestUser();
  const { accessToken } = (await login(u)).body;
  const send = (body) => request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${accessToken}`).send(body);
  assert.equal((await send({ currentPassword: u.password, newPassword: 'short1' })).status, 400);
  assert.equal((await send({ currentPassword: u.password, newPassword: 'onlyletters' })).status, 400);
  assert.equal((await send({ currentPassword: u.password, newPassword: '12345678' })).status, 400);
});

test('change-password with a wrong current password -> 401', async () => {
  const u = await createTestUser();
  const { accessToken } = (await login(u)).body;
  const res = await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${accessToken}`)
    .send({ currentPassword: 'wrong-password1', newPassword: 'NewPassw0rd' });
  assert.equal(res.status, 401);
});

test('change-password succeeds, clears the flag, revokes refresh tokens and the new password logs in', async () => {
  const u = await createTestUser({ mustChange: true });
  const first = (await login(u)).body;
  const res = await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${first.accessToken}`)
    .send({ currentPassword: u.password, newPassword: 'NewPassw0rd' });
  assert.equal(res.status, 200);

  assert.equal((await refresh(first.refreshToken)).status, 401);
  const again = await login(u, 'NewPassw0rd');
  assert.equal(again.status, 200);
  assert.equal(again.body.mustChangePassword, false);
});
