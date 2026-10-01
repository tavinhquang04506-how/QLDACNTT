const { test } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { validate } = require('../../src/middleware/validate');

test('valid input is replaced by the parsed value (coercion applied)', () => {
  const mw = validate({ query: z.object({ page: z.coerce.number().int().min(1) }) });
  const req = { query: { page: '2' } };
  let err = 'unset';
  mw(req, {}, (e) => { err = e; });
  assert.equal(err, undefined);
  assert.deepEqual(req.query, { page: 2 });
});

test('invalid body forwards a ZodError to next', () => {
  const mw = validate({ body: z.object({ name: z.string().min(1) }) });
  let err;
  mw({ body: { name: '' } }, {}, (e) => { err = e; });
  assert.equal(err.name, 'ZodError');
});

test('missing body (undefined) is validated, not skipped', () => {
  const mw = validate({ body: z.object({ name: z.string() }) });
  let err;
  mw({ body: undefined }, {}, (e) => { err = e; });
  assert.equal(err.name, 'ZodError');
});
