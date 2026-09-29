require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

async function resetAndSeed50Employees() {
  const client = await db.pool.connect();
  try {
    console.log('🔄 Bắt đầu dọn sạch database và khởi tạo dữ liệu chuẩn 50 nhân sự (4 phòng ban)...\n');
    await client.query('BEGIN');

    // 1. Dọn sạch toàn bộ các bảng nghiệp vụ
    const tablesToTruncate = [
      'attendance_appeals',
      'attendance_logs',
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
      'ot_requests',
      'medical_claims',
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
      'positions'
    ];

    console.log('🗑️ 1. Xóa toàn bộ dữ liệu nghiệp vụ (TRUNCATE CASCADE)...');
    for (const tbl of tablesToTruncate) {
      try {
        await client.query(`TRUNCATE TABLE "${tbl}" RESTART IDENTITY CASCADE;`);
      } catch (e) {
        console.warn(`  - Bỏ qua bảng ${tbl}:`, e.message);
      }
    }

    // 2. Roles
    console.log('🛡️ 2. Khởi tạo danh mục Phân quyền Roles chuẩn...');
    await client.query(`
      INSERT INTO roles (role_code, role_name, description, permissions) VALUES
        ('CEO', 'Tổng Giám Đốc', 'Cấp 1 — Lãnh đạo tối cao', '{"all": true}'),
        ('HR_DIRECTOR', 'Giám Đốc Nhân Sự', 'Cấp 2A — Quản lý toàn bộ nhân sự', '{"manage_employees": true, "manage_leave": true, "manage_payroll": true, "view_reports": true, "manage_ai": true}'),
        ('LINE_MANAGER', 'Trưởng Phòng', 'Cấp 2B — Quản lý nhân viên phòng ban', '{"view_team": true, "approve_leave": true, "manage_tasks": true, "create_projects": true}'),
        ('EMPLOYEE', 'Nhân Viên', 'Cấp 3 — Nhân viên tự phục vụ (ESS)', '{"view_self": true, "request_leave": true, "update_tasks": true}'),
        ('KIOSK', 'Kiosk Chấm Công', 'Thiết bị chấm công sảnh', '{"attendance_only": true}'),
        ('ADMIN', 'Quản Trị Hệ Thống', 'Quản trị viên kỹ thuật IT', '{"all": true}')
      ON CONFLICT (role_code) DO NOTHING;
    `);

    // 3. Departments (4 phòng ban nghiệp vụ chính + Ban Điều Hành)
    console.log('🏢 3. Khởi tạo 4 Phòng ban chính + Ban Điều Hành...');
    await client.query(`
      INSERT INTO departments (id, name, budget_yearly, description) VALUES
        ('DEPT-CEO', 'Ban Điều Hành & Lãnh Đạo', 5000000000, 'Ban Tổng Giám Đốc điều hành chiến lược toàn diện công ty'),
        ('DEPT-IT',  'Phòng Kỹ thuật Phần mềm',   4500000000, 'Phòng Kỹ thuật Phần mềm — Frontend, Backend, AI, DevOps & QA'),
        ('DEPT-HR',  'Phòng Quản trị Nhân sự',     2500000000, 'Quản lý tuyển dụng, tiền lương C&B, đào tạo & trải nghiệm nhân viên'),
        ('DEPT-MKT', 'Phòng Kinh doanh & Tiếp thị', 3800000000, 'Phát triển khách hàng B2B, Performance Marketing & Nhãn hàng'),
        ('DEPT-FIN', 'Phòng Tài chính & Kế toán',  2000000000, 'Kế toán quản trị, dòng tiền, báo cáo thuế & kiểm toán nội bộ')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
    `);

    // 4. Positions (Các chức danh rõ ràng theo cấp bậc)
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
        ('LT-AL', 'Nghỉ phép năm', 'PHEP_NAM', 12, TRUE, 'Phép năm theo Bộ luật Lao động Việt Nam'),
        ('LT-SL', 'Nghỉ ốm BHXH', 'NGHI_OM', 30, TRUE, 'Nghỉ ốm đau có giấy chứng nhận y tế C65 BHXH'),
        ('LT-PL', 'Nghỉ việc riêng', 'VIEC_RIENG', 3, TRUE, 'Nghỉ kết hôn, tang chế, hiếu hỉ theo quy chế'),
        ('LT-ML', 'Nghỉ thai sản', 'THAI_SAN', 180, TRUE, 'Chế độ thai sản cho lao động nữ sinh con'),
        ('LT-UL', 'Nghỉ không lương', 'KHONG_LUONG', 30, FALSE, 'Nghỉ việc cá nhân không hưởng lương'),
        ('LT-BT', 'Nghỉ công tác', 'CONG_TAC', 30, TRUE, 'Đi công tác đối ngoại ngoài văn phòng')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 6. 50 Employees (Danh sách 50 nhân sự chuẩn xác)
    console.log('👥 6. Khởi tạo 50 Hồ sơ Nhân sự chân thực...');
    const rawEmployees = [
      // 1. CEO
      { id: 'NV-0001', name: 'Lê Vũ Ngọc Duy', dept: 'DEPT-CEO', pos: 'POS-CEO', title: 'Tổng Giám Đốc (CEO)', email: 'ceo@fwbnexus.vn', phone: '0901 000 001', citizen: '079185001001', gender: 'Nam', dob: '1985-05-12', salary: 80000000, joined: '2020-01-15', manager: null, role: 'CEO', bankAcc: '0071 0008 89988', bankName: 'Vietcombank', kpi: 99.0, attRate: 100 },
      
      // 2. HR Director (Cấp 2A)
      { id: 'NV-1001', name: 'Trần Mai Hương', dept: 'DEPT-HR', pos: 'POS-DIR', title: 'Giám Đốc Nhân Sự (HRD)', email: 'hrd@fwbnexus.vn', phone: '0901 000 002', citizen: '079188002002', gender: 'Nu', dob: '1988-08-20', salary: 55000000, joined: '2021-03-01', manager: 'NV-0001', role: 'HR_DIRECTOR', bankAcc: '1018 0099 11', bankName: 'Vietcombank', kpi: 98.0, attRate: 99.0 },
      
      // 3. Line Manager IT (Cấp 2B)
      { id: 'NV-1002', name: 'Vũ Đình Khang', dept: 'DEPT-IT', pos: 'POS-MGR', title: 'Trưởng Phòng Kỹ Thuật', email: 'lead@fwbnexus.vn', phone: '0901 000 003', citizen: '079190003003', gender: 'Nam', dob: '1990-11-15', salary: 45000000, joined: '2021-06-15', manager: 'NV-0001', role: 'LINE_MANAGER', bankAcc: '0071 9384 11', bankName: 'Vietcombank', kpi: 98.5, attRate: 100 },
      
      // 4. Employee Staff IT (Cấp 3)
      { id: 'NV-0842', name: 'Phạm Minh Quân', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Kỹ Sư Phần Mềm (Frontend Lead)', email: 'employee@fwbnexus.vn', phone: '0901 000 004', citizen: '079196004004', gender: 'Nam', dob: '1996-04-18', salary: 28000000, joined: '2023-01-10', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 4455 66', bankName: 'Techcombank', kpi: 95.0, attRate: 98.0 },
      
      // DEPT-IT (17 nhân sự còn lại để đạt 19 người IT)
      { id: 'NV-1003', name: 'Nguyễn Hoàng Nam', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Kỹ Sư Backend Cấp Cao (Node.js/Go)', email: 'nam.nguyen@fwbnexus.vn', phone: '0902 111 005', citizen: '079194005005', gender: 'Nam', dob: '1994-09-22', salary: 32000000, joined: '2022-04-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 8877 66', bankName: 'Techcombank', kpi: 96.0, attRate: 98.5 },
      { id: 'NV-1004', name: 'Đặng Quỳnh Anh', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Chuyên Viên UI/UX Product Designer', email: 'anh.dang@fwbnexus.vn', phone: '0902 111 006', citizen: '079197006006', gender: 'Nu', dob: '1997-12-05', salary: 23000000, joined: '2023-05-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0381 2233 44', bankName: 'MB Bank', kpi: 94.0, attRate: 97.0 },
      { id: 'NV-1005', name: 'Bùi Quốc Bảo', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Kỹ Sư DevOps & Điện Toán Đám Mây', email: 'bao.bui@fwbnexus.vn', phone: '0902 111 007', citizen: '079193007007', gender: 'Nam', dob: '1993-07-14', salary: 34000000, joined: '2022-02-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 5566 77', bankName: 'Vietcombank', kpi: 97.0, attRate: 99.0 },
      { id: 'NV-1006', name: 'Hoàng Thảo Linh', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Trưởng Nhóm Kiểm Thử QA/QC', email: 'linh.hoang@fwbnexus.vn', phone: '0902 111 008', citizen: '079195008008', gender: 'Nu', dob: '1995-03-30', salary: 25000000, joined: '2023-03-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1028 9988 77', bankName: 'Vietinbank', kpi: 95.5, attRate: 98.0 },
      { id: 'NV-1007', name: 'Phan Thế Anh', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Kỹ Sư Mobile Flutter/iOS', email: 'anh.phan@fwbnexus.vn', phone: '0902 111 009', citizen: '079198009009', gender: 'Nam', dob: '1998-06-11', salary: 24000000, joined: '2023-09-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 6677 88', bankName: 'Techcombank', kpi: 93.0, attRate: 96.5 },
      { id: 'NV-1008', name: 'Đỗ Bích Thảo', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Lập Trình Viên Frontend React', email: 'thao.do@fwbnexus.vn', phone: '0902 111 010', citizen: '079199010010', gender: 'Nu', dob: '1999-10-15', salary: 18000000, joined: '2024-02-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0341 8899 00', bankName: 'MB Bank', kpi: 92.0, attRate: 97.0 },
      { id: 'NV-1009', name: 'Vũ Trọng Hùng', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Kỹ Sư Quản Trị Cơ Sở Dữ Liệu (DBA)', email: 'hung.vu@fwbnexus.vn', phone: '0902 111 011', citizen: '079194011011', gender: 'Nam', dob: '1994-01-20', salary: 27000000, joined: '2022-08-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 3344 55', bankName: 'Vietcombank', kpi: 94.5, attRate: 99.0 },
      { id: 'NV-1010', name: 'Lâm Gia Hân', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Kiểm Thử Viên Phần Mềm (QC Tester)', email: 'han.lam@fwbnexus.vn', phone: '0902 111 012', citizen: '079200012012', gender: 'Nu', dob: '2000-05-18', salary: 16000000, joined: '2024-04-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1038 4455 66', bankName: 'ACB', kpi: 91.0, attRate: 98.0 },
      { id: 'NV-1011', name: 'Mai Văn Tuấn', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Kỹ Sư An Toàn Thông Tin & SecOps', email: 'tuan.mai@fwbnexus.vn', phone: '0902 111 013', citizen: '079195013013', gender: 'Nam', dob: '1995-11-28', salary: 29000000, joined: '2023-06-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 1122 33', bankName: 'Techcombank', kpi: 96.0, attRate: 98.5 },
      { id: 'NV-1012', name: 'Trịnh Mỹ Duyên', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Lập Trình Viên Backend API Node.js', email: 'duyen.trinh@fwbnexus.vn', phone: '0902 111 014', citizen: '079199014014', gender: 'Nu', dob: '1999-07-09', salary: 18500000, joined: '2024-01-10', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0371 4455 66', bankName: 'MB Bank', kpi: 92.5, attRate: 97.5 },
      { id: 'NV-1013', name: 'Hồ Đăng Khoa', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Kỹ Sư Trí Tuệ Nhân Tạo & AI Vision', email: 'khoa.ho@fwbnexus.vn', phone: '0902 111 015', citizen: '079192015015', gender: 'Nam', dob: '1992-04-03', salary: 36000000, joined: '2022-09-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 8899 00', bankName: 'Vietcombank', kpi: 97.5, attRate: 99.5 },
      { id: 'NV-1014', name: 'Ngô Thảo Trang', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Lập Trình Viên Giao Diện Web React', email: 'trang.ngo@fwbnexus.vn', phone: '0902 111 016', citizen: '079201016016', gender: 'Nu', dob: '2001-08-25', salary: 17000000, joined: '2024-06-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1018 7788 99', bankName: 'Vietinbank', kpi: 90.0, attRate: 96.0 },
      { id: 'NV-1015', name: 'Dương Công Minh', dept: 'DEPT-IT', pos: 'POS-INT', title: 'Thực Tập Sinh Lập Trình Frontend', email: 'minh.duong@fwbnexus.vn', phone: '0902 111 017', citizen: '079203017017', gender: 'Nam', dob: '2003-02-14', salary: 8500000, joined: '2024-07-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 9900 11', bankName: 'Techcombank', kpi: 88.0, attRate: 95.0 },
      { id: 'NV-1016', name: 'Tạ Thu Hiền', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Chuyên Viên Phân Tích Nghiệp Vụ (BA)', email: 'hien.ta@fwbnexus.vn', phone: '0902 111 018', citizen: '079196018018', gender: 'Nu', dob: '1996-09-19', salary: 24000000, joined: '2023-04-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0391 5566 77', bankName: 'MB Bank', kpi: 95.0, attRate: 98.0 },
      { id: 'NV-1017', name: 'Lý Quốc Cường', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Kỹ Sư Quản Trị Hạ Tầng Mạng', email: 'cuong.ly@fwbnexus.vn', phone: '0902 111 019', citizen: '079197019019', gender: 'Nam', dob: '1997-03-12', salary: 23500000, joined: '2023-10-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 2233 44', bankName: 'Vietcombank', kpi: 93.5, attRate: 97.5 },
      { id: 'NV-1018', name: 'Lê Cẩm Ly', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Chuyên Viên Hỗ Trợ Kỹ Thuật (IT Helpdesk)', email: 'ly.le@fwbnexus.vn', phone: '0902 111 020', citizen: '079200020020', gender: 'Nu', dob: '2000-11-04', salary: 17500000, joined: '2024-03-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1048 6677 88', bankName: 'ACB', kpi: 91.5, attRate: 98.0 },

      // DEPT-HR (9 nhân sự bổ sung + NV-1001 = 10 người)
      { id: 'NV-1101', name: 'Nguyễn Thu Trang', dept: 'DEPT-HR', pos: 'POS-MGR', title: 'Trưởng Nhóm Tuyển Dụng & Đào Tạo', email: 'trang.nguyen@fwbnexus.vn', phone: '0903 222 001', citizen: '079192021021', gender: 'Nu', dob: '1992-06-25', salary: 28000000, joined: '2021-08-01', manager: 'NV-1001', role: 'LINE_MANAGER', bankAcc: '0071 4455 66', bankName: 'Vietcombank', kpi: 96.0, attRate: 99.0 },
      { id: 'NV-1102', name: 'Đinh Gia Bảo', dept: 'DEPT-HR', pos: 'POS-SR', title: 'Chuyên Viên Cấp Cao Tiền Lương & C&B', email: 'bao.dinh@fwbnexus.vn', phone: '0903 222 002', citizen: '079193022022', gender: 'Nam', dob: '1993-02-18', salary: 26000000, joined: '2022-01-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '1903 5566 77', bankName: 'Techcombank', kpi: 97.0, attRate: 100 },
      { id: 'NV-1103', name: 'Chu Bảo Ngọc', dept: 'DEPT-HR', pos: 'POS-MID', title: 'Chuyên Viên Thu Hút Nhân Tài (HR Tech)', email: 'ngoc.chu@fwbnexus.vn', phone: '0903 222 003', citizen: '079196023023', gender: 'Nu', dob: '1996-10-10', salary: 21000000, joined: '2023-02-01', manager: 'NV-1101', role: 'EMPLOYEE', bankAcc: '0351 7788 99', bankName: 'MB Bank', kpi: 94.0, attRate: 98.0 },
      { id: 'NV-1104', name: 'Võ Đình Trọng', dept: 'DEPT-HR', pos: 'POS-MID', title: 'Chuyên Viên Pháp Chế & Quan Hệ Lao Động', email: 'trong.vo@fwbnexus.vn', phone: '0903 222 004', citizen: '079194024024', gender: 'Nam', dob: '1994-08-14', salary: 23000000, joined: '2022-11-01', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0071 7788 99', bankName: 'Vietcombank', kpi: 95.0, attRate: 98.5 },
      { id: 'NV-1105', name: 'Trần Kim Ngân', dept: 'DEPT-HR', pos: 'POS-JR', title: 'Chuyên Viên Tổ Chức Đào Tạo Nội Bộ', email: 'ngan.tran@fwbnexus.vn', phone: '0903 222 005', citizen: '079199025025', gender: 'Nu', dob: '1999-04-05', salary: 17000000, joined: '2024-01-15', manager: 'NV-1101', role: 'EMPLOYEE', bankAcc: '1028 1122 33', bankName: 'Vietinbank', kpi: 91.0, attRate: 97.0 },
      { id: 'NV-1106', name: 'Phạm Minh Đức', dept: 'DEPT-HR', pos: 'POS-MID', title: 'Chuyên Viên Vận Hành Nhân Sự & Chấm Công Kiosk', email: 'duc.pham@fwbnexus.vn', phone: '0903 222 006', citizen: '079197026026', gender: 'Nam', dob: '1997-12-20', salary: 20000000, joined: '2023-07-01', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '1903 2233 44', bankName: 'Techcombank', kpi: 93.0, attRate: 99.0 },
      { id: 'NV-1107', name: 'Lê Hải Yến', dept: 'DEPT-HR', pos: 'POS-JR', title: 'Chuyên Viên Trải Nghiệm & Gắn Kết Nhân Viên', email: 'yen.le@fwbnexus.vn', phone: '0903 222 007', citizen: '079200027027', gender: 'Nu', dob: '2000-03-15', salary: 16500000, joined: '2024-03-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0381 9900 11', bankName: 'MB Bank', kpi: 92.0, attRate: 97.5 },
      { id: 'NV-1108', name: 'Đoàn Anh Khoa', dept: 'DEPT-HR', pos: 'POS-INT', title: 'Thực Tập Sinh Tuyển Dụng & Hành Chính', email: 'khoa.doan@fwbnexus.vn', phone: '0903 222 008', citizen: '079203028028', gender: 'Nam', dob: '2003-09-08', salary: 8000000, joined: '2024-08-01', manager: 'NV-1101', role: 'EMPLOYEE', bankAcc: '1058 3344 55', bankName: 'ACB', kpi: 89.0, attRate: 96.0 },
      { id: 'NV-1109', name: 'Thái Nhật Lệ', dept: 'DEPT-HR', pos: 'POS-MID', title: 'Chuyên Viên Truyền Thông Nội Bộ & Văn Hóa Doanh Nghiệp', email: 'le.thai@fwbnexus.vn', phone: '0903 222 009', citizen: '079198029029', gender: 'Nu', dob: '1998-05-22', salary: 21000000, joined: '2023-08-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0071 6677 88', bankName: 'Vietcombank', kpi: 94.5, attRate: 98.0 },
      { id: 'NV-1110', name: 'Nguyễn Thanh Tùng', dept: 'DEPT-HR', pos: 'POS-JR', title: 'Chuyên Viên Thủ Tục Nhân Sự & Hợp Đồng', email: 'tung.nguyen@fwbnexus.vn', phone: '0903 222 010', citizen: '079200050050', gender: 'Nam', dob: '2000-07-14', salary: 17000000, joined: '2024-04-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0071 9900 22', bankName: 'Vietcombank', kpi: 92.0, attRate: 98.0 },

      // DEPT-MKT (12 nhân sự)
      { id: 'NV-2001', name: 'Đỗ Minh Trí', dept: 'DEPT-MKT', pos: 'POS-MGR', title: 'Trưởng Phòng Kinh Doanh & Marketing', email: 'tri.do@fwbnexus.vn', phone: '0904 333 001', citizen: '079189030030', gender: 'Nam', dob: '1989-07-17', salary: 42000000, joined: '2021-05-01', manager: 'NV-0001', role: 'LINE_MANAGER', bankAcc: '0071 1122 33', bankName: 'Vietcombank', kpi: 97.5, attRate: 99.0 },
      { id: 'NV-2002', name: 'Bùi Khánh Linh', dept: 'DEPT-MKT', pos: 'POS-SR', title: 'Trưởng Nhóm Digital & Growth Marketing', email: 'linh.bui@fwbnexus.vn', phone: '0904 333 002', citizen: '079193031031', gender: 'Nu', dob: '1993-11-25', salary: 27000000, joined: '2022-03-01', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '1903 7788 99', bankName: 'Techcombank', kpi: 96.0, attRate: 98.0 },
      { id: 'NV-2003', name: 'Vũ Tuấn Kiệt', dept: 'DEPT-MKT', pos: 'POS-SR', title: 'Trưởng Nhóm Kinh Doanh Khách Hàng B2B', email: 'kiet.vu@fwbnexus.vn', phone: '0904 333 003', citizen: '079192032032', gender: 'Nam', dob: '1992-03-19', salary: 29000000, joined: '2022-06-15', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '0361 2233 44', bankName: 'MB Bank', kpi: 96.5, attRate: 98.5 },
      { id: 'NV-2004', name: 'Nguyễn Thanh Hằng', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'Chuyên Viên Quản Lý Khách Hàng Chiến Lược (Key Account)', email: 'hang.nguyen@fwbnexus.vn', phone: '0904 333 004', citizen: '079196033033', gender: 'Nu', dob: '1996-01-30', salary: 22000000, joined: '2023-01-15', manager: 'NV-2003', role: 'EMPLOYEE', bankAcc: '1028 4455 66', bankName: 'Vietinbank', kpi: 94.0, attRate: 97.5 },
      { id: 'NV-2005', name: 'Lương Văn Phú', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'Chuyên Viên Tối Ưu Quảng Cáo (Performance Ads)', email: 'phu.luong@fwbnexus.vn', phone: '0904 333 005', citizen: '079195034034', gender: 'Nam', dob: '1995-08-04', salary: 23000000, joined: '2023-04-01', manager: 'NV-2002', role: 'EMPLOYEE', bankAcc: '1903 3344 55', bankName: 'Techcombank', kpi: 95.0, attRate: 98.0 },
      { id: 'NV-2006', name: 'Huỳnh Ngọc Bích', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'Chuyên Viên Sáng Tạo Nội Dung & Copywriter', email: 'bich.huynh@fwbnexus.vn', phone: '0904 333 006', citizen: '079197035035', gender: 'Nu', dob: '1997-04-16', salary: 20000000, joined: '2023-09-15', manager: 'NV-2002', role: 'EMPLOYEE', bankAcc: '0071 9900 11', bankName: 'Vietcombank', kpi: 93.0, attRate: 97.0 },
      { id: 'NV-2007', name: 'Trương Tấn Phát', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'Chuyên Viên Phát Triển Thị Trường Doanh Nghiệp', email: 'phat.truong@fwbnexus.vn', phone: '0904 333 007', citizen: '079199036036', gender: 'Nam', dob: '1999-12-12', salary: 18000000, joined: '2024-02-01', manager: 'NV-2003', role: 'EMPLOYEE', bankAcc: '0371 6677 88', bankName: 'MB Bank', kpi: 92.0, attRate: 96.5 },
      { id: 'NV-2008', name: 'Đặng Phương Thảo', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'Chuyên Viên Quản Trị Kênh Số & Mạng Xã Hội', email: 'thao.dang@fwbnexus.vn', phone: '0904 333 008', citizen: '079200037037', gender: 'Nu', dob: '2000-06-20', salary: 17000000, joined: '2024-03-10', manager: 'NV-2002', role: 'EMPLOYEE', bankAcc: '1068 5566 77', bankName: 'ACB', kpi: 91.5, attRate: 97.0 },
      { id: 'NV-2009', name: 'Vương Gia Huy', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'Chuyên Viên Thiết Kế Đồ Họa Truyền Thông', email: 'huy.vuong@fwbnexus.vn', phone: '0904 333 009', citizen: '079198038038', gender: 'Nam', dob: '1998-09-05', salary: 18500000, joined: '2023-11-15', manager: 'NV-2002', role: 'EMPLOYEE', bankAcc: '1903 0011 22', bankName: 'Techcombank', kpi: 93.5, attRate: 98.0 },
      { id: 'NV-2010', name: 'Cao Thùy Dương', dept: 'DEPT-MKT', pos: 'POS-INT', title: 'Thực Tập Sinh Marketing & Sự Kiện', email: 'duong.cao@fwbnexus.vn', phone: '0904 333 010', citizen: '079203039039', gender: 'Nu', dob: '2003-04-28', salary: 8000000, joined: '2024-08-15', manager: 'NV-2002', role: 'EMPLOYEE', bankAcc: '0391 1122 33', bankName: 'MB Bank', kpi: 88.5, attRate: 95.5 },
      { id: 'NV-2011', name: 'Hoàng Minh Quân', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'Chuyên Viên Tư Vấn Giải Pháp HR Tech', email: 'quan.hoang@fwbnexus.vn', phone: '0904 333 011', citizen: '079196040040', gender: 'Nam', dob: '1996-08-11', salary: 21500000, joined: '2023-05-01', manager: 'NV-2003', role: 'EMPLOYEE', bankAcc: '0071 8877 66', bankName: 'Vietcombank', kpi: 94.0, attRate: 98.0 },
      { id: 'NV-2012', name: 'Phùng Diệu Thúy', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'Chuyên Viên Chăm Sóc Khách Hàng (CSKH B2B)', email: 'thuy.phung@fwbnexus.vn', phone: '0904 333 012', citizen: '079201041041', gender: 'Nu', dob: '2001-01-17', salary: 16500000, joined: '2024-05-15', manager: 'NV-2003', role: 'EMPLOYEE', bankAcc: '1038 8899 00', bankName: 'Vietinbank', kpi: 91.0, attRate: 97.5 },

      // DEPT-FIN (8 nhân sự)
      { id: 'NV-3001', name: 'Nguyễn Bích Ngọc', dept: 'DEPT-FIN', pos: 'POS-MGR', title: 'Trưởng Phòng Tài Chính & Kế Toán Trưởng', email: 'ngoc.nguyen@fwbnexus.vn', phone: '0905 444 001', citizen: '079187042042', gender: 'Nu', dob: '1987-03-24', salary: 43000000, joined: '2021-02-01', manager: 'NV-0001', role: 'LINE_MANAGER', bankAcc: '0071 5544 33', bankName: 'Vietcombank', kpi: 98.0, attRate: 100 },
      { id: 'NV-3002', name: 'Trần Quốc Thịnh', dept: 'DEPT-FIN', pos: 'POS-SR', title: 'Kế Toán Tổng Hợp & Báo Cáo Tài Chính', email: 'thinh.tran@fwbnexus.vn', phone: '0905 444 002', citizen: '079191043043', gender: 'Nam', dob: '1991-10-09', salary: 27000000, joined: '2022-04-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1903 4433 22', bankName: 'Techcombank', kpi: 96.5, attRate: 99.0 },
      { id: 'NV-3003', name: 'Lê Hoàng Oanh', dept: 'DEPT-FIN', pos: 'POS-MID', title: 'Chuyên Viên Kế Toán Thuế & Kiểm Toán Nội Bộ', email: 'oanh.le@fwbnexus.vn', phone: '0905 444 003', citizen: '079194044044', gender: 'Nu', dob: '1994-06-16', salary: 23000000, joined: '2022-10-01', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '0341 3322 11', bankName: 'MB Bank', kpi: 95.0, attRate: 98.5 },
      { id: 'NV-3004', name: 'Phan Anh Vũ', dept: 'DEPT-FIN', pos: 'POS-MID', title: 'Chuyên Viên Quản Trị Ngân Sách & Dòng Tiền', email: 'vu.phan@fwbnexus.vn', phone: '0905 444 004', citizen: '079195045045', gender: 'Nam', dob: '1995-12-03', salary: 24000000, joined: '2023-03-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '0071 9988 77', bankName: 'Vietcombank', kpi: 95.5, attRate: 98.0 },
      { id: 'NV-3005', name: 'Tạ Thúy Nga', dept: 'DEPT-FIN', pos: 'POS-JR', title: 'Chuyên Viên Kế Toán Thanh Toán & Công Nợ', email: 'nga.ta@fwbnexus.vn', phone: '0905 444 005', citizen: '079199046046', gender: 'Nu', dob: '1999-05-27', salary: 18000000, joined: '2023-12-01', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1028 6655 44', bankName: 'Vietinbank', kpi: 92.0, attRate: 97.5 },
      { id: 'NV-3006', name: 'Quách Hữu Tài', dept: 'DEPT-FIN', pos: 'POS-JR', title: 'Chuyên Viên Kế Toán Tài Sản & Kho Quản Trị', email: 'tai.quach@fwbnexus.vn', phone: '0905 444 006', citizen: '079198047047', gender: 'Nam', dob: '1998-11-18', salary: 17500000, joined: '2024-02-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1903 8899 11', bankName: 'Techcombank', kpi: 91.5, attRate: 98.0 },
      { id: 'NV-3007', name: 'Dương Diễm My', dept: 'DEPT-FIN', pos: 'POS-JR', title: 'Thủ Quỹ Doanh Nghiệp & Quản Lý Quỹ Tiền Mặt', email: 'my.duong@fwbnexus.vn', phone: '0905 444 007', citizen: '079200048048', gender: 'Nu', dob: '2000-08-08', salary: 16500000, joined: '2024-04-10', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '0371 9988 77', bankName: 'MB Bank', kpi: 92.5, attRate: 98.5 },
      { id: 'NV-3008', name: 'Kiều Minh Tuấn', dept: 'DEPT-FIN', pos: 'POS-INT', title: 'Thực Tập Sinh Kế Toán Doanh Nghiệp', email: 'tuan.kieu@fwbnexus.vn', phone: '0905 444 008', citizen: '079203049049', gender: 'Nam', dob: '2003-01-22', salary: 8000000, joined: '2024-07-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1078 2233 44', bankName: 'ACB', kpi: 89.0, attRate: 96.0 }
    ];

    console.log(`  => Tổng cộng có ${rawEmployees.length} nhân sự chuẩn bị đưa vào hệ thống.`);

    // Chèn 50 Employees
    for (const emp of rawEmployees) {
      await client.query(`
        INSERT INTO employees (
          id, full_name, department_id, position_id, job_title, work_email, phone_number,
          citizen_id, date_of_birth, gender, base_salary, contract_type, joined_date,
          status, bank_account, bank_name, kpi_score, attendance_rate
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'CHINH_THUC', $12,
          'DANG_LAM_VIEC', $13, $14, $15, $16
        );
      `, [
        emp.id, emp.name, emp.dept, emp.pos, emp.title, emp.email, emp.phone,
        emp.citizen, emp.dob, emp.gender, emp.salary, emp.joined,
        emp.bankAcc, emp.bankName, emp.kpi, emp.attRate
      ]);
    }

    // Cập nhật quan hệ cấp trên quản lý (manager_id)
    console.log('🔗 Thiết lập cấu trúc phân cấp quản lý (manager_id)...');
    for (const emp of rawEmployees) {
      if (emp.manager) {
        await client.query(`UPDATE employees SET manager_id = $1 WHERE id = $2;`, [emp.manager, emp.id]);
      }
    }
    // Gán Trưởng phòng cho từng Department
    await client.query(`UPDATE departments SET manager_id = 'NV-0001' WHERE id = 'DEPT-CEO';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-1002' WHERE id = 'DEPT-IT';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-1001' WHERE id = 'DEPT-HR';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-2001' WHERE id = 'DEPT-MKT';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-3001' WHERE id = 'DEPT-FIN';`);

    // 7. Tạo Users và gán Roles
    console.log('🔐 7. Khởi tạo Tài khoản Users với mật khẩu chuẩn bảo mật...');
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
        INSERT INTO users (employee_id, email, password_hash, role_code, is_active, failed_login_attempts, must_change_password)
        VALUES ($1, $2, $3, $4, true, 0, false);
      `, [emp.id, emp.email, pwd, emp.role]);
    }

    // Gán bảng user_roles
    await client.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id 
      FROM users u 
      JOIN roles r ON u.role_code = r.role_code;
    `);

    // 8. Hợp đồng lao động (contracts)
    console.log('📜 8. Khởi tạo 50 Hợp đồng Lao động chính thức có hiệu lực...');
    await client.query(`
      INSERT INTO contracts (employee_id, contract_no, type, start_date, salary, status)
      SELECT id, 'HDLD-' || id, contract_type, joined_date, base_salary, 'HIEU_LUC'
      FROM employees;
    `);

    // 9. Quỹ ngày phép (leave_balances)
    console.log('🏖️ 9. Khởi tạo Số dư ngày phép 2026 cho 50 nhân viên...');
    const currentYear = new Date().getFullYear();
    for (const emp of rawEmployees) {
      await client.query(`
        INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
        VALUES ($1, 'LT-AL', $2, 12, 0)
        ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;
      `, [emp.id, currentYear]);
    }

    // 10. Chấm công thực tế (attendance_logs)
    console.log('⏱️ 10. Khởi tạo Dữ liệu Chấm công thực tế trong tháng 09/2026...');
    const today = '2026-09-29';
    const yesterday = '2026-09-28';
    const dayBefore = '2026-09-27';

    // Tạo chấm công cho hôm nay (2026-09-29) cho toàn bộ 50 người
    for (let i = 0; i < rawEmployees.length; i++) {
      const emp = rawEmployees[i];
      let status = 'DUNG_GIO';
      let lateMinutes = 0;
      let checkInHour = 8;
      let checkInMin = 10 + (i % 20); // 08:10 -> 08:30
      let method = (i % 3 === 0) ? 'face_id' : (i % 3 === 1 ? 'kiosk' : 'code_gps');

      if (i === 2 || i === 7 || i === 18) {
        status = 'DI_MUON';
        lateMinutes = 15 + (i * 2);
        checkInHour = 8;
        checkInMin = 45;
      } else if (i === 12) {
        status = 'NGHI_PHEP';
        continue;
      }

      const inTime = `${today} ${String(checkInHour).padStart(2, '0')}:${String(checkInMin).padStart(2, '0')}:00+07`;
      const outTime = `${today} 18:00:00+07`;
      const workHours = status === 'DI_MUON' ? 7.75 : 8.5;

      await client.query(`
        INSERT INTO attendance_logs (employee_id, work_date, check_in_time, check_out_time, status, late_minutes, check_in_method, work_hours, check_in_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Trụ sở chính Tòa nhà NEXUS, Tầng 12, Q.1, TP.HCM');
      `, [emp.id, today, inTime, outTime, status, lateMinutes, method, workHours]);
    }

    // Tạo chấm công ngày hôm qua (2026-09-28)
    for (let i = 0; i < rawEmployees.length; i++) {
      const emp = rawEmployees[i];
      const inTime = `${yesterday} 08:15:00+07`;
      const outTime = `${yesterday} 17:45:00+07`;
      await client.query(`
        INSERT INTO attendance_logs (employee_id, work_date, check_in_time, check_out_time, status, late_minutes, check_in_method, work_hours, check_in_address)
        VALUES ($1, $2, $3, $4, 'DUNG_GIO', 0, 'face_id', 8.5, 'Trụ sở chính Tòa nhà NEXUS, Tầng 12, Q.1, TP.HCM');
      `, [emp.id, yesterday, inTime, outTime]);
    }

    // 11. Đơn nghỉ phép mẫu đa dạng (leave_requests)
    console.log('📝 11. Khởi tạo Đơn nghỉ phép đa trạng thái & đúng luồng phê duyệt...');
    await client.query(`
      INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage, handover_to, submitted_at)
      VALUES 
        ('LP-2026-001', 'NV-0842', 'LT-AL', '2026-10-02', '2026-10-02', 1.0, 'Giải quyết công việc gia đình cá nhân', 'CHO_TRUONG_PHONG_DUYET', 'Vũ Đình Khang', NOW() - INTERVAL '3 hours'),
        ('LP-2026-002', 'NV-1008', 'LT-AL', '2026-10-05', '2026-10-06', 2.0, 'Nghỉ về quê gia đình có việc hiếu hỉ', 'CHO_TRUONG_PHONG_DUYET', 'Phạm Minh Quân', NOW() - INTERVAL '5 hours'),
        ('LP-2026-003', 'NV-1002', 'LT-BT', '2026-10-10', '2026-10-12', 3.0, 'Tham gia Hội thảo Công nghệ Phần mềm Quốc gia Vietnam Tech 2026', 'CHO_HR_PHE_CHUAN', 'Phạm Minh Quân', NOW() - INTERVAL '1 day'),
        ('LP-2026-004', 'NV-2001', 'LT-BT', '2026-10-08', '2026-10-09', 2.0, 'Gặp gỡ ký kết hợp tác đối tác chiến lược tại Hà Nội', 'CHO_HR_PHE_CHUAN', 'Bùi Khánh Linh', NOW() - INTERVAL '2 days');
    `);

    // Các đơn đã phê duyệt
    await client.query(`
      INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage, manager_approved_by, manager_approved_at, hr_approved_by, hr_approved_at, hr_note, submitted_at)
      VALUES
        ('LP-2026-005', 'NV-1001', 'LT-AL', '2026-09-15', '2026-09-16', 2.0, 'Nghỉ phép năm tái tạo năng lượng', 'DA_PHE_DUYET', 'NV-0001', NOW() - INTERVAL '14 days', 'NV-0001', NOW() - INTERVAL '14 days', 'Tổng Giám Đốc đã phê chuẩn', NOW() - INTERVAL '15 days'),
        ('LP-2026-006', 'NV-1102', 'LT-AL', '2026-09-20', '2026-09-20', 1.0, 'Khám sức khỏe định kỳ', 'DA_PHE_DUYET', 'NV-1001', NOW() - INTERVAL '9 days', 'NV-1001', NOW() - INTERVAL '9 days', 'Trưởng phòng Nhân sự đã duyệt', NOW() - INTERVAL '10 days'),
        ('LP-2026-007', 'NV-3002', 'LT-SL', '2026-09-22', '2026-09-23', 2.0, 'Nghỉ ốm theo chỉ định của bác sĩ bệnh viện', 'DA_PHE_DUYET', 'NV-3001', NOW() - INTERVAL '7 days', 'NV-1001', NOW() - INTERVAL '7 days', 'Đã nộp giấy C65 BHXH hợp lệ', NOW() - INTERVAL '8 days');
    `);

    // Đơn bị từ chối
    await client.query(`
      INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage, manager_approved_by, manager_approved_at, manager_note, submitted_at)
      VALUES
        ('LP-2026-008', 'NV-2007', 'LT-UL', '2026-09-25', '2026-09-26', 2.0, 'Xin nghỉ việc riêng', 'TU_CHOI', 'NV-2001', NOW() - INTERVAL '5 days', 'Bộ phận đang tập trung chốt chiến dịch kinh doanh cuối tháng, đề nghị bố trí dịp khác.', NOW() - INTERVAL '6 days');
    `);

    // 12. Bảng lương và Phiếu lương 50 người (payroll_periods & payslips)
    console.log('💰 12. Khởi tạo Bảng lương tháng 09/2026 và tháng 08/2026 cho toàn bộ 50 nhân sự...');
    
    // Kỳ lương Tháng 09/2026 (Hiện tại - Dự thảo)
    const period09Res = await client.query(`
      INSERT INTO payroll_periods (period, total_headcount, total_net, total_bhxh, total_tax, status, note)
      VALUES ('2026-09', 50, 0, 0, 0, 'DU_THAO', 'Bảng lương tổng hợp tháng 09/2026 theo dữ liệu chấm công thực tế của 50 cán bộ nhân viên')
      RETURNING id;
    `);
    const period09Id = period09Res.rows[0].id;

    // Kỳ lương Tháng 08/2026 (Quá khứ - Đã hoàn thành chi trả)
    const period08Res = await client.query(`
      INSERT INTO payroll_periods (period, total_headcount, total_net, total_bhxh, total_tax, status, note)
      VALUES ('2026-08', 50, 0, 0, 0, 'DA_CHUYEN_KHOAN', 'Bảng lương tháng 08/2026 đã giải ngân quyết toán thành công qua ngân hàng Vietcombank')
      RETURNING id;
    `);
    const period08Id = period08Res.rows[0].id;

    let sumNet09 = 0, sumBhxh09 = 0, sumTax09 = 0;
    let sumNet08 = 0, sumBhxh08 = 0, sumTax08 = 0;

    for (const emp of rawEmployees) {
      const baseSalary = Number(emp.salary);
      const standardDays = 22;
      const actualDays = 22;
      const allowances = baseSalary >= 40000000 ? 5000000 : (baseSalary >= 25000000 ? 3000000 : 1500000);
      const bonus = (emp.kpi >= 96) ? 3000000 : ((emp.kpi >= 92) ? 1500000 : 0);
      const gross = baseSalary + allowances + bonus;

      // Bảo hiểm theo luật VN (trần 20 lần lương cơ sở hoặc theo lương)
      const insSalary = Math.min(baseSalary, 36000000);
      const bhxh = Math.round(insSalary * 0.08);
      const bhyt = Math.round(insSalary * 0.015);
      const bhtn = Math.round(insSalary * 0.01);
      const totalInsurance = bhxh + bhyt + bhtn;

      // Giảm trừ cá nhân 11tr
      const pitDeduction = 11000000;
      const taxable = Math.max(0, gross - totalInsurance - pitDeduction);
      
      // Thuế TNCN lũy tiến đơn giản hóa
      let pit = 0;
      if (taxable > 32000000) pit = Math.round(taxable * 0.25);
      else if (taxable > 18000000) pit = Math.round(taxable * 0.20);
      else if (taxable > 10000000) pit = Math.round(taxable * 0.15);
      else if (taxable > 5000000) pit = Math.round(taxable * 0.10);
      else if (taxable > 0) pit = Math.round(taxable * 0.05);

      const totalDeductions = totalInsurance + pit;
      const net = gross - totalDeductions;

      sumNet09 += net;
      sumBhxh09 += totalInsurance;
      sumTax09 += pit;

      // Phiếu lương tháng 09
      await client.query(`
        INSERT INTO payslips (
          period_id, employee_id, base_salary, actual_work_days, standard_work_days,
          allowances, bonus, gross_income, bhxh_amount, bhyt_amount, bhtn_amount,
          pit_deduction, pit_taxable, pit_amount, total_deductions, net_salary,
          status, bank_account, bank_name
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          'DU_THAO', $17, $18
        );
      `, [
        period09Id, emp.id, baseSalary, actualDays, standardDays,
        allowances, bonus, gross, bhxh, bhyt, bhtn,
        pitDeduction, taxable, pit, totalDeductions, net,
        emp.bankAcc, emp.bankName
      ]);

      // Phiếu lương tháng 08
      sumNet08 += net;
      sumBhxh08 += totalInsurance;
      sumTax08 += pit;
      await client.query(`
        INSERT INTO payslips (
          period_id, employee_id, base_salary, actual_work_days, standard_work_days,
          allowances, bonus, gross_income, bhxh_amount, bhyt_amount, bhtn_amount,
          pit_deduction, pit_taxable, pit_amount, total_deductions, net_salary,
          status, paid_date, bank_account, bank_name
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          'DA_CHUYEN_KHOAN', '2026-09-05', $17, $18
        );
      `, [
        period08Id, emp.id, baseSalary, actualDays, standardDays,
        allowances, bonus, gross, bhxh, bhyt, bhtn,
        pitDeduction, taxable, pit, totalDeductions, net,
        emp.bankAcc, emp.bankName
      ]);
    }

    // Cập nhật tổng số tiền cho kỳ lương
    await client.query(`
      UPDATE payroll_periods 
      SET total_net = $1, total_bhxh = $2, total_tax = $3 
      WHERE id = $4;
    `, [sumNet09, sumBhxh09, sumTax09, period09Id]);

    await client.query(`
      UPDATE payroll_periods 
      SET total_net = $1, total_bhxh = $2, total_tax = $3 
      WHERE id = $4;
    `, [sumNet08, sumBhxh08, sumTax08, period08Id]);

    // 13. Dự án và Nhiệm vụ Kanban (projects & tasks)
    console.log('📌 13. Khởi tạo Dự án & Nhiệm vụ Kanban phòng ban...');
    await client.query(`
      INSERT INTO projects (id, code, name, department_id, manager_id, start_date, end_date, progress, status, priority, description, budget_hours, used_hours)
      VALUES 
        ('PRJ-01', 'PRJ-NEXUS-V2', 'Nâng cấp Nền Tảng NEXUS HR v2.0 Toàn Diện', 'DEPT-IT', 'NV-1002', '2026-09-01', '2026-10-31', 82, 'in_progress', 'Cao', 'Hiện đại hóa toàn diện giao diện, phông chữ chuẩn Roboto YouTube, tối ưu trải nghiệm và hiệu năng', 400, 328),
        ('PRJ-02', 'PRJ-AI-KIOSK', 'Hệ Thống Điểm Danh Kiosk AI Face ID & Cổng Barrier', 'DEPT-IT', 'NV-1002', '2026-08-15', '2026-10-15', 88, 'in_progress', 'Cao', 'Triển khai camera AI nhận diện khuôn mặt chấm công thời gian thực tại sảnh', 250, 220),
        ('PRJ-03', 'PRJ-MKT-Q4',   'Chiến Dịch Tiếp Thị Số & Mở Rộng Thị Phần B2B Quý IV/2026', 'DEPT-MKT', 'NV-2001', '2026-09-15', '2026-12-31', 35, 'in_progress', 'Trung bình', 'Thu hút 200 khách hàng doanh nghiệp sử dụng nền tảng HR Tech', 300, 105),
        ('PRJ-04', 'PRJ-FIN-AUTO', 'Tự Động Hóa Đối Soát Ngân Hàng & Báo Cáo Tài Chính', 'DEPT-FIN', 'NV-3001', '2026-09-01', '2026-10-31', 65, 'in_progress', 'Trung bình', 'Kết nối API thanh toán chi lương tự động qua Vietcombank và Techcombank', 180, 117);
    `);

    await client.query(`
      INSERT INTO tasks (id, project_id, title, description, assignee_id, creator_id, deadline, priority, kpi_weight, progress, stage)
      VALUES
        ('TSK-01', 'PRJ-01', 'Chuẩn hóa phông chữ Roboto chuẩn YouTube tiếng Việt sắc nét', 'Cập nhật Google Fonts Roboto đầy đủ trọng số 300-900, dãn dòng 1.5, khử răng cưa antialiased', 'NV-0842', 'NV-1002', '2026-10-01', 'Cao', 30, 100, 'done'),
        ('TSK-02', 'PRJ-01', 'Dọn dẹp và reset database chuẩn 50 nhân viên 4 phòng ban', 'Khởi tạo dữ liệu sạch, đồng bộ toàn bộ luồng chấm công, phép năm, bảng lương và Kanban', 'NV-0842', 'NV-1002', '2026-10-02', 'Cao', 30, 100, 'done'),
        ('TSK-03', 'PRJ-01', 'Kiểm thử toàn diện từng nút bấm và 11 màn hình ứng dụng', 'Thực hiện test kỹ càng trên giao diện trình duyệt live, xác nhận 0 lỗi console', 'NV-1006', 'NV-1002', '2026-10-05', 'Khẩn cấp', 25, 80, 'review'),
        ('TSK-04', 'PRJ-02', 'Tối ưu nhận diện FaceID camera AI góc nghiêng tại sảnh', 'Đảm bảo thời gian nhận diện khuôn mặt dưới 0.3s với độ chính xác trên 99%', 'NV-1013', 'NV-1002', '2026-10-10', 'Cao', 25, 85, 'in_progress'),
        ('TSK-05', 'PRJ-03', 'Thiết kế bộ ấn phẩm nhận diện thương hiệu sản phẩm B2B', 'Bộ banner, landing page và hồ sơ năng lực gửi các đối tác tập đoàn', 'NV-2009', 'NV-2001', '2026-10-08', 'Trung bình', 20, 70, 'in_progress'),
        ('TSK-06', 'PRJ-04', 'Kiểm thử đối soát tự động lệnh chi lương qua cổng ngân hàng', 'Xác thực định dạng file ủy nhiệm chi điện tử chuẩn Vietcombank Digital', 'NV-3002', 'NV-3001', '2026-10-12', 'Trung bình', 20, 60, 'in_progress'),
        ('TSK-07', 'PRJ-01', 'Viết tài liệu hướng dẫn sử dụng phiên bản mới cho người dùng', 'Cập nhật cẩm nang nhân viên, quy trình xin nghỉ phép và ký hợp đồng điện tử', 'NV-1016', 'NV-1002', '2026-10-15', 'Thấp', 15, 20, 'todo'),
        ('TSK-08', 'PRJ-03', 'Chạy chiến dịch quảng cáo tìm kiếm Google Ads và LinkedIn', 'Nhắm mục tiêu Giám đốc nhân sự và CEO các doanh nghiệp vừa và nhỏ', 'NV-2005', 'NV-2001', '2026-10-20', 'Trung bình', 20, 10, 'todo');
    `);

    // 14. Thông báo doanh nghiệp (company_notices & broadcast notifications)
    console.log('📢 14. Khởi tạo Thông báo chính thức nội bộ công ty và đồng bộ trung tâm thông báo...');
    await client.query(`
      INSERT INTO company_notices (id, title, content, category, priority, author_id, is_pinned, is_active, published_at)
      VALUES 
        ('NOT-01', 'QUYẾT ĐỊNH KHEN THƯỞNG XUẤT SẮC QUÝ III/2026', 'Tổng Giám Đốc biểu dương và trao thưởng cho các tập thể phòng ban xuất sắc đã hoàn thành xuất sắc các chỉ tiêu công tác và nâng cấp hệ thống NEXUS HR v2.0.', 'general', 'high', 'NV-0001', TRUE, TRUE, NOW() - INTERVAL '1 day'),
        ('NOT-02', 'HƯỚNG DẪN QUY TRÌNH CHẤM CÔNG VÀ NGHỈ PHÉP TỰ ĐỘNG', 'Nhân viên thực hiện điểm danh qua Kiosk FaceID hoặc định vị GPS trên ứng dụng. Mọi đơn nghỉ phép phải gửi trước ít nhất 24 giờ để cấp trên phê duyệt.', 'policy', 'normal', 'NV-1001', TRUE, TRUE, NOW() - INTERVAL '3 days'),
        ('NOT-03', 'KẾ HOẠCH TỔ CHỨC KHÁM SỨC KHỎE ĐỊNH KỲ NĂM 2026', 'Phòng Quản trị Nhân sự phối hợp cùng Bệnh viện Đa khoa Quốc tế tổ chức khám sức khỏe định kỳ cho toàn thể 50 cán bộ nhân viên trong tháng 10/2026.', 'event', 'normal', 'NV-1001', FALSE, TRUE, NOW() - INTERVAL '5 days'),
        ('NOT-04', 'LỊCH NGHỈ LỄ VÀ QUY CHẾ TRỰC HỆ THỐNG DOANH NGHIỆP', 'Thông báo lịch trực hỗ trợ khách hàng và vận hành hệ thống hạ tầng máy chủ trong các dịp lễ tới.', 'urgent', 'high', 'NV-0001', FALSE, TRUE, NOW() - INTERVAL '7 days');
    `);

    // Đồng bộ 4 thông báo công ty vào bảng notifications (Broadcast toàn doanh nghiệp)
    await client.query(`
      INSERT INTO notifications (
        id, user_id, role_target, type, category, title, summary, 
        sender_name, sender_role, sender_avatar, priority, is_read, 
        action_type, action_payload, created_at
      ) VALUES 
        (
          'NOTIF-NOT-01', NULL, NULL, 'company_award', 'Thông báo công ty',
          'QUYẾT ĐỊNH KHEN THƯỞNG XUẤT SẮC QUÝ III/2026',
          'Tổng Giám Đốc biểu dương và trao thưởng cho các tập thể phòng ban xuất sắc đã hoàn thành xuất sắc các chỉ tiêu công tác và nâng cấp hệ thống NEXUS HR v2.0.',
          'Lê Vũ Ngọc Duy', 'Tổng Giám Đốc (CEO)',
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          'urgent', FALSE, 'notice_popup',
          '{"id":"NOT-01","title":"QUYẾT ĐỊNH KHEN THƯỞNG XUẤT SẮC QUÝ III/2026","content":"Tổng Giám Đốc biểu dương và trao thưởng cho các tập thể phòng ban xuất sắc đã hoàn thành xuất sắc các chỉ tiêu công tác và nâng cấp hệ thống NEXUS HR v2.0.","category":"general","priority":"high","isPinned":true,"attachments":[{"name":"QUYET_DINH_KHEN_THUONG_Q3_2026.pdf","size":"2.4 MB","type":"application/pdf"},{"name":"DANH_SACH_TAP_THE_CA_NHAN_KHEN_THUONG.xlsx","size":"1.1 MB","type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}],"date":"28/9/2026","signer":"Lê Vũ Ngọc Duy - Tổng Giám Đốc (CEO)","docNumber":"Số: 101/2026/QĐ-TGĐ"}'::jsonb,
          NOW() - INTERVAL '1 day'
        ),
        (
          'NOTIF-NOT-02', NULL, NULL, 'system', 'Thông báo công ty',
          'HƯỚNG DẪN QUY TRÌNH CHẤM CÔNG VÀ NGHỈ PHÉP TỰ ĐỘNG',
          'Nhân viên thực hiện điểm danh qua Kiosk FaceID hoặc định vị GPS trên ứng dụng. Mọi đơn nghỉ phép phải gửi trước ít nhất 24 giờ để cấp trên phê duyệt.',
          'Trần Mai Hương', 'Giám Đốc Nhân Sự (HRD)',
          'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
          'normal', FALSE, 'notice_popup',
          '{"id":"NOT-02","title":"HƯỚNG DẪN QUY TRÌNH CHẤM CÔNG VÀ NGHỈ PHÉP TỰ ĐỘNG","content":"Nhân viên thực hiện điểm danh qua Kiosk FaceID hoặc định vị GPS trên ứng dụng. Mọi đơn nghỉ phép phải gửi trước ít nhất 24 giờ để cấp trên phê duyệt.","category":"policy","priority":"normal","isPinned":true,"attachments":[{"name":"SO_TAY_QUY_TRINH_CHAM_CONG_NGHI_PHEP.pdf","size":"3.8 MB","type":"application/pdf"}],"date":"26/9/2026","signer":"Trần Mai Hương - Giám Đốc Nhân Sự (HRD)","docNumber":"Số: 88/2026/HD-HR"}'::jsonb,
          NOW() - INTERVAL '3 days'
        ),
        (
          'NOTIF-NOT-03', NULL, NULL, 'health_check', 'Thông báo công ty',
          'KẾ HOẠCH TỔ CHỨC KHÁM SỨC KHỎE ĐỊNH KỲ NĂM 2026',
          'Phòng Quản trị Nhân sự phối hợp cùng Bệnh viện Đa khoa Quốc tế tổ chức khám sức khỏe định kỳ cho toàn thể 50 cán bộ nhân viên trong tháng 10/2026.',
          'Trần Mai Hương', 'Giám Đốc Nhân Sự (HRD)',
          'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
          'normal', FALSE, 'notice_popup',
          '{"id":"NOT-03","title":"KẾ HOẠCH TỔ CHỨC KHÁM SỨC KHỎE ĐỊNH KỲ NĂM 2026","content":"Phòng Quản trị Nhân sự phối hợp cùng Bệnh viện Đa khoa Quốc tế tổ chức khám sức khỏe định kỳ cho toàn thể 50 cán bộ nhân viên trong tháng 10/2026.","category":"event","priority":"normal","isPinned":false,"attachments":[{"name":"LICH_KHAM_SUC_KHOE_THEO_PHONG_BAN.pdf","size":"1.5 MB","type":"application/pdf"}],"date":"24/9/2026","signer":"Trần Mai Hương - Giám Đốc Nhân Sự (HRD)","docNumber":"Số: 65/2026/TB-HR"}'::jsonb,
          NOW() - INTERVAL '5 days'
        ),
        (
          'NOTIF-NOT-04', NULL, NULL, 'ceo_directive', 'Thông báo công ty',
          'LỊCH NGHỈ LỄ VÀ QUY CHẾ TRỰC HỆ THỐNG DOANH NGHIỆP',
          'Thông báo lịch trực hỗ trợ khách hàng và vận hành hệ thống hạ tầng máy chủ trong các dịp lễ tới.',
          'Lê Vũ Ngọc Duy', 'Tổng Giám Đốc (CEO)',
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          'urgent', FALSE, 'notice_popup',
          '{"id":"NOT-04","title":"LỊCH NGHỈ LỄ VÀ QUY CHẾ TRỰC HỆ THỐNG DOANH NGHIỆP","content":"Thông báo lịch trực hỗ trợ khách hàng và vận hành hệ thống hạ tầng máy chủ trong các dịp lễ tới.","category":"urgent","priority":"high","isPinned":false,"attachments":[{"name":"QUY_CHE_TRUC_VAN_HANH_HA_TANG_LE.pdf","size":"2.1 MB","type":"application/pdf"}],"date":"22/9/2026","signer":"Lê Vũ Ngọc Duy - Tổng Giám Đốc (CEO)","docNumber":"Số: 45/2026/TB-TGĐ"}'::jsonb,
          NOW() - INTERVAL '7 days'
        )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        category = EXCLUDED.category,
        priority = EXCLUDED.priority,
        action_payload = EXCLUDED.action_payload;
    `);

    // 15. Thông báo cá nhân (notifications)
    console.log('🔔 15. Khởi tạo Thông báo thông tin người dùng...');
    await client.query(`
      INSERT INTO notifications (id, user_id, type, category, title, summary, priority, is_read, created_at)
      SELECT 
        'NOTIF-' || LPAD(ROW_NUMBER() OVER ()::TEXT, 4, '0'),
        u.id, 
        'system',
        'Cá nhân',
        'Chào mừng đến với Hệ thống NEXUS HR v2.0', 
        'Tài khoản của bạn đã được cập nhật với giao diện mới chuẩn sắc nét và tối ưu.', 
        'normal',
        FALSE,
        NOW()
      FROM users u;
    `);

    await client.query('COMMIT');
    console.log('\n======================================================');
    console.log('🎉 THÀNH CÔNG RỰC RỠ: DATABASE ĐÃ ĐƯỢC RESET VÀ SEED ĐẦY ĐỦ!');
    console.log('📊 Thống kê dữ liệu đã nạp:');
    console.log('   - 50 Nhân sự chính thức (Họ tên tiếng Việt chuẩn mực, lương, phòng ban, chức vụ)');
    console.log('   - 4 Phòng ban nghiệp vụ chính (IT, HR, Marketing, Finance) + Ban Điều Hành');
    console.log('   - 50 Tài khoản đăng nhập tương ứng với phân quyền Roles chuẩn xác');
    console.log('   - 50 Hợp đồng lao động có hiệu lực');
    console.log('   - 50 Quỹ ngày phép năm 2026');
    console.log('   - Hàng trăm bản ghi Chấm công thực tế trong tháng 09/2026');
    console.log('   - 8 Đơn nghỉ phép đa trạng thái đúng luồng phê duyệt 4 cấp');
    console.log('   - 2 Kỳ lương (Tháng 09/2026 và Tháng 08/2026) với 100 Phiếu lương đầy đủ');
    console.log('   - 4 Dự án lớn và 8 Nhiệm vụ Kanban phân bổ theo các phòng ban');
    console.log('   - 4 Thông báo công ty chính thức');
    console.log('======================================================');
    console.log('🔑 4 Tài khoản đăng nhập nhanh:');
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
