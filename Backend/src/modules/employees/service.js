const crypto = require('crypto');
const db = require('../../config/db');
const { AppError, badRequest, forbidden, notFound, conflict } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { setAuditActor } = require('../../utils/audit');
const { shapeEmployee, canViewEmployee } = require('./access');

// Every employees column except face_encoding, which is never sent to any client.
const EMP_COLS = `e.id, e.full_name, e.department_id, e.position_id, e.job_title, e.work_email, e.phone_number,
  e.citizen_id, e.date_of_birth, e.gender, e.address, e.base_salary, e.contract_type, e.joined_date,
  e.termination_date, e.termination_reason, e.manager_id, e.status, e.avatar_url, e.bank_account, e.bank_name,
  e.kpi_score, e.attendance_rate, e.created_at, e.updated_at`;

const DETAIL_SQL = `
  SELECT ${EMP_COLS},
         d.name AS department_name, p.name AS position_name, p.level AS position_level,
         m.full_name AS manager_name, m.job_title AS manager_title
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN positions p ON e.position_id = p.id
    LEFT JOIN employees m ON e.manager_id = m.id`;

async function findEmployee(executor, id) {
  const { rows } = await executor.query(`${DETAIL_SQL} WHERE e.id = $1`, [id]);
  return rows[0] || null;
}

async function departmentOf(executor, employeeId) {
  if (!employeeId) return null;
  const { rows } = await executor.query('SELECT department_id FROM employees WHERE id = $1', [employeeId]);
  return rows[0]?.department_id ?? null;
}

async function assertExists(client, table, id, message) {
  const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  if (rows.length === 0) throw notFound(message);
}

async function assertReferences(client, body) {
  if (body.departmentId) await assertExists(client, 'departments', body.departmentId, 'Không tìm thấy phòng ban');
  if (body.positionId) await assertExists(client, 'positions', body.positionId, 'Không tìm thấy chức danh');
  if (body.managerId) await assertExists(client, 'employees', body.managerId, 'Không tìm thấy quản lý trực tiếp');
}

async function assertEmailFree(client, email, exceptId) {
  const { rows } = await client.query(
    'SELECT id FROM employees WHERE LOWER(work_email) = LOWER($1) AND id <> COALESCE($2, \'\')', [email, exceptId ?? null]);
  if (rows.length > 0) throw conflict(`Email ${email} đã được sử dụng`);
}

