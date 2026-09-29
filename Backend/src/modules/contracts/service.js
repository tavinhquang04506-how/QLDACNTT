const db = require('../../config/db');
const { AppError, badRequest, forbidden, notFound, conflict } = require('../../utils/AppError');
const { writeAudit, setAuditActor } = require('../../utils/audit');

const COLS = `id, employee_id, contract_no, type, start_date, end_date, salary, status, file_url, signed_at, note, created_at, updated_at`;

async function findContract(executor, id, { lock = false } = {}) {
  const { rows } = await executor.query(`SELECT ${COLS} FROM contracts WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] || null;
}

/** Owners may read their own contracts; HR and CEO read everything. */
function assertCanRead(scope, user, employeeId) {
  if (scope === 'self' && employeeId !== user.employeeId) throw forbidden('Bạn chỉ có thể xem hợp đồng của chính mình');
}

async function lockEmployee(client, employeeId) {
  const { rows } = await client.query('SELECT id, status FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);
  if (rows.length === 0) throw notFound('Không tìm thấy nhân viên');
  return rows[0];
}

/** End the employee's active contract the day before `newStart`; refuse if the new one does not start later. */
async function closeActiveContract(client, employeeId, newStart, exceptId) {
  const { rows } = await client.query(
    `SELECT id, start_date FROM contracts WHERE employee_id = $1 AND status = 'HIEU_LUC' AND id <> COALESCE($2, '') FOR UPDATE`,
    [employeeId, exceptId ?? null]
  );
  const active = rows[0];
  if (!active) return;
  if (newStart <= active.start_date) {
    throw new AppError(409, 'CONTRACT_OVERLAP', 'Hợp đồng mới phải bắt đầu sau ngày bắt đầu của hợp đồng đang hiệu lực');
  }
  await client.query(
    `UPDATE contracts SET status = 'DA_CHAM_DUT',
            end_date = LEAST(COALESCE(end_date, $2::date - 1), $2::date - 1)
      WHERE id = $1`,
    [active.id, newStart]
  );
}

async function syncEmployee(client, employeeId, salary, type) {
  await client.query('UPDATE employees SET base_salary = $2, contract_type = $3 WHERE id = $1', [employeeId, salary, type]);
}

async function listForEmployee(user, employeeId, scope) {
  assertCanRead(scope, user, employeeId);
  const emp = await db.query('SELECT 1 FROM employees WHERE id = $1', [employeeId]);
  if (emp.rows.length === 0) throw notFound('Không tìm thấy nhân viên');
  const { rows } = await db.query(`SELECT ${COLS} FROM contracts WHERE employee_id = $1 ORDER BY start_date DESC, id DESC`, [employeeId]);
  return rows;
}

async function get(user, id, scope) {
  const contract = await findContract(db, id);
  if (!contract) throw notFound('Không tìm thấy hợp đồng');
  assertCanRead(scope, user, contract.employee_id);
  return contract;
}

async function create(actor, employeeId, body, req) {
  return db.withTransaction(async (client) => {
    await setAuditActor(client, actor);
    const emp = await lockEmployee(client, employeeId);
    if (emp.status === 'DA_NGHI_VIEC') throw conflict('Nhân viên đã nghỉ việc, không thể tạo hợp đồng mới');

    const status = body.status ?? 'HIEU_LUC';
    if (status === 'HIEU_LUC') await closeActiveContract(client, employeeId, body.startDate);

    const contractNo = body.contractNo
      ?? (await client.query("SELECT 'HDLD-' || $1::text || '-' || nextval('seq_contract_id') AS no", [employeeId])).rows[0].no;
    const { rows } = await client.query(
      `INSERT INTO contracts (employee_id, contract_no, type, start_date, end_date, salary, status, file_url, signed_at, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [employeeId, contractNo, body.type, body.startDate, body.endDate ?? null, body.salary, status,
        body.fileUrl ?? null, body.signedAt ?? null, body.note ?? null]
    );
    if (status === 'HIEU_LUC') await syncEmployee(client, employeeId, body.salary, body.type);

    await writeAudit(client, {
      user: actor, action: 'CREATE_CONTRACT', table: 'contracts', recordId: rows[0].id, req,
      newValues: { employee_id: employeeId, contract_no: contractNo, type: body.type, salary: body.salary, status, start_date: body.startDate },
    });
    return findContract(client, rows[0].id);
  });
}

