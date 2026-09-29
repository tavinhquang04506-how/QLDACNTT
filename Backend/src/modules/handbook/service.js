const db = require('../../config/db');
const { forbidden, notFound } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');

const HR_ROLES = ['CEO', 'HR_DIRECTOR'];
const META = 'id, title, category, version, is_active, updated_by, created_at, updated_at';

async function list(user, query) {
  const { page, limit, offset } = parsePagination(query, { defaultLimit: 50, maxLimit: 100 });
  const where = [];
  const params = [];
  if (query.all === 'true') {
    if (!HR_ROLES.includes(user.roleCode)) throw forbidden('Chỉ HR và CEO mới xem được toàn bộ cẩm nang');
  } else {
    where.push('is_active');
  }
  if (query.category) {
    params.push(query.category);
    where.push(`category = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT COUNT(*)::int AS n FROM handbook_docs ${clause}`, params)).rows[0].n;
  const { rows } = await db.query(
    `SELECT ${META}, LEFT(content, 200) AS excerpt FROM handbook_docs ${clause} ORDER BY category, title, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: rows, pagination: paginationMeta(total, page, limit) };
}

async function categories() {
  return (await db.query('SELECT DISTINCT category FROM handbook_docs WHERE is_active ORDER BY category')).rows.map((r) => r.category);
}

async function get(user, id) {
  const { rows } = await db.query(`SELECT ${META}, content FROM handbook_docs WHERE id = $1`, [id]);
  const doc = rows[0];
  if (!doc || (!doc.is_active && !HR_ROLES.includes(user.roleCode))) throw notFound('Không tìm thấy tài liệu');
  return doc;
}

async function create(actor, body, req) {
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO handbook_docs (title, category, content, updated_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [body.title, body.category, body.content, actor.employeeId ?? null]
    );
    await writeAudit(client, { user: actor, action: 'CREATE_HANDBOOK', table: 'handbook_docs', recordId: rows[0].id, req, newValues: { title: body.title, category: body.category } });
    return (await client.query(`SELECT ${META}, content FROM handbook_docs WHERE id = $1`, [rows[0].id])).rows[0];
  });
}

async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const before = (await client.query('SELECT * FROM handbook_docs WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!before) throw notFound('Không tìm thấy tài liệu');
    const contentChanged = body.content !== undefined && body.content !== before.content;
    await client.query(
      `UPDATE handbook_docs SET title = COALESCE($2, title), category = COALESCE($3, category), content = COALESCE($4, content),
              is_active = COALESCE($5, is_active), version = version + $6, updated_by = $7 WHERE id = $1`,
      [id, body.title ?? null, body.category ?? null, body.content ?? null, body.isActive ?? null, contentChanged ? 1 : 0, actor.employeeId ?? null]
    );
    await writeAudit(client, {
      user: actor, action: 'UPDATE_HANDBOOK', table: 'handbook_docs', recordId: id, req,
      oldValues: { title: before.title, version: before.version }, newValues: { ...body, content: body.content === undefined ? undefined : '[updated]' },
    });
    return (await client.query(`SELECT ${META}, content FROM handbook_docs WHERE id = $1`, [id])).rows[0];
  });
}

async function deactivate(actor, id, req) {
  return db.withTransaction(async (client) => {
    const res = await client.query('UPDATE handbook_docs SET is_active = FALSE, updated_by = $2 WHERE id = $1 RETURNING title', [id, actor.employeeId ?? null]);
    if (res.rowCount === 0) throw notFound('Không tìm thấy tài liệu');
    await writeAudit(client, { user: actor, action: 'DEACTIVATE_HANDBOOK', table: 'handbook_docs', recordId: id, req, oldValues: { title: res.rows[0].title } });
  });
}

module.exports = { list, categories, get, create, update, deactivate };
