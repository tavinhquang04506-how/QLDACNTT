const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePagination, paginationMeta } = require('../../src/utils/pagination');

test('defaults to page 1, limit 50', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 50, offset: 0 });
});

test('computes offset from page and limit', () => {
  assert.deepEqual(parsePagination({ page: '3', limit: '20' }), { page: 3, limit: 20, offset: 40 });
});

test('clamps page below 1 to 1', () => {
  assert.equal(parsePagination({ page: '0' }).page, 1);
  assert.equal(parsePagination({ page: '-3' }).page, 1);
});

test('non-numeric values fall back to defaults', () => {
  assert.deepEqual(parsePagination({ page: 'abc', limit: 'xyz' }), { page: 1, limit: 50, offset: 0 });
});

test('limit is clamped to [1, maxLimit]', () => {
  assert.equal(parsePagination({ limit: '100000' }).limit, 200);
  assert.equal(parsePagination({ limit: '-5' }).limit, 1);
  assert.equal(parsePagination({ limit: '0' }).limit, 50);
  assert.equal(parsePagination({ limit: '500' }, { maxLimit: 1000 }).limit, 500);
});

test('paginationMeta computes totalPages', () => {
  assert.deepEqual(paginationMeta(101, 2, 50), { total: 101, page: 2, limit: 50, totalPages: 3 });
  assert.deepEqual(paginationMeta(0, 1, 50), { total: 0, page: 1, limit: 50, totalPages: 0 });
});
