const assert = require('node:assert/strict');

const PAYROLL_REPORT_HEADERS = [
  'Mã NV',
  'Họ Và Tên',
  'Chức Vụ',
  'Lương Cơ Bản',
  'Ngày Công',
  'Làm Thêm (OT)',
  'Thưởng KPI & Phụ Cấp',
  'BHXH',
  'Thuế TNCN',
  'Thực Lĩnh (Net)',
];

const BANK_TRANSFER_HEADERS = [
  'STT',
  'Mã Nhân Viên',
  'Họ Và Tên',
  'Số Tài Khoản',
  'Ngân Hàng Thụ Hưởng',
  'Số Tiền Thực Nhận (VNĐ)',
  'Trạng Thái',
];

function parseCsvLine(line) {
  const cells = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (inQuotes) {
    throw new Error(`CSV_PARSE_ERROR: Unclosed quote in line: ${line}`);
  }
  cells.push(current);
  return cells;
}

/**
 * R19: Strict RFC-4180 CSV parser handling UTF-8 BOM, quoted fields, and header mapping.
 */
function parseCsvWithBom(rawCsv) {
  if (typeof rawCsv !== 'string' || rawCsv.length === 0) {
    throw new Error('CSV_EMPTY: Nội dung file CSV rỗng');
  }
  const hasBom = rawCsv.charCodeAt(0) === 0xfeff;
  const clean = hasBom ? rawCsv.slice(1) : rawCsv;
  const lines = clean.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error('CSV_NO_HEADER: File CSV không có dòng tiêu đề');
  }

  const headers = parseCsvLine(lines[0]);
  const rows = [];
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length !== headers.length) {
      throw new Error(
        `CSV_COLUMN_COUNT_MISMATCH: Dòng ${i + 1} có ${cells.length} cột, khác với số cột tiêu đề (${headers.length})`
      );
    }
    rows.push(cells);
    const rec = {};
    for (let c = 0; c < headers.length; c++) {
      rec[headers[c]] = cells[c];
    }
    records.push(rec);
  }

  return { hasBom, headers, rows, records };
}

function parseStrictNumber(val, fieldName, empId) {
  const str = String(val ?? '').trim();
  if (str === '' || !/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`CSV_INVALID_NUMBER: Giá trị cột "${fieldName}" của ${empId} không phải số hợp lệ: "${val}"`);
  }
  return Number(str);
}

/**
 * R19: Reconcile downloaded full Payroll Report CSV (`Bao_Cao_Tong_Hop_Quy_Luong_*.csv`)
 * row-by-row and column-by-column against DB `payslips` joined with `employees`.
 */
