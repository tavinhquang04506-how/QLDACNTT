const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateDistance, validateLocation } = require('../../src/modules/attendance/gpsValidator');
const { workingDays } = require('../../src/utils/dates');

test('F06: validateLocation enforces real Haversine geofencing across GREEN, YELLOW and RED zones', () => {
  // Exact office coordinates (10.77, 106.70)
  const exact = validateLocation(10.77, 106.7, 5);
  assert.equal(exact.valid, true);
  assert.equal(exact.zone, 'GREEN');
  assert.equal(exact.distance, 0);

  // ~180m away -> GREEN (within 250m)
  const green = validateLocation(10.7712, 106.701, 10);
  assert.equal(green.valid, true);
  assert.equal(green.zone, 'GREEN');
  assert.ok(green.distance > 0 && green.distance <= 250);

  // ~600m away -> YELLOW (between 250m and 1000m)
  const yellow = validateLocation(10.774, 106.704, 10);
  assert.equal(yellow.valid, true);
  assert.equal(yellow.zone, 'YELLOW');
  assert.ok(yellow.distance > 250 && yellow.distance <= 1000);

  // Hanoi (21.0285, 105.8542) -> RED (>1000km away)
  const red = validateLocation(21.0285, 105.8542, 10);
  assert.equal(red.valid, false);
  assert.equal(red.zone, 'RED');
  assert.ok(red.distance > 1_000_000);
});

test('F06: validateLocation treats 0 latitude/longitude as valid numeric coordinates, not falsy', () => {
  // User at (0, 0) when office is at (10.77, 106.70) -> rejected by distance, not falsy
  const farZero = validateLocation(0, 0, 5);
  assert.equal(farZero.valid, false);
  assert.equal(farZero.zone, 'RED');
  assert.ok(farZero.distance > 10_000_000);

  // Office configured at (0, 0) and user at (0, 0) -> valid GREEN (0m)
  const atEquatorPrime = validateLocation(0, 0, 5, {
    officeLat: 0,
    officeLng: 0,
    radiusGreen: 200,
  });
  assert.equal(atEquatorPrime.valid, true);
  assert.equal(atEquatorPrime.zone, 'GREEN');
  assert.equal(atEquatorPrime.distance, 0);

  assert.equal(calculateDistance(0, 0, 0, 0), 0);
});

test('G3: workingDays excludes weekends and optional public holidays on weekdays', () => {
  // 2026-04-27 (Mon) to 2026-05-03 (Sun): 5 weekdays
  assert.equal(workingDays('2026-04-27', '2026-05-03'), 5);
  // Exclude Reunification Day (2026-04-30 Thu) and Labor Day (2026-05-01 Fri) -> 3 working days
  assert.equal(workingDays('2026-04-27', '2026-05-03', ['2026-04-30', '2026-05-01']), 3);
});
