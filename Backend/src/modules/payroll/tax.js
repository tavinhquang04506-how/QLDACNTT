// Vietnamese payroll rules used by payslip calculation. All amounts are whole dong.

const STANDARD_WORK_DAYS = 22;
const PERSONAL_DEDUCTION = 11_000_000;
const BHXH_BHYT_CEILING = 46_800_000; // 20 x base salary (2.34M)
const BHTN_CEILING = 99_200_000; // 20 x regional minimum wage (region I)

// [upper bound of taxable income, rate] — progressive personal income tax, 7 brackets.
const BRACKETS = [
  [5_000_000, 0.05],
  [10_000_000, 0.1],
  [18_000_000, 0.15],
  [32_000_000, 0.2],
  [52_000_000, 0.25],
  [80_000_000, 0.3],
  [Infinity, 0.35],
];

function pit(taxable) {
  if (!(taxable > 0)) return 0;
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of BRACKETS) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return Math.round(tax);
}

function insurance(base) {
  return {
    bhxh: Math.round(Math.min(base, BHXH_BHYT_CEILING) * 0.08),
    bhyt: Math.round(Math.min(base, BHXH_BHYT_CEILING) * 0.015),
    bhtn: Math.round(Math.min(base, BHTN_CEILING) * 0.01),
  };
}

const overtimePay = (base, hours) => Math.round(hours * (base / STANDARD_WORK_DAYS / 8) * 1.5);

/** Everything a payslip row needs, from the salary, days worked, overtime hours, allowances and optional manual bonus. */
function computePayslip({ base, workDays, otHours, allowances, bonus = 0 }) {
  const days = Math.min(Math.max(workDays, 0), STANDARD_WORK_DAYS);
  const salaryByDays = Math.round((base / STANDARD_WORK_DAYS) * days);
  const otPay = overtimePay(base, otHours);
  const grossIncome = salaryByDays + otPay + allowances + Number(bonus || 0);
  const { bhxh, bhyt, bhtn } = insurance(base);
  const pitTaxable = Math.max(0, grossIncome - bhxh - bhyt - bhtn - PERSONAL_DEDUCTION);
  const pitAmount = pit(pitTaxable);
  const totalDeductions = bhxh + bhyt + bhtn + pitAmount;
  return {
    workDays: days, salaryByDays, otPay, grossIncome, bhxh, bhyt, bhtn,
    pitDeduction: PERSONAL_DEDUCTION, pitTaxable, pitAmount, totalDeductions,
    netSalary: grossIncome - totalDeductions,
  };
}

module.exports = { STANDARD_WORK_DAYS, PERSONAL_DEDUCTION, pit, insurance, overtimePay, computePayslip };