function reconcilePayrollReportCsv(csvText, dbPayslips) {
  if (!Array.isArray(dbPayslips) || dbPayslips.length === 0) {
    throw new Error('DB_PAYSLIPS_EMPTY: Không có dữ liệu payslips từ CSDL để đối chiếu');
  }

  const parsed = parseCsvWithBom(csvText);
  assert.equal(parsed.hasBom, true, 'Payroll report CSV must include UTF-8 BOM (\\uFEFF)');
  assert.deepEqual(
    parsed.headers,
    PAYROLL_REPORT_HEADERS,
    'Payroll report CSV headers must match expected 10 columns'
  );
  assert.equal(
    parsed.records.length,
    dbPayslips.length,
    `Payroll report CSV row count (${parsed.records.length}) must equal DB payslips count (${dbPayslips.length})`
  );

  const dbMap = new Map(dbPayslips.map((s) => [String(s.employee_id), s]));
  const seenEmpIds = new Set();

  const csvSums = {
    baseSalary: 0,
    otPay: 0,
    allowancesAndBonus: 0,
    bhxhTotal: 0,
    pitAmount: 0,
    netSalary: 0,
  };

  const dbSums = {
    baseSalary: 0,
    otPay: 0,
    allowancesAndBonus: 0,
    bhxhTotal: 0,
    pitAmount: 0,
    netSalary: 0,
  };

  for (const s of dbPayslips) {
    dbSums.baseSalary += Number(s.base_salary || 0);
    dbSums.otPay += Number(s.ot_pay || 0);
    dbSums.allowancesAndBonus += Number(s.allowances || 0) + Number(s.bonus || 0);
    dbSums.bhxhTotal += Number(s.bhxh_amount || 0) + Number(s.bhyt_amount || 0) + Number(s.bhtn_amount || 0);
    dbSums.pitAmount += Number(s.pit_amount || 0);
    dbSums.netSalary += Number(s.net_salary || 0);
  }

  for (const rec of parsed.records) {
    const empId = String(rec['Mã NV'] || '').trim();
    assert.ok(empId, 'CSV row missing Mã NV');
    assert.equal(seenEmpIds.has(empId), false, `Duplicate Mã NV in Payroll Report CSV: ${empId}`);
    seenEmpIds.add(empId);

    const dbSlip = dbMap.get(empId);
    assert.ok(dbSlip, `CSV contains employee ${empId} not found in DB payslips for this period`);

    const csvName = String(rec['Họ Và Tên'] || '').trim();
    const csvRole = String(rec['Chức Vụ'] || '').trim();
    const csvBase = parseStrictNumber(rec['Lương Cơ Bản'], 'Lương Cơ Bản', empId);
    const csvDays = String(rec['Ngày Công'] || '').trim();
    const csvOtPay = parseStrictNumber(rec['Làm Thêm (OT)'], 'Làm Thêm (OT)', empId);
    const csvAllowBonus = parseStrictNumber(rec['Thưởng KPI & Phụ Cấp'], 'Thưởng KPI & Phụ Cấp', empId);
    const csvBhxh = parseStrictNumber(rec['BHXH'], 'BHXH', empId);
    const csvPit = parseStrictNumber(rec['Thuế TNCN'], 'Thuế TNCN', empId);
    const csvNet = parseStrictNumber(rec['Thực Lĩnh (Net)'], 'Thực Lĩnh (Net)', empId);

    const expectedDays = `${Number(dbSlip.actual_work_days ?? 0)}/${Number(dbSlip.standard_work_days ?? 22)}`;
    const expectedBase = Number(dbSlip.base_salary || 0);
    const expectedOtPay = Number(dbSlip.ot_pay || 0);
    const expectedAllowBonus = Number(dbSlip.allowances || 0) + Number(dbSlip.bonus || 0);
    const expectedBhxh =
      Number(dbSlip.bhxh_amount || 0) + Number(dbSlip.bhyt_amount || 0) + Number(dbSlip.bhtn_amount || 0);
    const expectedPit = Number(dbSlip.pit_amount || 0);
    const expectedNet = Number(dbSlip.net_salary || 0);

    assert.equal(csvName, String(dbSlip.full_name || '').trim(), `Name mismatch for ${empId}`);
    assert.equal(csvRole, String(dbSlip.job_title || '').trim(), `Job title mismatch for ${empId}`);
    assert.equal(csvBase, expectedBase, `Base salary mismatch for ${empId}: CSV=${csvBase} vs DB=${expectedBase}`);
    assert.equal(csvDays, expectedDays, `Workdays mismatch for ${empId}: CSV=${csvDays} vs DB=${expectedDays}`);
    assert.equal(csvOtPay, expectedOtPay, `OT pay mismatch for ${empId}: CSV=${csvOtPay} vs DB=${expectedOtPay}`);
    assert.equal(
      csvAllowBonus,
      expectedAllowBonus,
      `Allowances+Bonus mismatch for ${empId}: CSV=${csvAllowBonus} vs DB=${expectedAllowBonus}`
    );
    assert.equal(csvBhxh, expectedBhxh, `BHXH mismatch for ${empId}: CSV=${csvBhxh} vs DB=${expectedBhxh}`);
    assert.equal(csvPit, expectedPit, `PIT mismatch for ${empId}: CSV=${csvPit} vs DB=${expectedPit}`);
    assert.equal(csvNet, expectedNet, `Net salary mismatch for ${empId}: CSV=${csvNet} vs DB=${expectedNet}`);

    csvSums.baseSalary += csvBase;
    csvSums.otPay += csvOtPay;
    csvSums.allowancesAndBonus += csvAllowBonus;
    csvSums.bhxhTotal += csvBhxh;
    csvSums.pitAmount += csvPit;
    csvSums.netSalary += csvNet;
  }

  assert.equal(seenEmpIds.size, dbMap.size, 'CSV must cover 100% of DB payslip employees without missing rows');
  assert.deepEqual(csvSums, dbSums, 'Payroll report CSV column totals must exactly equal DB column totals');

  return {
    rowCount: parsed.records.length,
    sums: csvSums,
  };
}

/**
 * R19: Reconcile downloaded Bank Transfer CSV (`Lenh_Chi_Luong_*.csv`)
 * against DB `payslips` for the period, accounting for valid exclusion of zero-net and missing-bank rows.
 */
