const { test } = require('node:test');
const assert = require('node:assert/strict');
const { redactAuditValues } = require('../../src/utils/redact');

const row = {
  id: 'NV-1', full_name: 'A', base_salary: 100, citizen_id: '079', bank_account: '1', bank_name: 'VCB',
  date_of_birth: '2000-01-01', address: 'x', face_encoding: 'deadbeef', password_hash: '$2a$', nested: { token_hash: 't', salary: 5, ok: 1 },
};

test('secrets are always redacted, for every role, at any depth', () => {
  for (const role of ['CEO', 'HR_DIRECTOR', 'ADMIN', 'EMPLOYEE']) {
    const out = redactAuditValues(row, role);
    assert.equal(out.face_encoding, '[REDACTED]');
    assert.equal(out.password_hash, '[REDACTED]');
    assert.equal(out.nested.token_hash, '[REDACTED]');
  }
});

test('CEO and HR_DIRECTOR keep personal and salary data', () => {
  for (const role of ['CEO', 'HR_DIRECTOR']) {
    const out = redactAuditValues(row, role);
    assert.equal(out.base_salary, 100);
    assert.equal(out.citizen_id, '079');
    assert.equal(out.nested.salary, 5);
  }
});

test('ADMIN loses every personal and salary field', () => {
  const out = redactAuditValues(row, 'ADMIN');
  for (const key of ['base_salary', 'citizen_id', 'bank_account', 'bank_name', 'date_of_birth', 'address']) {
    assert.equal(out[key], '[REDACTED]', key);
  }
  assert.equal(out.nested.salary, '[REDACTED]');
  assert.equal(out.full_name, 'A');
  assert.equal(out.nested.ok, 1);
});

test('does not mutate its input and tolerates null, primitives and arrays', () => {
  const copy = JSON.parse(JSON.stringify(row));
  redactAuditValues(row, 'ADMIN');
  assert.deepEqual(row, copy);
  assert.equal(redactAuditValues(null, 'ADMIN'), null);
  assert.equal(redactAuditValues(undefined, 'ADMIN'), undefined);
  assert.equal(redactAuditValues('text', 'ADMIN'), 'text');
  assert.deepEqual(redactAuditValues([{ base_salary: 1 }], 'ADMIN'), [{ base_salary: '[REDACTED]' }]);
});