async function list(user, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  // LINE_MANAGER: own department only (or just themselves when they have none).
  if (user.roleCode === 'LINE_MANAGER') {
    const dept = await departmentOf(db, user.employeeId);
    if (dept) add('e.department_id = ?', dept);
    else add('e.id = ?', user.employeeId ?? '');
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    const p = `$${params.length}`;
    where.push(`(e.full_name ILIKE ${p} OR e.work_email ILIKE ${p} OR e.id ILIKE ${p} OR e.phone_number ILIKE ${p})`);
  }
  if (query.department) add('e.department_id = ?', query.department);
  if (query.status) add('e.status = ?', query.status);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = parseInt((await db.query(`SELECT COUNT(*) FROM employees e ${clause}`, params)).rows[0].count, 10);
  const { rows } = await db.query(
    `SELECT ${EMP_COLS}, d.name AS department_name, p.name AS position_name, m.full_name AS manager_name,
            COALESCE(lb.remaining_days, 12) AS leave_balance
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN positions p ON e.position_id = p.id
       LEFT JOIN employees m ON e.manager_id = m.id
       LEFT JOIN leave_balances lb ON lb.employee_id = e.id
             AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER AND lb.leave_type_id = 'LT-AL'
       ${clause}
      ORDER BY e.id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: rows.map((r) => shapeEmployee(r, user)), pagination: paginationMeta(total, page, limit) };
}

async function get(user, id, scope) {
  const row = await findEmployee(db, id);
  if (!row) throw notFound('Không tìm thấy nhân viên');
  const actorDept = scope === 'department' ? await departmentOf(db, user.employeeId) : null;
  if (!canViewEmployee(scope, user, actorDept, row)) {
    throw forbidden(
      scope === 'department'
        ? 'Bạn chỉ có thể xem nhân viên trong phòng ban của mình'
        : 'Bạn chỉ có thể xem thông tin cá nhân của mình'
    );
  }
  return shapeEmployee(row, user);
}

async function nextEmployeeId(client) {
  for (let i = 0; i < 5; i += 1) {
    const { rows } = await client.query("SELECT 'NV-' || nextval('seq_emp_code') AS id");
    const taken = await client.query('SELECT 1 FROM employees WHERE id = $1', [rows[0].id]);
    if (taken.rows.length === 0) return rows[0].id;
  }
  throw new AppError(500, 'ID_GENERATION_FAILED', 'Không thể tạo mã nhân viên');
}

/** Insert one employee plus its initial active contract. Runs on the caller's transaction client. */
async function insertEmployee(client, body, { dry = false } = {}) {
  await assertReferences(client, body);
  await assertEmailFree(client, body.workEmail);

  let id = body.id;
  if (id) {
    const taken = await client.query('SELECT 1 FROM employees WHERE id = $1', [id]);
    if (taken.rows.length > 0) throw conflict(`Mã nhân viên ${id} đã tồn tại`);
  } else {
    // A dry run must not burn sequence values, so it uses throw-away ids.
    id = dry ? `NV-DRY-${crypto.randomBytes(4).toString('hex')}` : await nextEmployeeId(client);
  }

  const salary = body.baseSalary ?? 0;
  const contractType = body.contractType ?? 'CHINH_THUC';
  await client.query(
    `INSERT INTO employees (id, full_name, department_id, position_id, job_title, work_email, phone_number,
        citizen_id, date_of_birth, gender, address, base_salary, contract_type, joined_date, manager_id,
        avatar_url, bank_account, bank_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [id, body.fullName, body.departmentId ?? null, body.positionId ?? null, body.jobTitle, body.workEmail,
      body.phoneNumber ?? null, body.citizenId ?? null, body.dateOfBirth ?? null, body.gender ?? null,
      body.address ?? null, salary, contractType, body.joinedDate, body.managerId ?? null,
      body.avatarUrl ?? null, body.bankAccount ?? null, body.bankName ?? null]
  );
  await client.query(
    `INSERT INTO contracts (id, employee_id, contract_no, type, start_date, salary, status)
     VALUES (COALESCE($1, 'CT-' || LPAD(nextval('seq_contract_id')::TEXT, 5, '0')), $2, $3, $4, $5, $6, 'HIEU_LUC')`,
    [dry ? `CT-DRY-${crypto.randomBytes(4).toString('hex')}` : null, id, `HDLD-${id}`, contractType, body.joinedDate, salary]
  );
  return id;
}

async function create(actor, body) {
  return db.withTransaction(async (client) => {
    await setAuditActor(client, actor);
    const id = await insertEmployee(client, body);
    return shapeEmployee(await findEmployee(client, id), actor);
  });
}

const COLUMNS = {
  fullName: 'full_name', jobTitle: 'job_title', workEmail: 'work_email', departmentId: 'department_id',
  positionId: 'position_id', phoneNumber: 'phone_number', citizenId: 'citizen_id', dateOfBirth: 'date_of_birth',
  gender: 'gender', address: 'address', baseSalary: 'base_salary', contractType: 'contract_type',
  managerId: 'manager_id', avatarUrl: 'avatar_url', bankAccount: 'bank_account', bankName: 'bank_name', status: 'status',
};

async function update(actor, id, body) {
  if (body.status === 'DA_NGHI_VIEC') {
    throw badRequest('Dùng chức năng cho nghỉ việc (offboard) để chuyển nhân viên sang trạng thái nghỉ việc');
  }
  if (body.managerId && body.managerId === id) throw badRequest('Nhân viên không thể là quản lý của chính mình');

  return db.withTransaction(async (client) => {
    await setAuditActor(client, actor);
    const before = await findEmployee(client, id);
    if (!before) throw notFound('Không tìm thấy nhân viên');
    if (body.status && before.status === 'DA_NGHI_VIEC') {
      throw conflict('Nhân viên đã nghỉ việc, không thể đổi trạng thái');
    }
    await assertReferences(client, body);
    if (body.workEmail) await assertEmailFree(client, body.workEmail, id);

    const sets = [];
    const params = [id];
    for (const [key, column] of Object.entries(COLUMNS)) {
      if (body[key] !== undefined) {
        params.push(body[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    await client.query(`UPDATE employees SET ${sets.join(', ')} WHERE id = $1`, params);
    return shapeEmployee(await findEmployee(client, id), actor);
  });
}

module.exports = { list, get, create, update, findEmployee, insertEmployee, assertReferences, EMP_COLS };