async function update(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    await setAuditActor(client, actor);
    // Lock order is always employee first, then contract (same as create/activate) to avoid deadlocks.
    const pre = await findContract(client, id);
    if (!pre) throw notFound('Không tìm thấy hợp đồng');
    await lockEmployee(client, pre.employee_id);
    const before = await findContract(client, id, { lock: true });
    if (!['CHO_KY', 'HIEU_LUC'].includes(before.status)) throw conflict('Hợp đồng đã kết thúc, không thể chỉnh sửa');
    if (body.endDate && body.endDate < before.start_date) throw badRequest('Ngày kết thúc không được trước ngày bắt đầu');

    const columns = { salary: 'salary', endDate: 'end_date', fileUrl: 'file_url', signedAt: 'signed_at', note: 'note' };
    const sets = [];
    const params = [id];
    for (const [key, column] of Object.entries(columns)) {
      if (body[key] !== undefined) {
        params.push(body[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    await client.query(`UPDATE contracts SET ${sets.join(', ')} WHERE id = $1`, params);
    if (before.status === 'HIEU_LUC' && body.salary !== undefined) {
      await syncEmployee(client, before.employee_id, body.salary, before.type);
    }
    await writeAudit(client, {
      user: actor, action: 'UPDATE_CONTRACT', table: 'contracts', recordId: id, req,
      oldValues: { salary: before.salary, end_date: before.end_date, note: before.note },
      newValues: body,
    });
    return findContract(client, id);
  });
}

async function activate(actor, id, req) {
  return db.withTransaction(async (client) => {
    await setAuditActor(client, actor);
    const pre = await findContract(client, id);
    if (!pre) throw notFound('Không tìm thấy hợp đồng');
    const emp = await lockEmployee(client, pre.employee_id);
    const contract = await findContract(client, id, { lock: true });
    if (contract.status !== 'CHO_KY') throw conflict('Chỉ có thể kích hoạt hợp đồng đang chờ ký');
    if (emp.status === 'DA_NGHI_VIEC') throw conflict('Nhân viên đã nghỉ việc');

    await closeActiveContract(client, contract.employee_id, contract.start_date, id);
    await client.query("UPDATE contracts SET status = 'HIEU_LUC' WHERE id = $1", [id]);
    await syncEmployee(client, contract.employee_id, contract.salary, contract.type);
    await writeAudit(client, {
      user: actor, action: 'ACTIVATE_CONTRACT', table: 'contracts', recordId: id, req,
      oldValues: { status: 'CHO_KY' }, newValues: { status: 'HIEU_LUC' },
    });
    return findContract(client, id);
  });
}

async function terminate(actor, id, body, req) {
  return db.withTransaction(async (client) => {
    await setAuditActor(client, actor);
    const contract = await findContract(client, id, { lock: true });
    if (!contract) throw notFound('Không tìm thấy hợp đồng');
    if (!['CHO_KY', 'HIEU_LUC'].includes(contract.status)) throw conflict('Hợp đồng đã kết thúc');

    const date = body.terminationDate ?? (await client.query('SELECT CURRENT_DATE::text AS d')).rows[0].d;
    if (date < contract.start_date) throw badRequest('Ngày chấm dứt không được trước ngày bắt đầu hợp đồng');

    await client.query(
      "UPDATE contracts SET status = 'DA_CHAM_DUT', end_date = $2, note = COALESCE($3, note) WHERE id = $1",
      [id, date, body.note ?? null]
    );
    await writeAudit(client, {
      user: actor, action: 'TERMINATE_CONTRACT', table: 'contracts', recordId: id, req,
      oldValues: { status: contract.status }, newValues: { status: 'DA_CHAM_DUT', end_date: date },
    });
    return findContract(client, id);
  });
}

module.exports = { listForEmployee, get, create, update, activate, terminate };
