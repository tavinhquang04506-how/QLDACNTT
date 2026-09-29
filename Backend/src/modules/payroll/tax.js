// Vietnamese payroll rules used by payslip calculation. All amounts are whole dong.

const STANDARD_WORK_DAYS = 22;
const PERSONAL_DEDUCTION = 11_000_000;
const DEPENDENT_DEDUCTION = 4_400_000;
const DEFAULT_OT_MULTIPLIER = 1.5;
const DEFAULT_EMPLOYEE_INSURANCE_RATE = 10.5; // 8% BHXH + 1.5% BHYT + 1% BHTN
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

function resolvePolicy(policy = {}) {
  const standardWorkDays = Number(policy?.standard_work_days) > 0
    ? Number(policy.standard_work_days)
    : STANDARD_WORK_DAYS;
  const personalDeduction = Number.isFinite(Number(policy?.personal_income_tax_deduction)) && Number(policy?.personal_income_tax_deduction) >= 0
    ? Number(policy.personal_income_tax_deduction)
    : PERSONAL_DEDUCTION;
  const dependentDeduction = Number.isFinite(Number(policy?.dependent_deduction)) && Number(policy?.dependent_deduction) >= 0
    ? Number(policy.dependent_deduction)
    : DEPENDENT_DEDUCTION;
  const otMultiplier = Number(policy?.ot_multiplier) > 0
    ? Number(policy.ot_multiplier)
    : DEFAULT_OT_MULTIPLIER;
  const totalInsuranceRate = Number.isFinite(Number(policy?.employee_bhxh_rate)) && Number(policy?.employee_bhxh_rate) >= 0
    ? Number(policy.employee_bhxh_rate)
    : DEFAULT_EMPLOYEE_INSURANCE_RATE;

  let bhxhRate = 0.08;
  let bhytRate = 0.015;
  let bhtnRate = 0.01;
  if (totalInsuranceRate === 0) {
    bhxhRate = 0;
    bhytRate = 0;
    bhtnRate = 0;
  } else if (Math.abs(totalInsuranceRate - DEFAULT_EMPLOYEE_INSURANCE_RATE) > 1e-6) {
    if (totalInsuranceRate >= 2.5) {
      bhxhRate = (totalInsuranceRate - 2.5) / 100;
      bhytRate = 0.015;
      bhtnRate = 0.01;
    } else {
      const scale = totalInsuranceRate / DEFAULT_EMPLOYEE_INSURANCE_RATE;
      bhxhRate = 0.08 * scale;
      bhytRate = 0.015 * scale;
      bhtnRate = 0.01 * scale;
    }
  }

  return {
    standardWorkDays,
    personalDeduction,
    dependentDeduction,
    otMultiplier,
    totalInsuranceRate,
    bhxhRate,
    bhytRate,
    bhtnRate,
  };
}

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

function insurance(base, policy = {}) {
  const numericBase = Math.max(0, Number(base) || 0);
  if (numericBase === 0) {
    return { bhxh: 0, bhyt: 0, bhtn: 0 };
  }
  const { bhxhRate, bhytRate, bhtnRate } = resolvePolicy(policy);
  return {
    bhxh: Math.round(Math.min(numericBase, BHXH_BHYT_CEILING) * bhxhRate),
    bhyt: Math.round(Math.min(numericBase, BHXH_BHYT_CEILING) * bhytRate),
    bhtn: Math.round(Math.min(numericBase, BHTN_CEILING) * bhtnRate),
  };
}

const overtimePay = (base, hours, policy = {}) => {
  const { standardWorkDays, otMultiplier } = resolvePolicy(policy);
  return Math.round((Number(hours) || 0) * ((Number(base) || 0) / standardWorkDays / 8) * otMultiplier);
};

/** Everything a payslip row needs, from the salary, days worked, overtime hours, allowances and optional manual bonus. */
function computePayslip({ base, workDays, otHours, allowances = 0, bonus = 0, dependents = 0, policy = {} }) {
  const resolved = resolvePolicy(policy);
  const { standardWorkDays, personalDeduction, dependentDeduction } = resolved;
  const numericBase = Math.max(0, Number(base) || 0);
  const days = Math.min(Math.max(Number(workDays) || 0, 0), standardWorkDays);
  const numericOtHours = Math.max(0, Number(otHours) || 0);
  const numericBonus = Number(bonus || 0);
  const effectiveAllowances = days === 0 && numericOtHours === 0 && numericBonus === 0
    ? 0
    : Math.max(0, Number(allowances) || 0);
  const pitDeduction = personalDeduction + Math.max(0, Number(dependents) || 0) * dependentDeduction;

  if (days === 0 && numericOtHours === 0 && effectiveAllowances === 0 && numericBonus === 0) {
    return {
      workDays: 0,
      standardWorkDays,
      salaryByDays: 0,
      otPay: 0,
      allowances: 0,
      grossIncome: 0,
      bhxh: 0,
      bhyt: 0,
      bhtn: 0,
      pitDeduction,
      pitTaxable: 0,
      pitAmount: 0,
      totalDeductions: 0,
      netSalary: 0,
    };
  }

  const salaryByDays = Math.round((numericBase / standardWorkDays) * days);
  const otPay = overtimePay(numericBase, numericOtHours, policy);
  const grossIncome = salaryByDays + otPay + effectiveAllowances + numericBonus;
  const { bhxh, bhyt, bhtn } = days > 0 ? insurance(numericBase, policy) : { bhxh: 0, bhyt: 0, bhtn: 0 };
  const pitTaxable = Math.max(0, grossIncome - bhxh - bhyt - bhtn - pitDeduction);
  const pitAmount = pit(pitTaxable);
  const totalDeductions = bhxh + bhyt + bhtn + pitAmount;
  return {
    workDays: days,
    standardWorkDays,
    salaryByDays,
    otPay,
    allowances: effectiveAllowances,
    grossIncome,
    bhxh,
    bhyt,
    bhtn,
    pitDeduction,
    pitTaxable,
    pitAmount,
    totalDeductions,
    netSalary: grossIncome - totalDeductions,
  };
}

module.exports = {
  STANDARD_WORK_DAYS,
  PERSONAL_DEDUCTION,
  DEPENDENT_DEDUCTION,
  resolvePolicy,
  pit,
  insurance,
  overtimePay,
  computePayslip,
};
