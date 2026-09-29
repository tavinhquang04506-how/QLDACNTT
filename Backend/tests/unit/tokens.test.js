const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { hashToken, signAccessToken } = require('../../src/modules/auth/tokens');

test('hashToken is a deterministic 64-char hex sha256', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), hashToken('abd'));
  assert.match(hashToken('abc'), /^[0-9a-f]{64}$/);
});

test('signAccessToken carries the identity claims and an expiry', () => {
  const token = signAccessToken({ user_id: 'u1', employee_id: 'NV-1', role_code: 'CEO', email: 'a@b.c' });
  const claims = jwt.verify(token, process.env.JWT_SECRET);
  assert.equal(claims.userId, 'u1');
  assert.equal(claims.employeeId, 'NV-1');
  assert.equal(claims.roleCode, 'CEO');
  assert.equal(claims.email, 'a@b.c');
  assert.ok(claims.exp > claims.iat);
});
