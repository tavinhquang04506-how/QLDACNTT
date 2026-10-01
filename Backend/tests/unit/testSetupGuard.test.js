const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertTestDatabaseName } = require('../../scripts/test-setup');

test('accepts names ending in _test', () => {
  assert.doesNotThrow(() => assertTestDatabaseName('nexus_hrms_test'));
});

test('refuses the development database', () => {
  assert.throws(() => assertTestDatabaseName('nexus_hrms'), /_test/);
});

test('refuses names that could be SQL injection', () => {
  assert.throws(() => assertTestDatabaseName('x"; DROP DATABASE nexus_hrms; --_test'));
});

test('refuses empty or undefined names', () => {
  assert.throws(() => assertTestDatabaseName(''));
  assert.throws(() => assertTestDatabaseName(undefined));
});
