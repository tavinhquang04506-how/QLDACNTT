const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pit, insurance, overtimePay, computePayslip } = require('../../src/modules/payroll/tax');

test('personal income tax is progressive across the seven brackets', () => {
  assert.equal(pit(0), 0);
  assert.equal(pit(-5), 0);
  assert.equal(pit(5_000_000), 250_000);
  assert.equal(pit(10_000_000), 750_000);
  assert.equal(pit(18_000_000), 1_950_000);
  assert.equal(pit(32_000_000), 4_750_000);
  assert.equal(pit(52_000_000), 9_750_000);
  assert.equal(pit(80_000_000), 18_150_000);
  assert.equal(pit(100_000_000), 25_150_000);
});

test('tax inside a bracket is proportional and rounded to whole dong', () => {
  assert.equal(pit(10_190_000), 778_500);
  assert.equal(pit(1_234_567), 61_728);
});

test('insurance is 8% + 1.5% + 1% of the salary, capped at the statutory ceilings', () => {
  assert.deepEqual(insurance(22_000_000), { bhxh: 1_760_000, bhyt: 330_000, bhtn: 220_000 });
  const capped = insurance(200_000_000);
  assert.equal(capped.bhxh, 3_744_000); // 8% of 46.8M
  assert.equal(capped.bhyt, 702_000); // 1.5% of 46.8M
  assert.equal(capped.bhtn, 992_000); // 1% of 99.2M
  assert.deepEqual(insurance(0), { bhxh: 0, bhyt: 0, bhtn: 0 });
});

test('overtime pays 150% of the hourly rate (salary / 22 days / 8 hours)', () => {
  assert.equal(overtimePay(22_000_000, 0), 0);
  assert.equal(overtimePay(22_000_000, 8), 1_500_000);
  assert.equal(overtimePay(30_000_000, 10), Math.round(10 * (30_000_000 / 22 / 8) * 1.5));
});

test('a full month at 22 million: gross, deductions and net', () => {
  const p = computePayslip({ base: 22_000_000, workDays: 22, otHours: 0, allowances: 1_500_000 });
  assert.equal(p.grossIncome, 23_500_000);
  assert.equal(p.bhxh + p.bhyt + p.bhtn, 2_310_000);
  assert.equal(p.pitTaxable, 10_190_000);
  assert.equal(p.pitAmount, 778_500);
  assert.equal(p.totalDeductions, 3_088_500);
  assert.equal(p.netSalary, 20_411_500);
  assert.equal(p.otPay, 0);
});

test('fewer worked days lower the pay, and workDays above the standard are capped', () => {
  const half = computePayslip({ base: 22_000_000, workDays: 11, otHours: 0, allowances: 0 });
  assert.equal(half.salaryByDays, 11_000_000);
  const capped = computePayslip({ base: 22_000_000, workDays: 30, otHours: 0, allowances: 0 });
  assert.equal(capped.salaryByDays, 22_000_000);
  assert.equal(capped.workDays, 22);
});

test('a low salary pays no income tax and never yields a negative net', () => {
  const p = computePayslip({ base: 6_000_000, workDays: 22, otHours: 0, allowances: 0 });
  assert.equal(p.pitAmount, 0);
  assert.ok(p.netSalary > 0);
  const zero = computePayslip({ base: 0, workDays: 0, otHours: 0, allowances: 0 });
  assert.equal(zero.netSalary, 0);
});
