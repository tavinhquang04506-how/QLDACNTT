const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeTurnoverRisk } = require('../../src/modules/analytics/risk');

const calm = { salary: 30_000_000, peerAvgSalary: 30_000_000, otRecent: 0, otPrev: 0, monthsSinceChange: 6, latestPerformance: 85, previousPerformance: 85, unpaidAbsences60: 0, lateCount30: 0 };
const codes = (r) => r.signals.map((s) => s.code).sort();

test('a settled employee scores zero with no signals', () => {
  const r = computeTurnoverRisk(calm);
  assert.equal(r.score, 0);
  assert.equal(r.level, 'Thấp');
  assert.deepEqual(r.signals, []);
});

test('pay below the peer average adds 1.2 points per percent, capped at 30', () => {
  assert.equal(computeTurnoverRisk({ ...calm, salary: 27_000_000 }).score, 12); // 10% gap
  assert.equal(computeTurnoverRisk({ ...calm, salary: 22_500_000 }).score, 30); // 25% gap
  assert.equal(computeTurnoverRisk({ ...calm, salary: 10_000_000 }).score, 30); // capped
  assert.equal(computeTurnoverRisk({ ...calm, salary: 36_000_000 }).score, 0); // paid above peers
  assert.equal(computeTurnoverRisk({ ...calm, peerAvgSalary: null, salary: 1 }).score, 0); // too few peers to compare
});

test('overtime load counts from 10 hours and is capped at 15; a steep rise adds 5', () => {
  assert.equal(computeTurnoverRisk({ ...calm, otRecent: 9 }).score, 0);
  assert.equal(computeTurnoverRisk({ ...calm, otRecent: 12, otPrev: 12 }).score, 6);
  const surge = computeTurnoverRisk({ ...calm, otRecent: 40, otPrev: 0 });
  assert.equal(surge.score, 20);
  assert.deepEqual(codes(surge), ['OT_LOAD', 'OT_TREND']);
});

test('stagnation: 18 months is a mild signal, 24 months stronger, high performers get 5 more', () => {
  assert.equal(computeTurnoverRisk({ ...calm, monthsSinceChange: 17 }).score, 0);
  assert.equal(computeTurnoverRisk({ ...calm, monthsSinceChange: 18, latestPerformance: 70, previousPerformance: 70 }).score, 5);
  assert.equal(computeTurnoverRisk({ ...calm, monthsSinceChange: 24, latestPerformance: 70, previousPerformance: 70 }).score, 10);
  assert.equal(computeTurnoverRisk({ ...calm, monthsSinceChange: 24 }).score, 15);
});

test('performance signals: low score, and a drop of 10 points or more', () => {
  const low = computeTurnoverRisk({ ...calm, latestPerformance: 55, previousPerformance: 58 });
  assert.equal(low.score, 10);
  assert.deepEqual(codes(low), ['LOW_PERFORMANCE']);
  const drop = computeTurnoverRisk({ ...calm, latestPerformance: 72, previousPerformance: 85 });
  assert.deepEqual(codes(drop), ['PERFORMANCE_DROP']);
  assert.equal(computeTurnoverRisk({ ...calm, latestPerformance: null, previousPerformance: null }).score, 0);
});

test('attendance signals: three unpaid absences in 60 days, six late arrivals in 30 days', () => {
  assert.equal(computeTurnoverRisk({ ...calm, unpaidAbsences60: 2 }).score, 0);
  assert.equal(computeTurnoverRisk({ ...calm, unpaidAbsences60: 3 }).score, 10);
  assert.equal(computeTurnoverRisk({ ...calm, lateCount30: 5 }).score, 0);
  assert.equal(computeTurnoverRisk({ ...calm, lateCount30: 6 }).score, 5);
});

test('levels: below 30 low, 30-59 medium, 60 and above high; the score is bounded by 100', () => {
  assert.equal(computeTurnoverRisk({ ...calm, salary: 27_000_000, unpaidAbsences60: 3 }).level, 'Thấp'); // 22
  assert.equal(computeTurnoverRisk({ ...calm, salary: 24_000_000, unpaidAbsences60: 3 }).level, 'Trung bình'); // 34
  const mid = computeTurnoverRisk({ ...calm, salary: 22_500_000 });
  assert.equal(mid.level, 'Trung bình');
  const high = computeTurnoverRisk({ ...calm, salary: 22_500_000, otRecent: 40, otPrev: 0, monthsSinceChange: 30, latestPerformance: 55, previousPerformance: 55 });
  assert.equal(high.score, 70);
  assert.equal(high.level, 'Cao');
  const worst = computeTurnoverRisk({ salary: 1, peerAvgSalary: 40_000_000, otRecent: 100, otPrev: 0, monthsSinceChange: 60, latestPerformance: 40, previousPerformance: 90, unpaidAbsences60: 9, lateCount30: 20 });
  assert.equal(worst.score, 95); // 'stuck high performer' and 'low performance' cannot both apply
  assert.ok(worst.score <= 100);
});

test('every signal explains itself with points and a readable detail', () => {
  const r = computeTurnoverRisk({ ...calm, salary: 22_500_000, otRecent: 40, otPrev: 0 });
  for (const s of r.signals) {
    assert.ok(s.title && s.detail && Number.isInteger(s.points) && s.points > 0, s.code);
  }
  assert.equal(r.signals.reduce((sum, s) => sum + s.points, 0), r.score);
});

test('the function is deterministic and does not mutate its input', () => {
  const input = { ...calm, salary: 20_000_000 };
  const copy = { ...input };
  assert.deepEqual(computeTurnoverRisk(input), computeTurnoverRisk(input));
  assert.deepEqual(input, copy);
});
