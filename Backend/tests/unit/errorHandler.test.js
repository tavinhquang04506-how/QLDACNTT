const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { AppError, notFound } = require('../../src/utils/AppError');
const { errorHandler, notFoundHandler } = require('../../src/middleware/errorHandler');

function run(err) {
  const out = {};
  const res = {
    status(s) { out.status = s; return this; },
    json(b) { out.body = b; return this; },
  };
  errorHandler(err, {}, res, () => {});
  return out;
}

test('AppError maps to its status, code and message', () => {
  const out = run(new AppError(418, 'TEAPOT', 'Tôi là ấm trà', { a: 1 }));
  assert.equal(out.status, 418);
  assert.deepEqual(out.body, { success: false, code: 'TEAPOT', message: 'Tôi là ấm trà', details: { a: 1 } });
});

test('AppError without details omits the details key', () => {
  const out = run(notFound());
  assert.equal(out.status, 404);
  assert.equal('details' in out.body, false);
  assert.equal(out.body.code, 'NOT_FOUND');
});

test('ZodError maps to 400 VALIDATION_ERROR with field paths', () => {
  const result = z.object({ email: z.string().email() }).safeParse({ email: 'nope' });
  const out = run(result.error);
  assert.equal(out.status, 400);
  assert.equal(out.body.code, 'VALIDATION_ERROR');
  assert.equal(out.body.details[0].path, 'email');
});

test('malformed JSON body maps to 400 INVALID_JSON', () => {
  const out = run(Object.assign(new SyntaxError('bad'), { type: 'entity.parse.failed' }));
  assert.equal(out.status, 400);
  assert.equal(out.body.code, 'INVALID_JSON');
});

test('oversized body maps to 413', () => {
  const out = run(Object.assign(new Error('big'), { type: 'entity.too.large' }));
  assert.equal(out.status, 413);
  assert.equal(out.body.code, 'PAYLOAD_TOO_LARGE');
});

test('Postgres unique violation maps to 409', () => {
  const out = run(Object.assign(new Error('dup'), { code: '23505' }));
  assert.equal(out.status, 409);
  assert.equal(out.body.code, 'CONFLICT');
});

test('Postgres foreign key violation maps to 409', () => {
  const out = run(Object.assign(new Error('fk'), { code: '23503' }));
  assert.equal(out.status, 409);
  assert.equal(out.body.code, 'REFERENCE_ERROR');
});

test('Postgres check violation and invalid text representation map to 400', () => {
  assert.equal(run(Object.assign(new Error('chk'), { code: '23514' })).status, 400);
  assert.equal(run(Object.assign(new Error('uuid'), { code: '22P02' })).status, 400);
});

test('deadlock and serialization failures map to a retryable 409', () => {
  for (const code of ['40P01', '40001']) {
    const out = run(Object.assign(new Error('deadlock'), { code }));
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'RETRY');
  }
});

test('unknown errors map to 500 without leaking the message', () => {
  const spy = mock.method(console, 'error', () => {});
  const out = run(new Error('secret db password leaked'));
  spy.mock.restore();
  assert.equal(out.status, 500);
  assert.equal(out.body.code, 'INTERNAL_ERROR');
  assert.equal(out.body.message, 'Internal Server Error');
});

test('notFoundHandler keeps the legacy Vietnamese message', () => {
  const out = {};
  const res = { status(s) { out.status = s; return this; }, json(b) { out.body = b; return this; } };
  notFoundHandler({ method: 'GET', originalUrl: '/api/x' }, res);
  assert.equal(out.status, 404);
  assert.equal(out.body.success, false);
  assert.equal(out.body.message, 'Route GET /api/x không tồn tại');
});
