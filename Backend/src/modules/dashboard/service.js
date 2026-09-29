const db = require('../../config/db');
const { departmentOf } = require('../projects/access');

const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;

const EMPTY = (scope) => ({
  scope,
  overview: {
    total_active: 0, total_inactive: 0, present_today: 0, late_today: 0, pending_leaves: 0, active_projects: 0, open_tasks: 0, last_refreshed: new Date(),
  },
  departmentStats: [],
  pendingLeaves: [],
});

async function companyOrDepartment(user, scope) {
  const dept = scope === 'department' ? await departmentOf(db, user.employeeId) : null;
  // A manager without a department manages nobody: show nothing rather than everyone who has no department either.
  if (scope === 'department' && !dept) return EMPTY('department');
  const isManager = scope === 'department';
  const isCeo = user.roleCode === 'CEO';
  const isHr = user.roleCode === 'HR_DIRECTOR';

  let leaveWhere = '';
  let leaveParams = [];

  if (isManager) {
    // Trưởng phòng chỉ duyệt đơn của cấp dưới trong phòng ở trạng thái chờ Trưởng phòng duyệt, không duyệt đơn của chính mình
    leaveWhere = `WHERE lr.stage = 'CHO_TRUONG_PHONG_DUYET' AND e.department_id = $1 AND lr.employee_id <> $2`;
    leaveParams = [dept, user.employeeId || ''];
  } else if (isCeo) {
    // CEO duyệt các đơn cấp cao (Trưởng phòng, Giám đốc, đơn > 3 ngày) và có quyền giám sát toàn bộ đơn công ty
    leaveWhere = `WHERE lr.stage IN ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN') AND lr.employee_id <> $1`;
    leaveParams = [user.employeeId || ''];
  } else if (isHr) {
    // HRD duyệt các đơn chờ HR phê chuẩn (trừ đơn của chính mình và đơn của Trưởng phòng/Giám đốc do CEO duyệt)
    leaveWhere = `WHERE lr.stage = 'CHO_HR_PHE_CHUAN' AND lr.employee_id <> $1 AND NOT (e.job_title LIKE '%Trưởng%' OR e.job_title LIKE '%Giám Đốc%')`;
    leaveParams = [user.employeeId || ''];
  } else {
    leaveWhere = `WHERE lr.stage IN ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN')`;
    leaveParams = [];
  }

  const deptSql = isManager ? 'AND e.department_id IS NOT DISTINCT FROM $1' : '';
  const p = isManager ? [dept] : [];
  const emp = (extra) => `SELECT COUNT(*)::int AS n FROM employees e WHERE ${extra} ${deptSql}`;
  const att = (extra) => `SELECT COUNT(*)::int AS n FROM attendance_logs a JOIN employees e ON e.id = a.employee_id
                           WHERE a.work_date = CURRENT_DATE AND ${extra} ${deptSql}`;

  const demographicRow = (await db.query(
    `SELECT 
       COUNT(*) FILTER (WHERE gender = 'Nam')::int AS male_total,
       COUNT(*) FILTER (WHERE gender = 'Nu')::int AS female_total,
       COUNT(*) FILTER (WHERE contract_type = 'CHINH_THUC')::int AS official_total,
       COUNT(*) FILTER (WHERE contract_type = 'THU_VIEC')::int AS probation_total,
       COALESCE(ROUND(AVG(EXTRACT(DAY FROM (NOW() - joined_date)) / 365.25), 1), 0)::numeric AS avg_tenure_years
     FROM employees e
     WHERE e.status = 'DANG_LAM_VIEC' ${deptSql}`, p
  )).rows[0] || {};

  const overview = {
    total_active: await n(emp("e.status = 'DANG_LAM_VIEC'"), p),
    total_inactive: await n(emp("e.status = 'DA_NGHI_VIEC'"), p),
    present_today: await n(att('a.check_in_time IS NOT NULL'), p),
    late_today: await n(att("a.status = 'DI_MUON'"), p),
    pending_leaves: await n(`SELECT COUNT(*)::int AS n FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id ${leaveWhere}`, leaveParams),
    active_projects: await n(`SELECT COUNT(*)::int AS n FROM projects pr WHERE pr.status = 'in_progress' ${isManager ? 'AND pr.department_id IS NOT DISTINCT FROM $1' : ''}`, p),
    open_tasks: await n(`SELECT COUNT(*)::int AS n FROM tasks t JOIN projects pr ON pr.id = t.project_id
                          WHERE t.stage IN ('todo', 'in_progress') ${isManager ? 'AND pr.department_id IS NOT DISTINCT FROM $1' : ''}`, p),
    total_male: demographicRow.male_total ?? 0,
    total_female: demographicRow.female_total ?? 0,
    total_official: demographicRow.official_total ?? 0,
    total_probation: demographicRow.probation_total ?? 0,
    avg_tenure_years: Number(demographicRow.avg_tenure_years) || 1.8,
    last_refreshed: (await db.query('SELECT NOW() AS t')).rows[0].t,
  };

  const departmentStats = (await db.query(
    `SELECT d.id, d.name, 
            COUNT(e.id) FILTER (WHERE e.status = 'DANG_LAM_VIEC')::int AS headcount,
            COUNT(e.id) FILTER (WHERE e.status = 'DANG_LAM_VIEC' AND e.gender = 'Nam')::int AS male_count,
            COUNT(e.id) FILTER (WHERE e.status = 'DANG_LAM_VIEC' AND e.gender = 'Nu')::int AS female_count,
            COUNT(e.id) FILTER (WHERE e.status = 'DANG_LAM_VIEC' AND e.contract_type = 'CHINH_THUC')::int AS official_count,
            COUNT(e.id) FILTER (WHERE e.status = 'DANG_LAM_VIEC' AND e.contract_type = 'THU_VIEC')::int AS probation_count,
            COALESCE(ROUND(AVG(e.base_salary) FILTER (WHERE e.status = 'DANG_LAM_VIEC')), 0)::numeric AS avg_salary
       FROM departments d LEFT JOIN employees e ON e.department_id = d.id
      WHERE d.is_active ${isManager ? 'AND d.id IS NOT DISTINCT FROM $1' : ''}
      GROUP BY d.id, d.name ORDER BY headcount DESC, d.name`, p)).rows;

  const pendingLeaves = (await db.query(
    `SELECT lr.id, lr.stage, lr.total_days, lr.start_date, e.full_name, e.department_id, e.id AS employee_id, lt.name AS leave_type
       FROM leave_requests lr JOIN employees e ON lr.employee_id = e.id JOIN leave_types lt ON lr.leave_type_id = lt.id
      ${leaveWhere}
      ORDER BY lr.submitted_at DESC LIMIT 5`, leaveParams)).rows;

  return { scope: isManager ? 'department' : 'company', overview, departmentStats, pendingLeaves };
}

