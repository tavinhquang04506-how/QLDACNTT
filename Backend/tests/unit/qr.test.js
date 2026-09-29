const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { signQrToken, verifyQrToken, consumeQrToken, QR_TTL_SECONDS } = require('../../src/modules/attendance/qr');

test('a signed token verifies and carries the employee id, a unique id and an expiry', () => {
  const token = signQrToken('NV-1');
  const claims = verifyQrToken(token);
  assert.equal(claims.employeeId, 'NV-1');
  assert.ok(claims.jti);
  assert.ok(claims.exp - Math.floor(Date.now() / 1000) <= QR_TTL_SECONDS);
  assert.notEqual(verifyQrToken(signQrToken('NV-1')).jti, claims.jti);
});

test('expired, tampered, garbage and non-string tokens are rejected as INVALID_QR_TOKEN', () => {
  const bad = [signQrToken('NV-1', { expiresIn: -5 }), `${signQrToken('NV-1')}x`, 'garbage', '', undefined, 42];
  for (const t of bad) {
    assert.throws(() => verifyQrToken(t), (e) => e.status === 401 && e.code === 'INVALID_QR_TOKEN', String(t));
  }
});

test('an access token signed with the JWT secret is not a valid QR token', () => {
  const access = jwt.sign({ userId: 'u', employeeId: 'NV-1', roleCode: 'CEO' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  assert.throws(() => verifyQrToken(access), (e) => e.code === 'INVALID_QR_TOKEN');
});

test('a QR token signed with the JWT secret but claiming to be a QR token is rejected', () => {
  const forged = jwt.sign({ typ: 'attendance-qr', sub: 'NV-1' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  assert.throws(() => verifyQrToken(forged), (e) => e.code === 'INVALID_QR_TOKEN');
});

test('consumeQrToken accepts a token id once and then refuses it', () => {
  const claims = verifyQrToken(signQrToken('NV-2'));
  consumeQrToken(claims);
  assert.throws(() => consumeQrToken(claims), (e) => e.status === 401 && e.code === 'QR_TOKEN_USED');
});
