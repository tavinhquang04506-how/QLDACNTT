const db = require('../../config/db');
const { AppError, forbidden, notFound } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { scopeCondition } = require('../../utils/scope');
const { STANDARD_WORK_DAYS, PERSONAL_DEDUCTION, DEPENDENT_DEDUCTION, computePayslip } = require('./tax');
const settingsService = require('../settings/service');

function parseIsoDate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DEFAULT_ALLOWANCES = 1_500_000; // phụ cấp ăn trưa + xăng xe
const OT_MONTHLY_LIMIT = 40;
const LOCKED = ['DA_CHOT', 'DA_CHUYEN_KHOAN'];

const SEVERITY_ORDER = { Cao: 0, 'Trung bình': 1, Thấp: 2 };

function buildPolicySnapshot(settings = {}) {
  return {
    policy_version_id: settings.policy_version_id ?? null,
    standard_work_days: Number(settings.standard_work_days) > 0 ? Number(settings.standard_work_days) : STANDARD_WORK_DAYS,
    ot_multiplier: Number(settings.ot_multiplier) > 0 ? Number(settings.ot_multiplier) : 1.5,
    default_allowances: Number.isFinite(Number(settings.default_allowances)) && Number(settings.default_allowances) >= 0
      ? Number(settings.default_allowances)
      : DEFAULT_ALLOWANCES,
    personal_income_tax_deduction: Number.isFinite(Number(settings.personal_income_tax_deduction)) && Number(settings.personal_income_tax_deduction) >= 0
      ? Number(settings.personal_income_tax_deduction)
      : PERSONAL_DEDUCTION,
    dependent_deduction: Number.isFinite(Number(settings.dependent_deduction)) && Number(settings.dependent_deduction) >= 0
      ? Number(settings.dependent_deduction)
      : DEPENDENT_DEDUCTION,
    employee_bhxh_rate: Number.isFinite(Number(settings.employee_bhxh_rate)) && Number(settings.employee_bhxh_rate) >= 0
      ? Number(settings.employee_bhxh_rate)
      : 10.5,
    max_ot_per_month: Number(settings.max_ot_per_month) > 0 ? Number(settings.max_ot_per_month) : OT_MONTHLY_LIMIT,
    policy_effective_from: String(settings.policy_effective_from || '2020-01'),
  };
}

async function resolvePeriodPolicy(executor, periodRow) {
  if (periodRow?.policy_snapshot && typeof periodRow.policy_snapshot === 'object' && Object.keys(periodRow.policy_snapshot).length > 0) {
    return buildPolicySnapshot(periodRow.policy_snapshot);
  }
  const settings = await settingsService.getSettingsForPeriod(executor, periodRow?.period);
  return buildPolicySnapshot(settings);
}

/**
 * Compute approved paid leave days within a payroll period that do not overlap dates already counted in `paidDatesSet`.
 */
