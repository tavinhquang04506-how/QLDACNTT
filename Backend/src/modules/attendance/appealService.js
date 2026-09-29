// ============================================
// appealService.js — Quản lý Đơn Giải Trình Chấm Công
// ============================================
const db = require('../../config/db');

// In-memory fallback cache if table does not exist
const memoryAppeals = [];

/**
 * Đảm bảo bảng attendance_appeals tồn tại trong PostgreSQL
 */
async function ensureAppealsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS attendance_appeals (
        id VARCHAR(50) PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL,
        employee_name VARCHAR(100),
        department_name VARCHAR(100),
        date DATE NOT NULL,
        appeal_type VARCHAR(50) NOT NULL, -- DI_MUON, VE_SOM, QUEN_CHAM_CONG
        reason TEXT NOT NULL,
        proof_url TEXT,
        status VARCHAR(20) DEFAULT 'CHO_DUYET', -- CHO_DUYET, DA_DUYET, TU_CHOI
        review_note TEXT,
        reviewer_id VARCHAR(50),
        reviewer_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP
      );
    `);
  } catch (err) {
    console.warn('ensureAppealsTable note:', err.message);
  }
}

// Auto-run migration check on load
ensureAppealsTable().catch(() => null);

async function createAppeal(data) {
  const id = 'APL-' + Date.now().toString().slice(-6);
  const appeal = {
    id,
    employee_id: data.employee_id || 'NV-0842',
    employee_name: data.employee_name || 'Nhân sự',
    department_name: data.department_name || 'Phòng Kỹ thuật Phần mềm',
    date: data.date || new Date().toISOString().split('T')[0],
    appeal_type: data.appeal_type || 'DI_MUON',
    reason: data.reason || 'Sự cố phát sinh cá nhân',
    proof_url: data.proof_url || null,
    status: 'CHO_DUYET',
    review_note: null,
    reviewer_id: null,
    reviewer_name: null,
    created_at: new Date().toISOString(),
    reviewed_at: null,
  };

  try {
    const res = await db.query(
      `INSERT INTO attendance_appeals (id, employee_id, employee_name, department_name, date, appeal_type, reason, proof_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        appeal.id,
        appeal.employee_id,
        appeal.employee_name,
        appeal.department_name,
        appeal.date,
        appeal.appeal_type,
        appeal.reason,
        appeal.proof_url,
        appeal.status,
      ]
    );
    if (res.rows?.[0]) return res.rows[0];
  } catch (err) {
    console.warn('DB insert appeal error, using memory store:', err.message);
  }

  memoryAppeals.unshift(appeal);
  return appeal;
}

async function getAppeals(filter = {}) {
  try {
    let query = 'SELECT * FROM attendance_appeals ORDER BY created_at DESC';
    const params = [];
    if (filter.employee_id) {
      query = 'SELECT * FROM attendance_appeals WHERE employee_id = $1 ORDER BY created_at DESC';
      params.push(filter.employee_id);
    }
    const res = await db.query(query, params);
    if (res.rows && res.rows.length > 0) return res.rows;
  } catch (err) {
    console.warn('DB get appeals error, using memory store:', err.message);
  }

  if (filter.employee_id) {
    return memoryAppeals.filter((a) => a.employee_id === filter.employee_id);
  }
  return memoryAppeals;
}

async function reviewAppeal(id, reviewData) {
  const { status, review_note, reviewer_id, reviewer_name } = reviewData;
  const now = new Date().toISOString();

  let appealRow = null;

  try {
    const res = await db.query(
      `UPDATE attendance_appeals
       SET status = $1, review_note = $2, reviewer_id = $3, reviewer_name = $4, reviewed_at = $5
       WHERE id = $6
       RETURNING *`,
      [status, review_note || '', reviewer_id || null, reviewer_name || null, now, id]
    );
    if (res.rows?.[0]) appealRow = res.rows[0];
  } catch (err) {
    console.warn('DB review appeal error, using memory store:', err.message);
  }

  if (!appealRow) {
    const found = memoryAppeals.find((a) => a.id === id);
    if (found) {
      found.status = status;
      found.review_note = review_note || '';
      found.reviewer_id = reviewer_id;
      found.reviewer_name = reviewer_name;
      found.reviewed_at = now;
      appealRow = found;
    }
  }

  // When appeal is approved, automatically normalize the attendance log in DB
  if (status === 'DA_DUYET' && appealRow?.employee_id && appealRow?.date) {
    try {
      const empId = appealRow.employee_id;
      const workDate = new Date(appealRow.date).toISOString().split('T')[0];
      const appealType = appealRow.appeal_type || 'DI_MUON';
      const noteMsg = `[Giải trình ${appealType} đã được duyệt: ${review_note || 'Đồng ý'}]`;

      const existing = await db.query(
        'SELECT id, check_in_time, check_out_time, note FROM attendance_logs WHERE employee_id = $1 AND work_date = $2',
        [empId, workDate]
      );

      if (existing.rows && existing.rows[0]) {
        await db.query(
          `UPDATE attendance_logs
           SET status = 'DUNG_GIO',
               late_minutes = 0,
               note = TRIM(COALESCE(note, '') || ' ' || $2)
           WHERE id = $1`,
          [existing.rows[0].id, noteMsg]
        );
      } else {
        const checkIn = `${workDate} 08:00:00+07`;
        const checkOut = `${workDate} 17:00:00+07`;
        await db.query(
          `INSERT INTO attendance_logs (employee_id, work_date, check_in_time, check_out_time, check_in_method, status, late_minutes, work_hours, note)
           VALUES ($1, $2, $3, $4, 'manual', 'DUNG_GIO', 0, 8.0, $5)`,
          [empId, workDate, checkIn, checkOut, noteMsg]
        );
      }
    } catch (attErr) {
      console.warn('Auto-adjust attendance log on appeal approval error:', attErr.message);
    }
  }

  return appealRow || {
    id,
    status,
    review_note,
    reviewer_id,
    reviewer_name,
    reviewed_at: now,
  };
}

module.exports = {
  createAppeal,
  getAppeals,
  reviewAppeal,
};
