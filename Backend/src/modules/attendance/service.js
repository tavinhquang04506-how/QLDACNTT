const config = require('../../config/env');
const db = require('../../config/db');
const { AppError, badRequest, forbidden, notFound, conflict } = require('../../utils/AppError');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const { scopeCondition } = require('../../utils/scope');
const { signQrToken, verifyQrToken, consumeQrToken, QR_TTL_SECONDS } = require('./qr');

const { getCurrentKioskCode, validateKioskCode } = require('./kioskCode');
const { validateLocation, OFFICE_LOCATION } = require('./gpsValidator');

const NOT_LINKED = 'Tài khoản chưa được liên kết với hồ sơ nhân viên';
const requireEmployee = (user) => {
  if (!user.employeeId) throw forbidden(NOT_LINKED);
  return user.employeeId;
};

const lateMessage = (row) =>
  row.late_minutes > 0 ? `Check-in thành công (muộn ${row.late_minutes} phút)` : 'Check-in thành công — Đúng giờ!';
const hoursMessage = (row) =>
  `Check-out thành công — Làm ${row.work_hours}h${row.ot_hours > 0 ? ` (OT: ${row.ot_hours}h)` : ''}`;

async function insertCheckIn(executor, employeeId, method, gps = {}) {
  const { rows } = await executor.query(
    `INSERT INTO attendance_logs (
       employee_id, work_date, check_in_time, check_in_method, 
       gps_lat, gps_lng, check_in_lat, check_in_lng, check_in_address, distance_meters
     )
     VALUES ($1, CURRENT_DATE, NOW(), $2, $3, $4, $3, $4, $5, $6)
     ON CONFLICT (employee_id, work_date) DO UPDATE SET
       check_in_time = NOW(), 
       check_in_method = EXCLUDED.check_in_method, 
       gps_lat = EXCLUDED.gps_lat, 
       gps_lng = EXCLUDED.gps_lng,
       check_in_lat = EXCLUDED.check_in_lat,
       check_in_lng = EXCLUDED.check_in_lng,
       check_in_address = EXCLUDED.check_in_address,
       distance_meters = EXCLUDED.distance_meters,
       status = CASE WHEN attendance_logs.status = 'CONG_TAC' THEN 'CONG_TAC'::attendance_status_enum ELSE 'DUNG_GIO'::attendance_status_enum END
     WHERE attendance_logs.check_in_time IS NULL   -- a day HR pre-marked without times can still be punched
     RETURNING *`,
    [
      employeeId, 
      method || 'code_gps', 
      gps.gpsLat ?? null, 
      gps.gpsLng ?? null, 
      gps.address ?? (gps.gpsLat ? OFFICE_LOCATION.name : null),
      gps.distance ?? null
    ]
  );
  return rows[0] || null;
}

function getKioskCode() {
  return getCurrentKioskCode();
}

async function checkIn(user, body) {
  const employeeId = requireEmployee(user);

  // 1. Kiểm tra mã 6 số nếu có gửi lên hoặc phương thức là code_gps
  if (body.code) {
    const isCodeValid = validateKioskCode(body.code);
    if (!isCodeValid) {
      throw badRequest('Mã code Kiosk không chính xác hoặc đã hết hạn (Mã tự động đổi mỗi 20 giây)');
    }
  }

  // 2. Kiểm tra GPS Geofencing (3 vùng thông minh)
  let loc = { valid: true, distance: null, message: null };
  if (body.gpsLat != null && body.gpsLng != null) {
    loc = validateLocation(body.gpsLat, body.gpsLng, body.accuracy);
    if (!loc.valid) {
      throw badRequest(loc.message);
    }
  }

  const row = await insertCheckIn(db, employeeId, body.method || 'code_gps', {
    ...body,
    distance: loc.distance,
    address: body.address || (body.gpsLat ? loc.office : null)
  });
  if (!row) throw conflict('Bạn đã check-in hôm nay rồi');
  return { 
    row, 
    message: lateMessage(row),
    location: loc 
  };
}