function reconcileBankTransferCsv(csvText, dbPayslips) {
  if (!Array.isArray(dbPayslips) || dbPayslips.length === 0) {
    throw new Error('DB_PAYSLIPS_EMPTY: Không có dữ liệu payslips từ CSDL để đối chiếu');
  }

  const parsed = parseCsvWithBom(csvText);
  assert.equal(parsed.hasBom, true, 'Bank transfer CSV must include UTF-8 BOM (\\uFEFF)');
  assert.deepEqual(
    parsed.headers,
    BANK_TRANSFER_HEADERS,
    'Bank transfer CSV headers must match expected 7 columns'
  );

  const payableDbSlips = dbPayslips.filter(
    (s) =>
      s.bank_account &&
      String(s.bank_account).trim() !== '' &&
      s.bank_name &&
      String(s.bank_name).trim() !== '' &&
      Number(s.net_salary) > 0
  );
  const excludedZeroOrMissingBank = dbPayslips.filter(
    (s) =>
      !s.bank_account ||
      String(s.bank_account).trim() === '' ||
      !s.bank_name ||
      String(s.bank_name).trim() === '' ||
      Number(s.net_salary) <= 0
  );

  assert.equal(
    parsed.records.length,
    payableDbSlips.length,
    `Bank transfer CSV row count (${parsed.records.length}) must equal payable DB payslips count (${payableDbSlips.length})`
  );

  const payableMap = new Map(payableDbSlips.map((s) => [String(s.employee_id), s]));
  const excludedIds = new Set(excludedZeroOrMissingBank.map((s) => String(s.employee_id)));
  const seenEmpIds = new Set();

  let csvTotalAmount = 0;
  const dbPayableTotalAmount = payableDbSlips.reduce((sum, s) => sum + Number(s.net_salary || 0), 0);

  for (let i = 0; i < parsed.records.length; i++) {
    const rec = parsed.records[i];
    const stt = parseStrictNumber(rec['STT'], 'STT', `row-${i + 1}`);
    const empId = String(rec['Mã Nhân Viên'] || '').trim();
    assert.equal(stt, i + 1, `Bank transfer STT sequence mismatch at row ${i + 1}`);
    assert.ok(empId, 'Bank transfer CSV row missing Mã Nhân Viên');
    assert.equal(seenEmpIds.has(empId), false, `Duplicate Mã Nhân Viên in Bank Transfer CSV: ${empId}`);
    assert.equal(
      excludedIds.has(empId),
      false,
      `Bank transfer CSV must not include zero-net or missing-bank employee ${empId}`
    );
    seenEmpIds.add(empId);

    const dbSlip = payableMap.get(empId);
    assert.ok(dbSlip, `Bank transfer CSV contains employee ${empId} not in payable DB payslips`);

    const csvName = String(rec['Họ Và Tên'] || '').trim();
    const csvAccount = String(rec['Số Tài Khoản'] || '').trim();
    const csvBank = String(rec['Ngân Hàng Thụ Hưởng'] || '').trim();
    const csvAmount = parseStrictNumber(rec['Số Tiền Thực Nhận (VNĐ)'], 'Số Tiền Thực Nhận (VNĐ)', empId);
    const csvStatus = String(rec['Trạng Thái'] || '').trim();

    assert.equal(csvName, String(dbSlip.full_name || '').trim(), `Bank transfer name mismatch for ${empId}`);
    assert.equal(csvAccount, String(dbSlip.bank_account || '').trim(), `Bank account mismatch for ${empId}`);
    assert.equal(csvBank, String(dbSlip.bank_name || '').trim(), `Bank name mismatch for ${empId}`);
    assert.equal(
      csvAmount,
      Number(dbSlip.net_salary),
      `Bank transfer net amount mismatch for ${empId}: CSV=${csvAmount} vs DB=${Number(dbSlip.net_salary)}`
    );
    assert.equal(csvStatus, 'Hợp lệ', `Bank transfer status mismatch for ${empId}`);

    csvTotalAmount += csvAmount;
  }

  assert.equal(
    seenEmpIds.size,
    payableMap.size,
    'Bank transfer CSV must cover 100% of payable DB employees without missing rows'
  );
  assert.equal(
    csvTotalAmount,
    dbPayableTotalAmount,
    `Bank transfer CSV total (${csvTotalAmount}) must equal payable DB total (${dbPayableTotalAmount})`
  );

  return {
    payableRowCount: parsed.records.length,
    excludedRowCount: excludedZeroOrMissingBank.length,
    totalAmount: csvTotalAmount,
  };
}

module.exports = {
  PAYROLL_REPORT_HEADERS,
  BANK_TRANSFER_HEADERS,
  parseCsvLine,
  parseCsvWithBom,
  reconcilePayrollReportCsv,
  reconcileBankTransferCsv,
};
