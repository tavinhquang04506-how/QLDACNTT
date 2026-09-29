import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  levelOf,
  cellOf,
  average,
  currentPeriod,
  previousPeriod,
  periodLabel,
  buildPeriodOptions,
  CELL_META,
  GRID_ORDER,
  TOP_TALENT_CELLS,
  NEEDS_IMPROVEMENT_CELLS,
  CORE_CELLS,
  PIP_CELLS,
} from '../src/utils/nineBox.js';

describe('9-Box Logic & Calculation Unit Tests', () => {
  it('correctly calculates score levels with strict boundary conditions', () => {
    // Level 1: < 60
    assert.equal(levelOf(0), 1);
    assert.equal(levelOf(59), 1);
    assert.equal(levelOf(59.9), 1);

    // Level 2: 60 to 79.99
    assert.equal(levelOf(60), 2);
    assert.equal(levelOf(70), 2);
    assert.equal(levelOf(79.9), 2);

    // Level 3: >= 80
    assert.equal(levelOf(80), 3);
    assert.equal(levelOf(95), 3);
    assert.equal(levelOf(100), 3);
  });

  it('correctly maps all 9 cells in the 9-box matrix', () => {
    // Formula: (level(potential) - 1) * 3 + level(performance)
    // Row 1 (Pot 1): cells 1, 2, 3
    assert.equal(cellOf(50, 50), 1); // Perf Low, Pot Low -> Cell 1
    assert.equal(cellOf(70, 50), 2); // Perf Med, Pot Low -> Cell 2
    assert.equal(cellOf(90, 50), 3); // Perf High, Pot Low -> Cell 3

    // Row 2 (Pot 2): cells 4, 5, 6
    assert.equal(cellOf(50, 70), 4); // Perf Low, Pot Med -> Cell 4
    assert.equal(cellOf(70, 70), 5); // Perf Med, Pot Med -> Cell 5
    assert.equal(cellOf(90, 70), 6); // Perf High, Pot Med -> Cell 6

    // Row 3 (Pot 3): cells 7, 8, 9
    assert.equal(cellOf(50, 90), 7); // Perf Low, Pot High -> Cell 7
    assert.equal(cellOf(70, 90), 8); // Perf Med, Pot High -> Cell 8
    assert.equal(cellOf(90, 90), 9); // Perf High, Pot High -> Cell 9
  });

  it('verifies tier groupings and grid order structure', () => {
    assert.deepEqual(GRID_ORDER, [7, 8, 9, 4, 5, 6, 1, 2, 3]);
    assert.deepEqual(TOP_TALENT_CELLS, [6, 8, 9]);
    assert.deepEqual(NEEDS_IMPROVEMENT_CELLS, [1, 2, 4]);
    assert.deepEqual(CORE_CELLS, [3, 5, 7]);
    assert.deepEqual(PIP_CELLS, [1, 2, 4]);

    // All 9 cells must be represented in CELL_META
    for (let c = 1; c <= 9; c++) {
      assert.ok(CELL_META[c], `CELL_META[${c}] must exist`);
      assert.equal(CELL_META[c].cell, c);
      assert.ok(CELL_META[c].title);
      assert.ok(CELL_META[c].tag);
      assert.ok(Array.isArray(CELL_META[c].actions) && CELL_META[c].actions.length > 0);
    }
  });

  it('computes arithmetic average safely with edge cases', () => {
    assert.equal(average([]), null);
    assert.equal(average(['invalid', null, undefined]), null);
    assert.equal(average([80, 90, 100]), 90.0);
    assert.equal(average([85, 92]), 88.5);
    // 83.3333... rounded to 1 decimal place = 83.3
    assert.equal(average([80, 85, 85]), 83.3);
  });

  it('handles period formatting and rollover calculations accurately', () => {
    // Current period format matching backend regex ^\d{4}-(Q[1-4]|H[12]|FY)$
    const cur = currentPeriod(new Date(2026, 9, 3)); // Oct 2026 -> Q4
    assert.equal(cur, '2026-Q4');

    // Previous period rollover
    assert.equal(previousPeriod('2026-Q4'), '2026-Q3');
    assert.equal(previousPeriod('2026-Q3'), '2026-Q2');
    assert.equal(previousPeriod('2026-Q2'), '2026-Q1');
    assert.equal(previousPeriod('2026-Q1'), '2025-Q4'); // Rollover to previous year
    assert.equal(previousPeriod('2026-H2'), '2026-H1');
    assert.equal(previousPeriod('2026-H1'), '2025-H2');
    assert.equal(previousPeriod('2026-FY'), '2025-FY');

    // Period label
    assert.equal(periodLabel('2026-Q4'), 'Quý 4/2026');
    assert.equal(periodLabel('2026-H1'), '6 tháng đầu 2026');
    assert.equal(periodLabel('2026-H2'), '6 tháng cuối 2026');
    assert.equal(periodLabel('2026-FY'), 'Cả năm 2026');

    // Period options
    const opts = buildPeriodOptions(new Date(2026, 0, 1));
    assert.ok(opts.includes('2026-Q4'));
    assert.ok(opts.includes('2025-Q1'));
    opts.forEach((p) => {
      assert.match(p, /^\d{4}-(Q[1-4]|H[12]|FY)$/);
    });
  });
});
