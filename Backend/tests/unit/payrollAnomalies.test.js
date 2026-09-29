const { test } = require('node:test');
const assert = require('node:assert/strict');

// Testing the anomaly categorization and rule evaluation
const SEVERITY_ORDER = { Cao: 0, 'Trung bình': 1, Thấp: 2 };
const OT_MONTHLY_LIMIT = 40;

function evaluateAnomalies(rows) {
  const out = [];
  const push = (r, type, severity, category, message, metric, limit) =>
    out.push({ type, severity, category, employee_id: r.employee_id, full_name: r.full_name, message, metric_value: metric ?? null, limit: limit ?? null });

  for (const r of rows) {
    const ot = Number(r.ot_hours || 0);
    if (ot > OT_MONTHLY_LIMIT) {
      push(r, 'OT_OVER_LIMIT', 'Cao', 'violation', `Làm thêm ${ot} giờ, vượt giới hạn ${OT_MONTHLY_LIMIT} giờ/tháng theo Bộ luật Lao động`, ot, OT_MONTHLY_LIMIT);
    }
    const unapproved = Math.round((ot - Number(r.approved_ot || 0)) * 100) / 100;
    if (unapproved > 0) {
      push(r, 'OT_UNAPPROVED', 'Trung bình', 'unapproved', `${unapproved} giờ làm thêm chưa có đăng ký được duyệt`, unapproved);
    }
    if (!r.bank_account || !r.bank_name) {
      push(r, 'MISSING_BANK', 'Trung bình', 'payment', 'Chưa có thông tin tài khoản ngân hàng');
    }
    if (Number(r.att_days || 0) === 0) {
      push(r, 'NO_ATTENDANCE', 'Thấp', 'data', 'Không có dữ liệu chấm công trong kỳ (tính đủ công chuẩn)');
    }
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.employee_id.localeCompare(b.employee_id));
}

test('detects overtime exceeding statutory 40h limit as Cao violation', () => {
  const items = evaluateAnomalies([
    { employee_id: 'NV-001', full_name: 'Test A', ot_hours: 48, approved_ot: 48, bank_account: '123', bank_name: 'VCB', att_days: 22 },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'OT_OVER_LIMIT');
  assert.equal(items[0].severity, 'Cao');
  assert.equal(items[0].category, 'violation');
  assert.equal(items[0].metric_value, 48);
  assert.equal(items[0].limit, 40);
});

test('detects unapproved overtime as Trung bình anomaly', () => {
  const items = evaluateAnomalies([
    { employee_id: 'NV-002', full_name: 'Test B', ot_hours: 20, approved_ot: 12, bank_account: '123', bank_name: 'VCB', att_days: 22 },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'OT_UNAPPROVED');
  assert.equal(items[0].severity, 'Trung bình');
  assert.equal(items[0].metric_value, 8);
});

test('detects missing bank account as Trung bình payment anomaly', () => {
  const items = evaluateAnomalies([
    { employee_id: 'NV-003', full_name: 'Test C', ot_hours: 0, approved_ot: 0, bank_account: null, bank_name: null, att_days: 22 },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'MISSING_BANK');
  assert.equal(items[0].severity, 'Trung bình');
});

test('detects zero attendance as Thấp data notice', () => {
  const items = evaluateAnomalies([
    { employee_id: 'NV-004', full_name: 'Test D', ot_hours: 0, approved_ot: 0, bank_account: '123', bank_name: 'VCB', att_days: 0 },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'NO_ATTENDANCE');
  assert.equal(items[0].severity, 'Thấp');
});

test('sorts anomalies by severity: Cao -> Trung bình -> Thấp', () => {
  const items = evaluateAnomalies([
    { employee_id: 'NV-004', full_name: 'Test D', ot_hours: 0, approved_ot: 0, bank_account: '123', bank_name: 'VCB', att_days: 0 },
    { employee_id: 'NV-001', full_name: 'Test A', ot_hours: 45, approved_ot: 45, bank_account: '123', bank_name: 'VCB', att_days: 22 },
    { employee_id: 'NV-003', full_name: 'Test C', ot_hours: 0, approved_ot: 0, bank_account: null, bank_name: null, att_days: 22 },
  ]);
  assert.equal(items.length, 3);
  assert.equal(items[0].severity, 'Cao');
  assert.equal(items[1].severity, 'Trung bình');
  assert.equal(items[2].severity, 'Thấp');
});
