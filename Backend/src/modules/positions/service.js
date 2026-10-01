const db = require('../../config/db');
const { notFound, AppError } = require('../../utils/AppError');
const { writeAudit } = require('../../utils/audit');

const COLS = 'id, name, level, description, is_active, created_at';

async function findPosition(executor, id) {
  const { rows } = await executor.query(`SELECT ${COLS} FROM positions WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function list({ includeInactive }) {
  const where = includeInactive === 'true' ? '' : 'WHERE is_active = TRUE';
  const { rows } = await db.query(`SELECT ${COLS} FROM positions ${where} ORDER BY level DESC, name`);
  return rows;
}

async function get(id) {
  const pos = await findPosition(db, id);
  if (!pos) throw notFound('Không tìm thấy chức danh');
  return pos;
}

async function create(actor, body, req) {
  const id = `POS-${body.code}`;
  return db.withTransaction(async (client) => {
    await client.query(
      'INSERT INTO positions (id, name, level, description) VALUES ($1, $2, $3, $4)',
      [id, body.name, body.level ?? 0, body.description ?? null]
    );
    await writeAudit(client, {
      user: actor, action: 'CREATE_POSITION', table: 'positions', recordId: id, req,
      newValues: { name: body.name, level: body.level ?? 0 },
    });
    return findPosition(client, id);
  });
}

const COLUMNS = { name: 'name', level: 'level', description: 'description', isActive: 'is_active' };

async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    const before = await findPosition(client, id);
    if (!before) throw notFound('Không tìm thấy chức danh');

    const sets = [];
    const params = [id];
    for (const [key, column] of Object.entries(COLUMNS)) {
      if (body[key] !== undefined) {
        params.push(body[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    await client.query(`UPDATE positions SET ${sets.join(', ')} WHERE id = $1`, params);
    await writeAudit(client, {
      user: actor, action: 'UPDATE_POSITION', table: 'positions', recordId: id, req,
      oldValues: { name: before.name, level: before.level, description: before.description, is_active: before.is_active },
      newValues: body,
    });
    return findPosition(client, id);
  });
}

async function deactivate(actor, id, req) {
  return db.withTransaction(async (client) => {
    const pos = await findPosition(client, id);
    if (!pos) throw notFound('Không tìm thấy chức danh');

    const { rows } = await client.query(
      "SELECT COUNT(*)::int AS n FROM employees WHERE position_id = $1 AND status <> 'DA_NGHI_VIEC'",
      [id]
    );
    if (rows[0].n > 0) {
      throw new AppError(409, 'POSITION_IN_USE', `Chức danh đang được ${rows[0].n} nhân viên sử dụng`);
    }
    await client.query('UPDATE positions SET is_active = FALSE WHERE id = $1', [id]);
    await writeAudit(client, {
      user: actor, action: 'DEACTIVATE_POSITION', table: 'positions', recordId: id, req,
      oldValues: { is_active: pos.is_active }, newValues: { is_active: false },
    });
  });
}

module.exports = { list, get, create, update, deactivate };
