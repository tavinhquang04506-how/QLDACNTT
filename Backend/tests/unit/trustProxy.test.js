const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTrustProxy } = require('../../src/utils/trustProxy');

test('unset, empty and "false" mean no proxy trusted', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(''), false);
  assert.equal(parseTrustProxy('false'), false);
});

test('a number is a hop count', () => {
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('2'), 2);
});

test('anything else is passed through as a subnet / preset list', () => {
  assert.equal(parseTrustProxy('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8');
});

test('"true" is refused because it lets clients spoof X-Forwarded-For', () => {
  assert.throws(() => parseTrustProxy('true'), /TRUST_PROXY/);
});
