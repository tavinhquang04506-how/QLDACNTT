const { test } = require('node:test');
const assert = require('node:assert/strict');
const { levelOf, cellOf, CELLS } = require('../../src/modules/analytics/nineBox');

test('scores map to low/medium/high at 60 and 80', () => {
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(59.99), 1);
  assert.equal(levelOf(60), 2);
  assert.equal(levelOf(79.99), 2);
  assert.equal(levelOf(80), 3);
  assert.equal(levelOf(100), 3);
});

test('cell = (potential level - 1) * 3 + performance level, from 1 (low/low) to 9 (high/high)', () => {
  assert.equal(cellOf(10, 10), 1);
  assert.equal(cellOf(70, 10), 2);
  assert.equal(cellOf(90, 10), 3);
  assert.equal(cellOf(10, 70), 4);
  assert.equal(cellOf(70, 70), 5);
  assert.equal(cellOf(90, 70), 6);
  assert.equal(cellOf(10, 90), 7);
  assert.equal(cellOf(70, 90), 8);
  assert.equal(cellOf(90, 90), 9);
});

test('all nine cells have a title and a recommended action, in order', () => {
  assert.deepEqual(CELLS.map((c) => c.cell), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const c of CELLS) {
    assert.ok(c.title && c.description && c.tag, `cell ${c.cell}`);
  }
  assert.equal(CELLS[8].title, 'Ngôi sao xuất sắc');
  assert.equal(CELLS[0].tag, 'Kế hoạch cải thiện PIP');
});