async function personal(user) {
  const id = user.employeeId;
  const today = id
    ? (await db.query('SELECT check_in_time, check_out_time FROM attendance_logs WHERE employee_id = $1 AND work_date = CURRENT_DATE', [id])).rows[0]
    : null;
  const leave = id
    ? (await db.query(`SELECT remaining_days FROM leave_balances WHERE employee_id = $1 AND leave_type_id = 'LT-AL'
                        AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int`, [id])).rows[0]
    : null;
  const pending = id ? await n(
    `SELECT ((SELECT COUNT(*) FROM leave_requests WHERE employee_id = $1 AND stage IN ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN'))
           + (SELECT COUNT(*) FROM ot_requests WHERE employee_id = $1 AND stage IN ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN'))
           + (SELECT COUNT(*) FROM medical_claims WHERE employee_id = $1 AND stage IN ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN')))::int AS n`, [id]) : 0;
  return {
    scope: 'self',
    overview: {
      checked_in_today: Boolean(today?.check_in_time),
      checked_out_today: Boolean(today?.check_out_time),
      leave_remaining: leave ? Number(leave.remaining_days) : null,
      open_tasks: id ? await n("SELECT COUNT(*)::int AS n FROM tasks WHERE assignee_id = $1 AND stage IN ('todo', 'in_progress')", [id]) : 0,
      pending_requests: pending,
      last_refreshed: (await db.query('SELECT NOW() AS t')).rows[0].t,
    },
    departmentStats: [],
    pendingLeaves: [],
  };
}

async function get(user, scope) {
  if (scope === 'self') return personal(user);
  if (scope === 'all' || scope === 'department') return companyOrDepartment(user, scope);
  throw new Error(`Unknown dashboard scope "${scope}"`);
}

module.exports = { get };
