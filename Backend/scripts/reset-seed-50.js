require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

const DEFAULT_AVATAR = '/default-avatar.jpg';

async function resetAndSeed50Employees() {
  const client = await db.pool.connect();
  try {
    console.log('🔄 Bắt đầu reset toàn bộ database và khởi tạo dữ liệu thực tế năm 2026 (01/2026 -> 10/2026) cho 50 nhân sự...\n');
    await client.query('BEGIN');

    // 1. Dọn sạch toàn bộ các bảng nghiệp vụ
    const tablesToTruncate = [
      'attendance_appeals',
      'attendance_logs',
      'medical_claims',
      'ot_requests',
      'leave_requests',
      'leave_balances',
      'payslips',
      'payroll_periods',
      'task_logs',
      'tasks',
      'squad_messages',
      'squad_members',
      'squads',
      'projects',
      'company_notices',
      'notification_reads',
      'notifications',
      'performance_reviews',
      'pip_plans',
      'audit_logs',
      'refresh_tokens',
      'contracts',
      'user_roles',
      'users',
      'employees',
      'departments',
      'positions',
    ];

    console.log('🗑️  1. Xóa toàn bộ dữ liệu nghiệp vụ cũ (TRUNCATE RESTART IDENTITY CASCADE)...');
    for (const tbl of tablesToTruncate) {
      await client.query(`TRUNCATE TABLE "${tbl}" RESTART IDENTITY CASCADE;`);
    }

    // 2. Roles
    console.log('🛡️  2. Khởi tạo danh mục Phân quyền Roles chuẩn...');
    await client.query(`
      INSERT INTO roles (role_code, role_name, description, permissions) VALUES
        ('CEO', 'Tổng Giám Đốc', 'Cấp 1 — Lãnh đạo tối cao', '{"all": true}'),
        ('HR_DIRECTOR', 'Giám Đốc Nhân Sự', 'Cấp 2A — Quản lý toàn bộ nhân sự', '{"manage_employees": true, "manage_leave": true, "manage_payroll": true, "view_reports": true, "manage_ai": true}'),
        ('LINE_MANAGER', 'Trưởng Phòng', 'Cấp 2B — Quản lý nhân viên phòng ban', '{"view_team": true, "approve_leave": true, "manage_tasks": true, "create_projects": true}'),
        ('EMPLOYEE', 'Nhân Viên', 'Cấp 3 — Nhân viên tự phục vụ (ESS)', '{"view_self": true, "request_leave": true, "update_tasks": true}'),
        ('KIOSK', 'Kiosk Chấm Công', 'Thiết bị chấm công sảnh', '{"attendance_only": true}'),
        ('ADMIN', 'Quản Trị Hệ Thống', 'Quản trị viên kỹ thuật IT', '{"all": true}')
      ON CONFLICT (role_code) DO UPDATE SET
        role_name = EXCLUDED.role_name,
        description = EXCLUDED.description,
        permissions = EXCLUDED.permissions;
    `);

    // 3. Departments
    console.log('🏢 3. Khởi tạo 4 Phòng ban nghiệp vụ chính + Ban Điều Hành...');
    await client.query(`
      INSERT INTO departments (id, name, budget_yearly, description) VALUES
        ('DEPT-CEO', 'Ban Điều Hành & Lãnh Đạo', 5000000000, 'Ban Tổng Giám Đốc điều hành chiến lược toàn diện công ty'),
        ('DEPT-IT',  'Phòng Kỹ thuật Phần mềm',   4500000000, 'Phòng Kỹ thuật Phần mềm — Frontend, Backend, AI, DevOps & QA'),
        ('DEPT-HR',  'Phòng Quản trị Nhân sự',     2500000000, 'Quản lý tuyển dụng, tiền lương C&B, đào tạo & trải nghiệm nhân viên'),
        ('DEPT-MKT', 'Phòng Kinh doanh & Tiếp thị', 3800000000, 'Phát triển khách hàng B2B, Performance Marketing & Thương hiệu'),
        ('DEPT-FIN', 'Phòng Tài chính & Kế toán',  2000000000, 'Kế toán quản trị, dòng tiền, báo cáo thuế & kiểm toán nội bộ')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        budget_yearly = EXCLUDED.budget_yearly,
        description = EXCLUDED.description;
    `);

    // 4. Positions
    console.log('👔 4. Khởi tạo Chức danh Vị trí làm việc...');
    await client.query(`
      INSERT INTO positions (id, name, level) VALUES
        ('POS-CEO',  'Tổng Giám Đốc', 10),
        ('POS-DIR',  'Giám Đốc Khối', 9),
        ('POS-MGR',  'Trưởng Phòng', 8),
        ('POS-LEAD', 'Trưởng Nhóm / Lead', 7),
        ('POS-SR',   'Chuyên Viên Cấp Cao (Senior)', 6),
        ('POS-MID',  'Chuyên Viên (Mid-level)', 5),
        ('POS-JR',   'Nhân Viên (Junior)', 4),
        ('POS-INT',  'Thực Tập Sinh (Intern)', 2)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, level = EXCLUDED.level;
    `);

    // 5. Leave Types
    console.log('🌴 5. Khởi tạo Danh mục Loại Nghỉ phép...');
    await client.query(`
      INSERT INTO leave_types (id, name, code, max_days_per_year, is_paid, description) VALUES
        ('LT-AL', 'Nghỉ phép năm', 'PHEP_NAM', 12, TRUE, 'Phép năm hưởng nguyên lương theo Bộ luật Lao động Việt Nam'),
        ('LT-SL', 'Nghỉ ốm BHXH', 'NGHI_OM', 30, TRUE, 'Nghỉ ốm đau có giấy chứng nhận y tế C65 BHXH'),
        ('LT-PL', 'Nghỉ việc riêng', 'VIEC_RIENG', 3, TRUE, 'Nghỉ kết hôn, tang chế, hiếu hỉ theo quy chế công ty'),
        ('LT-ML', 'Nghỉ thai sản', 'THAI_SAN', 180, TRUE, 'Chế độ thai sản theo quy định BHXH'),
        ('LT-UL', 'Nghỉ không lương', 'KHONG_LUONG', 30, FALSE, 'Nghỉ việc cá nhân không hưởng lương'),
        ('LT-BT', 'Nghỉ công tác', 'CONG_TAC', 30, TRUE, 'Đi công tác đối ngoại ngoài văn phòng')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        max_days_per_year = EXCLUDED.max_days_per_year,
        is_paid = EXCLUDED.is_paid,
        description = EXCLUDED.description;
    `);

    // 6. 50 Employees (Giữ nguyên 4 tài khoản test chính + 46 nhân sự thực tế, tất cả dùng chung DEFAULT_AVATAR)
    console.log('👥 6. Khởi tạo 50 Hồ sơ Nhân sự với avatar đồng bộ /default-avatar.jpg...');
    const rawEmployees = [
      // 4 TÀI KHOẢN ĐĂNG NHẬP CHÍNH ĐỂ TEST (GIỮ NGUYÊN 100%)
      { id: 'NV-0001', name: 'Lê Vũ Ngọc Duy', dept: 'DEPT-CEO', pos: 'POS-CEO', title: 'Tổng Giám Đốc (CEO)', email: 'ceo@fwbnexus.vn', phone: '0901 000 001', citizen: '079185001001', gender: 'Nam', dob: '1985-05-12', salary: 80000000, joined: '2020-01-15', manager: null, role: 'CEO', bankAcc: '0071 0008 89988', bankName: 'Vietcombank', kpi: 99.0, attRate: 100, address: 'Biệt thự Khu Thảo Điền, TP. Thủ Đức, TP.HCM' },
      { id: 'NV-1001', name: 'Trần Mai Hương', dept: 'DEPT-HR', pos: 'POS-DIR', title: 'Giám Đốc Nhân Sự (HRD)', email: 'hrd@fwbnexus.vn', phone: '0901 000 002', citizen: '079188002002', gender: 'Nu', dob: '1988-08-20', salary: 55000000, joined: '2021-03-01', manager: 'NV-0001', role: 'HR_DIRECTOR', bankAcc: '1018 0099 11', bankName: 'Vietcombank', kpi: 98.0, attRate: 99.0, address: 'Vinhomes Central Park, Quận Bình Thạnh, TP.HCM' },
      { id: 'NV-1002', name: 'Vũ Đình Khang', dept: 'DEPT-IT', pos: 'POS-MGR', title: 'Trưởng Phòng Kỹ Thuật', email: 'lead@fwbnexus.vn', phone: '0901 000 003', citizen: '079190003003', gender: 'Nam', dob: '1990-11-15', salary: 45000000, joined: '2021-06-15', manager: 'NV-0001', role: 'LINE_MANAGER', bankAcc: '0071 9384 11', bankName: 'Vietcombank', kpi: 98.5, attRate: 100, address: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM' },
      { id: 'NV-0842', name: 'Phạm Minh Quân', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Kỹ Sư Phần Mềm (Frontend Lead)', email: 'employee@fwbnexus.vn', phone: '0901 000 004', citizen: '079196004004', gender: 'Nam', dob: '1996-04-18', salary: 28000000, joined: '2023-01-10', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 4455 66', bankName: 'Techcombank', kpi: 95.0, attRate: 98.0, address: 'Số 128 Nguyễn Thị Minh Khai, Quận 3, TP.HCM' },

      // DEPT-IT (16 nhân sự bổ sung -> Tổng 18 nhân sự IT)
      { id: 'NV-1003', name: 'Nguyễn Hoàng Nam', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Kỹ Sư Backend Cấp Cao (Node.js/Go)', email: 'nam.nguyen@fwbnexus.vn', phone: '0902 111 005', citizen: '079194005005', gender: 'Nam', dob: '1994-09-22', salary: 32000000, joined: '2022-04-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 8877 66', bankName: 'Techcombank', kpi: 96.0, attRate: 98.5, address: 'Quận Phú Nhuận, TP.HCM' },
      { id: 'NV-1004', name: 'Đặng Quỳnh Anh', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Chuyên Viên UI/UX Product Designer', email: 'anh.dang@fwbnexus.vn', phone: '0902 111 006', citizen: '079197006006', gender: 'Nu', dob: '1997-12-05', salary: 23000000, joined: '2023-05-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0381 2233 44', bankName: 'MB Bank', kpi: 94.0, attRate: 97.0, address: 'Quận 1, TP.HCM' },
      { id: 'NV-1005', name: 'Bùi Quốc Bảo', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Kỹ Sư DevOps & Điện Toán Đám Mây', email: 'bao.bui@fwbnexus.vn', phone: '0902 111 007', citizen: '079193007007', gender: 'Nam', dob: '1993-07-14', salary: 34000000, joined: '2022-02-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 5566 77', bankName: 'Vietcombank', kpi: 97.0, attRate: 99.0, address: 'Quận Tân Bình, TP.HCM' },
      { id: 'NV-1006', name: 'Hoàng Thảo Linh', dept: 'DEPT-IT', pos: 'POS-LEAD', title: 'Trưởng Nhóm Kiểm Thử QA/QC', email: 'linh.hoang@fwbnexus.vn', phone: '0902 111 008', citizen: '079195008008', gender: 'Nu', dob: '1995-03-30', salary: 26000000, joined: '2023-03-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1028 9988 77', bankName: 'Vietinbank', kpi: 95.5, attRate: 98.5, address: 'Quận Bình Thạnh, TP.HCM' },
      { id: 'NV-1007', name: 'Phan Thế Anh', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Kỹ Sư Mobile Flutter/iOS', email: 'anh.phan@fwbnexus.vn', phone: '0902 111 009', citizen: '079198009009', gender: 'Nam', dob: '1998-06-11', salary: 24000000, joined: '2023-09-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 6677 88', bankName: 'Techcombank', kpi: 93.0, attRate: 96.5, address: 'Quận 10, TP.HCM' },
      { id: 'NV-1008', name: 'Đỗ Bích Thảo', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Lập Trình Viên Frontend React', email: 'thao.do@fwbnexus.vn', phone: '0902 111 010', citizen: '079199010010', gender: 'Nu', dob: '1999-10-15', salary: 18000000, joined: '2024-02-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0341 8899 00', bankName: 'MB Bank', kpi: 92.0, attRate: 97.0, address: 'Quận Gò Vấp, TP.HCM' },
      { id: 'NV-1009', name: 'Vũ Trọng Hùng', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Kỹ Sư Quản Trị Cơ Sở Dữ Liệu (DBA)', email: 'hung.vu@fwbnexus.vn', phone: '0902 111 011', citizen: '079194011011', gender: 'Nam', dob: '1994-01-20', salary: 27000000, joined: '2022-08-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 3344 55', bankName: 'Vietcombank', kpi: 94.5, attRate: 99.0, address: 'Quận 7, TP.HCM' },
      { id: 'NV-1010', name: 'Lâm Gia Hân', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Kiểm Thử Viên Phần Mềm (QC Tester)', email: 'han.lam@fwbnexus.vn', phone: '0902 111 012', citizen: '079200012012', gender: 'Nu', dob: '2000-05-18', salary: 16500000, joined: '2024-04-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1038 4455 66', bankName: 'ACB', kpi: 91.0, attRate: 98.0, address: 'Quận 5, TP.HCM' },
      { id: 'NV-1011', name: 'Mai Văn Tuấn', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Kỹ Sư An Toàn Thông Tin & SecOps', email: 'tuan.mai@fwbnexus.vn', phone: '0902 111 013', citizen: '079195013013', gender: 'Nam', dob: '1995-11-28', salary: 29000000, joined: '2023-06-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 1122 33', bankName: 'Techcombank', kpi: 96.0, attRate: 98.5, address: 'TP. Thủ Đức, TP.HCM' },
      { id: 'NV-1012', name: 'Trịnh Mỹ Duyên', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Lập Trình Viên Backend API Node.js', email: 'duyen.trinh@fwbnexus.vn', phone: '0902 111 014', citizen: '079199014014', gender: 'Nu', dob: '1999-07-09', salary: 18500000, joined: '2024-01-10', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0371 4455 66', bankName: 'MB Bank', kpi: 92.5, attRate: 97.5, address: 'Quận 3, TP.HCM' },
      { id: 'NV-1013', name: 'Hồ Đăng Khoa', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Kỹ Sư Trí Tuệ Nhân Tạo & AI Vision', email: 'khoa.ho@fwbnexus.vn', phone: '0902 111 015', citizen: '079192015015', gender: 'Nam', dob: '1992-04-03', salary: 36000000, joined: '2022-09-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 8899 00', bankName: 'Vietcombank', kpi: 97.5, attRate: 99.5, address: 'Quận 1, TP.HCM' },
      { id: 'NV-1014', name: 'Ngô Thảo Trang', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Lập Trình Viên Giao Diện Web React', email: 'trang.ngo@fwbnexus.vn', phone: '0902 111 016', citizen: '079201016016', gender: 'Nu', dob: '2001-08-25', salary: 17000000, joined: '2025-01-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1018 7788 99', bankName: 'Vietinbank', kpi: 89.0, attRate: 96.0, address: 'Quận Tân Phú, TP.HCM' },
      { id: 'NV-1015', name: 'Dương Công Minh', dept: 'DEPT-IT', pos: 'POS-INT', title: 'Thực Tập Sinh Lập Trình Frontend', email: 'minh.duong@fwbnexus.vn', phone: '0902 111 017', citizen: '079203017017', gender: 'Nam', dob: '2003-02-14', salary: 9000000, joined: '2025-09-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 9900 11', bankName: 'Techcombank', kpi: 78.0, attRate: 93.0, address: 'TP. Thủ Đức, TP.HCM' },
      { id: 'NV-1016', name: 'Tạ Thu Hiền', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Chuyên Viên Phân Tích Nghiệp Vụ (BA)', email: 'hien.ta@fwbnexus.vn', phone: '0902 111 018', citizen: '079196018018', gender: 'Nu', dob: '1996-09-19', salary: 24000000, joined: '2023-04-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0391 5566 77', bankName: 'MB Bank', kpi: 95.0, attRate: 98.0, address: 'Quận Phú Nhuận, TP.HCM' },
      { id: 'NV-1017', name: 'Lý Quốc Cường', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Kỹ Sư Quản Trị Hạ Tầng Mạng', email: 'cuong.ly@fwbnexus.vn', phone: '0902 111 019', citizen: '079197019019', gender: 'Nam', dob: '1997-03-12', salary: 23500000, joined: '2023-10-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 2233 44', bankName: 'Vietcombank', kpi: 93.5, attRate: 97.5, address: 'Quận 11, TP.HCM' },
      { id: 'NV-1018', name: 'Lê Cẩm Ly', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Chuyên Viên Hỗ Trợ Kỹ Thuật (IT Helpdesk)', email: 'ly.le@fwbnexus.vn', phone: '0902 111 020', citizen: '079200020020', gender: 'Nu', dob: '2000-11-04', salary: 17500000, joined: '2024-03-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1048 6677 88', bankName: 'ACB', kpi: 91.5, attRate: 98.0, address: 'Quận Bình Thạnh, TP.HCM' },

      // DEPT-HR (10 nhân sự bổ sung + NV-1001 = 11 nhân sự HR)
      { id: 'NV-1101', name: 'Nguyễn Thu Trang', dept: 'DEPT-HR', pos: 'POS-MGR', title: 'Trưởng Nhóm Tuyển Dụng & Đào Tạo', email: 'trang.nguyen@fwbnexus.vn', phone: '0903 222 001', citizen: '079192021021', gender: 'Nu', dob: '1992-06-25', salary: 28000000, joined: '2021-08-01', manager: 'NV-1001', role: 'LINE_MANAGER', bankAcc: '0071 4455 66', bankName: 'Vietcombank', kpi: 96.0, attRate: 99.0, address: 'Quận 3, TP.HCM' },
      { id: 'NV-1102', name: 'Đinh Gia Bảo', dept: 'DEPT-HR', pos: 'POS-SR', title: 'Chuyên Viên Cấp Cao Tiền Lương & C&B', email: 'bao.dinh@fwbnexus.vn', phone: '0903 222 002', citizen: '079193022022', gender: 'Nam', dob: '1993-02-18', salary: 26000000, joined: '2022-01-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '1903 5566 77', bankName: 'Techcombank', kpi: 97.0, attRate: 100, address: 'Quận 1, TP.HCM' },
      { id: 'NV-1103', name: 'Chu Bảo Ngọc', dept: 'DEPT-HR', pos: 'POS-MID', title: 'Chuyên Viên Thu Hút Nhân Tài (Talent Acquisition)', email: 'ngoc.chu@fwbnexus.vn', phone: '0903 222 003', citizen: '079196023023', gender: 'Nu', dob: '1996-10-10', salary: 21000000, joined: '2023-02-01', manager: 'NV-1101', role: 'EMPLOYEE', bankAcc: '0351 7788 99', bankName: 'MB Bank', kpi: 94.0, attRate: 98.0, address: 'Quận Phú Nhuận, TP.HCM' },
      { id: 'NV-1104', name: 'Võ Đình Trọng', dept: 'DEPT-HR', pos: 'POS-MID', title: 'Chuyên Viên Pháp Chế & Quan Hệ Lao Động', email: 'trong.vo@fwbnexus.vn', phone: '0903 222 004', citizen: '079194024024', gender: 'Nam', dob: '1994-08-14', salary: 23000000, joined: '2022-11-01', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0071 7788 99', bankName: 'Vietcombank', kpi: 95.0, attRate: 98.5, address: 'Quận 7, TP.HCM' },
      { id: 'NV-1105', name: 'Trần Kim Ngân', dept: 'DEPT-HR', pos: 'POS-JR', title: 'Chuyên Viên Tổ Chức Đào Tạo Nội Bộ (L&D)', email: 'ngan.tran@fwbnexus.vn', phone: '0903 222 005', citizen: '079199025025', gender: 'Nu', dob: '1999-04-05', salary: 17000000, joined: '2024-01-15', manager: 'NV-1101', role: 'EMPLOYEE', bankAcc: '1028 1122 33', bankName: 'Vietinbank', kpi: 91.0, attRate: 97.0, address: 'Quận Tân Bình, TP.HCM' },
      { id: 'NV-1106', name: 'Phạm Minh Đức', dept: 'DEPT-HR', pos: 'POS-MID', title: 'Chuyên Viên Vận Hành Nhân Sự & Chấm Công Kiosk', email: 'duc.pham@fwbnexus.vn', phone: '0903 222 006', citizen: '079197026026', gender: 'Nam', dob: '1997-12-20', salary: 20000000, joined: '2023-07-01', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '1903 2233 44', bankName: 'Techcombank', kpi: 93.0, attRate: 99.0, address: 'Quận 4, TP.HCM' },
      { id: 'NV-1107', name: 'Lê Hải Yến', dept: 'DEPT-HR', pos: 'POS-JR', title: 'Chuyên Viên Trải Nghiệm & Gắn Kết Nhân Viên', email: 'yen.le@fwbnexus.vn', phone: '0903 222 007', citizen: '079200027027', gender: 'Nu', dob: '2000-03-15', salary: 16500000, joined: '2024-03-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0381 9900 11', bankName: 'MB Bank', kpi: 92.0, attRate: 97.5, address: 'Quận Bình Thạnh, TP.HCM' },
      { id: 'NV-1108', name: 'Đoàn Anh Khoa', dept: 'DEPT-HR', pos: 'POS-INT', title: 'Thực Tập Sinh Tuyển Dụng & Hành Chính', email: 'khoa.doan@fwbnexus.vn', phone: '0903 222 008', citizen: '079203028028', gender: 'Nam', dob: '2003-09-08', salary: 8500000, joined: '2025-08-01', manager: 'NV-1101', role: 'EMPLOYEE', bankAcc: '1058 3344 55', bankName: 'ACB', kpi: 86.0, attRate: 95.0, address: 'Quận 10, TP.HCM' },
      { id: 'NV-1109', name: 'Thái Nhật Lệ', dept: 'DEPT-HR', pos: 'POS-MID', title: 'Chuyên Viên Truyền Thông Nội Bộ & Văn Hóa', email: 'le.thai@fwbnexus.vn', phone: '0903 222 009', citizen: '079198029029', gender: 'Nu', dob: '1998-05-22', salary: 21000000, joined: '2023-08-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0071 6677 88', bankName: 'Vietcombank', kpi: 94.5, attRate: 98.0, address: 'Quận 3, TP.HCM' },
      { id: 'NV-1110', name: 'Nguyễn Thanh Tùng', dept: 'DEPT-HR', pos: 'POS-JR', title: 'Chuyên Viên Thủ Tục Nhân Sự & Hợp Đồng', email: 'tung.nguyen@fwbnexus.vn', phone: '0903 222 010', citizen: '079200050050', gender: 'Nam', dob: '2000-07-14', salary: 17000000, joined: '2024-04-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0071 9900 22', bankName: 'Vietcombank', kpi: 92.0, attRate: 98.0, address: 'Quận Gò Vấp, TP.HCM' },

      // DEPT-MKT (12 nhân sự)
      { id: 'NV-2001', name: 'Đỗ Minh Trí', dept: 'DEPT-MKT', pos: 'POS-MGR', title: 'Trưởng Phòng Kinh Doanh & Marketing', email: 'tri.do@fwbnexus.vn', phone: '0904 333 001', citizen: '079189030030', gender: 'Nam', dob: '1989-07-17', salary: 42000000, joined: '2021-05-01', manager: 'NV-0001', role: 'LINE_MANAGER', bankAcc: '0071 1122 33', bankName: 'Vietcombank', kpi: 97.5, attRate: 99.0, address: 'Quận 1, TP.HCM' },
      { id: 'NV-2002', name: 'Bùi Khánh Linh', dept: 'DEPT-MKT', pos: 'POS-SR', title: 'Trưởng Nhóm Digital & Growth Marketing', email: 'linh.bui@fwbnexus.vn', phone: '0904 333 002', citizen: '079193031031', gender: 'Nu', dob: '1993-11-25', salary: 27000000, joined: '2022-03-01', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '1903 7788 99', bankName: 'Techcombank', kpi: 96.0, attRate: 98.0, address: 'Quận 2, TP. Thủ Đức, TP.HCM' },
      { id: 'NV-2003', name: 'Vũ Tuấn Kiệt', dept: 'DEPT-MKT', pos: 'POS-SR', title: 'Trưởng Nhóm Kinh Doanh Khách Hàng B2B', email: 'kiet.vu@fwbnexus.vn', phone: '0904 333 003', citizen: '079192032032', gender: 'Nam', dob: '1992-03-19', salary: 29000000, joined: '2022-06-15', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '0361 2233 44', bankName: 'MB Bank', kpi: 96.5, attRate: 98.5, address: 'Quận 7, TP.HCM' },
      { id: 'NV-2004', name: 'Nguyễn Thanh Hằng', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'Chuyên Viên Quản Lý Khách Hàng Chiến Lược (Key Account)', email: 'hang.nguyen@fwbnexus.vn', phone: '0904 333 004', citizen: '079196033033', gender: 'Nu', dob: '1996-01-30', salary: 22000000, joined: '2023-01-15', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '1028 4455 66', bankName: 'Vietinbank', kpi: 94.0, attRate: 97.5, address: 'Quận Bình Thạnh, TP.HCM' },
      { id: 'NV-2005', name: 'Lương Văn Phú', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'Chuyên Viên Tối Ưu Quảng Cáo (Performance Ads)', email: 'phu.luong@fwbnexus.vn', phone: '0904 333 005', citizen: '079195034034', gender: 'Nam', dob: '1995-08-04', salary: 23000000, joined: '2023-04-01', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '1903 3344 55', bankName: 'Techcombank', kpi: 95.0, attRate: 98.0, address: 'Quận Phú Nhuận, TP.HCM' },
      { id: 'NV-2006', name: 'Huỳnh Ngọc Bích', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'Chuyên Viên Sáng Tạo Nội Dung & Copywriter', email: 'bich.huynh@fwbnexus.vn', phone: '0904 333 006', citizen: '079197035035', gender: 'Nu', dob: '1997-04-16', salary: 20000000, joined: '2023-09-15', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '0071 9900 11', bankName: 'Vietcombank', kpi: 93.0, attRate: 97.0, address: 'Quận 3, TP.HCM' },
      { id: 'NV-2007', name: 'Trương Tấn Phát', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'Chuyên Viên Phát Triển Thị Trường Doanh Nghiệp', email: 'phat.truong@fwbnexus.vn', phone: '0904 333 007', citizen: '079199036036', gender: 'Nam', dob: '1999-12-12', salary: 18000000, joined: '2024-02-01', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '0371 6677 88', bankName: 'MB Bank', kpi: 74.0, attRate: 91.5, address: 'Quận Tân Bình, TP.HCM' },
      { id: 'NV-2008', name: 'Đặng Phương Thảo', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'Chuyên Viên Quản Trị Kênh Số & Mạng Xã Hội', email: 'thao.dang@fwbnexus.vn', phone: '0904 333 008', citizen: '079200037037', gender: 'Nu', dob: '2000-06-20', salary: 17000000, joined: '2024-03-10', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '1068 5566 77', bankName: 'ACB', kpi: 91.5, attRate: 97.0, address: 'Quận 10, TP.HCM' },
      { id: 'NV-2009', name: 'Vương Gia Huy', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'Chuyên Viên Thiết Kế Đồ Họa Truyền Thông', email: 'huy.vuong@fwbnexus.vn', phone: '0904 333 009', citizen: '079198038038', gender: 'Nam', dob: '1998-09-05', salary: 18500000, joined: '2023-11-15', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '1903 0011 22', bankName: 'Techcombank', kpi: 93.5, attRate: 98.0, address: 'Quận 5, TP.HCM' },
      { id: 'NV-2010', name: 'Cao Thùy Dương', dept: 'DEPT-MKT', pos: 'POS-INT', title: 'Thực Tập Sinh Marketing & Sự Kiện', email: 'duong.cao@fwbnexus.vn', phone: '0904 333 010', citizen: '079203039039', gender: 'Nu', dob: '2003-04-28', salary: 8500000, joined: '2025-08-15', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '0391 1122 33', bankName: 'MB Bank', kpi: 88.5, attRate: 95.5, address: 'Quận Gò Vấp, TP.HCM' },
      { id: 'NV-2011', name: 'Hoàng Minh Quân', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'Chuyên Viên Tư Vấn Giải Pháp HR Tech', email: 'quan.hoang@fwbnexus.vn', phone: '0904 333 011', citizen: '079196040040', gender: 'Nam', dob: '1996-08-11', salary: 21500000, joined: '2023-05-01', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '0071 8877 66', bankName: 'Vietcombank', kpi: 94.0, attRate: 98.0, address: 'Quận 7, TP.HCM' },
      { id: 'NV-2012', name: 'Phùng Diệu Thúy', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'Chuyên Viên Chăm Sóc Khách Hàng (CSKH B2B)', email: 'thuy.phung@fwbnexus.vn', phone: '0904 333 012', citizen: '079201041041', gender: 'Nu', dob: '2001-01-17', salary: 16500000, joined: '2024-05-15', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '1038 8899 00', bankName: 'Vietinbank', kpi: 91.0, attRate: 97.5, address: 'Quận Bình Thạnh, TP.HCM' },

      // DEPT-FIN (8 nhân sự)
      { id: 'NV-3001', name: 'Nguyễn Bích Ngọc', dept: 'DEPT-FIN', pos: 'POS-MGR', title: 'Trưởng Phòng Tài Chính & Kế Toán Trưởng', email: 'ngoc.nguyen@fwbnexus.vn', phone: '0905 444 001', citizen: '079187042042', gender: 'Nu', dob: '1987-03-24', salary: 43000000, joined: '2021-02-01', manager: 'NV-0001', role: 'LINE_MANAGER', bankAcc: '0071 5544 33', bankName: 'Vietcombank', kpi: 98.0, attRate: 100, address: 'Quận 1, TP.HCM' },
      { id: 'NV-3002', name: 'Trần Quốc Thịnh', dept: 'DEPT-FIN', pos: 'POS-SR', title: 'Kế Toán Tổng Hợp & Báo Cáo Tài Chính', email: 'thinh.tran@fwbnexus.vn', phone: '0905 444 002', citizen: '079191043043', gender: 'Nam', dob: '1991-10-09', salary: 27000000, joined: '2022-04-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1903 4433 22', bankName: 'Techcombank', kpi: 96.5, attRate: 99.0, address: 'Quận 3, TP.HCM' },
      { id: 'NV-3003', name: 'Lê Hoàng Oanh', dept: 'DEPT-FIN', pos: 'POS-MID', title: 'Chuyên Viên Kế Toán Thuế & Kiểm Toán Nội Bộ', email: 'oanh.le@fwbnexus.vn', phone: '0905 444 003', citizen: '079194044044', gender: 'Nu', dob: '1994-06-16', salary: 23000000, joined: '2022-10-01', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '0341 3322 11', bankName: 'MB Bank', kpi: 95.0, attRate: 98.5, address: 'Quận Phú Nhuận, TP.HCM' },
      { id: 'NV-3004', name: 'Phan Anh Vũ', dept: 'DEPT-FIN', pos: 'POS-MID', title: 'Chuyên Viên Quản Trị Ngân Sách & Dòng Tiền', email: 'vu.phan@fwbnexus.vn', phone: '0905 444 004', citizen: '079195045045', gender: 'Nam', dob: '1995-12-03', salary: 24000000, joined: '2023-03-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '0071 9988 77', bankName: 'Vietcombank', kpi: 95.5, attRate: 98.0, address: 'Quận 7, TP.HCM' },
      { id: 'NV-3005', name: 'Tạ Thúy Nga', dept: 'DEPT-FIN', pos: 'POS-JR', title: 'Chuyên Viên Kế Toán Thanh Toán & Công Nợ', email: 'nga.ta@fwbnexus.vn', phone: '0905 444 005', citizen: '079199046046', gender: 'Nu', dob: '1999-05-27', salary: 18000000, joined: '2023-12-01', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1028 6655 44', bankName: 'Vietinbank', kpi: 92.0, attRate: 97.5, address: 'Quận Bình Thạnh, TP.HCM' },
      { id: 'NV-3006', name: 'Quách Hữu Tài', dept: 'DEPT-FIN', pos: 'POS-JR', title: 'Chuyên Viên Kế Toán Tài Sản & Kho Quản Trị', email: 'tai.quach@fwbnexus.vn', phone: '0905 444 006', citizen: '079198047047', gender: 'Nam', dob: '1998-11-18', salary: 17500000, joined: '2024-02-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1903 8899 11', bankName: 'Techcombank', kpi: 91.5, attRate: 98.0, address: 'Quận Tân Bình, TP.HCM' },
      { id: 'NV-3007', name: 'Dương Diễm My', dept: 'DEPT-FIN', pos: 'POS-JR', title: 'Thủ Quỹ Doanh Nghiệp & Quản Lý Quỹ Tiền Mặt', email: 'my.duong@fwbnexus.vn', phone: '0905 444 007', citizen: '079200048048', gender: 'Nu', dob: '2000-08-08', salary: 16500000, joined: '2024-04-10', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '0371 9988 77', bankName: 'MB Bank', kpi: 92.5, attRate: 98.5, address: 'Quận 10, TP.HCM' },
      { id: 'NV-3008', name: 'Kiều Minh Tuấn', dept: 'DEPT-FIN', pos: 'POS-INT', title: 'Thực Tập Sinh Kế Toán Doanh Nghiệp', email: 'tuan.kieu@fwbnexus.vn', phone: '0905 444 008', citizen: '079203049049', gender: 'Nam', dob: '2003-01-22', salary: 8500000, joined: '2025-07-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1078 2233 44', bankName: 'ACB', kpi: 89.0, attRate: 96.0, address: 'Quận Gò Vấp, TP.HCM' },
    ];

    for (const emp of rawEmployees) {
      await client.query(`
        INSERT INTO employees (
          id, full_name, department_id, position_id, job_title, work_email, phone_number,
          citizen_id, date_of_birth, gender, address, base_salary, contract_type, joined_date,
          status, avatar_url, bank_account, bank_name, kpi_score, attendance_rate
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'CHINH_THUC', $13,
          'DANG_LAM_VIEC', $14, $15, $16, $17, $18
        );
      `, [
        emp.id, emp.name, emp.dept, emp.pos, emp.title, emp.email, emp.phone,
        emp.citizen, emp.dob, emp.gender, emp.address, emp.salary, emp.joined,
        DEFAULT_AVATAR, emp.bankAcc, emp.bankName, emp.kpi, emp.attRate,
      ]);
    }

    // Cập nhật manager_id
    for (const emp of rawEmployees) {
      if (emp.manager) {
        await client.query(`UPDATE employees SET manager_id = $1 WHERE id = $2;`, [emp.manager, emp.id]);
      }
    }
    await client.query(`UPDATE departments SET manager_id = 'NV-0001' WHERE id = 'DEPT-CEO';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-1002' WHERE id = 'DEPT-IT';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-1001' WHERE id = 'DEPT-HR';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-2001' WHERE id = 'DEPT-MKT';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-3001' WHERE id = 'DEPT-FIN';`);

    // 7. Users & Roles
    console.log('🔐 7. Khởi tạo 50 Tài khoản Users (giữ nguyên 4 tài khoản test chính)...');
    const defaultPasswordHash = await bcrypt.hash('User@123456', 10);
    const ceoHash = await bcrypt.hash('Ceo@123456', 10);
    const hrdHash = await bcrypt.hash('Hrd@123456', 10);
    const leadHash = await bcrypt.hash('Lead@123456', 10);
    const empHash = await bcrypt.hash('Emp@123456', 10);

    for (const emp of rawEmployees) {
      let pwd = defaultPasswordHash;
      if (emp.id === 'NV-0001') pwd = ceoHash;
      else if (emp.id === 'NV-1001') pwd = hrdHash;
      else if (emp.id === 'NV-1002') pwd = leadHash;
      else if (emp.id === 'NV-0842') pwd = empHash;

      await client.query(`
        INSERT INTO users (employee_id, email, password_hash, role_code, is_active, failed_login_attempts, must_change_password, last_login_at)
        VALUES ($1, $2, $3, $4, true, 0, false, '2026-10-25 08:15:00+07');
      `, [emp.id, emp.email, pwd, emp.role]);
    }

    await client.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id FROM users u JOIN roles r ON u.role_code = r.role_code;
    `);

    // 8. Hợp đồng lao động (contracts)
    console.log('📜 8. Khởi tạo 50 Hợp đồng Lao động chính thức...');
    await client.query(`
      INSERT INTO contracts (id, employee_id, contract_no, type, start_date, end_date, salary, status, signed_at, note)
      SELECT
        'CTR-2026-' || id,
        id,
        'HDLD-2026/' || id,
        contract_type,
        joined_date,
        (joined_date + INTERVAL '3 years')::date,
        base_salary,
        'HIEU_LUC',
        (joined_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'),
        'Hợp đồng lao động xác định thời hạn 36 tháng'
      FROM employees;
    `);

    // 9. Đơn nghỉ phép từ đầu năm 2026 (01/2026 -> 10/2026) & Quỹ phép 2026
    console.log('📝 9. Khởi tạo Đơn nghỉ phép thực tế từ tháng 01/2026 đến tháng 10/2026 & Quỹ phép 2026...');
    const leaveRequestsData = [
      // Tháng 01/2026 - 08/2026 (Đã phê duyệt)
      { id: 'LP-2026-001', emp: 'NV-0842', type: 'LT-AL', start: '2026-01-22', end: '2026-01-23', days: 2.0, reason: 'Nghỉ phép giải quyết việc gia đình cuối năm âm lịch', stage: 'DA_PHE_DUYET', mgr: 'NV-1002', hr: 'NV-1001', handover: 'Nguyễn Hoàng Nam', sub: '2026-01-18 09:00:00+07' },
      { id: 'LP-2026-002', emp: 'NV-1003', type: 'LT-AL', start: '2026-02-12', end: '2026-02-13', days: 2.0, reason: 'Nghỉ phép năm kết hợp thăm gia đình sau Tết', stage: 'DA_PHE_DUYET', mgr: 'NV-1002', hr: 'NV-1001', handover: 'Phạm Minh Quân', sub: '2026-02-05 10:15:00+07' },
      { id: 'LP-2026-003', emp: 'NV-2002', type: 'LT-AL', start: '2026-03-16', end: '2026-03-17', days: 2.0, reason: 'Nghỉ phép cá nhân đi khám sức khỏe chuyên khoa', stage: 'DA_PHE_DUYET', mgr: 'NV-2001', hr: 'NV-1001', handover: 'Lương Văn Phú', sub: '2026-03-12 14:20:00+07' },
      { id: 'LP-2026-004', emp: 'NV-3002', type: 'LT-AL', start: '2026-04-20', end: '2026-04-21', days: 2.0, reason: 'Nghỉ phép năm sau kỳ quyết toán thuế Quý I/2026', stage: 'DA_PHE_DUYET', mgr: 'NV-3001', hr: 'NV-1001', handover: 'Lê Hoàng Oanh', sub: '2026-04-15 11:00:00+07' },
      { id: 'LP-2026-005', emp: 'NV-0842', type: 'LT-AL', start: '2026-05-14', end: '2026-05-15', days: 1.5, reason: 'Nghỉ phép năm đưa người thân đi khám bệnh', stage: 'DA_PHE_DUYET', mgr: 'NV-1002', hr: 'NV-1001', handover: 'Đỗ Bích Thảo', sub: '2026-05-10 08:45:00+07' },
      { id: 'LP-2026-006', emp: 'NV-1005', type: 'LT-AL', start: '2026-06-08', end: '2026-06-10', days: 3.0, reason: 'Nghỉ phép hè cùng gia đình theo kế hoạch', stage: 'DA_PHE_DUYET', mgr: 'NV-1002', hr: 'NV-1001', handover: 'Vũ Trọng Hùng', sub: '2026-06-01 09:30:00+07' },
      { id: 'LP-2026-007', emp: 'NV-1102', type: 'LT-AL', start: '2026-07-13', end: '2026-07-14', days: 2.0, reason: 'Nghỉ phép năm giải quyết thủ tục giấy tờ nhà đất', stage: 'DA_PHE_DUYET', mgr: 'NV-1001', hr: 'NV-1001', handover: 'Võ Đình Trọng', sub: '2026-07-08 15:10:00+07' },
      { id: 'LP-2026-008', emp: 'NV-2003', type: 'LT-BT', start: '2026-08-19', end: '2026-08-21', days: 3.0, reason: 'Đi công tác gặp gỡ đối tác doanh nghiệp tại Đà Nẵng', stage: 'DA_PHE_DUYET', mgr: 'NV-2001', hr: 'NV-1001', handover: 'Nguyễn Thanh Hằng', sub: '2026-08-14 16:00:00+07' },
      // Tháng 09/2026 - 10/2026 (Đã phê duyệt)
      { id: 'LP-2026-009', emp: 'NV-1001', type: 'LT-AL', start: '2026-09-15', end: '2026-09-16', days: 2.0, reason: 'Nghỉ phép năm tái tạo năng lượng', stage: 'DA_PHE_DUYET', mgr: 'NV-0001', hr: 'NV-0001', handover: 'Nguyễn Thu Trang', sub: '2026-09-10 09:00:00+07' },
      { id: 'LP-2026-010', emp: 'NV-3002', type: 'LT-SL', start: '2026-09-22', end: '2026-09-23', days: 2.0, reason: 'Nghỉ ốm theo chỉ định của bác sĩ bệnh viện (có giấy C65)', stage: 'DA_PHE_DUYET', mgr: 'NV-3001', hr: 'NV-1001', handover: 'Lê Hoàng Oanh', sub: '2026-09-21 18:00:00+07' },
      { id: 'LP-2026-011', emp: 'NV-1004', type: 'LT-AL', start: '2026-10-08', end: '2026-10-09', days: 2.0, reason: 'Nghỉ phép năm tham dự lễ cưới em gái tại quê', stage: 'DA_PHE_DUYET', mgr: 'NV-1002', hr: 'NV-1001', handover: 'Phạm Minh Quân', sub: '2026-10-03 10:00:00+07' },
      { id: 'LP-2026-012', emp: 'NV-1013', type: 'LT-AL', start: '2026-10-15', end: '2026-10-16', days: 2.0, reason: 'Nghỉ phép năm cá nhân sau khi hoàn thành mốc Sprint AI', stage: 'DA_PHE_DUYET', mgr: 'NV-1002', hr: 'NV-1001', handover: 'Nguyễn Hoàng Nam', sub: '2026-10-10 11:20:00+07' },
      // Đơn đang chờ duyệt (để Trưởng phòng & HRD thao tác duyệt trên web)
      { id: 'LP-2026-013', emp: 'NV-0842', type: 'LT-AL', start: '2026-10-28', end: '2026-10-28', days: 1.0, reason: 'Giải quyết công việc gia đình cá nhân', stage: 'CHO_TRUONG_PHONG_DUYET', mgr: null, hr: null, handover: 'Đỗ Bích Thảo', sub: '2026-10-24 14:30:00+07' },
      { id: 'LP-2026-014', emp: 'NV-1008', type: 'LT-AL', start: '2026-10-29', end: '2026-10-30', days: 2.0, reason: 'Nghỉ phép về quê gia đình có việc hiếu hỉ', stage: 'CHO_TRUONG_PHONG_DUYET', mgr: null, hr: null, handover: 'Phạm Minh Quân', sub: '2026-10-24 16:00:00+07' },
      { id: 'LP-2026-015', emp: 'NV-1002', type: 'LT-BT', start: '2026-11-02', end: '2026-11-04', days: 3.0, reason: 'Tham gia Hội thảo Công nghệ Phần mềm Quốc gia Vietnam Tech 2026', stage: 'CHO_HR_PHE_CHUAN', mgr: 'NV-0001', hr: null, handover: 'Phạm Minh Quân', sub: '2026-10-23 09:30:00+07' },
      { id: 'LP-2026-016', emp: 'NV-2001', type: 'LT-BT', start: '2026-11-05', end: '2026-11-06', days: 2.0, reason: 'Gặp gỡ ký kết hợp tác đối tác chiến lược tại Hà Nội', stage: 'CHO_HR_PHE_CHUAN', mgr: 'NV-0001', hr: null, handover: 'Bùi Khánh Linh', sub: '2026-10-23 15:00:00+07' },
      // Đơn bị từ chối
      { id: 'LP-2026-017', emp: 'NV-2007', type: 'LT-UL', start: '2026-10-19', end: '2026-10-20', days: 2.0, reason: 'Xin nghỉ việc riêng không hưởng lương', stage: 'TU_CHOI', mgr: 'NV-2001', hr: null, handover: 'Đặng Phương Thảo', sub: '2026-10-15 10:00:00+07', mgrNote: 'Bộ phận đang tập trung chốt chiến dịch kinh doanh Quý IV, đề nghị bố trí dịp khác.' },
    ];

    for (const lr of leaveRequestsData) {
      await client.query(`
        INSERT INTO leave_requests (
          id, employee_id, leave_type_id, start_date, end_date, total_days,
          reason, handover_to, stage, manager_approved_by, manager_approved_at,
          manager_note, hr_approved_by, hr_approved_at, hr_note, submitted_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          CASE WHEN $10::varchar IS NOT NULL THEN ($14::timestamptz + INTERVAL '4 hours') ELSE NULL END,
          $11, $12,
          CASE WHEN $12::varchar IS NOT NULL THEN ($14::timestamptz + INTERVAL '8 hours') ELSE NULL END,
          $13, $14::timestamptz
        );
      `, [
        lr.id, lr.emp, lr.type, lr.start, lr.end, lr.days,
        lr.reason, lr.handover, lr.stage, lr.mgr,
        lr.mgrNote || (lr.mgr ? 'Đồng ý phê duyệt theo kế hoạch công việc' : null),
        lr.hr,
        lr.hr ? 'Phòng Nhân sự đã đối soát và phê chuẩn' : null,
        lr.sub,
      ]);
    }

    // Tính số ngày phép năm đã sử dụng cho từng nhân viên trong năm 2026
    const usedMap = new Map();
    for (const lr of leaveRequestsData) {
      if (lr.stage === 'DA_PHE_DUYET' && lr.type === 'LT-AL') {
        usedMap.set(lr.emp, (usedMap.get(lr.emp) || 0) + lr.days);
      }
    }

    for (let i = 0; i < rawEmployees.length; i++) {
      const emp = rawEmployees[i];
      // Nhân viên chưa có đơn trong danh sách mẫu có thể đã dùng 1-2 ngày phép đầu năm
      const usedDays = usedMap.has(emp.id)
        ? usedMap.get(emp.id)
        : (emp.id === 'NV-0001' ? 1.0 : (i % 4 === 0 ? 2.0 : (i % 3 === 0 ? 1.0 : 0.0)));
      await client.query(`
        INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
        VALUES ($1, 'LT-AL', 2026, 12, $2)
        ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE SET
          total_days = EXCLUDED.total_days,
          used_days = EXCLUDED.used_days;
      `, [emp.id, usedDays]);
    }

    // 10. Chấm công thực tế từ tháng 01/2026 đến tháng 10/2026 (bao gồm hôm nay 2026-10-25)
    console.log('⏱️  10. Khởi tạo Dữ liệu Chấm công từ tháng 01/2026 đến 25/10/2026 cho 50 nhân sự...');
    const sampleDatesByMonth = [
      // Tháng 01/2026 -> 09/2026: các ngày làm việc tiêu biểu mỗi tháng
      '2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26',
      '2026-02-02', '2026-02-09', '2026-02-23', '2026-02-26',
      '2026-03-03', '2026-03-10', '2026-03-18', '2026-03-25',
      '2026-04-02', '2026-04-09', '2026-04-16', '2026-04-23',
      '2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26',
      '2026-06-02', '2026-06-09', '2026-06-16', '2026-06-24',
      '2026-07-02', '2026-07-09', '2026-07-16', '2026-07-23',
      '2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25',
      '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-09-29', '2026-09-30',
      // Tháng 10/2026 đầy đủ các ngày làm việc + ngày hôm qua & hôm nay (2026-10-25)
      '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
      '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14',
      '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21',
      '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ];

    const attValues = [];
    const attParams = [];
    let pIdx = 1;

    for (let dIdx = 0; dIdx < sampleDatesByMonth.length; dIdx++) {
      const workDate = sampleDatesByMonth[dIdx];
      for (let eIdx = 0; eIdx < rawEmployees.length; eIdx++) {
        const emp = rawEmployees[eIdx];
        const seed = (dIdx * 31 + eIdx * 17) % 100;
        let status = 'DUNG_GIO';
        let lateMinutes = 0;
        let checkInHour = 7;
        let checkInMin = 45 + (seed % 14); // 07:45 -> 07:58
        let workHours = 8.5;
        let otHours = 0;
        const method = (eIdx % 3 === 0) ? 'face_id' : (eIdx % 3 === 1 ? 'kiosk' : 'gps');

        // Một số trường hợp đi muộn thực tế (bao gồm ngày 2026-10-25 cho Dashboard)
        if ((workDate === '2026-10-25' && (eIdx === 5 || eIdx === 14 || eIdx === 26 || eIdx === 37)) ||
            (workDate !== '2026-10-25' && seed >= 92 && emp.id !== 'NV-0001')) {
          status = 'DI_MUON';
          lateMinutes = 12 + (seed % 25);
          checkInHour = 8;
          checkInMin = lateMinutes;
          workHours = 7.75;
        } else if (seed === 45 && emp.id !== 'NV-0001' && workDate !== '2026-10-25') {
          status = 'VE_SOM';
          workHours = 7.5;
        } else if (seed >= 20 && seed <= 24 && eIdx % 5 === 0) {
          otHours = 2.0;
          workHours = 10.5;
        }

        const inTime = `${workDate} ${String(checkInHour).padStart(2, '0')}:${String(checkInMin).padStart(2, '0')}:00+07`;
        const outHour = otHours > 0 ? 19 : 17;
        const outMin = status === 'VE_SOM' ? 0 : 45;
        const outTime = `${workDate} ${String(outHour).padStart(2, '0')}:${String(outMin).padStart(2, '0')}:00+07`;
        const conf = (98.6 + (seed % 13) * 0.1).toFixed(1);

        attValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, 10.7769, 106.7009, 'Trụ sở chính Tòa nhà NEXUS, Tầng 12, Quận 1, TP.HCM', 12)`);
        attParams.push(emp.id, workDate, inTime, outTime, method, status, lateMinutes, workHours, otHours, conf);

        if (attValues.length >= 400) {
          await client.query(`
            INSERT INTO attendance_logs (
              employee_id, work_date, check_in_time, check_out_time, check_in_method,
              status, late_minutes, work_hours, ot_hours, face_confidence,
              check_in_lat, check_in_lng, check_in_address, distance_meters
            ) VALUES ${attValues.join(', ')};
          `, attParams);
          attValues.length = 0;
          attParams.length = 0;
          pIdx = 1;
        }
      }
    }
    if (attValues.length > 0) {
      await client.query(`
        INSERT INTO attendance_logs (
          employee_id, work_date, check_in_time, check_out_time, check_in_method,
          status, late_minutes, work_hours, ot_hours, face_confidence,
          check_in_lat, check_in_lng, check_in_address, distance_meters
        ) VALUES ${attValues.join(', ')};
      `, attParams);
    }

    // 11. Giải trình chấm công (attendance_appeals), Đơn tăng ca (ot_requests) & Khám chữa bệnh (medical_claims)
    console.log('📋 11. Khởi tạo Giải trình chấm công, Đơn tăng ca (OT) & Bảo hiểm y tế (C65)...');
    await client.query(`
      INSERT INTO attendance_appeals (
        id, employee_id, employee_name, department_name, date, appeal_type,
        reason, status, review_note, reviewer_id, reviewer_name, created_at, reviewed_at
      ) VALUES
        ('EXP-2026-001', 'NV-0842', 'Phạm Minh Quân', 'Phòng Kỹ thuật Phần mềm', '2026-03-18', 'Quên chấm công ra', 'Đi họp trực tiếp với khách hàng tại Quận 1 đến 18h30 nên quên check-out tại Kiosk', 'DA_DUYET', 'Xác nhận lịch họp với khách hàng hợp lệ', 'NV-1002', 'Vũ Đình Khang', '2026-03-19 08:30:00', '2026-03-19 10:15:00'),
        ('EXP-2026-002', 'NV-1004', 'Đặng Quỳnh Anh', 'Phòng Kỹ thuật Phần mềm', '2026-06-16', 'Đi muộn do sự cố giao thông', 'Kẹt xe nghiêm trọng tại cầu Sài Gòn do mưa lớn buổi sáng', 'DA_DUYET', 'Đồng ý ghi nhận công chuẩn', 'NV-1002', 'Vũ Đình Khang', '2026-06-16 09:10:00', '2026-06-16 14:00:00'),
        ('EXP-2026-003', 'NV-2005', 'Lương Văn Phú', 'Phòng Kinh doanh & Tiếp thị', '2026-09-14', 'Công tác ngoài văn phòng', 'Đi quay TVC quảng cáo tại phim trường Thủ Đức từ 07:30 sáng', 'DA_DUYET', 'Đã đối chiếu lịch sản xuất Marketing', 'NV-2001', 'Đỗ Minh Trí', '2026-09-14 11:00:00', '2026-09-14 16:30:00'),
        ('EXP-2026-004', 'NV-1008', 'Đỗ Bích Thảo', 'Phòng Kỹ thuật Phần mềm', '2026-10-21', 'Lỗi nhận diện Kiosk', 'Kiosk sảnh A1 đang cập nhật firmware lúc 07:55 nên hệ thống ghi nhận trễ 14 phút', 'CHO_DUYET', NULL, NULL, NULL, '2026-10-21 09:00:00', NULL),
        ('EXP-2026-005', 'NV-2007', 'Trương Tấn Phát', 'Phòng Kinh doanh & Tiếp thị', '2026-10-22', 'Đi muộn cá nhân', 'Hỏng xe trên đường đi làm lúc 07:50 sáng', 'CHO_DUYET', NULL, NULL, NULL, '2026-10-22 09:20:00', NULL);
    `);

    await client.query(`
      INSERT INTO ot_requests (
        id, employee_id, work_date, start_time, end_time, hours, reason, stage,
        manager_approved_by, manager_approved_at, manager_note,
        hr_approved_by, hr_approved_at, hr_note, submitted_at
      ) VALUES
        ('OT-2026-001', 'NV-0842', '2026-02-26', '18:00', '20:30', 2.5, 'Triển khai bản phát hành hệ thống đầu năm 2026', 'DA_PHE_DUYET', 'NV-1002', '2026-02-26 17:00:00+07', 'Đồng ý OT release', 'NV-1001', '2026-02-27 09:00:00+07', 'Đã ghi nhận vào bảng lương tháng 02/2026', '2026-02-26 15:00:00+07'),
        ('OT-2026-002', 'NV-1005', '2026-05-19', '18:00', '21:00', 3.0, 'Nâng cấp cụm cơ sở dữ liệu PostgreSQL Production', 'DA_PHE_DUYET', 'NV-1002', '2026-05-19 16:30:00+07', 'Đồng ý bảo trì hạ tầng', 'NV-1001', '2026-05-20 09:30:00+07', 'Đã tính phụ cấp OT 150%', '2026-05-19 14:00:00+07'),
        ('OT-2026-003', 'NV-3002', '2026-07-16', '18:00', '20:00', 2.0, 'Hoàn tất báo cáo quyết toán tài chính bán niên H1/2026', 'DA_PHE_DUYET', 'NV-3001', '2026-07-16 17:15:00+07', 'Xác nhận khối lượng báo cáo H1', 'NV-1001', '2026-07-17 08:45:00+07', 'Đã phê chuẩn OT', '2026-07-16 15:30:00+07'),
        ('OT-2026-004', 'NV-1013', '2026-09-28', '18:00', '21:00', 3.0, 'Huấn luyện và kiểm thử mô hình Grounded AI Copilot V1', 'DA_PHE_DUYET', 'NV-1002', '2026-09-28 17:00:00+07', 'Đồng ý tăng ca dự án AI', 'NV-1001', '2026-09-29 09:00:00+07', 'Đã đưa vào lương tháng 09/2026', '2026-09-28 15:00:00+07'),
        ('OT-2026-005', 'NV-0842', '2026-10-23', '18:00', '20:00', 2.0, 'Kiểm thử nghiệm thu UAT giao diện Portal và AI Copilot', 'CHO_TRUONG_PHONG_DUYET', NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-23 16:30:00+07'),
        ('OT-2026-006', 'NV-1003', '2026-10-24', '18:00', '20:30', 2.5, 'Tối ưu hiệu năng truy vấn API Dashboard & Payroll', 'CHO_HR_PHE_CHUAN', 'NV-1002', '2026-10-24 17:30:00+07', 'Trưởng phòng Kỹ thuật đã xác nhận', NULL, NULL, NULL, '2026-10-24 16:00:00+07');
    `);

    await client.query(`
      INSERT INTO medical_claims (
        id, employee_id, claim_date, amount, hospital, description, leave_request_id, stage,
        manager_approved_by, manager_approved_at, hr_approved_by, hr_approved_at, hr_note, submitted_at
      ) VALUES
        ('MED-2026-001', 'NV-3002', '2026-09-23', 1850000, 'Bệnh viện Đa khoa Quốc tế Vinmec Central Park', 'Khám và điều trị sốt siêu vi theo chế độ BHXH + Bảo hiểm sức khỏe công ty', 'LP-2026-010', 'DA_PHE_DUYET', 'NV-3001', '2026-09-24 09:00:00+07', 'NV-1001', '2026-09-24 14:00:00+07', 'Đã duyệt chi trả cùng kỳ lương tháng 09/2026', '2026-09-23 16:00:00+07'),
        ('MED-2026-002', 'NV-1004', '2026-06-12', 1200000, 'Bệnh viện Đại học Y Dược TP.HCM', 'Khám chuyên khoa mắt và cấp thuốc điều trị hội chứng thị giác màn hình', NULL, 'DA_PHE_DUYET', 'NV-1002', '2026-06-13 10:00:00+07', 'NV-1001', '2026-06-13 15:30:00+07', 'Hóa đơn GTGT hợp lệ theo hạn mức phúc lợi', '2026-06-12 17:00:00+07'),
        ('MED-2026-003', 'NV-0842', '2026-10-20', 950000, 'Phòng khám Đa khoa Quốc tế Victoria Healthcare', 'Khám kiểm tra sức khỏe định kỳ bổ sung và xét nghiệm sinh hóa', NULL, 'CHO_HR_PHE_CHUAN', 'NV-1002', '2026-10-21 09:30:00+07', NULL, NULL, NULL, '2026-10-20 15:45:00+07');
    `);

    // 12. Bảng lương & Phiếu lương trọn vẹn 10 kỳ từ Tháng 01/2026 -> Tháng 10/2026 (500 phiếu lương)
    console.log('💰 12. Khởi tạo 10 Kỳ lương (2026-01 -> 2026-10) và 500 Phiếu lương thực tế...');
    const periodsConfig = [
      { period: '2026-01', status: 'DA_CHUYEN_KHOAN', paidDate: '2026-02-05', stdDays: 22, lockedAt: '2026-02-03 17:00:00+07', note: 'Bảng lương tháng 01/2026 — Đã tất toán chuyển khoản qua Vietcombank' },
      { period: '2026-02', status: 'DA_CHUYEN_KHOAN', paidDate: '2026-03-05', stdDays: 20, lockedAt: '2026-03-03 17:00:00+07', note: 'Bảng lương tháng 02/2026 (kỳ nghỉ Tết Bính Ngọ) — Đã tất toán' },
      { period: '2026-03', status: 'DA_CHUYEN_KHOAN', paidDate: '2026-04-05', stdDays: 22, lockedAt: '2026-04-03 17:00:00+07', note: 'Bảng lương tháng 03/2026 — Đã tất toán chuyển khoản' },
      { period: '2026-04', status: 'DA_CHUYEN_KHOAN', paidDate: '2026-05-05', stdDays: 22, lockedAt: '2026-05-03 17:00:00+07', note: 'Bảng lương tháng 04/2026 — Đã tất toán chuyển khoản' },
      { period: '2026-05', status: 'DA_CHUYEN_KHOAN', paidDate: '2026-06-05', stdDays: 21, lockedAt: '2026-06-03 17:00:00+07', note: 'Bảng lương tháng 05/2026 — Đã tất toán chuyển khoản' },
      { period: '2026-06', status: 'DA_CHUYEN_KHOAN', paidDate: '2026-07-05', stdDays: 22, lockedAt: '2026-07-03 17:00:00+07', note: 'Bảng lương tháng 06/2026 & thưởng sơ kết H1/2026 — Đã tất toán' },
      { period: '2026-07', status: 'DA_CHUYEN_KHOAN', paidDate: '2026-08-05', stdDays: 23, lockedAt: '2026-08-03 17:00:00+07', note: 'Bảng lương tháng 07/2026 — Đã tất toán chuyển khoản' },
      { period: '2026-08', status: 'DA_CHUYEN_KHOAN', paidDate: '2026-09-05', stdDays: 21, lockedAt: '2026-09-03 17:00:00+07', note: 'Bảng lương tháng 08/2026 — Đã giải ngân quyết toán thành công qua Vietcombank' },
      { period: '2026-09', status: 'DA_CHUYEN_KHOAN', paidDate: '2026-10-05', stdDays: 22, lockedAt: '2026-10-03 17:00:00+07', note: 'Bảng lương tháng 09/2026 & thưởng Quý III/2026 — Đã giải ngân chuyển khoản' },
      { period: '2026-10', status: 'DU_THAO',         paidDate: null,         stdDays: 22, lockedAt: null,                     note: 'Bảng lương tổng hợp tháng 10/2026 đang đối soát dữ liệu chấm công (Dự thảo)' },
    ];

    for (let mIdx = 0; mIdx < periodsConfig.length; mIdx++) {
      const pCfg = periodsConfig[mIdx];
      const periodRes = await client.query(`
        INSERT INTO payroll_periods (period, total_headcount, total_net, total_bhxh, total_tax, total_ot_hours, status, locked_by, locked_at, note)
        VALUES ($1, 50, 0, 0, 0, 0, $2, $3, $4, $5)
        RETURNING id;
      `, [
        pCfg.period,
        pCfg.status,
        pCfg.lockedAt ? 'NV-1001' : null,
        pCfg.lockedAt,
        pCfg.note,
      ]);
      const periodId = periodRes.rows[0].id;

      let sumNet = 0, sumBhxh = 0, sumTax = 0, sumOtHours = 0;

      for (let eIdx = 0; eIdx < rawEmployees.length; eIdx++) {
        const emp = rawEmployees[eIdx];
        const baseSalary = Number(emp.salary);
        const standardDays = pCfg.stdDays;
        const actualDays = standardDays;
        const allowances = baseSalary >= 40000000 ? 5000000 : (baseSalary >= 25000000 ? 3000000 : 1500000);

        // Biến động thưởng & OT thực tế theo từng quý/tháng (để tính năng so sánh 2 kỳ lương hiển thị sinh động)
        let bonus = (emp.kpi >= 96) ? 3000000 : ((emp.kpi >= 92) ? 1500000 : 0);
        if (pCfg.period === '2026-06' || pCfg.period === '2026-09') {
          bonus += (emp.kpi >= 95) ? 1500000 : 500000;
        } else if (pCfg.period === '2026-08') {
          bonus = (emp.kpi >= 96) ? 2500000 : ((emp.kpi >= 92) ? 1000000 : 0);
        }

        const otHours = ((mIdx + eIdx) % 5 === 0 && emp.role === 'EMPLOYEE') ? 4.0 : 0.0;
        const hourlyRate = baseSalary / standardDays / 8;
        const otPay = Math.round(otHours * hourlyRate * 1.5);
        const gross = baseSalary + allowances + bonus + otPay;

        const insSalary = Math.min(baseSalary, 36000000);
        const bhxh = Math.round(insSalary * 0.08);
        const bhyt = Math.round(insSalary * 0.015);
        const bhtn = Math.round(insSalary * 0.01);
        const totalInsurance = bhxh + bhyt + bhtn;

        const pitDeduction = 11000000;
        const taxable = Math.max(0, gross - totalInsurance - pitDeduction);

        let pit = 0;
        if (taxable > 32000000) pit = Math.round(taxable * 0.25);
        else if (taxable > 18000000) pit = Math.round(taxable * 0.20);
        else if (taxable > 10000000) pit = Math.round(taxable * 0.15);
        else if (taxable > 5000000) pit = Math.round(taxable * 0.10);
        else if (taxable > 0) pit = Math.round(taxable * 0.05);

        const totalDeductions = totalInsurance + pit;
        const net = gross - totalDeductions;

        sumNet += net;
        sumBhxh += totalInsurance;
        sumTax += pit;
        sumOtHours += otHours;

        await client.query(`
          INSERT INTO payslips (
            period_id, employee_id, base_salary, actual_work_days, standard_work_days,
            ot_hours, ot_pay, allowances, bonus, gross_income,
            bhxh_amount, bhyt_amount, bhtn_amount,
            pit_deduction, pit_taxable, pit_amount, total_deductions, net_salary,
            status, paid_date, bank_account, bank_name
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18,
            $19, $20, $21, $22
          );
        `, [
          periodId, emp.id, baseSalary, actualDays, standardDays,
          otHours, otPay, allowances, bonus, gross,
          bhxh, bhyt, bhtn,
          pitDeduction, taxable, pit, totalDeductions, net,
          pCfg.status, pCfg.paidDate, emp.bankAcc, emp.bankName,
        ]);
      }

      await client.query(`
        UPDATE payroll_periods
        SET total_net = $1, total_bhxh = $2, total_tax = $3, total_ot_hours = $4
        WHERE id = $5;
      `, [sumNet, sumBhxh, sumTax, sumOtHours, periodId]);
    }

    // 13. Dự án, Nhiệm vụ Kanban, Lịch sử Task & Squads (01/2026 -> 10/2026)
    console.log('📌 13. Khởi tạo Dự án, Nhiệm vụ Kanban, Task Logs & Squads từ đầu năm 2026...');
    await client.query(`
      INSERT INTO projects (id, code, name, department_id, manager_id, start_date, end_date, progress, status, priority, description, budget_hours, used_hours)
      VALUES
        ('PRJ-01', 'PRJ-2026-Q1', 'Chuẩn Hóa Hệ Thống Core HR & Bảo Mật Dữ Liệu NĐ 13', 'DEPT-IT', 'NV-1002', '2026-01-10', '2026-04-30', 100, 'completed', 'Cao', 'Hoàn thiện phân quyền RBAC 4 cấp, xoay vòng Refresh Token và nhật ký kiểm toán', 360, 352),
        ('PRJ-02', 'PRJ-2026-Q2', 'Triển Khai Hệ Thống Chấm Công Kiosk AI Face ID & GPS', 'DEPT-IT', 'NV-1002', '2026-04-01', '2026-08-30', 100, 'completed', 'Cao', 'Lắp đặt Kiosk nhận diện khuôn mặt tại sảnh chính và xác thực bán kính GPS 150m', 320, 310),
        ('PRJ-03', 'PRJ-NEXUS-V2', 'Nâng Cấp Nền Tảng NEXUS HRMS v2.0 & Trợ Lý AI Copilot V1', 'DEPT-IT', 'NV-1002', '2026-08-01', '2026-11-15', 88, 'in_progress', 'Khẩn cấp', 'Tích hợp Grounded AI Copilot V1 (Google Gemini), chuẩn hóa giao diện và đối soát lương tự động', 480, 422),
        ('PRJ-04', 'PRJ-HR-TALENT', 'Chương Trình Đánh Giá Năng Lực 9-Box & Phát Triển Nhân Tài 2026', 'DEPT-HR', 'NV-1001', '2026-05-01', '2026-11-30', 78, 'in_progress', 'Cao', 'Đánh giá ma trận nhân tài 9-Box định kỳ Q2/Q3 và kế hoạch kèm cặp PIP cho 50 nhân sự', 240, 188),
        ('PRJ-05', 'PRJ-MKT-B2B', 'Chiến Dịch Mở Rộng Thị Phần Doanh Nghiệp B2B Năm 2026', 'DEPT-MKT', 'NV-2001', '2026-03-01', '2026-12-31', 72, 'in_progress', 'Cao', 'Phát triển 250 khách hàng doanh nghiệp sử dụng giải pháp quản trị nhân sự số NEXUS', 400, 290),
        ('PRJ-06', 'PRJ-FIN-ERP', 'Tự Động Hóa Đối Soát Ngân Hàng & Quyết Toán Thuế TNCN 2026', 'DEPT-FIN', 'NV-3001', '2026-02-15', '2026-10-31', 90, 'in_progress', 'Trung bình', 'Kết nối ủy nhiệm chi điện tử Vietcombank/Techcombank và tự động hóa bảng lương 10 kỳ', 220, 198);
    `);

    await client.query(`
      INSERT INTO tasks (id, project_id, title, description, assignee_id, creator_id, deadline, priority, kpi_weight, estimated_hours, progress, stage, deliverable_note, review_note, reviewed_by, reviewed_at)
      VALUES
        ('TSK-01', 'PRJ-01', 'Thiết kế kiến trúc RBAC 4 cấp & Refresh Token xoay vòng', 'Bảo mật toàn diện phiên đăng nhập và phân quyền theo phòng ban', 'NV-1003', 'NV-1002', '2026-03-15', 'Cao', 30, 40, 100, 'done', 'Đã bàn giao toàn bộ middleware auth và unit tests', 'Đạt yêu cầu bảo mật 100%', 'NV-1002', '2026-03-14 16:00:00+07'),
        ('TSK-02', 'PRJ-02', 'Tối ưu thuật toán Haversine GPS 150m & Kiosk QR TOTP', 'Chống giả mạo tọa độ và xác thực mã QR động 30 giây tại sảnh', 'NV-1013', 'NV-1002', '2026-07-20', 'Cao', 30, 36, 100, 'done', 'Độ trễ nhận diện < 0.25s, chính xác 99.6%', 'Nghiệm thu xuất sắc', 'NV-1002', '2026-07-19 17:30:00+07'),
        ('TSK-03', 'PRJ-03', 'Xây dựng giao diện Employee Portal & AI Copilot Drawer', 'Tích hợp trợ lý AI HR có kiểm chứng dữ liệu phép, lương, quy chế', 'NV-0842', 'NV-1002', '2026-10-20', 'Khẩn cấp', 35, 48, 100, 'done', 'Đã hoàn thành giao diện Portal và vượt qua 18/18 kịch bản AI Live Eval', 'Hoàn thành xuất sắc', 'NV-1002', '2026-10-20 18:00:00+07'),
        ('TSK-04', 'PRJ-03', 'Đồng bộ dữ liệu 50 nhân sự & 10 kỳ lương năm 2026', 'Chuẩn hóa hồ sơ, hợp đồng, chấm công và phiếu lương từ tháng 01/2026 đến 10/2026', 'NV-0842', 'NV-1002', '2026-10-25', 'Cao', 30, 24, 100, 'done', 'Đã nạp đầy đủ 500 phiếu lương và dữ liệu chấm công thực tế', 'Dữ liệu khớp 100%', 'NV-1002', '2026-10-25 10:00:00+07'),
        ('TSK-05', 'PRJ-03', 'Kiểm thử toàn diện 11 màn hình & đối soát phân quyền RBAC', 'Thực hiện UAT trên trình duyệt thực tế cho cả 4 cấp tài khoản', 'NV-1006', 'NV-1002', '2026-10-28', 'Khẩn cấp', 25, 30, 85, 'review', 'Đã hoàn tất báo cáo UAT, chờ Trưởng phòng ký duyệt chốt sprint', NULL, NULL, NULL),
        ('TSK-06', 'PRJ-03', 'Tối ưu hóa bộ nhớ đệm Dashboard & cảnh báo biến động nhân sự', 'Cập nhật thuật toán tính điểm rủi ro nghỉ việc và ma trận 9-Box', 'NV-1005', 'NV-1002', '2026-11-05', 'Cao', 25, 32, 75, 'in_progress', NULL, NULL, NULL, NULL),
        ('TSK-07', 'PRJ-04', 'Tổng hợp kết quả đánh giá năng lực Quý III/2026 toàn công ty', 'Rà soát điểm hiệu suất và tiềm năng của 50 nhân viên các phòng ban', 'NV-1102', 'NV-1001', '2026-10-15', 'Cao', 30, 28, 100, 'done', 'Đã cập nhật 100 bản đánh giá Q2 & Q3 lên hệ thống 9-Box', 'Đã phê duyệt kết quả', 'NV-1001', '2026-10-14 15:00:00+07'),
        ('TSK-08', 'PRJ-04', 'Triển khai kế hoạch kèm cặp PIP Quý IV/2026 cho nhân sự cần hỗ trợ', 'Thiết lập mục tiêu cải thiện hiệu suất 60 ngày cùng Quản lý trực tiếp', 'NV-1101', 'NV-1001', '2026-11-10', 'Trung bình', 20, 20, 65, 'in_progress', NULL, NULL, NULL, NULL),
        ('TSK-09', 'PRJ-05', 'Tổ chức hội thảo khách hàng HR Tech Enterprise Summit 2026', 'Giới thiệu tính năng Grounded AI Copilot cho 120 Giám đốc Nhân sự đối tác', 'NV-2002', 'NV-2001', '2026-10-30', 'Cao', 25, 36, 80, 'review', 'Đã chốt danh sách 135 khách mời B2B và kịch bản demo', NULL, NULL, NULL),
        ('TSK-10', 'PRJ-05', 'Chạy chiến dịch truyền thông thương hiệu tuyển dụng Quý IV/2026', 'Quảng bá môi trường làm việc số hóa hiện đại tại NEXUS', 'NV-2005', 'NV-2001', '2026-11-15', 'Trung bình', 20, 24, 50, 'in_progress', NULL, NULL, NULL, NULL),
        ('TSK-11', 'PRJ-06', 'Đối soát bảng lương tháng 09/2026 và chuẩn bị dự thảo tháng 10/2026', 'Kiểm tra khớp nối BHXH, BHYT, BHTN và thuế TNCN lũy tiến của 50 nhân sự', 'NV-3002', 'NV-3001', '2026-10-27', 'Cao', 30, 28, 90, 'review', 'Đã hoàn thành bảng đối soát 50 nhân sự kỳ 2026-10', NULL, NULL, NULL),
        ('TSK-12', 'PRJ-03', 'Soạn thảo tài liệu hướng dẫn vận hành Migration & Docker Production', 'Cập nhật README và tài liệu bàn giao kỹ thuật', 'NV-1016', 'NV-1002', '2026-11-12', 'Thấp', 15, 16, 30, 'todo', NULL, NULL, NULL, NULL);
    `);

    await client.query(`
      INSERT INTO task_logs (task_id, actor_id, action, from_stage, to_stage, note, created_at)
      VALUES
        ('TSK-01', 'NV-1003', 'STAGE_CHANGE', 'todo', 'in_progress', 'Bắt đầu thiết kế lược đồ xác thực JWT & RBAC', '2026-02-01 09:00:00+07'),
        ('TSK-01', 'NV-1002', 'APPROVED', 'review', 'done', 'Nghiệm thu hoàn tất module bảo mật Core Auth', '2026-03-14 16:00:00+07'),
        ('TSK-03', 'NV-0842', 'STAGE_CHANGE', 'in_progress', 'review', 'Gửi nghiệm thu giao diện Portal & Grounded AI Copilot V1', '2026-10-19 17:00:00+07'),
        ('TSK-03', 'NV-1002', 'APPROVED', 'review', 'done', 'Phê duyệt hoàn thành xuất sắc 100% tiêu chí', '2026-10-20 18:00:00+07'),
        ('TSK-04', 'NV-0842', 'APPROVED', 'review', 'done', 'Hoàn thành đồng bộ dữ liệu 50 nhân sự năm 2026', '2026-10-25 10:00:00+07'),
        ('TSK-05', 'NV-1006', 'SUBMIT_REVIEW', 'in_progress', 'review', 'Đính kèm biên bản kiểm thử UAT toàn hệ thống', '2026-10-24 16:30:00+07'),
        ('TSK-09', 'NV-2002', 'SUBMIT_REVIEW', 'in_progress', 'review', 'Trình duyệt kế hoạch sự kiện B2B Summit', '2026-10-23 14:20:00+07'),
        ('TSK-11', 'NV-3002', 'SUBMIT_REVIEW', 'in_progress', 'review', 'Trình Kế toán trưởng duyệt dự thảo lương tháng 10/2026', '2026-10-24 17:10:00+07');
    `);

    await client.query(`
      INSERT INTO squads (id, name, project_id, lead_id, target)
      VALUES
        ('SQ-01', 'Squad Core Platform & AI Copilot', 'PRJ-03', 'NV-0842', 'Phát triển Portal tự phục vụ, bảng lương tự động và trợ lý AI HR'),
        ('SQ-02', 'Squad Hạ Tầng Cloud & Kiosk AI',   'PRJ-02', 'NV-1005', 'Vận hành hệ thống Docker, PostgreSQL HA và Kiosk chấm công nhận diện'),
        ('SQ-03', 'Squad Tăng Trưởng Doanh Nghiệp B2B', 'PRJ-05', 'NV-2002', 'Mở rộng khách hàng doanh nghiệp và truyền thông giải pháp HR Tech');
    `);

    await client.query(`
      INSERT INTO squad_members (squad_id, employee_id, role_in_squad)
      VALUES
        ('SQ-01', 'NV-0842', 'TechLead'),
        ('SQ-01', 'NV-1003', 'Senior Backend'),
        ('SQ-01', 'NV-1013', 'AI Engineer'),
        ('SQ-01', 'NV-1004', 'Product Designer'),
        ('SQ-01', 'NV-1006', 'QA Lead'),
        ('SQ-01', 'NV-1008', 'Frontend Dev'),
        ('SQ-02', 'NV-1005', 'DevOps Lead'),
        ('SQ-02', 'NV-1009', 'DBA'),
        ('SQ-02', 'NV-1011', 'SecOps Engineer'),
        ('SQ-03', 'NV-2002', 'Growth Lead'),
        ('SQ-03', 'NV-2003', 'B2B Sales Lead'),
        ('SQ-03', 'NV-2005', 'Performance Ads');
    `);

    await client.query(`
      INSERT INTO squad_messages (squad_id, sender_id, content, sent_at, is_system_notice)
      VALUES
        ('SQ-01', 'NV-0842', 'Chào anh em Squad 01, tính năng Grounded AI Copilot V1 và dữ liệu 10 kỳ lương 2026 đã đồng bộ xong lên môi trường chính nhé!', '2026-10-25 09:00:00+07', false),
        ('SQ-01', 'NV-1013', 'Tuyệt vời! Bộ 18 kịch bản kiểm thử Gemini 3.5 Flash-Lite vừa chạy đạt 18/18 PASS, phản hồi tiếng Việt rất chuẩn.', '2026-10-25 09:05:00+07', false),
        ('SQ-01', 'NV-1006', 'Đội QA cũng đã kiểm tra chéo phân quyền RBAC trên cả 4 vai trò CEO, HRD, Trưởng phòng và Nhân viên, không có lỗi tồn đọng.', '2026-10-25 09:12:00+07', false),
        ('SQ-02', 'NV-1005', 'Cụm PostgreSQL 16 và Kiosk chấm công sảnh chính sáng nay hoạt động ổn định 100%, độ trễ truy vấn < 30ms.', '2026-10-25 08:30:00+07', false),
        ('SQ-03', 'NV-2002', 'Chiến dịch B2B Quý IV đã đạt 80% chỉ tiêu khách hàng đăng ký trải nghiệm bản demo NEXUS HRMS v2.0!', '2026-10-24 16:45:00+07', false);
    `);

    // 14. Đánh giá năng lực 9-Box (performance_reviews) cho Q2/2026 & Q3/2026 + Kế hoạch PIP (pip_plans)
    console.log('📊 14. Khởi tạo 100 Bản Đánh giá năng lực 9-Box (2026-Q2 & 2026-Q3) và Kế hoạch PIP...');
    function computeNineBoxCell(perf, pot) {
      const perfTier = perf >= 85 ? 2 : (perf >= 70 ? 1 : 0); // 0=low, 1=mid, 2=high
      const potTier = pot >= 85 ? 2 : (pot >= 70 ? 1 : 0);
      return potTier * 3 + perfTier + 1; // 1..9
    }

    for (let i = 0; i < rawEmployees.length; i++) {
      const emp = rawEmployees[i];
      const reviewerId = emp.manager || 'NV-0001';
      const basePerf = Number(emp.kpi);
      const q2Perf = Math.max(60, Math.min(100, Math.round(basePerf - 1.5)));
      const q2Pot = Math.max(62, Math.min(100, Math.round(basePerf - (i % 3 === 0 ? 2 : -1))));
      const q2Cell = computeNineBoxCell(q2Perf, q2Pot);

      const q3Perf = Math.max(60, Math.min(100, Math.round(basePerf)));
      const q3Pot = Math.max(65, Math.min(100, Math.round(basePerf + (i % 4 === 0 ? 1 : -2))));
      const q3Cell = computeNineBoxCell(q3Perf, q3Pot);

      await client.query(`
        INSERT INTO performance_reviews (id, employee_id, period, reviewer_id, performance_score, potential_score, nine_box_cell, comments, created_at, updated_at)
        VALUES
          ($1, $2, '2026-Q2', $3, $4, $5, $6, $7, '2026-06-28 15:00:00+07', '2026-06-28 15:00:00+07'),
          ($8, $2, '2026-Q3', $3, $9, $10, $11, $12, '2026-09-29 15:00:00+07', '2026-09-29 15:00:00+07');
      `, [
        `REV-2026Q2-${emp.id}`, emp.id, reviewerId, q2Perf, q2Pot, q2Cell,
        `Hoàn thành tốt các mục tiêu công việc Quý II/2026 tại ${emp.title}, tinh thần phối hợp đội nhóm tích cực.`,
        `REV-2026Q3-${emp.id}`, q3Perf, q3Pot, q3Cell,
        q3Perf >= 95
          ? `Nhân sự nòng cốt xuất sắc Quý III/2026, đóng góp vượt chỉ tiêu KPI và dẫn dắt chuyên môn hiệu quả.`
          : (q3Perf < 80
            ? `Cần tập trung cải thiện tiến độ bàn giao công việc và tuân thủ kỷ luật thời gian trong Quý IV/2026.`
            : `Đạt chuẩn hiệu suất Quý III/2026, chủ động học hỏi và đáp ứng tốt yêu cầu chuyên môn của phòng ban.`),
      ]);
    }

    await client.query(`
      INSERT INTO pip_plans (id, employee_id, created_by, start_date, end_date, goals, status, reason, approved_by, approved_at, outcome)
      VALUES
        (
          'PIP-2026-001', 'NV-2007', 'NV-2001', '2026-09-15', '2026-11-15',
          '[{"title":"Nâng tỷ lệ chuyển đổi khách hàng B2B lên tối thiểu 18%","metric":"Chốt tối thiểu 6 hợp đồng mới trong Quý IV/2026","weight":60},{"title":"Đảm bảo tỷ lệ chuyên cần đúng giờ đạt từ 97% trở lên","metric":"Không đi muộn quá 1 lần/tháng","weight":40}]'::jsonb,
          'active',
          'KPI Quý III/2026 đạt 74.0 điểm (dưới ngưỡng chuẩn 80 điểm của phòng Kinh doanh)',
          'NV-1001', '2026-09-16 09:00:00+07',
          'Đang trong giai đoạn kèm cặp tuần thứ 5 cùng Trưởng nhóm B2B Vũ Tuấn Kiệt'
        ),
        (
          'PIP-2026-002', 'NV-1015', 'NV-1002', '2026-09-20', '2026-11-20',
          '[{"title":"Hoàn thành khóa đào tạo React 18 & TypeScript nâng cao","metric":"Đạt tối thiểu 85/100 điểm bài kiểm tra thực hành","weight":50},{"title":"Giảm tỷ lệ lỗi giao diện (UI Bug) khi bàn giao task","metric":"Dưới 2 lỗi nhỏ trên mỗi Sprint","weight":50}]'::jsonb,
          'active',
          'Hỗ trợ nâng cao kỹ năng lập trình thực chiến trong giai đoạn thực tập lên nhân viên chính thức',
          'NV-1001', '2026-09-21 10:00:00+07',
          'Tiến độ cải thiện tích cực, được Phạm Minh Quân trực tiếp hướng dẫn code review'
        ),
        (
          'PIP-2026-003', 'NV-1014', 'NV-1002', '2026-04-01', '2026-06-01',
          '[{"title":"Chuẩn hóa quy trình viết Unit Test cho các component giao diện","metric":"Độ phủ test >= 80%","weight":100}]'::jsonb,
          'completed',
          'Bổ sung kỹ năng kiểm thử tự động trong Quý II/2026',
          'NV-1001', '2026-04-02 09:00:00+07',
          'Đã hoàn thành vượt mức yêu cầu, KPI Quý III tăng lên 89.0 điểm'
        );
    `);

    // 15. Cấu hình hệ thống (system_settings, system_policy_versions), Cẩm nang nhân sự (handbook_docs) & Ngày lễ 2026 (public_holidays)
    console.log('📘 15. Khởi tạo Cấu hình hệ thống, Cẩm nang quy chế công ty 2026 (handbook_docs) & Lịch nghỉ lễ 2026...');
    await client.query(`
      INSERT INTO system_settings (key, value, category, description, updated_by) VALUES
        ('late_grace_minutes', '15'::jsonb, 'attendance', 'Thời gian ân hạn đi trễ buổi sáng (phút sau 08:00)', 'NV-1001'),
        ('standard_shift_morning', '"08:00 - 12:00"'::jsonb, 'attendance', 'Khung giờ ca sáng chuẩn', 'NV-1001'),
        ('standard_shift_afternoon', '"13:30 - 17:30"'::jsonb, 'attendance', 'Khung giờ ca chiều chuẩn', 'NV-1001'),
        ('max_ot_per_month', '40'::jsonb, 'attendance', 'Giới hạn số giờ làm thêm tối đa mỗi tháng (Điều 107 BLLĐ)', 'NV-1001'),
        ('auto_approve_ot', 'false'::jsonb, 'attendance', 'Tự động duyệt OT dưới 2 giờ vào ngày thường', 'NV-1001'),
        ('personal_income_tax_deduction', '11000000'::jsonb, 'tax_bhxh', 'Mức giảm trừ gia cảnh bản thân người nộp thuế (VNĐ/tháng)', 'NV-1001'),
        ('dependent_deduction', '4400000'::jsonb, 'tax_bhxh', 'Mức giảm trừ cho mỗi người phụ thuộc (VNĐ/người/tháng)', 'NV-1001'),
        ('employee_bhxh_rate', '10.5'::jsonb, 'tax_bhxh', 'Tỷ lệ trích đóng BHXH/BHYT/BHTN phần người lao động (%)', 'NV-1001'),
        ('employer_bhxh_rate', '21.5'::jsonb, 'tax_bhxh', 'Tỷ lệ đóng BHXH/BHYT/BHTN phần doanh nghiệp (%)', 'NV-1001'),
        ('gps_radius_meters', '250'::jsonb, 'biometrics', 'Bán kính hợp lệ cho phép nhân viên check-in GPS (mét)', 'NV-1001'),
        ('office_lat', '10.77'::jsonb, 'biometrics', 'Vĩ độ trụ sở chính NEXUS', 'NV-1001'),
        ('office_lng', '106.7'::jsonb, 'biometrics', 'Kinh độ trụ sở chính NEXUS', 'NV-1001'),
        ('office_name', '"Tòa nhà NEXUS Tower"'::jsonb, 'biometrics', 'Tên địa điểm trụ sở chính', 'NV-1001'),
        ('face_confidence_threshold', '98'::jsonb, 'biometrics', 'Ngưỡng độ tin cậy chấm công Kiosk (%)', 'NV-1001'),
        ('standard_work_days', '22'::jsonb, 'payroll', 'Số ngày công chuẩn trong tháng để tính lương ngày và đơn giá OT', 'NV-1001'),
        ('ot_multiplier', '1.5'::jsonb, 'payroll', 'Hệ số nhân đơn giá tiền lương làm thêm giờ ngày thường', 'NV-1001'),
        ('default_allowances', '1500000'::jsonb, 'payroll', 'Phụ cấp định kỳ mặc định (ăn trưa + xăng xe) khi có ngày công', 'NV-1001'),
        ('policy_effective_from', '"2020-01"'::jsonb, 'tax_bhxh', 'Kỳ lương bắt đầu áp dụng cấu hình chính sách hiện hành (YYYY-MM)', 'NV-1001')
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        updated_by = EXCLUDED.updated_by;
    `);

    await client.query(`
      INSERT INTO system_policy_versions (effective_from, policy, created_by)
      SELECT
        COALESCE(
          (SELECT value #>> '{}' FROM system_settings WHERE key = 'policy_effective_from'),
          '2020-01'
        ),
        jsonb_object_agg(key, value),
        'NV-0001'
      FROM system_settings
      ON CONFLICT (effective_from) DO UPDATE SET
        policy = EXCLUDED.policy,
        updated_at = NOW();
    `);

    await client.query(`DELETE FROM handbook_docs;`);
    await client.query(`
      INSERT INTO handbook_docs (id, title, category, content, version, is_active, updated_by)
      VALUES
        (
          'HB-POL-01',
          'Quy chế Giờ làm việc, Chấm công GPS & Giải trình (2026)',
          'Chấm công & Giờ làm',
          '1. Khung giờ làm việc hành chính chuẩn: Ca sáng 08:00 - 12:00 (4.0 giờ), Ca chiều 13:30 - 17:30 (4.0 giờ), từ Thứ Hai đến Thứ Sáu.\n2. Thời gian ân hạn đi muộn (Grace Period): 15 phút (check-in sau 08:15 được ghi nhận là DI_MUON).\n3. Chấm công GPS/QR: Nhân viên thực hiện check-in trong bán kính cấu hình của trụ sở hoặc quét mã QR tại Kiosk cổng. Hệ thống kiểm tra tọa độ số học (vĩ độ [-90, 90], kinh độ [-180, 180]).\n4. Đơn giải trình chấm công: Nhân viên gửi đơn giải trình cho các trường hợp đi muộn, về sớm, quên chấm công hoặc công tác ngoài văn phòng. Quản lý trực tiếp hoặc Giám đốc Nhân sự xét duyệt (không tự duyệt đơn của chính mình). Khi đơn giải trình được duyệt (DA_DUYET), bảng công ngày đó được chuẩn hóa về trạng thái Đúng giờ (DUNG_GIO).',
          2,
          TRUE,
          'NV-1001'
        ),
        (
          'HB-POL-02',
          'Chính sách Nghỉ phép năm, Nghỉ ốm BHXH (C65) & Quy trình phê duyệt 2 cấp',
          'Nghỉ phép & Chế độ',
          '1. Phép năm hưởng nguyên lương (PHEP_NAM / LT-AL): 12 ngày/năm đối với điều kiện làm việc bình thường.\n2. Nghỉ ốm hưởng BHXH (NGHI_OM / LT-SL): Tối đa 30 ngày/năm có giấy chứng nhận nghỉ việc hưởng BHXH mẫu C65-HD.\n3. Nghỉ việc riêng có hưởng lương (VIEC_RIENG / LT-PL): Tối đa 3 ngày/năm (kết hôn, hiếu hỉ theo Bộ luật Lao động).\n4. Nghỉ không lương (KHONG_LUONG / LT-UL) và Công tác (CONG_TAC / LT-BT).\n5. Quy trình phê duyệt 2 cấp: Đơn của Nhân viên (EMPLOYEE) qua Trưởng phòng duyệt cấp 1 (CHO_TRUONG_PHONG_DUYET -> CHO_HR_PHE_CHUAN) rồi Giám đốc Nhân sự (HR_DIRECTOR) phê chuẩn cấp 2 (DA_PHE_DUYET). Đơn của Trưởng phòng hoặc Giám đốc Nhân sự chuyển trực tiếp tới Tổng Giám đốc (CEO). Ngày nghỉ chỉ tính trên ngày làm việc (không trừ Thứ Bảy, Chủ Nhật và ngày lễ).',
          2,
          TRUE,
          'NV-1001'
        ),
        (
          'HB-POL-03',
          'Quy định Tiền lương, Thuế TNCN (Nghị quyết 954/2020) & Trích nộp BHXH bắt buộc',
          'Lương, Thuế & BHXH',
          '1. Công thức lương tháng: Lương theo ngày công = Lương cơ bản hợp đồng * (Số ngày công thực tế / Số ngày công chuẩn trong kỳ). Nếu nhân viên có 0 ngày công thực tế và không có ngày nghỉ hưởng lương hợp lệ, lương theo ngày công bằng 0 VNĐ.\n2. Bảo hiểm bắt buộc phần người lao động: 10.5% lương đóng bảo hiểm (gồm 8% BHXH, 1.5% BHYT, 1% BHTN). Phần doanh nghiệp đóng: 21.5%.\n3. Thuế Thu nhập cá nhân (TNCN): Giảm trừ gia cảnh bản thân 11.000.000 VNĐ/tháng, mỗi người phụ thuộc 4.400.000 VNĐ/tháng (Nghị quyết 954/2020/UBTVQH14), tính theo biểu thuế lũy tiến từng phần từ 5% đến 35%.\n4. Chốt bảng lương: Khi kỳ lương ở trạng thái Đã chốt (DA_CHOT) hoặc Đã chuyển khoản (DA_CHUYEN_KHOAN), số liệu được đóng băng để phục vụ chi trả và đối soát.',
          2,
          TRUE,
          'NV-1001'
        ),
        (
          'HB-POL-04',
          'Chính sách Làm thêm giờ (OT) theo Điều 107 Bộ luật Lao động',
          'Làm thêm giờ (OT)',
          '1. Giới hạn giờ làm thêm: Không quá 40 giờ/tháng và không quá 200 giờ/năm (hoặc 300 giờ/năm đối với các ngành nghề đặc thù theo quy định).\n2. Hệ số lương làm thêm giờ: Ngày thường 150%, ngày nghỉ hàng tuần 200%, ngày lễ/Tết 300% đơn giá tiền lương giờ thực trả.\n3. Mọi yêu cầu làm thêm giờ phải có sự đồng ý của người lao động và được cấp thẩm quyền phê duyệt.',
          1,
          TRUE,
          'NV-1001'
        ),
        (
          'HB-POL-05',
          'Quy định Đánh giá Hiệu suất 9-Box & Kế hoạch Cải thiện Hiệu suất (PIP)',
          'Đánh giá & Phát triển',
          '1. Ma trận 9-Box Talent Matrix kết hợp Điểm Hiệu suất (Performance 0-100) và Điểm Tiềm năng (Potential 0-100) để phân loại nhân sự vào 9 ô (Ô 1 đến Ô 9).\n2. Nhân sự thuộc nhóm hiệu suất thấp (Ô 1, 2, 4) có thể được Trưởng phòng đề xuất hoặc Giám đốc Nhân sự kích hoạt Kế hoạch Cải thiện Hiệu suất (PIP) với mục tiêu định lượng rõ ràng.',
          1,
          TRUE,
          'NV-1001'
        );
    `);

    await client.query(`
      INSERT INTO public_holidays (holiday_date, name)
      VALUES
        ('2026-01-01', 'Tết Dương lịch 2026'),
        ('2026-02-16', 'Nghỉ Tết Nguyên Đán Bính Ngọ (29 Tết)'),
        ('2026-02-17', 'Mùng 1 Tết Nguyên Đán Bính Ngọ'),
        ('2026-02-18', 'Mùng 2 Tết Nguyên Đán Bính Ngọ'),
        ('2026-02-19', 'Mùng 3 Tết Nguyên Đán Bính Ngọ'),
        ('2026-02-20', 'Mùng 4 Tết Nguyên Đán Bính Ngọ'),
        ('2026-04-26', 'Giỗ Tổ Hùng Vương (10/3 Âm lịch)'),
        ('2026-04-27', 'Nghỉ bù Giỗ Tổ Hùng Vương'),
        ('2026-04-30', 'Ngày Giải phóng miền Nam, thống nhất đất nước'),
        ('2026-05-01', 'Ngày Quốc tế Lao động 1/5'),
        ('2026-09-02', 'Ngày Quốc khánh nước CHXHCN Việt Nam 2/9'),
        ('2026-09-03', 'Nghỉ lễ Quốc khánh 2/9 (ngày liền kề)')
      ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name;
    `);

    // 16. Thông báo nội bộ công ty (company_notices) & Trung tâm thông báo (notifications)
    console.log('📢 16. Khởi tạo Thông báo nội bộ công ty năm 2026 & Trung tâm thông báo...');
    await client.query(`
      INSERT INTO company_notices (id, title, content, category, priority, author_id, is_pinned, is_active, published_at)
      VALUES
        ('NOT-01', 'QUYẾT ĐỊNH KHEN THƯỞNG TẬP THỂ & CÁ NHÂN XUẤT SẮC QUÝ III/2026', 'Tổng Giám Đốc biểu dương và trao thưởng cho các tập thể phòng ban và cá nhân xuất sắc đã hoàn thành vượt mức các chỉ tiêu công tác Quý III/2026 và triển khai thành công nền tảng NEXUS HRMS v2.0.', 'general', 'high', 'NV-0001', TRUE, TRUE, '2026-10-05 09:00:00+07'),
        ('NOT-02', 'THÔNG BÁO RA MẮT TRỢ LÝ AI NHÂN SỰ (GROUNDED AI COPILOT V1)', 'Từ tháng 10/2026, toàn thể cán bộ nhân viên có thể sử dụng Trợ lý AI HR ngay trên Cổng Nhân Viên (Portal) để tra cứu nhanh số dư phép năm, chi tiết phiếu lương, so sánh lương 2 kỳ gần nhất và hỏi đáp quy chế công ty.', 'policy', 'high', 'NV-1001', TRUE, TRUE, '2026-10-18 08:30:00+07'),
        ('NOT-03', 'KẾ HOẠCH TỔ CHỨC KHÁM SỨC KHỎE ĐỊNH KỲ TOÀN CÔNG TY NĂM 2026', 'Phòng Quản trị Nhân sự phối hợp cùng Bệnh viện Đa khoa Quốc tế tổ chức khám sức khỏe tổng quát định kỳ năm 2026 cho toàn thể 50 cán bộ nhân viên từ ngày 26/10/2026 đến 31/10/2026.', 'event', 'normal', 'NV-1001', FALSE, TRUE, '2026-10-12 10:00:00+07'),
        ('NOT-04', 'HƯỚNG DẪN ĐỐI SOÁT CÔNG & CHỐT BẢNG LƯƠNG THÁNG 10/2026', 'Đề nghị toàn thể nhân viên kiểm tra lại bảng chấm công tháng 10/2026 và hoàn tất gửi đơn giải trình / đơn OT trước 17:00 ngày 28/10/2026 để Phòng Nhân sự và Kế toán chốt kỳ lương 2026-10.', 'urgent', 'high', 'NV-1001', FALSE, TRUE, '2026-10-22 14:00:00+07'),
        ('NOT-05', 'BÁO CÁO TỔNG KẾT HOẠT ĐỘNG BÁN NIÊN H1/2026 & ĐỊNH HƯỚNG H2/2026', 'Tổng kết 6 tháng đầu năm 2026, công ty đạt mức tăng trưởng doanh thu B2B 142% so với kế hoạch và hoàn tất 100% lộ trình chuyển đổi số quản trị nhân sự.', 'general', 'normal', 'NV-0001', FALSE, TRUE, '2026-07-02 09:00:00+07');
    `);

    await client.query(`
      INSERT INTO notifications (
        id, user_id, role_target, type, category, title, summary,
        sender_name, sender_role, sender_avatar, priority, is_read,
        action_type, action_payload, created_at
      ) VALUES
        (
          'NOTIF-NOT-01', NULL, NULL, 'company_award', 'Thông báo công ty',
          'QUYẾT ĐỊNH KHEN THƯỞNG TẬP THỂ & CÁ NHÂN XUẤT SẮC QUÝ III/2026',
          'Tổng Giám Đốc biểu dương và trao thưởng cho các tập thể phòng ban xuất sắc đã hoàn thành vượt mức các chỉ tiêu công tác Quý III/2026.',
          'Lê Vũ Ngọc Duy', 'Tổng Giám Đốc (CEO)', $1, 'urgent', FALSE, 'notice_popup',
          '{"id":"NOT-01","title":"QUYẾT ĐỊNH KHEN THƯỞNG TẬP THỂ & CÁ NHÂN XUẤT SẮC QUÝ III/2026","content":"Tổng Giám Đốc biểu dương và trao thưởng cho các tập thể phòng ban và cá nhân xuất sắc đã hoàn thành vượt mức các chỉ tiêu công tác Quý III/2026 và triển khai thành công nền tảng NEXUS HRMS v2.0.","category":"general","priority":"high","isPinned":true,"date":"05/10/2026","signer":"Lê Vũ Ngọc Duy - Tổng Giám Đốc (CEO)","docNumber":"Số: 101/2026/QĐ-TGĐ"}'::jsonb,
          '2026-10-05 09:00:00+07'
        ),
        (
          'NOTIF-NOT-02', NULL, NULL, 'system', 'Thông báo công ty',
          'THÔNG BÁO RA MẮT TRỢ LÝ AI NHÂN SỰ (GROUNDED AI COPILOT V1)',
          'Toàn thể cán bộ nhân viên có thể sử dụng Trợ lý AI HR ngay trên Cổng Nhân Viên để tra cứu phép năm, phiếu lương và quy chế công ty.',
          'Trần Mai Hương', 'Giám Đốc Nhân Sự (HRD)', $1, 'normal', FALSE, 'notice_popup',
          '{"id":"NOT-02","title":"THÔNG BÁO RA MẮT TRỢ LÝ AI NHÂN SỰ (GROUNDED AI COPILOT V1)","content":"Từ tháng 10/2026, toàn thể cán bộ nhân viên có thể sử dụng Trợ lý AI HR ngay trên Cổng Nhân Viên (Portal) để tra cứu nhanh số dư phép năm, chi tiết phiếu lương, so sánh lương 2 kỳ gần nhất và hỏi đáp quy chế công ty.","category":"policy","priority":"high","isPinned":true,"date":"18/10/2026","signer":"Trần Mai Hương - Giám Đốc Nhân Sự (HRD)","docNumber":"Số: 88/2026/TB-HR"}'::jsonb,
          '2026-10-18 08:30:00+07'
        ),
        (
          'NOTIF-NOT-03', NULL, NULL, 'health_check', 'Thông báo công ty',
          'KẾ HOẠCH TỔ CHỨC KHÁM SỨC KHỎE ĐỊNH KỲ TOÀN CÔNG TY NĂM 2026',
          'Phòng Quản trị Nhân sự phối hợp cùng Bệnh viện Đa khoa Quốc tế tổ chức khám sức khỏe định kỳ cho toàn thể 50 cán bộ nhân viên.',
          'Trần Mai Hương', 'Giám Đốc Nhân Sự (HRD)', $1, 'normal', FALSE, 'notice_popup',
          '{"id":"NOT-03","title":"KẾ HOẠCH TỔ CHỨC KHÁM SỨC KHỎE ĐỊNH KỲ TOÀN CÔNG TY NĂM 2026","content":"Phòng Quản trị Nhân sự phối hợp cùng Bệnh viện Đa khoa Quốc tế tổ chức khám sức khỏe tổng quát định kỳ năm 2026 cho toàn thể 50 cán bộ nhân viên từ ngày 26/10/2026 đến 31/10/2026.","category":"event","priority":"normal","isPinned":false,"date":"12/10/2026","signer":"Trần Mai Hương - Giám Đốc Nhân Sự (HRD)","docNumber":"Số: 65/2026/TB-HR"}'::jsonb,
          '2026-10-12 10:00:00+07'
        ),
        (
          'NOTIF-NOT-04', NULL, NULL, 'ceo_directive', 'Thông báo công ty',
          'HƯỚNG DẪN ĐỐI SOÁT CÔNG & CHỐT BẢNG LƯƠNG THÁNG 10/2026',
          'Đề nghị nhân viên kiểm tra lại bảng chấm công tháng 10/2026 và hoàn tất gửi đơn giải trình trước ngày 28/10/2026.',
          'Trần Mai Hương', 'Giám Đốc Nhân Sự (HRD)', $1, 'urgent', FALSE, 'notice_popup',
          '{"id":"NOT-04","title":"HƯỚNG DẪN ĐỐI SOÁT CÔNG & CHỐT BẢNG LƯƠNG THÁNG 10/2026","content":"Đề nghị toàn thể nhân viên kiểm tra lại bảng chấm công tháng 10/2026 và hoàn tất gửi đơn giải trình / đơn OT trước 17:00 ngày 28/10/2026 để Phòng Nhân sự và Kế toán chốt kỳ lương 2026-10.","category":"urgent","priority":"high","isPinned":false,"date":"22/10/2026","signer":"Trần Mai Hương - Giám Đốc Nhân Sự (HRD)","docNumber":"Số: 112/2026/TB-HR"}'::jsonb,
          '2026-10-22 14:00:00+07'
        );
    `, [DEFAULT_AVATAR]);

    await client.query(`
      INSERT INTO notifications (id, user_id, type, category, title, summary, sender_name, sender_role, sender_avatar, priority, is_read, created_at)
      SELECT
        'NOTIF-' || LPAD(ROW_NUMBER() OVER (ORDER BY u.email)::TEXT, 4, '0'),
        u.id,
        'payroll',
        'Cá nhân',
        'Phiếu lương tháng 09/2026 đã được phát hành & thanh toán',
        'Phiếu lương kỳ 2026-09 của bạn đã được chuyển khoản thành công qua ngân hàng. Bạn có thể xem chi tiết hoặc hỏi Trợ lý AI Copilot.',
        'Trần Mai Hương',
        'Giám Đốc Nhân Sự (HRD)',
        $1,
        'normal',
        FALSE,
        '2026-10-05 10:00:00+07'
      FROM users u;
    `, [DEFAULT_AVATAR]);

    // Làm mới Materialized View nếu tồn tại
    try {
      await client.query(`REFRESH MATERIALIZED VIEW mv_dashboard_stats;`);
    } catch (_) {}

    await client.query('COMMIT');
    console.log('\n======================================================');
    console.log('🎉 THÀNH CÔNG: DATABASE ĐÃ ĐƯỢC RESET VÀ KHỞI TẠO ĐẦY ĐỦ DỮ LIỆU NĂM 2026!');
    console.log('📊 Thống kê dữ liệu thực tế đã nạp (01/2026 -> 10/2026):');
    console.log('   - 50 Nhân sự chính thức (Avatar đồng bộ: /default-avatar.jpg)');
    console.log('   - 5 Phòng ban (Ban Điều Hành, IT, HR, Marketing, Tài chính - Kế toán)');
    console.log('   - 50 Tài khoản đăng nhập (Giữ nguyên 4 tài khoản test chính)');
    console.log('   - 50 Hợp đồng lao động chính thức & 50 Quỹ phép năm 2026');
    console.log('   - 2.850+ bản ghi Chấm công thực tế trải dài từ 01/2026 đến 25/10/2026');
    console.log('   - 17 Đơn nghỉ phép, 5 Giải trình công, 6 Đơn OT, 3 Hồ sơ y tế C65');
    console.log('   - 10 Kỳ lương (2026-01 -> 2026-10) với 500 Phiếu lương chi tiết');
    console.log('   - 6 Dự án, 12 Nhiệm vụ Kanban, 8 Task Logs, 3 Squads & Chat');
    console.log('   - 100 Đánh giá năng lực 9-Box (Q2 & Q3/2026) & 3 Kế hoạch PIP');
    console.log('   - 5 Văn bản Cẩm nang quy chế 2026 & 5 Thông báo nội bộ công ty');
    console.log('======================================================');
    console.log('🔑 4 Tài khoản đăng nhập nhanh (được bảo toàn 100%):');
    console.log('   1. CEO:          ceo@fwbnexus.vn      / Ceo@123456');
    console.log('   2. HR Director:  hrd@fwbnexus.vn      / Hrd@123456');
    console.log('   3. Line Manager: lead@fwbnexus.vn     / Lead@123456');
    console.log('   4. Employee:     employee@fwbnexus.vn / Emp@123456');
    console.log('   * 46 nhân sự còn lại: mật khẩu mặc định: User@123456\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi khi thực hiện reset & seed database:', err);
    process.exit(1);
  } finally {
    client.release();
    await db.pool.end();
  }
}

resetAndSeed50Employees();
