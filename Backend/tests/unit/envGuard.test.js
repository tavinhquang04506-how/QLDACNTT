const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const backendDir = path.resolve(__dirname, '../..');

function loadEnv(extra) {
  return spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: backendDir,
    env: { PATH: process.env.PATH, JWT_SECRET: 'x', ...extra },
    encoding: 'utf8',
  });
}

test('NODE_ENV=test with a non-_test database name refuses to load', () => {
  const r = loadEnv({ NODE_ENV: 'test', DB_NAME_TEST: 'nexus_hrms' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /_test/);
});

test('NODE_ENV=test with a *_test database name loads', () => {
  const r = loadEnv({ NODE_ENV: 'test', DB_NAME_TEST: 'nexus_hrms_test' });
  assert.equal(r.status, 0, r.stderr);
});