async function checkOut(user, body) {
  const employeeId = requireEmployee(user);

  // 1. Kiểm tra mã 6 số nếu có gửi lên
  if (body.code) {
    const isCodeValid = validateKioskCode(body.code);
    if (!isCodeValid) {
      throw badRequest('Mã code Kiosk không chính xác hoặc đã hết hạn (Mã tự động đổi mỗi 20 giây)');
    }
  }

  // 2. Kiểm tra GPS Geofencing
  let loc = { valid: true, distance: null, message: null };
  if (body.gpsLat != null && body.gpsLng != null) {
    loc = validateLocation(body.gpsLat, body.gpsLng, body.accuracy);
    if (!loc.valid) {
      throw badRequest(loc.message);
    }
  }

  const { rows } = await db.query(
    `UPDATE attendance_logs SET 
       check_out_time = NOW(), 
       check_out_method = $2,
       check_out_lat = $3,
       check_out_lng = $4,
       check_out_address = $5
     WHERE employee_id = $1 AND work_date = CURRENT_DATE AND check_in_time IS NOT NULL AND check_out_time IS NULL
     RETURNING *`,
    [
      employeeId, 
      body.method || 'code_gps',
      body.gpsLat ?? null,
      body.gpsLng ?? null,
      body.address || (body.gpsLat ? loc.office : null)
    ]
  );
  if (rows[0]) return { row: rows[0], message: hoursMessage(rows[0]), location: loc };

  const existing = await db.query(
    'SELECT check_out_time FROM attendance_logs WHERE employee_id = $1 AND work_date = CURRENT_DATE AND check_in_time IS NOT NULL',
    [employeeId]
  );
  if (existing.rows.length === 0) throw badRequest('Bạn chưa check-in hôm nay');
  throw conflict('Bạn đã check-out hôm nay rồi');
}

async function today(user) {
  const employeeId = requireEmployee(user);
  const { rows } = await db.query(
    'SELECT * FROM attendance_logs WHERE employee_id = $1 AND work_date = CURRENT_DATE', [employeeId]);
  const row = rows[0] || null;
  return { row, checkedIn: Boolean(row && row.check_in_time), checkedOut: Boolean(row && row.check_out_time) };
}

function myQr(user) {
  const employeeId = requireEmployee(user);
  return { qrToken: signQrToken(employeeId), expiresIn: QR_TTL_SECONDS, employeeId };
}

/** A kiosk scans an employee's QR: the first scan of the day checks in, the second checks out. */
async function kioskPunch(body) {
  const claims = verifyQrToken(body.qrToken);
  consumeQrToken(claims);

  return db.withTransaction(async (client) => {
    const emp = await client.query('SELECT id, status FROM employees WHERE id = $1', [claims.employeeId]);
    if (emp.rows.length === 0) throw notFound('Không tìm thấy nhân viên');
    if (emp.rows[0].status === 'DA_NGHI_VIEC') throw conflict('Nhân viên đã nghỉ việc');

    const created = await insertCheckIn(client, claims.employeeId, 'qr');
    if (created) return { action: 'CHECK_IN', created: true, row: created, message: lateMessage(created) };

    const { rows } = await client.query(
      `SELECT id, check_in_time, check_out_time,
              EXTRACT(EPOCH FROM (NOW() - check_in_time)) AS since_in
         FROM attendance_logs WHERE employee_id = $1 AND work_date = CURRENT_DATE FOR UPDATE`,
      [claims.employeeId]
    );
    const log = rows[0];
    if (!log.check_in_time || log.check_out_time) throw conflict('Hôm nay đã chấm công vào và ra');
    if (Number(log.since_in) < config.punchMinGapSeconds) {
      throw new AppError(409, 'PUNCH_TOO_SOON', 'Vừa chấm công xong, vui lòng đợi rồi quét lại để check-out');
    }
    const out = await client.query(
      `UPDATE attendance_logs SET check_out_time = NOW(), check_out_method = 'qr' WHERE id = $1 RETURNING *`, [log.id]);
    return { action: 'CHECK_OUT', created: false, row: out.rows[0], message: hoursMessage(out.rows[0]) };
  });
}

