const db = require('../../config/db');
const { forbidden, notFound, conflict } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { departmentOf } = require('../projects/access');
const { computeTurnoverRisk } = require('./risk');

const HR_ROLES = ['CEO', 'HR_DIRECTOR'];

const METRICS_SQL = `
  SELECT e.id AS employee_id, e.full_name, e.job_title, e.avatar_url, e.department_id, d.name AS department_name, p.name AS position_name, e.status,
         e.base_salary::float8 AS salary,
         CASE WHEN peers.n >= 3 THEN peers.avg END AS peer_avg,
         COALESCE(ot.recent, 0)::float8 AS ot_recent, COALESCE(ot.prev, 0)::float8 AS ot_prev,
         (EXTRACT(YEAR FROM age(CURRENT_DATE, changed.d)) * 12 + EXTRACT(MONTH FROM age(CURRENT_DATE, changed.d)))::int AS months_since_change,
         rv.latest::float8 AS latest_performance, rv.previous::float8 AS previous_performance,
         COALESCE(ab.n, 0)::int AS unpaid_absences_60, COALESCE(lt.n, 0)::int AS late_count_30
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p ON p.id = e.position_id
    LEFT JOIN LATERAL (SELECT COUNT(*) AS n, AVG(x.base_salary)::float8 AS avg FROM employees x
                        WHERE x.position_id = e.position_id AND x.id <> e.id AND x.status IN ('DANG_LAM_VIEC', 'THU_VIEC')) peers ON TRUE
    LEFT JOIN LATERAL (SELECT SUM(a.ot_hours) FILTER (WHERE a.work_date > CURRENT_DATE - 30) AS recent,
                              SUM(a.ot_hours) FILTER (WHERE a.work_date <= CURRENT_DATE - 30 AND a.work_date > CURRENT_DATE - 60) AS prev
                         FROM attendance_logs a WHERE a.employee_id = e.id AND a.work_date > CURRENT_DATE - 60) ot ON TRUE
    LEFT JOIN LATERAL (SELECT GREATEST(e.joined_date, COALESCE(MAX(c.start_date), e.joined_date)) AS d
                         FROM contracts c WHERE c.employee_id = e.id AND c.status <> 'CHO_KY') changed ON TRUE
    LEFT JOIN LATERAL (SELECT (array_agg(r.performance_score ORDER BY (substring(r.period, 1, 4)::int * 100 + CASE substring(r.period FROM 6) WHEN 'Q1' THEN 3 WHEN 'Q2' THEN 6 WHEN 'Q3' THEN 9 WHEN 'H1' THEN 6 ELSE 12 END) DESC, r.period DESC))[1] AS latest,
                              (array_agg(r.performance_score ORDER BY (substring(r.period, 1, 4)::int * 100 + CASE substring(r.period FROM 6) WHEN 'Q1' THEN 3 WHEN 'Q2' THEN 6 WHEN 'Q3' THEN 9 WHEN 'H1' THEN 6 ELSE 12 END) DESC, r.period DESC))[2] AS previous
                         FROM performance_reviews r WHERE r.employee_id = e.id) rv ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS n FROM attendance_logs a WHERE a.employee_id = e.id AND a.status = 'VANG_KHONG_PHEP'
                          AND a.work_date > CURRENT_DATE - 60) ab ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS n FROM attendance_logs a WHERE a.employee_id = e.id AND a.status = 'DI_MUON'
                          AND a.work_date > CURRENT_DATE - 30) lt ON TRUE`;

function toRisk(r, user) {
  const risk = computeTurnoverRisk({
    salary: r.salary, peerAvgSalary: r.peer_avg, otRecent: r.ot_recent, otPrev: r.ot_prev, monthsSinceChange: r.months_since_change,
    latestPerformance: r.latest_performance, previousPerformance: r.previous_performance,
    unpaidAbsences60: r.unpaid_absences_60, lateCount30: r.late_count_30,
  });

  // Mask confidential peer salary gap details for LINE_MANAGER
  if (user && user.roleCode === 'LINE_MANAGER' && Array.isArray(risk.signals)) {
    risk.signals = risk.signals.map((s) => {
      if (s.code === 'PAY_GAP') {
        return {
          ...s,
          title: 'Dấu hiệu đãi ngộ chưa cạnh tranh',
          detail: 'Chế độ đãi ngộ có dấu hiệu chưa phù hợp với mặt bằng chung (Bộ phận Nhân sự trực tiếp thẩm định)',
        };
      }
      return s;
    });
  }

  return {
    employee_id: r.employee_id, full_name: r.full_name, job_title: r.job_title, avatar_url: r.avatar_url, department_id: r.department_id,
    department_name: r.department_name, position_name: r.position_name, ...risk,
  };
}

/** Everyone the user may see, scored. Always excludes the caller themselves. */
async function scoreScope(user, scope) {
  const params = [];
  const where = ["e.status IN ('DANG_LAM_VIEC', 'THU_VIEC')"];
  if (scope !== 'all' && scope !== 'department') throw new Error(`Unknown scope "${scope}"`);
  if (user?.employeeId) {
    params.push(user.employeeId);
    where.push(`e.id <> $${params.length}`);
  }
  if (scope === 'department') {
    const dept = await departmentOf(db, user.employeeId);
    if (!dept) return [];
    params.push(dept);
    where.push(`e.department_id = $${params.length}`);
  }
  const { rows } = await db.query(`${METRICS_SQL} WHERE ${where.join(' AND ')}`, params);
  return rows.map((r) => toRisk(r, user));
}

async function list(user, query, scope) {
  const { page, limit, offset } = parsePagination(query, { defaultLimit: 50, maxLimit: 200 });
  let all = await scoreScope(user, scope);
  if (query.level) all = all.filter((r) => r.level === query.level);
  if (query.departmentId && query.departmentId !== 'all') {
    all = all.filter((r) => r.department_id === query.departmentId);
  }
  all.sort((a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name));
  return { data: all.slice(offset, offset + limit), pagination: paginationMeta(all.length, page, limit) };
}

async function get(user, employeeId, scope) {
  const { rows } = await db.query(`${METRICS_SQL} WHERE e.id = $1`, [employeeId]);
  if (!rows[0]) throw notFound('Không tìm thấy nhân viên');
  if (user?.employeeId && employeeId === user.employeeId) {
    throw forbidden('Không thể xem dữ liệu rủi ro của chính mình');
  }
  if (!HR_ROLES.includes(user.roleCode)) {
    const dept = scope === 'department' ? await departmentOf(db, user.employeeId) : null;
    if (!dept || dept !== rows[0].department_id) throw forbidden('Bạn không có quyền xem dữ liệu này');
  }
  if (!['DANG_LAM_VIEC', 'THU_VIEC'].includes(rows[0].status)) throw conflict('Nhân viên đã nghỉ việc');
  return toRisk(rows[0], user);
}

async function atRiskCount(user, scope) {
  return (await scoreScope(user, scope)).filter((r) => r.level === 'Cao').length;
}

module.exports = { list, get, atRiskCount };
