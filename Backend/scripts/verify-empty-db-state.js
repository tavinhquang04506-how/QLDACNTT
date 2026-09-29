require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/db');

const BASE_URL = 'http://localhost:8000/api';

const ACCOUNTS = {
  CEO: { email: 'ceo@fwbnexus.vn', password: 'Ceo@123456' },
  HRD: { email: 'hrd@fwbnexus.vn', password: 'Hrd@123456' },
  LEAD: { email: 'lead@fwbnexus.vn', password: 'Lead@123456' },
  EMP: { email: 'employee@fwbnexus.vn', password: 'Emp@123456' }
};

let tokens = {};

async function loginAll() {
  for (const [role, creds] of Object.entries(ACCOUNTS)) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds)
    });
    const json = await res.json();
    const token = json.token || json.accessToken || json.data?.token;
    if (!res.ok || !token) {
      throw new Error(`Đăng nhập thất bại cho ${role}: ${json.message}`);
    }
    tokens[role] = token;
  }
}

async function apiGet(endpoint, token) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, data };
}

async function verifyEmptyIteration(iterNumber) {
  console.log(`\n========================================================================`);
  console.log(`🔍 KIỂM THỬ LẦN LẶP ${iterNumber}/3 - PHÁT HIỆN HARDCODE (DATABASE RỖNG)`);
  console.log(`========================================================================`);

  const results = [];

  function record(moduleName, testCase, pass, details) {
    results.push({ moduleName, testCase, pass, details });
    const mark = pass ? '✅ PASS' : '❌ FAIL (PHÁT HIỆN DỮ LIỆU TĨNH/HARDCODE)';
    console.log(`  [${mark}] ${moduleName} -> ${testCase}: ${details}`);
    if (!pass) {
      throw new Error(`PHÁT HIỆN LỖI HARDCODE: ${moduleName} - ${testCase}: ${details}`);
    }
  }

  // 1. Dashboard Stats
  {
    const res = await apiGet('/dashboard/stats', tokens.CEO);
    const dbEmpCount = (await db.query(`SELECT COUNT(*)::int AS cnt FROM employees WHERE status = 'DANG_LAM_VIEC'`)).rows[0].cnt;
    const dbPrjCount = (await db.query(`SELECT COUNT(*)::int AS cnt FROM projects`)).rows[0].cnt;
    const overview = res.data?.data?.overview || {};

    const empMatches = overview.total_active === 4 && overview.total_active === dbEmpCount;
    record(
      'Dashboard Quản Trị',
      'Tổng nhân sự phản ánh đúng DB (4 người, không phải 50)',
      empMatches,
      `API overview.total_active: ${overview.total_active}, DB thực tế: ${dbEmpCount}`
    );

    const prjMatches = (overview.active_projects === 0 || overview.active_projects === undefined) && dbPrjCount === 0;
    record(
      'Dashboard Quản Trị',
      'Dự án rỗng (0 dự án, không có số liệu ảo)',
      prjMatches,
      `API overview.active_projects: ${overview.active_projects || 0}, DB thực tế: ${dbPrjCount}`
    );

    record(
      'Dashboard Quản Trị',
      'Nhiệm vụ mở = 0 & Đơn phép chờ = 0',
      overview.open_tasks === 0 && overview.pending_leaves === 0,
      `API open_tasks: ${overview.open_tasks}, pending_leaves: ${overview.pending_leaves}`
    );
  }

  // 2. Danh bạ Nhân sự (/api/employees)
  {
    const res = await apiGet('/employees?limit=100', tokens.HRD);
    const emps = Array.isArray(res.data?.data) ? res.data.data : (res.data?.data?.employees || []);
    const dbEmps = (await db.query(`SELECT id, full_name FROM employees ORDER BY id`)).rows;

    record(
      'Danh Bạ Nhân Sự',
      'Chỉ hiển thị đúng 4 nhân sự còn lại trong DB',
      emps.length === 4 && dbEmps.length === 4,
      `API: ${emps.length} nhân viên (${emps.map(e => e.id).join(', ')}), DB: ${dbEmps.length}`
    );

    // Tìm kiếm nhân sự đã bị xóa xem có bị dính mảng tĩnh hay không
    const searchRes = await apiGet('/employees?search=Nguy%E1%BB%85n%20Ho%C3%A0ng%20Nam', tokens.HRD);
    const searchEmps = Array.isArray(searchRes.data?.data) ? searchRes.data.data : (searchRes.data?.data?.employees || []);
    record(
      'Danh Bạ Nhân Sự',
      'Tìm kiếm nhân sự bị xóa trả về rỗng [] (không có dữ liệu tĩnh)',
      searchEmps.length === 0,
      `Tìm 'Nguyễn Hoàng Nam' -> Tìm thấy: ${searchEmps.length} người`
    );

    // Lọc theo phòng ban Marketing (không còn ai)
    const mktRes = await apiGet('/employees?department=DEPT-MKT', tokens.HRD);
    const mktEmps = Array.isArray(mktRes.data?.data) ? mktRes.data.data : (mktRes.data?.data?.employees || []);
    record(
      'Danh Bạ Nhân Sự',
      'Lọc phòng ban trống DEPT-MKT trả về rỗng []',
      mktEmps.length === 0,
      `Phòng DEPT-MKT -> Tìm thấy: ${mktEmps.length} người`
    );
  }

  // 3. Bảng Tin Doanh Nghiệp & Thông Báo (/api/notices, /api/notifications)
  {
    const noticeRes = await apiGet('/notices', tokens.EMP);
    const notices = Array.isArray(noticeRes.data?.data) ? noticeRes.data.data : [];
    const dbNotices = (await db.query(`SELECT COUNT(*)::int AS cnt FROM company_notices`)).rows[0].cnt;
    record(
      'Bảng Tin Doanh Nghiệp',
      'Danh sách bài viết rỗng 0 bài (không dính mock 4 bài)',
      notices.length === 0 && dbNotices === 0,
      `API notices: ${notices.length} bài, DB notices: ${dbNotices}`
    );

    const notifRes = await apiGet('/notifications', tokens.EMP);
    const notifs = Array.isArray(notifRes.data?.data) ? notifRes.data.data : [];
    const dbNotifs = (await db.query(`SELECT COUNT(*)::int AS cnt FROM notifications`)).rows[0].cnt;
    record(
      'Trung Tâm Thông Báo',
      'Danh sách thông báo cá nhân rỗng 0 thông báo',
      notifs.length === 0 && dbNotifs === 0,
      `API notifs: ${notifs.length}, DB: ${dbNotifs}`
    );

    const unreadRes = await apiGet('/notifications/unread-count', tokens.EMP);
    const unreadCount = unreadRes.data?.count ?? unreadRes.data?.data?.unreadCount ?? 0;
    record(
      'Trung Tâm Thông Báo',
      'Huy hiệu Unread count bằng 0',
      unreadCount === 0,
      `Unread count: ${unreadCount}`
    );
  }

  // 4. Dự Án & Nhiệm Vụ Kanban (/api/projects)
  {
    const prjRes = await apiGet('/projects', tokens.CEO);
    const prjs = Array.isArray(prjRes.data?.data) ? prjRes.data.data : [];
    const dbPrjs = (await db.query(`SELECT COUNT(*)::int AS cnt FROM projects`)).rows[0].cnt;
    record(
      'Quản Lý Dự Án',
      'Danh sách dự án rỗng 0 dự án (không dính mock PRJ-01..04)',
      prjs.length === 0 && dbPrjs === 0,
      `API projects: ${prjs.length}, DB: ${dbPrjs}`
    );

    const dbTasks = (await db.query(`SELECT COUNT(*)::int AS cnt FROM tasks`)).rows[0].cnt;
    record(
      'Bảng Nhiệm Vụ Kanban',
      'Nhiệm vụ trong database rỗng 0 task (không dính 10 task demo)',
      dbTasks === 0,
      `DB tasks: ${dbTasks}`
    );
  }

  // 5. Tiền Lương & Phiếu Lương (/api/payroll/periods, /api/payroll/me)
  {
    const periodRes = await apiGet('/payroll/periods', tokens.CEO);
    const periods = Array.isArray(periodRes.data?.data) ? periodRes.data.data : [];
    const dbPeriods = (await db.query(`SELECT COUNT(*)::int AS cnt FROM payroll_periods`)).rows[0].cnt;
    record(
      'Quản Lý Tiền Lương',
      'Danh sách kỳ lương rỗng 0 kỳ',
      periods.length === 0 && dbPeriods === 0,
      `API periods: ${periods.length}, DB: ${dbPeriods}`
    );

    const mePayRes = await apiGet('/payroll/me', tokens.EMP);
    const mePays = Array.isArray(mePayRes.data?.data) ? mePayRes.data.data : [];
    const dbPays = (await db.query(`SELECT COUNT(*)::int AS cnt FROM payslips`)).rows[0].cnt;
    record(
      'Phiếu Lương Cá Nhân',
      'Phiếu lương của nhân viên rỗng (không dính số tiền demo 25.848.000 ₫)',
      mePays.length === 0 && dbPays === 0,
      `API me payslips: ${mePays.length}, DB total payslips: ${dbPays}`
    );
  }

  // 6. Quản Lý Nghỉ Phép (/api/leaves)
  {
    const leaveRes = await apiGet('/leaves', tokens.EMP);
    const leaves = Array.isArray(leaveRes.data?.data) ? leaveRes.data.data : [];
    const dbLeaves = (await db.query(`SELECT COUNT(*)::int AS cnt FROM leave_requests`)).rows[0].cnt;
    record(
      'Quản Lý Nghỉ Phép',
      'Đơn nghỉ phép rỗng 0 đơn',
      leaves.length === 0 && dbLeaves === 0,
      `API leaves: ${leaves.length}, DB: ${dbLeaves}`
    );
  }

  // 7. Chấm Công & Điểm Danh (/api/attendance, /api/attendance/me/today)
  {
    const attRes = await apiGet('/attendance', tokens.HRD);
    const attLogs = Array.isArray(attRes.data?.data) ? attRes.data.data : [];
    const dbAtt = (await db.query(`SELECT COUNT(*)::int AS cnt FROM attendance_logs`)).rows[0].cnt;
    record(
      'Chấm Công',
      'Lịch sử chấm công toàn công ty rỗng 0 bản ghi',
      attLogs.length === 0 && dbAtt === 0,
      `API attendance logs: ${attLogs.length}, DB: ${dbAtt}`
    );

    const todayRes = await apiGet('/attendance/me/today', tokens.EMP);
    record(
      'Chấm Công Cá Nhân Hôm Nay',
      'Chưa có dữ liệu quẹt thẻ hôm nay',
      todayRes.status === 200,
      `API today punch: ${JSON.stringify(todayRes.data?.data || null)}`
    );
  }

  // 8. Đánh Giá Nhân Sự & 9-Box (/api/analytics/nine-box, /api/analytics/turnover-risk)
  {
    const nineBoxRes = await apiGet('/analytics/nine-box', tokens.HRD);
    const cells = Array.isArray(nineBoxRes.data?.data) ? nineBoxRes.data.data : [];
    const totalAssignedEmployees = cells.reduce((sum, c) => sum + (c.count || (c.employees?.length || 0)), 0);
    const dbReviews = (await db.query(`SELECT COUNT(*)::int AS cnt FROM performance_reviews`)).rows[0].cnt;
    record(
      'Phân Tích Đánh Giá 9-Box',
      'Ma trận 9-Box rỗng không có nhân sự nào được xếp loại (0 người)',
      totalAssignedEmployees === 0 && dbReviews === 0,
      `9-Box assigned count: ${totalAssignedEmployees}, DB performance_reviews: ${dbReviews}`
    );

    const riskRes = await apiGet('/analytics/turnover-risk', tokens.HRD);
    const risks = Array.isArray(riskRes.data?.data) ? riskRes.data.data : [];
    const dbActiveEmp = (await db.query(`SELECT COUNT(*)::int AS cnt FROM employees WHERE status = 'DANG_LAM_VIEC'`)).rows[0].cnt;
    record(
      'Phân Tích Rủi Ro Nghỉ Việc',
      'Rủi ro turnover tính động đúng cho 4 nhân sự còn lại trong DB (không phải 50)',
      risks.length === dbActiveEmp && risks.length === 4,
      `API risks count: ${risks.length} (nhân sự: ${risks.map(r => r.employee_id).join(', ')}), DB active employees: ${dbActiveEmp}`
    );
  }

  // 9. Yêu Cầu Tăng Ca & Y Tế (/api/ot-requests, /api/medical-claims)
  {
    const otRes = await apiGet('/ot-requests', tokens.HRD);
    const ots = Array.isArray(otRes.data?.data) ? otRes.data.data : [];
    const dbOt = (await db.query(`SELECT COUNT(*)::int AS cnt FROM ot_requests`)).rows[0].cnt;
    record(
      'Tăng Ca OT',
      'Yêu cầu OT rỗng 0 bản ghi',
      ots.length === 0 && dbOt === 0,
      `API OT: ${ots.length}, DB: ${dbOt}`
    );

    const medRes = await apiGet('/medical-claims', tokens.EMP);
    const meds = Array.isArray(medRes.data?.data) ? medRes.data.data : [];
    const dbMed = (await db.query(`SELECT COUNT(*)::int AS cnt FROM medical_claims`)).rows[0].cnt;
    record(
      'Y Tế Bảo Hiểm',
      'Hồ sơ bồi hoàn y tế rỗng 0 bản ghi',
      meds.length === 0 && dbMed === 0,
      `API medical claims: ${meds.length}, DB: ${dbMed}`
    );
  }

  // 10. Hợp Đồng Lao Động (/api/employees/:id/contracts)
  {
    const contractRes = await apiGet('/employees/NV-0842/contracts', tokens.HRD);
    const contracts = Array.isArray(contractRes.data?.data) ? contractRes.data.data : [];
    const dbContracts = (await db.query(`SELECT COUNT(*)::int AS cnt FROM contracts`)).rows[0].cnt;
    record(
      'Hợp Đồng Lao Động',
      'Danh sách hợp đồng nhân sự rỗng 0 bản ghi',
      contracts.length === 0 && dbContracts === 0,
      `API contracts: ${contracts.length}, DB: ${dbContracts}`
    );
  }

  console.log(`\n🎉 KẾT QUẢ LẦN LẶP ${iterNumber}: 100% CÁC TEST CASE ĐỀU VƯỢT QUA! KHÔNG PHÁT HIỆN DỮ LIỆU TĨNH/HARDCODE NÀO!`);
  return results;
}

async function runTripleEmptyVerification() {
  console.log('🚀 BẮT ĐẦU KIỂM THỬ ĐỐI CHỨNG 3 LẦN LẶP (DATABASE RỖNG)');
  await loginAll();

  const allIterations = [];
  for (let i = 1; i <= 3; i++) {
    const res = await verifyEmptyIteration(i);
    allIterations.push(res);
  }

  console.log('\n========================================================================');
  console.log('🏆 TỔNG KẾT KIỂM THỬ DATABASE RỖNG: 3/3 LẦN LẶP ĐỀU ĐẠT CHUẨN 100%');
  console.log('Tất cả 10 module nghiệp vụ phản ánh trung thực trạng thái 0 bản ghi từ PostgreSQL!');
  console.log('Không có bất kỳ dấu hiệu hardcode mảng dữ liệu tĩnh nào trong hệ thống!');
  console.log('========================================================================');
}

runTripleEmptyVerification()
  .then(() => db.pool.end())
  .catch(err => {
    console.error('❌ Lỗi kiểm thử:', err);
    process.exit(1);
  });
