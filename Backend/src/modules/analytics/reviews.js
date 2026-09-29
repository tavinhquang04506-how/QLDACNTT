const db = require('../../config/db');
const { forbidden, notFound, conflict } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { scopeCondition } = require('../../utils/scope');
const { departmentOf } = require('../projects/access');
const { cellOf, CELLS } = require('./nineBox');

const HR_ROLES = ['CEO', 'HR_DIRECTOR'];
const COLS = `r.id, r.employee_id, r.period, r.reviewer_id, r.performance_score, r.potential_score, r.nine_box_cell, r.comments, r.created_at, r.updated_at,
  e.full_name, e.department_id, rv.full_name AS reviewer_name`;
const FROM = `FROM performance_reviews r JOIN employees e ON e.id = r.employee_id LEFT JOIN employees rv ON rv.id = r.reviewer_id`;

async function findReview(executor, id) {
  const { rows } = await executor.query(`SELECT ${COLS} ${FROM} WHERE r.id = $1`, [id]);
  return rows[0] || null;
}

/** HR/CEO may review anyone but themselves; a manager only members of their own department (never themselves). */
async function assertMayReview(executor, actor, employee) {
  if (employee.id === actor.employeeId) throw forbidden('Bạn không thể tự đánh giá bản thân');
  if (HR_ROLES.includes(actor.roleCode)) return;
  const dept = await departmentOf(executor, actor.employeeId);
  if (!dept || dept !== employee.department_id) throw forbidden('Bạn chỉ đánh giá được nhân viên thuộc phòng ban của mình');
}

async function list(user, query, scope) {
  const { page, limit, offset } = parsePagination(query, { defaultLimit: 50, maxLimit: 200 });
  const params = [];
  const where = [];
  const cond = await scopeCondition(db, user, scope, { employee: 'r.employee_id', department: 'e.department_id' }, params);
  if (cond) where.push(cond);
  if (query.employeeId) { params.push(query.employeeId); where.push(`r.employee_id = $${params.length}`); }
  if (query.period) { params.push(query.period); where.push(`r.period = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT COUNT(*)::int AS n ${FROM} ${clause}`, params)).rows[0].n;
  const { rows } = await db.query(`SELECT ${COLS} ${FROM} ${clause} ORDER BY r.period DESC, e.full_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
  return { data: rows, pagination: paginationMeta(total, page, limit) };
}

async function create(actor, body, req) {
  return db.withTransaction(async (client) => {
    const emp = (await client.query('SELECT id, department_id, status FROM employees WHERE id = $1', [body.employeeId])).rows[0];
    if (!emp) throw notFound('Không tìm thấy nhân viên');
    await assertMayReview(client, actor, emp);
    if (emp.status === 'DA_NGHI_VIEC') throw conflict('Nhân viên đã nghỉ việc, không thể đánh giá');
    const cell = cellOf(body.performanceScore, body.potentialScore);
    const { rows } = await client.query(
      `INSERT INTO performance_reviews (employee_id, period, reviewer_id, performance_score, potential_score, nine_box_cell, comments)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [body.employeeId, body.period, actor.employeeId ?? null, body.performanceScore, body.potentialScore, cell, body.comments ?? null]
    );
    await writeAudit(client, {
      user: actor, action: 'CREATE_REVIEW', table: 'performance_reviews', recordId: rows[0].id, req,
      newValues: { employee_id: body.employeeId, period: body.period, nine_box_cell: cell },
    });
    return findReview(client, rows[0].id);
  });
}

async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const before = await findReview(client, id);
    if (!before) throw notFound('Không tìm thấy đánh giá');
    await assertMayReview(client, actor, { id: before.employee_id, department_id: before.department_id });
    const performance = body.performanceScore ?? Number(before.performance_score);
    const potential = body.potentialScore ?? Number(before.potential_score);
    const comments = body.comments === undefined ? before.comments : body.comments;
    await client.query(
      `UPDATE performance_reviews SET performance_score = $2, potential_score = $3, nine_box_cell = $4, comments = $5, reviewer_id = $6 WHERE id = $1`,
      [id, performance, potential, cellOf(performance, potential), comments, actor.employeeId ?? before.reviewer_id]
    );
    await writeAudit(client, {
      user: actor, action: 'UPDATE_REVIEW', table: 'performance_reviews', recordId: id, req,
      oldValues: { performance_score: before.performance_score, potential_score: before.potential_score, nine_box_cell: before.nine_box_cell },
      newValues: { performance_score: performance, potential_score: potential },
    });
    return findReview(client, id);
  });
}

async function remove(actor, id, req) {
  return db.withTransaction(async (client) => {
    const res = await client.query('DELETE FROM performance_reviews WHERE id = $1 RETURNING employee_id, period', [id]);
    if (res.rowCount === 0) throw notFound('Không tìm thấy đánh giá');
    await writeAudit(client, { user: actor, action: 'DELETE_REVIEW', table: 'performance_reviews', recordId: id, req, oldValues: res.rows[0] });
  });
}

async function resolvePeriod(period) {
  if (period) return period;
  const { rows } = await db.query("SELECT r.period FROM performance_reviews r ORDER BY (substring(r.period, 1, 4)::int * 100 + CASE substring(r.period FROM 6) WHEN 'Q1' THEN 3 WHEN 'Q2' THEN 6 WHEN 'Q3' THEN 9 WHEN 'H1' THEN 6 ELSE 12 END) DESC, r.period DESC LIMIT 1");
  return rows[0]?.period ?? null;
}

async function nineBox(user, query, scope) {
  const period = await resolvePeriod(query.period);
  const params = [period];
  const cond = await scopeCondition(db, user, scope, { employee: 'r.employee_id', department: 'e.department_id' }, params);
  const { rows } = period
    ? await db.query(
      `SELECT r.employee_id, e.full_name, e.department_id, r.performance_score, r.potential_score, r.nine_box_cell
         ${FROM} WHERE r.period = $1 ${cond ? `AND ${cond}` : ''} ORDER BY e.full_name`, params)
    : { rows: [] };
  const data = [...CELLS].reverse().map((c) => {
    const employees = rows.filter((r) => r.nine_box_cell === c.cell)
      .map((r) => ({ employee_id: r.employee_id, full_name: r.full_name, department_id: r.department_id, performance_score: Number(r.performance_score), potential_score: Number(r.potential_score) }));
    return { ...c, count: employees.length, employees };
  });
  return { period, data };
}

async function departmentScores(user, query, scope) {
  const period = await resolvePeriod(query.period);
  const params = [period];
  const cond = await scopeCondition(db, user, scope, { employee: 'r.employee_id', department: 'e.department_id' }, params);
  const { rows } = period
    ? await db.query(
      `SELECT d.id AS department_id, d.name, ROUND(AVG(r.performance_score), 1)::float AS score, COUNT(*)::int AS reviewed
         FROM performance_reviews r JOIN employees e ON e.id = r.employee_id JOIN departments d ON d.id = e.department_id
        WHERE r.period = $1 ${cond ? `AND ${cond}` : ''} GROUP BY d.id, d.name ORDER BY score DESC, d.name`, params)
    : { rows: [] };
  return { period, data: rows };
}

module.exports = { list, create, update, remove, nineBox, departmentScores, resolvePeriod };