async function list(user, query, scope) {
  const { page, limit, offset } = parsePagination(query);
  const params = [];
  const where = [];
  const cond = await scopeCondition(db, user, scope, { employee: 'a.employee_id', department: 'e.department_id' }, params);
  if (cond) where.push(cond);
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (query.employeeId) add('a.employee_id = ?', query.employeeId);
  if (query.department) add('e.department_id = ?', query.department);
  if (query.date) add('a.work_date = ?::date', query.date);
  if (query.month) {
    params.push(`${query.month}-01`);
    where.push(`a.work_date >= $${params.length}::date AND a.work_date < ($${params.length}::date + INTERVAL '1 month')`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = parseInt(
    (await db.query(`SELECT COUNT(*) FROM attendance_logs a JOIN employees e ON e.id = a.employee_id ${clause}`, params)).rows[0].count, 10);
  const { rows } = await db.query(
    `SELECT a.*, e.full_name, e.avatar_url, e.job_title, e.department_id, d.name AS department_name
       FROM attendance_logs a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       ${clause}
      ORDER BY a.work_date DESC, e.full_name, a.id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { data: rows, pagination: paginationMeta(total, page, limit) };
}

/** HR/CEO correction of one day (upsert). The DB trigger recomputes late minutes, hours and status from the times. */
async function adjust(actor, body, req) {
  return db.withTransaction(async (client) => {
    const emp = await client.query('SELECT 1 FROM employees WHERE id = $1', [body.employeeId]);
    if (emp.rows.length === 0) throw notFound('Không tìm thấy nhân viên');

    const existing = await client.query(
      'SELECT * FROM attendance_logs WHERE employee_id = $1 AND work_date = $2 FOR UPDATE', [body.employeeId, body.workDate]);
    let row;
    let created = false;
    if (existing.rows[0]) {
      const res = await client.query(
        `UPDATE attendance_logs SET
            check_in_time = COALESCE($2::timestamptz, check_in_time),
            check_out_time = COALESCE($3::timestamptz, check_out_time),
            status = COALESCE($4::attendance_status_enum, status),
            note = COALESCE($5, note)
          WHERE id = $1 RETURNING *`,
        [existing.rows[0].id, body.checkIn ?? null, body.checkOut ?? null, body.status ?? null, body.note ?? null]
      );
      row = res.rows[0];
    } else {
      const res = await client.query(
        `INSERT INTO attendance_logs (employee_id, work_date, check_in_time, check_out_time, check_in_method, status, note)
         VALUES ($1, $2, $3, $4, 'manual', COALESCE($5::attendance_status_enum, 'DUNG_GIO'), $6) RETURNING *`,
        [body.employeeId, body.workDate, body.checkIn ?? null, body.checkOut ?? null, body.status ?? null, body.note ?? null]
      );
      row = res.rows[0];
      created = true;
    }
    await writeAudit(client, {
      user: actor, action: 'ADJUST_ATTENDANCE', table: 'attendance_logs', recordId: row.id, req,
      oldValues: existing.rows[0]
        ? { check_in_time: existing.rows[0].check_in_time, check_out_time: existing.rows[0].check_out_time, status: existing.rows[0].status }
        : null,
      newValues: { employee_id: row.employee_id, work_date: row.work_date, check_in_time: row.check_in_time, check_out_time: row.check_out_time, status: row.status, note: row.note },
    });
    return { row, created };
  });
}

const PRESENT = new Set(['DUNG_GIO', 'DI_MUON', 'VE_SOM', 'CONG_TAC']);

async function timesheet(user, query, scope) {
  const params = [`${query.month}-01`];
  const where = ["(e.status <> 'DA_NGHI_VIEC' OR EXISTS (SELECT 1 FROM attendance_logs x WHERE x.employee_id = e.id AND x.work_date >= $1::date AND x.work_date < ($1::date + INTERVAL '1 month')))"];
  const cond = await scopeCondition(db, user, scope, { employee: 'e.id', department: 'e.department_id' }, params);
  if (cond) where.push(cond);
  if (query.department) {
    params.push(query.department);
    where.push(`e.department_id = $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT e.id, e.full_name, e.department_id, a.work_date, a.status, a.late_minutes, a.ot_hours
       FROM employees e
       LEFT JOIN attendance_logs a ON a.employee_id = e.id
             AND a.work_date >= $1::date AND a.work_date < ($1::date + INTERVAL '1 month')
      WHERE ${where.join(' AND ')}
      ORDER BY e.id, a.work_date`,
    params
  );

  const [year, mon] = query.month.split('-').map(Number);
  const byEmployee = new Map();
  for (const r of rows) {
    if (!byEmployee.has(r.id)) {
      byEmployee.set(r.id, {
        employee_id: r.id, full_name: r.full_name, department_id: r.department_id, cells: {},
        totals: { work_days: 0, late_days: 0, leave_days: 0, absent_days: 0, ot_hours: 0 },
      });
    }
    if (!r.work_date) continue;
    const row = byEmployee.get(r.id);
    row.cells[r.work_date] = r.status;
    if (PRESENT.has(r.status)) row.totals.work_days += 1;
    if (r.status === 'DI_MUON') row.totals.late_days += 1;
    if (r.status === 'NGHI_PHEP') row.totals.leave_days += 1;
    if (r.status === 'VANG_KHONG_PHEP') row.totals.absent_days += 1;
    row.totals.ot_hours = Math.round((row.totals.ot_hours + Number(r.ot_hours || 0)) * 100) / 100;
  }
  return { month: query.month, days: new Date(Date.UTC(year, mon, 0)).getUTCDate(), rows: [...byEmployee.values()] };
}

async function exceptions(user, query, scope) {
  const date = query.date ?? (await db.query('SELECT CURRENT_DATE::text AS d')).rows[0].d;

  const lateParams = [date];
  const lateCond = await scopeCondition(db, user, scope, { employee: 'a.employee_id', department: 'e.department_id' }, lateParams);
  const late = await db.query(
    `SELECT a.employee_id, e.full_name, e.department_id, a.late_minutes, a.check_in_time
       FROM attendance_logs a JOIN employees e ON e.id = a.employee_id
      WHERE a.work_date = $1::date AND a.late_minutes > 0 ${lateCond ? `AND ${lateCond}` : ''}
      ORDER BY a.late_minutes DESC, e.full_name`,
    lateParams
  );

  const absentParams = [date];
  const absentCond = await scopeCondition(db, user, scope, { employee: 'e.id', department: 'e.department_id' }, absentParams);
  const absent = await db.query(
    `SELECT e.id AS employee_id, e.full_name, e.department_id
       FROM employees e
      WHERE EXTRACT(ISODOW FROM $1::date) <= 5
        AND e.status IN ('DANG_LAM_VIEC', 'THU_VIEC') AND e.joined_date <= $1::date
        AND NOT EXISTS (SELECT 1 FROM attendance_logs a WHERE a.employee_id = e.id AND a.work_date = $1::date)
        AND NOT EXISTS (SELECT 1 FROM leave_requests lr WHERE lr.employee_id = e.id AND lr.stage = 'DA_PHE_DUYET'
                           AND $1::date BETWEEN lr.start_date AND lr.end_date)
        ${absentCond ? `AND ${absentCond}` : ''}
      ORDER BY e.full_name`,
    absentParams
  );
  return { date, late: late.rows, absent: absent.rows };
}

async function live(user, scope) {
  const params = [];
  const cond = await scopeCondition(db, user, scope, { employee: 'a.employee_id', department: 'e.department_id' }, params);
  const { rows } = await db.query(
    `SELECT a.id, a.employee_id, e.full_name, e.avatar_url, e.department_id, a.check_in_time, a.check_out_time,
            a.check_in_method, a.check_out_method, a.late_minutes, a.status,
            a.check_in_address, a.check_out_address, a.distance_meters,
            CASE WHEN a.check_out_time IS NOT NULL THEN 'CHECK_OUT' ELSE 'CHECK_IN' END AS event,
            GREATEST(a.check_in_time, a.check_out_time) AS event_time
       FROM attendance_logs a JOIN employees e ON e.id = a.employee_id
      WHERE a.work_date = CURRENT_DATE AND a.check_in_time IS NOT NULL ${cond ? `AND ${cond}` : ''}
      ORDER BY event_time DESC NULLS LAST
      LIMIT 50`,
    params
  );
  return rows;
}

module.exports = { checkIn, checkOut, today, myQr, kioskPunch, list, adjust, timesheet, exceptions, live, getKioskCode };