function computeApprovedPaidLeaveDays(leavesForEmp = [], paidDatesSet = new Set(), holidaySet = new Set()) {
  if (!leavesForEmp || leavesForEmp.length === 0) return 0;
  let totalPaidLeaveDays = 0;
  const countedLeaveDates = new Set();

  for (const lr of leavesForEmp) {
    const isHalfDaySingle = lr.raw_start === lr.raw_end && Number(lr.total_days) === 0.5;
    const cur = parseIsoDate(lr.clip_start);
    const last = parseIsoDate(lr.clip_end);
    if (!cur || !last || last < cur) continue;

    while (cur <= last) {
      const dow = cur.getUTCDay();
      const iso = cur.toISOString().slice(0, 10);
      if (dow >= 1 && dow <= 5 && !holidaySet.has(iso) && !paidDatesSet.has(iso) && !countedLeaveDates.has(iso)) {
        countedLeaveDates.add(iso);
        totalPaidLeaveDays += isHalfDaySingle ? 0.5 : 1;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  return Math.round(totalPaidLeaveDays * 10) / 10;
}

async function findPeriod(executor, id, { lock = false } = {}) {
  const { rows } = await executor.query(`SELECT * FROM payroll_periods WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
  if (!rows[0]) throw notFound('Không tìm thấy kỳ lương');
  return rows[0];
}

async function listPeriods() {
  return (await db.query('SELECT * FROM payroll_periods ORDER BY period DESC LIMIT 24')).rows;
}

const getPeriod = (id) => findPeriod(db, id);

/** Draft payroll for every employee paid in `period` ('YYYY-MM'). A locked or transferred period is never touched. */
async function calculate(actor, period, req) {
  return db.withTransaction(async (client) => {
    const settings = await settingsService.getSettingsForPeriod(client, period);
    const policySnapshot = buildPolicySnapshot(settings);

    await client.query('INSERT INTO payroll_periods (period) VALUES ($1) ON CONFLICT (period) DO NOTHING', [period]);
    const periodRow = (await client.query('SELECT * FROM payroll_periods WHERE period = $1 FOR UPDATE', [period])).rows[0];
    if (periodRow.status !== 'DU_THAO') {
      throw new AppError(409, 'PERIOD_LOCKED', `Kỳ lương ${period} đã được chốt, không thể tính lại`);
    }
    await client.query('DELETE FROM payslips WHERE period_id = $1', [periodRow.id]);

    const start = `${period}-01`;
    const { rows: employees } = await client.query(
      `SELECT id, base_salary, bank_account, bank_name, joined_date, termination_date FROM employees
        WHERE joined_date < ($1::date + INTERVAL '1 month')
          AND (status IN ('DANG_LAM_VIEC', 'THU_VIEC') OR (status = 'DA_NGHI_VIEC' AND termination_date >= $1::date))
        ORDER BY id`,
      [start]
    );
    const { rows: attendance } = await client.query(
      `SELECT employee_id,
              COUNT(*)::int AS total_logs,
              COUNT(*) FILTER (WHERE status <> 'VANG_KHONG_PHEP')::int AS work_days,
              COALESCE(ARRAY_AGG(work_date::text) FILTER (WHERE status <> 'VANG_KHONG_PHEP'), ARRAY[]::text[]) AS paid_dates,
              COALESCE(SUM(ot_hours), 0) AS ot
         FROM attendance_logs
        WHERE work_date >= $1::date AND work_date < ($1::date + INTERVAL '1 month')
        GROUP BY employee_id`,
      [start]
    );
    const byEmployee = new Map(attendance.map((a) => [a.employee_id, a]));

    const { rows: holidayRows } = await client.query(
      `SELECT holiday_date::text AS d
         FROM public_holidays
        WHERE is_paid = TRUE
          AND holiday_date >= $1::date
          AND holiday_date < ($1::date + INTERVAL '1 month')`,
      [start]
    );
    const holidaySet = new Set(holidayRows.map((r) => String(r.d).slice(0, 10)));

    const { rows: paidLeaveRows } = await client.query(
      `SELECT lr.employee_id,
              GREATEST(lr.start_date, $1::date)::text AS clip_start,
              LEAST(lr.end_date, ($1::date + INTERVAL '1 month' - INTERVAL '1 day')::date)::text AS clip_end,
              lr.start_date::text AS raw_start,
              lr.end_date::text AS raw_end,
              lr.total_days
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE lr.stage = 'DA_PHE_DUYET'
          AND lt.is_paid = TRUE
          AND lr.start_date < ($1::date + INTERVAL '1 month')
          AND lr.end_date >= $1::date
        ORDER BY lr.start_date, lr.id`,
      [start]
    );
    const paidLeavesByEmployee = new Map();
    for (const lr of paidLeaveRows) {
      if (!paidLeavesByEmployee.has(lr.employee_id)) {
        paidLeavesByEmployee.set(lr.employee_id, []);
      }
      paidLeavesByEmployee.get(lr.employee_id).push({
        ...lr,
        clip_start: String(lr.clip_start).slice(0, 10),
        clip_end: String(lr.clip_end).slice(0, 10),
        raw_start: String(lr.raw_start).slice(0, 10),
        raw_end: String(lr.raw_end).slice(0, 10),
      });
    }

    const totals = { net: 0, bhxh: 0, tax: 0, ot: 0 };
    for (const emp of employees) {
      const base = Number(emp.base_salary) || 0;
      const att = byEmployee.get(emp.id);
      const loggedWorkDays = att ? Number(att.work_days) : 0;
      const paidDatesSet = new Set((att?.paid_dates || []).map((d) => String(d).slice(0, 10)));
      const approvedPaidLeaveDays = computeApprovedPaidLeaveDays(
        paidLeavesByEmployee.get(emp.id) || [],
        paidDatesSet,
        holidaySet
      );
      const otHours = att ? Number(att.ot) : 0;
      // R02 / F09 + R14: Never fabricate 22 workdays when attendance logs are missing.
      // Combine actual attendance workdays with non-overlapping approved paid leave days (`DA_PHE_DUYET` & `is_paid = TRUE`).
      const workDays = loggedWorkDays + approvedPaidLeaveDays;
      const rawAllowances = workDays === 0 && otHours === 0 ? 0 : policySnapshot.default_allowances;
      const p = computePayslip({
        base,
        workDays,
        otHours,
        allowances: rawAllowances,
        bonus: 0,
        policy: policySnapshot,
      });

      await client.query(
        `INSERT INTO payslips (period_id, employee_id, base_salary, actual_work_days, standard_work_days, ot_hours, ot_pay,
            allowances, gross_income, bhxh_amount, bhyt_amount, bhtn_amount, pit_deduction, pit_taxable, pit_amount,
            total_deductions, net_salary, status, bank_account, bank_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'DU_THAO',$18,$19)`,
        [
          periodRow.id,
          emp.id,
          base,
          p.workDays,
          p.standardWorkDays,
          otHours,
          p.otPay,
          p.allowances,
          p.grossIncome,
          p.bhxh,
          p.bhyt,
          p.bhtn,
          p.pitDeduction,
          p.pitTaxable,
          p.pitAmount,
          p.totalDeductions,
          p.netSalary,
          emp.bank_account,
          emp.bank_name,
        ]
      );
      totals.net += p.netSalary;
      totals.bhxh += p.bhxh;
      totals.tax += p.pitAmount;
      totals.ot += otHours;
    }
    await client.query(
      `UPDATE payroll_periods
          SET total_headcount = $2,
              total_net = $3,
              total_bhxh = $4,
              total_tax = $5,
              total_ot_hours = $6,
              policy_snapshot = $7::jsonb
        WHERE id = $1`,
      [periodRow.id, employees.length, totals.net, totals.bhxh, totals.tax, totals.ot, JSON.stringify(policySnapshot)]
    );
    await writeAudit(client, {
      user: actor, action: 'CALCULATE_PAYROLL', table: 'payroll_periods', recordId: periodRow.id, req,
      newValues: { period, headcount: employees.length, total_net: totals.net, policy_snapshot: policySnapshot },
    });
    return {
      period,
      headcount: employees.length,
      totalNet: totals.net,
      totalBhxh: totals.bhxh,
      totalTax: totals.tax,
      totalOtHours: totals.ot,
      policySnapshot,
    };
  });
}

function evaluateAnomalyRows(rows, otMonthlyLimit = OT_MONTHLY_LIMIT) {
  const out = [];
  const push = (r, type, severity, category, message, metric, limit) =>
    out.push({ type, severity, category, employee_id: r.employee_id, full_name: r.full_name, message, metric_value: metric ?? null, limit: limit ?? null });

  for (const r of rows) {
    const ot = Number(r.ot_hours || 0);
    if (ot > otMonthlyLimit) {
      push(r, 'OT_OVER_LIMIT', 'Cao', 'violation', `Làm thêm ${ot} giờ, vượt giới hạn ${otMonthlyLimit} giờ/tháng theo cấu hình chính sách`, ot, otMonthlyLimit);
    }
    const unapproved = Math.round((ot - Number(r.approved_ot || 0)) * 100) / 100;
    if (unapproved > 0) {
      push(r, 'OT_UNAPPROVED', 'Trung bình', 'unapproved', `${unapproved} giờ làm thêm chưa có đăng ký được duyệt`, unapproved);
    }
    if (!r.bank_account || !r.bank_name) {
      push(r, 'MISSING_BANK', 'Trung bình', 'payment', 'Chưa có thông tin tài khoản ngân hàng');
    }
    if (Number(r.att_days || 0) === 0) {
      push(r, 'NO_ATTENDANCE', 'Cao', 'violation', 'Không có dữ liệu chấm công trong kỳ (0 công, cần bổ sung chấm công hoặc xác nhận trước khi chốt)', 0, 1);
    } else if (r.actual_work_days !== undefined && r.actual_work_days !== null && Number(r.actual_work_days) === 0) {
      push(r, 'ZERO_WORKDAYS', 'Trung bình', 'data', 'Có dữ liệu chấm công nhưng 0 ngày công hưởng lương trong kỳ', 0);
    }
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.employee_id.localeCompare(b.employee_id));
}

/** Problems worth a human look before money moves. Computed from the period's payslips and current data. */
async function computeAnomalies(executor, periodRow) {
  const start = `${periodRow.period}-01`;
  const policy = await resolvePeriodPolicy(executor, periodRow);
  const otMonthlyLimit = Number(policy.max_ot_per_month) || OT_MONTHLY_LIMIT;

  const { rows } = await executor.query(
    `SELECT ps.employee_id, e.full_name, ps.actual_work_days, ps.ot_hours, ps.bank_account, ps.bank_name,
            (
              (SELECT COUNT(*) FROM attendance_logs a
                WHERE a.employee_id = ps.employee_id AND a.work_date >= $2::date AND a.work_date < ($2::date + INTERVAL '1 month'))
              +
              (SELECT COUNT(*) FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
                WHERE lr.employee_id = ps.employee_id AND lr.stage = 'DA_PHE_DUYET' AND lt.is_paid = TRUE
                  AND lr.start_date < ($2::date + INTERVAL '1 month') AND lr.end_date >= $2::date)
            ) AS att_days,
            (SELECT COALESCE(SUM(o.hours), 0) FROM ot_requests o
              WHERE o.employee_id = ps.employee_id AND o.stage = 'DA_PHE_DUYET'
                AND o.work_date >= $2::date AND o.work_date < ($2::date + INTERVAL '1 month')) AS approved_ot
       FROM payslips ps JOIN employees e ON e.id = ps.employee_id
      WHERE ps.period_id = $1`,
    [periodRow.id, start]
  );
  return evaluateAnomalyRows(rows, otMonthlyLimit);
}

async function anomalies(id) {
  return computeAnomalies(db, await findPeriod(db, id));
}

async function lock(actor, id, body = {}, req) {
  return db.withTransaction(async (client) => {
    const period = await findPeriod(client, id, { lock: true });
    if (period.status !== 'DU_THAO') throw new AppError(409, 'PERIOD_LOCKED', 'Kỳ lương đã được chốt');

    const count = await client.query('SELECT COUNT(*)::int AS n FROM payslips WHERE period_id = $1', [id]);
    if (count.rows[0].n === 0) throw new AppError(409, 'NO_PAYSLIPS', 'Chưa có phiếu lương, hãy tính lương trước khi chốt');

    const acknowledge = body?.acknowledgeAnomalies === true;
    const violations = (await computeAnomalies(client, period)).filter((a) => a.category === 'violation');
    if (violations.length > 0 && !acknowledge) {
      throw new AppError(409, 'ANOMALIES_PENDING', `Còn ${violations.length} vi phạm cần xử lý hoặc xác nhận trước khi chốt lương`, violations);
    }
    const policySnapshot = await resolvePeriodPolicy(client, period);
    const lockNote = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null;
    await client.query(
      `UPDATE payroll_periods
          SET status = 'DA_CHOT',
              locked_by = $2,
              locked_at = NOW(),
              note = COALESCE($4, note),
              policy_snapshot = COALESCE(policy_snapshot, $3::jsonb)
        WHERE id = $1`,
      [id, actor.employeeId ?? null, JSON.stringify(policySnapshot), lockNote]
    );
    await client.query("UPDATE payslips SET status = 'DA_CHOT' WHERE period_id = $1", [id]);
    await writeAudit(client, {
      user: actor,
      action: 'LOCK_PAYROLL',
      table: 'payroll_periods',
      recordId: id,
      req,
      oldValues: { status: 'DU_THAO' },
      newValues: {
        status: 'DA_CHOT',
        acknowledge_anomalies: acknowledge,
        acknowledged_violations: violations.length,
        acknowledged_violation_items: acknowledge
          ? violations.map((v) => ({
              type: v.type,
              employee_id: v.employee_id,
              employeeId: v.employeeId || v.employee_id,
              severity: v.severity,
            }))
          : [],
        note: lockNote,
      },
    });
    return findPeriod(client, id);
  });
}

async function transfer(actor, id, req) {
  return db.withTransaction(async (client) => {
    const period = await findPeriod(client, id, { lock: true });
    if (period.status !== 'DA_CHOT') {
      throw new AppError(409, 'INVALID_STATUS', period.status === 'DU_THAO' ? 'Kỳ lương chưa được chốt' : 'Kỳ lương đã chuyển khoản');
    }
    const missing = await client.query(
      `SELECT ps.employee_id, e.full_name FROM payslips ps JOIN employees e ON e.id = ps.employee_id
        WHERE ps.period_id = $1 AND (COALESCE(ps.bank_account, '') = '' OR COALESCE(ps.bank_name, '') = '') ORDER BY ps.employee_id`,
      [id]
    );
    if (missing.rows.length > 0) {
      throw new AppError(409, 'MISSING_BANK_ACCOUNT', `${missing.rows.length} nhân viên chưa có tài khoản ngân hàng`, missing.rows);
    }
    await client.query("UPDATE payroll_periods SET status = 'DA_CHUYEN_KHOAN' WHERE id = $1", [id]);
    await client.query("UPDATE payslips SET status = 'DA_CHUYEN_KHOAN', paid_date = CURRENT_DATE WHERE period_id = $1", [id]);
    await writeAudit(client, {
      user: actor, action: 'TRANSFER_PAYROLL', table: 'payroll_periods', recordId: id, req,
      oldValues: { status: 'DA_CHOT' }, newValues: { status: 'DA_CHUYEN_KHOAN' },
    });
    return findPeriod(client, id);
  });
}

async function bankTransfer(id) {
  const period = await findPeriod(db, id);
  if (!LOCKED.includes(period.status)) throw new AppError(409, 'INVALID_STATUS', 'Kỳ lương chưa được chốt');
  const { rows } = await db.query(
    `SELECT ps.employee_id, e.full_name, ps.bank_account, ps.bank_name, ps.net_salary
       FROM payslips ps JOIN employees e ON e.id = ps.employee_id WHERE ps.period_id = $1 ORDER BY ps.employee_id`,
    [id]
  );
  const payable = rows.filter((r) => r.bank_account && r.bank_name);
  return {
    period: period.period,
    status: period.status,
    count: payable.length,
    totalAmount: payable.reduce((sum, r) => sum + Number(r.net_salary), 0), // sum of the lines in this batch
    periodTotalNet: Number(period.total_net),
    items: payable.map((r) => ({
      employee_id: r.employee_id, full_name: r.full_name, bank_account: r.bank_account, bank_name: r.bank_name,
      amount: Number(r.net_salary), memo: `LUONG ${period.period} ${r.employee_id}`,
    })),
    missingBank: rows.filter((r) => !r.bank_account || !r.bank_name).map((r) => ({ employee_id: r.employee_id, full_name: r.full_name })),
  };
}

const PAYSLIP_SQL = `
  SELECT ps.*, pp.period, pp.status AS period_status, e.full_name, e.avatar_url, e.job_title, e.department_id,
         d.name AS department_name
    FROM payslips ps
    JOIN payroll_periods pp ON ps.period_id = pp.id
    JOIN employees e ON ps.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id`;

/** Employees (and managers) only ever see their own payslips, and only once the period is locked. */
async function listPayslips(user, query, scope) {
  const { page, limit, offset } = parsePagination(query, { defaultLimit: 100, maxLimit: 500 });
  const params = [];
  const where = [];
  const cond = await scopeCondition(db, user, scope, { employee: 'ps.employee_id', department: 'e.department_id' }, params);
  if (cond) where.push(cond);
  if (scope !== 'all') where.push("pp.status IN ('DA_CHOT', 'DA_CHUYEN_KHOAN')");
  if (query.period) {
    params.push(query.period);
    where.push(`pp.period = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = parseInt((await db.query(
    `SELECT COUNT(*) FROM payslips ps JOIN payroll_periods pp ON pp.id = ps.period_id JOIN employees e ON e.id = ps.employee_id ${clause}`, params)).rows[0].count, 10);
  const { rows } = await db.query(
    `${PAYSLIP_SQL} ${clause} ORDER BY pp.period DESC, e.full_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: rows, pagination: paginationMeta(total, page, limit) };
}

async function myPayslips(user) {
  if (!user.employeeId) throw forbidden('Tài khoản chưa được liên kết với hồ sơ nhân viên');
  const { rows } = await db.query(
    `${PAYSLIP_SQL} WHERE ps.employee_id = $1 AND pp.status IN ('DA_CHOT', 'DA_CHUYEN_KHOAN') ORDER BY pp.period DESC LIMIT 12`,
    [user.employeeId]
  );
  return rows;
}

async function getPayslip(user, id, scope) {
  const { rows } = await db.query(`${PAYSLIP_SQL} WHERE ps.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound('Không tìm thấy phiếu lương');
  if (scope !== 'all') {
    if (row.employee_id !== user.employeeId) throw forbidden('Bạn chỉ có thể xem phiếu lương của mình');
    if (!LOCKED.includes(row.period_status)) throw forbidden('Phiếu lương chưa được công bố');
  }
  return row;
}

async function updatePayslip(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const lookup = await client.query('SELECT period_id FROM payslips WHERE id = $1', [id]);
    if (lookup.rows.length === 0) throw notFound('Không tìm thấy phiếu lương');

    // Lock the parent payroll_periods row first to serialize cleanly against lock()/calculate()/transfer()
    const period = await findPeriod(client, lookup.rows[0].period_id, { lock: true });
    if (period.status !== 'DU_THAO') {
      throw new AppError(409, 'PERIOD_LOCKED', 'Không thể sửa phiếu lương khi kỳ lương đã được khóa hoặc chốt');
    }

    const { rows } = await client.query('SELECT * FROM payslips WHERE id = $1 FOR UPDATE', [id]);
    if (rows.length === 0) throw notFound('Không tìm thấy phiếu lương');
    const existing = rows[0];

    const policy = await resolvePeriodPolicy(client, period);

    const base = body.baseSalary !== undefined ? Number(body.baseSalary) : Number(existing.base_salary);
    const workDays = body.actualWorkDays !== undefined ? Number(body.actualWorkDays) : Number(existing.actual_work_days);
    const otHours = body.otHours !== undefined ? Number(body.otHours) : Number(existing.ot_hours);
    const allowances = body.allowances !== undefined ? Number(body.allowances) : Number(existing.allowances);
    const bonus = body.bonus !== undefined ? Number(body.bonus) : Number(existing.bonus || 0);
    const note = body.note !== undefined ? body.note : existing.note;

    const p = computePayslip({ base, workDays, otHours, allowances, bonus, policy });

    const updated = (await client.query(
      `UPDATE payslips SET
         base_salary = $2,
         actual_work_days = $3,
         standard_work_days = $4,
         ot_hours = $5,
         ot_pay = $6,
         allowances = $7,
         bonus = $8,
         gross_income = $9,
         bhxh_amount = $10,
         bhyt_amount = $11,
         bhtn_amount = $12,
         pit_deduction = $13,
         pit_taxable = $14,
         pit_amount = $15,
         total_deductions = $16,
         net_salary = $17,
         note = $18
       WHERE id = $1
       RETURNING *`,
      [
        id,
        base,
        p.workDays,
        p.standardWorkDays,
        otHours,
        p.otPay,
        p.allowances,
        bonus,
        p.grossIncome,
        p.bhxh,
        p.bhyt,
        p.bhtn,
        p.pitDeduction,
        p.pitTaxable,
        p.pitAmount,
        p.totalDeductions,
        p.netSalary,
        note,
      ]
    )).rows[0];

    // Recalculate totals on period
    const sumResult = await client.query(
      `SELECT COUNT(*)::int AS total_headcount,
              COALESCE(SUM(net_salary), 0) AS total_net,
              COALESCE(SUM(bhxh_amount), 0) AS total_bhxh,
              COALESCE(SUM(pit_amount), 0) AS total_tax,
              COALESCE(SUM(ot_hours), 0) AS total_ot
       FROM payslips WHERE period_id = $1`,
      [existing.period_id]
    );
    const sums = sumResult.rows[0];
    await client.query(
      `UPDATE payroll_periods SET total_headcount = $2, total_net = $3, total_bhxh = $4, total_tax = $5, total_ot_hours = $6 WHERE id = $1`,
      [existing.period_id, sums.total_headcount, sums.total_net, sums.total_bhxh, sums.total_tax, sums.total_ot]
    );

    await writeAudit(client, {
      user: actor, action: 'UPDATE_PAYSLIP', table: 'payslips', recordId: id, req,
      oldValues: { net_salary: existing.net_salary, bonus: existing.bonus, actual_work_days: existing.actual_work_days, allowances: existing.allowances },
      newValues: { net_salary: updated.net_salary, bonus: updated.bonus, actual_work_days: updated.actual_work_days, allowances: updated.allowances, note: updated.note },
    });

    return updated;
  });
}

module.exports = {
  listPeriods,
  getPeriod,
  calculate,
  anomalies,
  evaluateAnomalyRows,
  computeApprovedPaidLeaveDays,
  lock,
  transfer,
  bankTransfer,
  listPayslips,
  myPayslips,
  getPayslip,
  updatePayslip,
};
