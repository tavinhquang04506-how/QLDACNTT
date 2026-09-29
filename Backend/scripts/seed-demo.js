/**
 * Idempotent demo data for the modules added after the base schema seed (notices, handbook, performance reviews).
 * Run against the development database: `npm run seed:demo`. Safe to run repeatedly.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/db');

const NOTICES = [
  { key: 'seed-welcome', title: 'Chào mừng bạn đến với NEXUS HR v2.0', category: 'general', pinned: true, content: 'Hệ thống nhân sự mới hỗ trợ chấm công QR, nghỉ phép nhiều cấp duyệt, bảng lương và quản lý dự án.' },
  { key: 'seed-policy', title: 'Cập nhật quy chế làm thêm giờ', category: 'policy', pinned: false, content: 'Làm thêm giờ tối đa 4 giờ/ngày và 40 giờ/tháng. Đăng ký trước và được trưởng phòng duyệt.' },
  { key: 'seed-managers', title: 'Họp giao ban trưởng phòng thứ Hai hàng tuần', category: 'event', pinned: false, role: 'LINE_MANAGER', content: 'Họp lúc 09:00 tại phòng họp lớn.' },
];
const HANDBOOK = [
  { title: 'Nội quy lao động', category: 'Nội quy', content: 'Điều 1. Giờ làm việc từ 08:00 đến 17:00, nghỉ trưa 60 phút.\nĐiều 2. Đi muộn sau 08:00 được ghi nhận theo phút.' },
  { title: 'Chế độ nghỉ phép', category: 'Phúc lợi', content: 'Phép năm 12 ngày/năm. Đơn nghỉ được duyệt theo chuỗi: Trưởng phòng, Giám đốc Nhân sự.' },
  { title: 'Hướng dẫn chấm công bằng QR', category: 'Hướng dẫn', content: 'Mở ứng dụng để lấy mã QR cá nhân (hiệu lực 60 giây), quét tại kiosk sảnh: lần đầu là vào ca, lần hai là tan ca.' },
];

async function main() {
  const author = (await db.query("SELECT employee_id FROM users WHERE email = 'hrd@fwbnexus.vn'")).rows[0]?.employee_id ?? null;

  for (const n of NOTICES) {
    const exists = await db.query('SELECT 1 FROM company_notices WHERE title = $1', [n.title]);
    if (exists.rows.length) continue;
    await db.query(
      `INSERT INTO company_notices (title, content, category, author_id, target_role, is_pinned) VALUES ($1, $2, $3::notice_category_enum, $4, $5, $6)`,
      [n.title, n.content, n.category, author, n.role ?? null, n.pinned]);
  }
  for (const h of HANDBOOK) {
    const exists = await db.query('SELECT 1 FROM handbook_docs WHERE title = $1', [h.title]);
    if (exists.rows.length) continue;
    await db.query('INSERT INTO handbook_docs (title, category, content, updated_by) VALUES ($1, $2, $3, $4)', [h.title, h.category, h.content, author]);
  }

  // One review per active employee for 2026-Q3 with deterministic scores spread over the 9-box.
  const { rows: emps } = await db.query("SELECT id FROM employees WHERE status = 'DANG_LAM_VIEC' ORDER BY id");
  const { cellOf } = require('../src/modules/analytics/nineBox');
  let i = 0;
  for (const e of emps) {
    i += 1;
    const perf = 45 + ((i * 17) % 55);
    const pot = 40 + ((i * 29) % 60);
    await db.query(
      `INSERT INTO performance_reviews (employee_id, period, reviewer_id, performance_score, potential_score, nine_box_cell, comments)
       VALUES ($1, '2026-Q3', $2, $3, $4, $5, 'Đánh giá mẫu') ON CONFLICT (employee_id, period) DO NOTHING`,
      [e.id, author, perf, pot, cellOf(perf, pot)]);
  }
  console.log(`✅ Demo data ready: ${NOTICES.length} notices, ${HANDBOOK.length} handbook docs, ${emps.length} reviews (2026-Q3)`);
}

main().then(() => db.pool.end()).catch((e) => { console.error('❌', e.message); process.exit(1); });
