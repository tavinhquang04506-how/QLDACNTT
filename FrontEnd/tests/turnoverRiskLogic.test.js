import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRiskStats,
  filterRiskList,
  isTopTalentAtRisk,
  SIGNAL_DEFINITIONS,
} from '../src/utils/turnoverRisk.js';

test('computeRiskStats correctly calculates distribution and talents at risk', () => {
  const mockList = [
    { employee_id: 'NV-001', score: 75, level: 'Cao', department_id: 'DEPT-ENG' },
    { employee_id: 'NV-002', score: 50, level: 'Trung bình', department_id: 'DEPT-ENG' },
    { employee_id: 'NV-003', score: 20, level: 'Thấp', department_id: 'DEPT-MKT' },
    { employee_id: 'NV-004', score: 65, level: 'Cao', department_id: 'DEPT-MKT' },
  ];
  const talentIds = ['NV-001', 'NV-003']; // NV-001 is top talent with High risk

  const stats = computeRiskStats(mockList, talentIds);
  assert.equal(stats.total, 4);
  assert.equal(stats.high, 2);
  assert.equal(stats.mid, 1);
  assert.equal(stats.low, 1);
  assert.equal(stats.talentsAtRisk, 1); // Only NV-001
});

test('isTopTalentAtRisk checks if employee is both high/mid risk and in talentIds', () => {
  const talentIds = ['NV-001', 'NV-002', 'NV-003'];
  assert.equal(isTopTalentAtRisk({ employee_id: 'NV-001', level: 'Cao' }, talentIds), true);
  assert.equal(isTopTalentAtRisk({ employee_id: 'NV-002', level: 'Trung bình' }, talentIds), true);
  assert.equal(isTopTalentAtRisk({ employee_id: 'NV-003', level: 'Thấp' }, talentIds), false);
  assert.equal(isTopTalentAtRisk({ employee_id: 'NV-999', level: 'Cao' }, talentIds), false);
});

test('filterRiskList filters by search, level, department and talent', () => {
  const mockList = [
    { employee_id: 'NV-001', full_name: 'Nguyễn Văn A', score: 75, level: 'Cao', department_id: 'DEPT-ENG' },
    { employee_id: 'NV-002', full_name: 'Trần Thị B', score: 45, level: 'Trung bình', department_id: 'DEPT-ENG' },
    { employee_id: 'NV-003', full_name: 'Lê Văn C', score: 15, level: 'Thấp', department_id: 'DEPT-MKT' },
  ];
  const talentIds = ['NV-001'];

  // Search by name
  assert.equal(filterRiskList(mockList, { search: 'văn A' }).length, 1);
  // Level filter
  assert.equal(filterRiskList(mockList, { levelFilter: 'Cao' }).length, 1);
  // Dept filter
  assert.equal(filterRiskList(mockList, { deptFilter: 'DEPT-ENG' }).length, 2);
  // Talents only
  assert.equal(filterRiskList(mockList, { talentIds, onlyTalentsAtRisk: true }).length, 1);
});

test('SIGNAL_DEFINITIONS covers all 8 retention risk factors', () => {
  assert.ok(SIGNAL_DEFINITIONS.PAY_GAP);
  assert.ok(SIGNAL_DEFINITIONS.OT_LOAD);
  assert.ok(SIGNAL_DEFINITIONS.OT_TREND);
  assert.ok(SIGNAL_DEFINITIONS.STAGNATION);
  assert.ok(SIGNAL_DEFINITIONS.LOW_PERFORMANCE);
  assert.ok(SIGNAL_DEFINITIONS.PERFORMANCE_DROP);
  assert.ok(SIGNAL_DEFINITIONS.UNPAID_ABSENCE);
  assert.ok(SIGNAL_DEFINITIONS.FREQUENT_LATE);
});
