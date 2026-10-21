const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAnomalyRows } = require('../../src/modules/payroll/service');

test('detects overtime exceeding statutory 40h limit as Cao violation', () => {
  const items = evaluateAnomalyRows([
    { employee_id: 'NV-001', full_name: 'Test A', ot_hours: 48, approved_ot: 48, bank_account: '123', bank_name: 'VCB', att_days: 22, actual_work_days: 22 },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'OT_OVER_LIMIT');
  assert.equal(items[0].severity, 'Cao');
  assert.equal(items[0].category, 'violation');
  assert.equal(items[0].metric_value, 48);
  assert.equal(items[0].limit, 40);
});

test('detects unapproved overtime as Trung bình anomaly', () => {
  const items = evaluateAnomalyRows([
    { employee_id: 'NV-002', full_name: 'Test B', ot_hours: 20, approved_ot: 12, bank_account: '123', bank_name: 'VCB', att_days: 22, actual_work_days: 22 },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'OT_UNAPPROVED');
  assert.equal(items[0].severity, 'Trung bình');
  assert.equal(items[0].metric_value, 8);
});

test('detects missing bank account as Trung bình payment anomaly', () => {
  const items = evaluateAnomalyRows([
    { employee_id: 'NV-003', full_name: 'Test C', ot_hours: 0, approved_ot: 0, bank_account: null, bank_name: null, att_days: 22, actual_work_days: 22 },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'MISSING_BANK');
  assert.equal(items[0].severity, 'Trung bình');
});

test('R02: detects missing attendance logs (att_days === 0) as Cao violation that blocks lock', () => {
  const items = evaluateAnomalyRows([
    { employee_id: 'NV-004', full_name: 'Test D', ot_hours: 0, approved_ot: 0, bank_account: '123', bank_name: 'VCB', att_days: 0, actual_work_days: 0 },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'NO_ATTENDANCE');
  assert.equal(items[0].severity, 'Cao');
  assert.equal(items[0].category, 'violation');
});

test('R02: distinguishes logged attendance with 0 paid workdays (ZERO_WORKDAYS, Trung bình) from missing attendance', () => {
  const items = evaluateAnomalyRows([
    { employee_id: 'NV-005', full_name: 'Test E', ot_hours: 0, approved_ot: 0, bank_account: '123', bank_name: 'VCB', att_days: 5, actual_work_days: 0 },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'ZERO_WORKDAYS');
  assert.equal(items[0].severity, 'Trung bình');
  assert.equal(items[0].category, 'data');
});

test('sorts anomalies by severity: Cao -> Trung bình', () => {
  const items = evaluateAnomalyRows([
    { employee_id: 'NV-005', full_name: 'Test E', ot_hours: 0, approved_ot: 0, bank_account: '123', bank_name: 'VCB', att_days: 5, actual_work_days: 0 },
    { employee_id: 'NV-001', full_name: 'Test A', ot_hours: 45, approved_ot: 45, bank_account: '123', bank_name: 'VCB', att_days: 22, actual_work_days: 22 },
    { employee_id: 'NV-003', full_name: 'Test C', ot_hours: 0, approved_ot: 0, bank_account: null, bank_name: null, att_days: 22, actual_work_days: 22 },
  ]);
  assert.equal(items.length, 3);
  assert.equal(items[0].severity, 'Cao');
  assert.equal(items[1].severity, 'Trung bình');
  assert.equal(items[2].severity, 'Trung bình');
});
