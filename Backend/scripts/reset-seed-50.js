require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

async function resetAndSeed50Employees() {
  const client = await db.pool.connect();
  try {
    console.log('ðŸ”„ Báº¯t Ä‘áº§u dá»n sáº¡ch database vÃ  khá»Ÿi táº¡o dá»¯ liá»‡u chuáº©n 50 nhÃ¢n sá»± (4 phÃ²ng ban)...\n');
    await client.query('BEGIN');

    // 1. Dá»n sáº¡ch toÃ n bá»™ cÃ¡c báº£ng nghiá»‡p vá»¥
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

    console.log('ðŸ—‘ï¸ 1. XÃ³a toÃ n bá»™ dá»¯ liá»‡u nghiá»‡p vá»¥ (TRUNCATE CASCADE)...');
    for (const tbl of tablesToTruncate) {
      try {
        await client.query(`TRUNCATE TABLE "${tbl}" RESTART IDENTITY CASCADE;`);
      } catch (e) {
        console.warn(`  - Bá» qua báº£ng ${tbl}:`, e.message);
      }
    }

    // 2. Roles
    console.log('ðŸ›¡ï¸ 2. Khá»Ÿi táº¡o danh má»¥c PhÃ¢n quyá»n Roles chuáº©n...');
    await client.query(`
      INSERT INTO roles (role_code, role_name, description, permissions) VALUES
        ('CEO', 'Tá»•ng GiÃ¡m Äá»‘c', 'Cáº¥p 1 â€” LÃ£nh Ä‘áº¡o tá»‘i cao', '{"all": true}'),
        ('HR_DIRECTOR', 'GiÃ¡m Äá»‘c NhÃ¢n Sá»±', 'Cáº¥p 2A â€” Quáº£n lÃ½ toÃ n bá»™ nhÃ¢n sá»±', '{"manage_employees": true, "manage_leave": true, "manage_payroll": true, "view_reports": true, "manage_ai": true}'),
        ('LINE_MANAGER', 'TrÆ°á»Ÿng PhÃ²ng', 'Cáº¥p 2B â€” Quáº£n lÃ½ nhÃ¢n viÃªn phÃ²ng ban', '{"view_team": true, "approve_leave": true, "manage_tasks": true, "create_projects": true}'),
        ('EMPLOYEE', 'NhÃ¢n ViÃªn', 'Cáº¥p 3 â€” NhÃ¢n viÃªn tá»± phá»¥c vá»¥ (ESS)', '{"view_self": true, "request_leave": true, "update_tasks": true}'),
        ('KIOSK', 'Kiosk Cháº¥m CÃ´ng', 'Thiáº¿t bá»‹ cháº¥m cÃ´ng sáº£nh', '{"attendance_only": true}'),
        ('ADMIN', 'Quáº£n Trá»‹ Há»‡ Thá»‘ng', 'Quáº£n trá»‹ viÃªn ká»¹ thuáº­t IT', '{"all": true}')
      ON CONFLICT (role_code) DO NOTHING;
    `);

    // 3. Departments (4 phÃ²ng ban nghiá»‡p vá»¥ chÃ­nh + Ban Äiá»u HÃ nh)
    console.log('ðŸ¢ 3. Khá»Ÿi táº¡o 4 PhÃ²ng ban chÃ­nh + Ban Äiá»u HÃ nh...');
    await client.query(`
      INSERT INTO departments (id, name, budget_yearly, description) VALUES
        ('DEPT-CEO', 'Ban Äiá»u HÃ nh & LÃ£nh Äáº¡o', 5000000000, 'Ban Tá»•ng GiÃ¡m Äá»‘c Ä‘iá»u hÃ nh chiáº¿n lÆ°á»£c toÃ n diá»‡n cÃ´ng ty'),
        ('DEPT-IT',  'PhÃ²ng Ká»¹ thuáº­t Pháº§n má»m',   4500000000, 'PhÃ²ng Ká»¹ thuáº­t Pháº§n má»m â€” Frontend, Backend, AI, DevOps & QA'),
        ('DEPT-HR',  'PhÃ²ng Quáº£n trá»‹ NhÃ¢n sá»±',     2500000000, 'Quáº£n lÃ½ tuyá»ƒn dá»¥ng, tiá»n lÆ°Æ¡ng C&B, Ä‘Ã o táº¡o & tráº£i nghiá»‡m nhÃ¢n viÃªn'),
        ('DEPT-MKT', 'PhÃ²ng Kinh doanh & Tiáº¿p thá»‹', 3800000000, 'PhÃ¡t triá»ƒn khÃ¡ch hÃ ng B2B, Performance Marketing & NhÃ£n hÃ ng'),
        ('DEPT-FIN', 'PhÃ²ng TÃ i chÃ­nh & Káº¿ toÃ¡n',  2000000000, 'Káº¿ toÃ¡n quáº£n trá»‹, dÃ²ng tiá»n, bÃ¡o cÃ¡o thuáº¿ & kiá»ƒm toÃ¡n ná»™i bá»™')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
    `);

    // 4. Positions (CÃ¡c chá»©c danh rÃµ rÃ ng theo cáº¥p báº­c)
    console.log('ðŸ‘” 4. Khá»Ÿi táº¡o Chá»©c danh Vá»‹ trÃ­ lÃ m viá»‡c...');
    await client.query(`
      INSERT INTO positions (id, name, level) VALUES
        ('POS-CEO',  'Tá»•ng GiÃ¡m Äá»‘c', 10),
        ('POS-DIR',  'GiÃ¡m Äá»‘c Khá»‘i', 9),
        ('POS-MGR',  'TrÆ°á»Ÿng PhÃ²ng', 8),
        ('POS-LEAD', 'TrÆ°á»Ÿng NhÃ³m / Lead', 7),
        ('POS-SR',   'ChuyÃªn ViÃªn Cáº¥p Cao (Senior)', 6),
        ('POS-MID',  'ChuyÃªn ViÃªn (Mid-level)', 5),
        ('POS-JR',   'NhÃ¢n ViÃªn (Junior)', 4),
        ('POS-INT',  'Thá»±c Táº­p Sinh (Intern)', 2)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, level = EXCLUDED.level;
    `);

    // 5. Leave Types
    console.log('ðŸŒ´ 5. Khá»Ÿi táº¡o Danh má»¥c Loáº¡i Nghá»‰ phÃ©p...');
    await client.query(`
      INSERT INTO leave_types (id, name, code, max_days_per_year, is_paid, description) VALUES
        ('LT-AL', 'Nghá»‰ phÃ©p nÄƒm', 'PHEP_NAM', 12, TRUE, 'PhÃ©p nÄƒm theo Bá»™ luáº­t Lao Ä‘á»™ng Viá»‡t Nam'),
        ('LT-SL', 'Nghá»‰ á»‘m BHXH', 'NGHI_OM', 30, TRUE, 'Nghá»‰ á»‘m Ä‘au cÃ³ giáº¥y chá»©ng nháº­n y táº¿ C65 BHXH'),
        ('LT-PL', 'Nghá»‰ viá»‡c riÃªng', 'VIEC_RIENG', 3, TRUE, 'Nghá»‰ káº¿t hÃ´n, tang cháº¿, hiáº¿u há»‰ theo quy cháº¿'),
        ('LT-ML', 'Nghá»‰ thai sáº£n', 'THAI_SAN', 180, TRUE, 'Cháº¿ Ä‘á»™ thai sáº£n cho lao Ä‘á»™ng ná»¯ sinh con'),
        ('LT-UL', 'Nghá»‰ khÃ´ng lÆ°Æ¡ng', 'KHONG_LUONG', 30, FALSE, 'Nghá»‰ viá»‡c cÃ¡ nhÃ¢n khÃ´ng hÆ°á»Ÿng lÆ°Æ¡ng'),
        ('LT-BT', 'Nghá»‰ cÃ´ng tÃ¡c', 'CONG_TAC', 30, TRUE, 'Äi cÃ´ng tÃ¡c Ä‘á»‘i ngoáº¡i ngoÃ i vÄƒn phÃ²ng')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 6. 50 Employees (Danh sÃ¡ch 50 nhÃ¢n sá»± chuáº©n xÃ¡c)
    console.log('ðŸ‘¥ 6. Khá»Ÿi táº¡o 50 Há»“ sÆ¡ NhÃ¢n sá»± chÃ¢n thá»±c...');
    const rawEmployees = [
      // 1. CEO
      { id: 'NV-0001', name: 'LÃª VÅ© Ngá»c Duy', dept: 'DEPT-CEO', pos: 'POS-CEO', title: 'Tá»•ng GiÃ¡m Äá»‘c (CEO)', email: 'ceo@fwbnexus.vn', phone: '0901 000 001', citizen: '079185001001', gender: 'Nam', dob: '1985-05-12', salary: 80000000, joined: '2020-01-15', manager: null, role: 'CEO', bankAcc: '0071 0008 89988', bankName: 'Vietcombank', kpi: 99.0, attRate: 100 },
      
      // 2. HR Director (Cáº¥p 2A)
      { id: 'NV-1001', name: 'Tráº§n Mai HÆ°Æ¡ng', dept: 'DEPT-HR', pos: 'POS-DIR', title: 'GiÃ¡m Äá»‘c NhÃ¢n Sá»± (HRD)', email: 'hrd@fwbnexus.vn', phone: '0901 000 002', citizen: '079188002002', gender: 'Nu', dob: '1988-08-20', salary: 55000000, joined: '2021-03-01', manager: 'NV-0001', role: 'HR_DIRECTOR', bankAcc: '1018 0099 11', bankName: 'Vietcombank', kpi: 98.0, attRate: 99.0 },
      
      // 3. Line Manager IT (Cáº¥p 2B)
      { id: 'NV-1002', name: 'VÅ© ÄÃ¬nh Khang', dept: 'DEPT-IT', pos: 'POS-MGR', title: 'TrÆ°á»Ÿng PhÃ²ng Ká»¹ Thuáº­t', email: 'lead@fwbnexus.vn', phone: '0901 000 003', citizen: '079190003003', gender: 'Nam', dob: '1990-11-15', salary: 45000000, joined: '2021-06-15', manager: 'NV-0001', role: 'LINE_MANAGER', bankAcc: '0071 9384 11', bankName: 'Vietcombank', kpi: 98.5, attRate: 100 },
      
      // 4. Employee Staff IT (Cáº¥p 3)
      { id: 'NV-0842', name: 'Pháº¡m Minh QuÃ¢n', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Ká»¹ SÆ° Pháº§n Má»m (Frontend Lead)', email: 'employee@fwbnexus.vn', phone: '0901 000 004', citizen: '079196004004', gender: 'Nam', dob: '1996-04-18', salary: 28000000, joined: '2023-01-10', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 4455 66', bankName: 'Techcombank', kpi: 95.0, attRate: 98.0 },
      
      // DEPT-IT (17 nhÃ¢n sá»± cÃ²n láº¡i Ä‘á»ƒ Ä‘áº¡t 19 ngÆ°á»i IT)
      { id: 'NV-1003', name: 'Nguyá»…n HoÃ ng Nam', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Ká»¹ SÆ° Backend Cáº¥p Cao (Node.js/Go)', email: 'nam.nguyen@fwbnexus.vn', phone: '0902 111 005', citizen: '079194005005', gender: 'Nam', dob: '1994-09-22', salary: 32000000, joined: '2022-04-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 8877 66', bankName: 'Techcombank', kpi: 96.0, attRate: 98.5 },
      { id: 'NV-1004', name: 'Äáº·ng Quá»³nh Anh', dept: 'DEPT-IT', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn UI/UX Product Designer', email: 'anh.dang@fwbnexus.vn', phone: '0902 111 006', citizen: '079197006006', gender: 'Nu', dob: '1997-12-05', salary: 23000000, joined: '2023-05-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0381 2233 44', bankName: 'MB Bank', kpi: 94.0, attRate: 97.0 },
      { id: 'NV-1005', name: 'BÃ¹i Quá»‘c Báº£o', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Ká»¹ SÆ° DevOps & Äiá»‡n ToÃ¡n ÄÃ¡m MÃ¢y', email: 'bao.bui@fwbnexus.vn', phone: '0902 111 007', citizen: '079193007007', gender: 'Nam', dob: '1993-07-14', salary: 34000000, joined: '2022-02-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 5566 77', bankName: 'Vietcombank', kpi: 97.0, attRate: 99.0 },
      { id: 'NV-1006', name: 'HoÃ ng Tháº£o Linh', dept: 'DEPT-IT', pos: 'POS-MID', title: 'TrÆ°á»Ÿng NhÃ³m Kiá»ƒm Thá»­ QA/QC', email: 'linh.hoang@fwbnexus.vn', phone: '0902 111 008', citizen: '079195008008', gender: 'Nu', dob: '1995-03-30', salary: 25000000, joined: '2023-03-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1028 9988 77', bankName: 'Vietinbank', kpi: 95.5, attRate: 98.0 },
      { id: 'NV-1007', name: 'Phan Tháº¿ Anh', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Ká»¹ SÆ° Mobile Flutter/iOS', email: 'anh.phan@fwbnexus.vn', phone: '0902 111 009', citizen: '079198009009', gender: 'Nam', dob: '1998-06-11', salary: 24000000, joined: '2023-09-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 6677 88', bankName: 'Techcombank', kpi: 93.0, attRate: 96.5 },
      { id: 'NV-1008', name: 'Äá»— BÃ­ch Tháº£o', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Láº­p TrÃ¬nh ViÃªn Frontend React', email: 'thao.do@fwbnexus.vn', phone: '0902 111 010', citizen: '079199010010', gender: 'Nu', dob: '1999-10-15', salary: 18000000, joined: '2024-02-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0341 8899 00', bankName: 'MB Bank', kpi: 92.0, attRate: 97.0 },
      { id: 'NV-1009', name: 'VÅ© Trá»ng HÃ¹ng', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Ká»¹ SÆ° Quáº£n Trá»‹ CÆ¡ Sá»Ÿ Dá»¯ Liá»‡u (DBA)', email: 'hung.vu@fwbnexus.vn', phone: '0902 111 011', citizen: '079194011011', gender: 'Nam', dob: '1994-01-20', salary: 27000000, joined: '2022-08-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 3344 55', bankName: 'Vietcombank', kpi: 94.5, attRate: 99.0 },
      { id: 'NV-1010', name: 'LÃ¢m Gia HÃ¢n', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Kiá»ƒm Thá»­ ViÃªn Pháº§n Má»m (QC Tester)', email: 'han.lam@fwbnexus.vn', phone: '0902 111 012', citizen: '079200012012', gender: 'Nu', dob: '2000-05-18', salary: 16000000, joined: '2024-04-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1038 4455 66', bankName: 'ACB', kpi: 91.0, attRate: 98.0 },
      { id: 'NV-1011', name: 'Mai VÄƒn Tuáº¥n', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Ká»¹ SÆ° An ToÃ n ThÃ´ng Tin & SecOps', email: 'tuan.mai@fwbnexus.vn', phone: '0902 111 013', citizen: '079195013013', gender: 'Nam', dob: '1995-11-28', salary: 29000000, joined: '2023-06-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 1122 33', bankName: 'Techcombank', kpi: 96.0, attRate: 98.5 },
      { id: 'NV-1012', name: 'Trá»‹nh Má»¹ DuyÃªn', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Láº­p TrÃ¬nh ViÃªn Backend API Node.js', email: 'duyen.trinh@fwbnexus.vn', phone: '0902 111 014', citizen: '079199014014', gender: 'Nu', dob: '1999-07-09', salary: 18500000, joined: '2024-01-10', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0371 4455 66', bankName: 'MB Bank', kpi: 92.5, attRate: 97.5 },
      { id: 'NV-1013', name: 'Há»“ ÄÄƒng Khoa', dept: 'DEPT-IT', pos: 'POS-SR', title: 'Ká»¹ SÆ° TrÃ­ Tuá»‡ NhÃ¢n Táº¡o & AI Vision', email: 'khoa.ho@fwbnexus.vn', phone: '0902 111 015', citizen: '079192015015', gender: 'Nam', dob: '1992-04-03', salary: 36000000, joined: '2022-09-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 8899 00', bankName: 'Vietcombank', kpi: 97.5, attRate: 99.5 },
      { id: 'NV-1014', name: 'NgÃ´ Tháº£o Trang', dept: 'DEPT-IT', pos: 'POS-JR', title: 'Láº­p TrÃ¬nh ViÃªn Giao Diá»‡n Web React', email: 'trang.ngo@fwbnexus.vn', phone: '0902 111 016', citizen: '079201016016', gender: 'Nu', dob: '2001-08-25', salary: 17000000, joined: '2024-06-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1018 7788 99', bankName: 'Vietinbank', kpi: 90.0, attRate: 96.0 },
      { id: 'NV-1015', name: 'DÆ°Æ¡ng CÃ´ng Minh', dept: 'DEPT-IT', pos: 'POS-INT', title: 'Thá»±c Táº­p Sinh Láº­p TrÃ¬nh Frontend', email: 'minh.duong@fwbnexus.vn', phone: '0902 111 017', citizen: '079203017017', gender: 'Nam', dob: '2003-02-14', salary: 8500000, joined: '2024-07-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1903 9900 11', bankName: 'Techcombank', kpi: 88.0, attRate: 95.0 },
      { id: 'NV-1016', name: 'Táº¡ Thu Hiá»n', dept: 'DEPT-IT', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn PhÃ¢n TÃ­ch Nghiá»‡p Vá»¥ (BA)', email: 'hien.ta@fwbnexus.vn', phone: '0902 111 018', citizen: '079196018018', gender: 'Nu', dob: '1996-09-19', salary: 24000000, joined: '2023-04-15', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0391 5566 77', bankName: 'MB Bank', kpi: 95.0, attRate: 98.0 },
      { id: 'NV-1017', name: 'LÃ½ Quá»‘c CÆ°á»ng', dept: 'DEPT-IT', pos: 'POS-MID', title: 'Ká»¹ SÆ° Quáº£n Trá»‹ Háº¡ Táº§ng Máº¡ng', email: 'cuong.ly@fwbnexus.vn', phone: '0902 111 019', citizen: '079197019019', gender: 'Nam', dob: '1997-03-12', salary: 23500000, joined: '2023-10-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '0071 2233 44', bankName: 'Vietcombank', kpi: 93.5, attRate: 97.5 },
      { id: 'NV-1018', name: 'LÃª Cáº©m Ly', dept: 'DEPT-IT', pos: 'POS-JR', title: 'ChuyÃªn ViÃªn Há»— Trá»£ Ká»¹ Thuáº­t (IT Helpdesk)', email: 'ly.le@fwbnexus.vn', phone: '0902 111 020', citizen: '079200020020', gender: 'Nu', dob: '2000-11-04', salary: 17500000, joined: '2024-03-01', manager: 'NV-1002', role: 'EMPLOYEE', bankAcc: '1048 6677 88', bankName: 'ACB', kpi: 91.5, attRate: 98.0 },

      // DEPT-HR (9 nhÃ¢n sá»± bá»• sung + NV-1001 = 10 ngÆ°á»i)
      { id: 'NV-1101', name: 'Nguyá»…n Thu Trang', dept: 'DEPT-HR', pos: 'POS-MGR', title: 'TrÆ°á»Ÿng NhÃ³m Tuyá»ƒn Dá»¥ng & ÄÃ o Táº¡o', email: 'trang.nguyen@fwbnexus.vn', phone: '0903 222 001', citizen: '079192021021', gender: 'Nu', dob: '1992-06-25', salary: 28000000, joined: '2021-08-01', manager: 'NV-1001', role: 'LINE_MANAGER', bankAcc: '0071 4455 66', bankName: 'Vietcombank', kpi: 96.0, attRate: 99.0 },
      { id: 'NV-1102', name: 'Äinh Gia Báº£o', dept: 'DEPT-HR', pos: 'POS-SR', title: 'ChuyÃªn ViÃªn Cáº¥p Cao Tiá»n LÆ°Æ¡ng & C&B', email: 'bao.dinh@fwbnexus.vn', phone: '0903 222 002', citizen: '079193022022', gender: 'Nam', dob: '1993-02-18', salary: 26000000, joined: '2022-01-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '1903 5566 77', bankName: 'Techcombank', kpi: 97.0, attRate: 100 },
      { id: 'NV-1103', name: 'Chu Báº£o Ngá»c', dept: 'DEPT-HR', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn Thu HÃºt NhÃ¢n TÃ i (HR Tech)', email: 'ngoc.chu@fwbnexus.vn', phone: '0903 222 003', citizen: '079196023023', gender: 'Nu', dob: '1996-10-10', salary: 21000000, joined: '2023-02-01', manager: 'NV-1101', role: 'EMPLOYEE', bankAcc: '0351 7788 99', bankName: 'MB Bank', kpi: 94.0, attRate: 98.0 },
      { id: 'NV-1104', name: 'VÃµ ÄÃ¬nh Trá»ng', dept: 'DEPT-HR', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn PhÃ¡p Cháº¿ & Quan Há»‡ Lao Äá»™ng', email: 'trong.vo@fwbnexus.vn', phone: '0903 222 004', citizen: '079194024024', gender: 'Nam', dob: '1994-08-14', salary: 23000000, joined: '2022-11-01', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0071 7788 99', bankName: 'Vietcombank', kpi: 95.0, attRate: 98.5 },
      { id: 'NV-1105', name: 'Tráº§n Kim NgÃ¢n', dept: 'DEPT-HR', pos: 'POS-JR', title: 'ChuyÃªn ViÃªn Tá»• Chá»©c ÄÃ o Táº¡o Ná»™i Bá»™', email: 'ngan.tran@fwbnexus.vn', phone: '0903 222 005', citizen: '079199025025', gender: 'Nu', dob: '1999-04-05', salary: 17000000, joined: '2024-01-15', manager: 'NV-1101', role: 'EMPLOYEE', bankAcc: '1028 1122 33', bankName: 'Vietinbank', kpi: 91.0, attRate: 97.0 },
      { id: 'NV-1106', name: 'Pháº¡m Minh Äá»©c', dept: 'DEPT-HR', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn Váº­n HÃ nh NhÃ¢n Sá»± & Cháº¥m CÃ´ng Kiosk', email: 'duc.pham@fwbnexus.vn', phone: '0903 222 006', citizen: '079197026026', gender: 'Nam', dob: '1997-12-20', salary: 20000000, joined: '2023-07-01', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '1903 2233 44', bankName: 'Techcombank', kpi: 93.0, attRate: 99.0 },
      { id: 'NV-1107', name: 'LÃª Háº£i Yáº¿n', dept: 'DEPT-HR', pos: 'POS-JR', title: 'ChuyÃªn ViÃªn Tráº£i Nghiá»‡m & Gáº¯n Káº¿t NhÃ¢n ViÃªn', email: 'yen.le@fwbnexus.vn', phone: '0903 222 007', citizen: '079200027027', gender: 'Nu', dob: '2000-03-15', salary: 16500000, joined: '2024-03-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0381 9900 11', bankName: 'MB Bank', kpi: 92.0, attRate: 97.5 },
      { id: 'NV-1108', name: 'ÄoÃ n Anh Khoa', dept: 'DEPT-HR', pos: 'POS-INT', title: 'Thá»±c Táº­p Sinh Tuyá»ƒn Dá»¥ng & HÃ nh ChÃ­nh', email: 'khoa.doan@fwbnexus.vn', phone: '0903 222 008', citizen: '079203028028', gender: 'Nam', dob: '2003-09-08', salary: 8000000, joined: '2024-08-01', manager: 'NV-1101', role: 'EMPLOYEE', bankAcc: '1058 3344 55', bankName: 'ACB', kpi: 89.0, attRate: 96.0 },
      { id: 'NV-1109', name: 'ThÃ¡i Nháº­t Lá»‡', dept: 'DEPT-HR', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn Truyá»n ThÃ´ng Ná»™i Bá»™ & VÄƒn HÃ³a Doanh Nghiá»‡p', email: 'le.thai@fwbnexus.vn', phone: '0903 222 009', citizen: '079198029029', gender: 'Nu', dob: '1998-05-22', salary: 21000000, joined: '2023-08-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0071 6677 88', bankName: 'Vietcombank', kpi: 94.5, attRate: 98.0 },
      { id: 'NV-1110', name: 'Nguyá»…n Thanh TÃ¹ng', dept: 'DEPT-HR', pos: 'POS-JR', title: 'ChuyÃªn ViÃªn Thá»§ Tá»¥c NhÃ¢n Sá»± & Há»£p Äá»“ng', email: 'tung.nguyen@fwbnexus.vn', phone: '0903 222 010', citizen: '079200050050', gender: 'Nam', dob: '2000-07-14', salary: 17000000, joined: '2024-04-15', manager: 'NV-1001', role: 'EMPLOYEE', bankAcc: '0071 9900 22', bankName: 'Vietcombank', kpi: 92.0, attRate: 98.0 },

      // DEPT-MKT (12 nhÃ¢n sá»±)
      { id: 'NV-2001', name: 'Äá»— Minh TrÃ­', dept: 'DEPT-MKT', pos: 'POS-MGR', title: 'TrÆ°á»Ÿng PhÃ²ng Kinh Doanh & Marketing', email: 'tri.do@fwbnexus.vn', phone: '0904 333 001', citizen: '079189030030', gender: 'Nam', dob: '1989-07-17', salary: 42000000, joined: '2021-05-01', manager: 'NV-0001', role: 'LINE_MANAGER', bankAcc: '0071 1122 33', bankName: 'Vietcombank', kpi: 97.5, attRate: 99.0 },
      { id: 'NV-2002', name: 'BÃ¹i KhÃ¡nh Linh', dept: 'DEPT-MKT', pos: 'POS-SR', title: 'TrÆ°á»Ÿng NhÃ³m Digital & Growth Marketing', email: 'linh.bui@fwbnexus.vn', phone: '0904 333 002', citizen: '079193031031', gender: 'Nu', dob: '1993-11-25', salary: 27000000, joined: '2022-03-01', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '1903 7788 99', bankName: 'Techcombank', kpi: 96.0, attRate: 98.0 },
      { id: 'NV-2003', name: 'VÅ© Tuáº¥n Kiá»‡t', dept: 'DEPT-MKT', pos: 'POS-SR', title: 'TrÆ°á»Ÿng NhÃ³m Kinh Doanh KhÃ¡ch HÃ ng B2B', email: 'kiet.vu@fwbnexus.vn', phone: '0904 333 003', citizen: '079192032032', gender: 'Nam', dob: '1992-03-19', salary: 29000000, joined: '2022-06-15', manager: 'NV-2001', role: 'EMPLOYEE', bankAcc: '0361 2233 44', bankName: 'MB Bank', kpi: 96.5, attRate: 98.5 },
      { id: 'NV-2004', name: 'Nguyá»…n Thanh Háº±ng', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn Quáº£n LÃ½ KhÃ¡ch HÃ ng Chiáº¿n LÆ°á»£c (Key Account)', email: 'hang.nguyen@fwbnexus.vn', phone: '0904 333 004', citizen: '079196033033', gender: 'Nu', dob: '1996-01-30', salary: 22000000, joined: '2023-01-15', manager: 'NV-2003', role: 'EMPLOYEE', bankAcc: '1028 4455 66', bankName: 'Vietinbank', kpi: 94.0, attRate: 97.5 },
      { id: 'NV-2005', name: 'LÆ°Æ¡ng VÄƒn PhÃº', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn Tá»‘i Æ¯u Quáº£ng CÃ¡o (Performance Ads)', email: 'phu.luong@fwbnexus.vn', phone: '0904 333 005', citizen: '079195034034', gender: 'Nam', dob: '1995-08-04', salary: 23000000, joined: '2023-04-01', manager: 'NV-2002', role: 'EMPLOYEE', bankAcc: '1903 3344 55', bankName: 'Techcombank', kpi: 95.0, attRate: 98.0 },
      { id: 'NV-2006', name: 'Huá»³nh Ngá»c BÃ­ch', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn SÃ¡ng Táº¡o Ná»™i Dung & Copywriter', email: 'bich.huynh@fwbnexus.vn', phone: '0904 333 006', citizen: '079197035035', gender: 'Nu', dob: '1997-04-16', salary: 20000000, joined: '2023-09-15', manager: 'NV-2002', role: 'EMPLOYEE', bankAcc: '0071 9900 11', bankName: 'Vietcombank', kpi: 93.0, attRate: 97.0 },
      { id: 'NV-2007', name: 'TrÆ°Æ¡ng Táº¥n PhÃ¡t', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'ChuyÃªn ViÃªn PhÃ¡t Triá»ƒn Thá»‹ TrÆ°á»ng Doanh Nghiá»‡p', email: 'phat.truong@fwbnexus.vn', phone: '0904 333 007', citizen: '079199036036', gender: 'Nam', dob: '1999-12-12', salary: 18000000, joined: '2024-02-01', manager: 'NV-2003', role: 'EMPLOYEE', bankAcc: '0371 6677 88', bankName: 'MB Bank', kpi: 92.0, attRate: 96.5 },
      { id: 'NV-2008', name: 'Äáº·ng PhÆ°Æ¡ng Tháº£o', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'ChuyÃªn ViÃªn Quáº£n Trá»‹ KÃªnh Sá»‘ & Máº¡ng XÃ£ Há»™i', email: 'thao.dang@fwbnexus.vn', phone: '0904 333 008', citizen: '079200037037', gender: 'Nu', dob: '2000-06-20', salary: 17000000, joined: '2024-03-10', manager: 'NV-2002', role: 'EMPLOYEE', bankAcc: '1068 5566 77', bankName: 'ACB', kpi: 91.5, attRate: 97.0 },
      { id: 'NV-2009', name: 'VÆ°Æ¡ng Gia Huy', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'ChuyÃªn ViÃªn Thiáº¿t Káº¿ Äá»“ Há»a Truyá»n ThÃ´ng', email: 'huy.vuong@fwbnexus.vn', phone: '0904 333 009', citizen: '079198038038', gender: 'Nam', dob: '1998-09-05', salary: 18500000, joined: '2023-11-15', manager: 'NV-2002', role: 'EMPLOYEE', bankAcc: '1903 0011 22', bankName: 'Techcombank', kpi: 93.5, attRate: 98.0 },
      { id: 'NV-2010', name: 'Cao ThÃ¹y DÆ°Æ¡ng', dept: 'DEPT-MKT', pos: 'POS-INT', title: 'Thá»±c Táº­p Sinh Marketing & Sá»± Kiá»‡n', email: 'duong.cao@fwbnexus.vn', phone: '0904 333 010', citizen: '079203039039', gender: 'Nu', dob: '2003-04-28', salary: 8000000, joined: '2024-08-15', manager: 'NV-2002', role: 'EMPLOYEE', bankAcc: '0391 1122 33', bankName: 'MB Bank', kpi: 88.5, attRate: 95.5 },
      { id: 'NV-2011', name: 'HoÃ ng Minh QuÃ¢n', dept: 'DEPT-MKT', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn TÆ° Váº¥n Giáº£i PhÃ¡p HR Tech', email: 'quan.hoang@fwbnexus.vn', phone: '0904 333 011', citizen: '079196040040', gender: 'Nam', dob: '1996-08-11', salary: 21500000, joined: '2023-05-01', manager: 'NV-2003', role: 'EMPLOYEE', bankAcc: '0071 8877 66', bankName: 'Vietcombank', kpi: 94.0, attRate: 98.0 },
      { id: 'NV-2012', name: 'PhÃ¹ng Diá»‡u ThÃºy', dept: 'DEPT-MKT', pos: 'POS-JR', title: 'ChuyÃªn ViÃªn ChÄƒm SÃ³c KhÃ¡ch HÃ ng (CSKH B2B)', email: 'thuy.phung@fwbnexus.vn', phone: '0904 333 012', citizen: '079201041041', gender: 'Nu', dob: '2001-01-17', salary: 16500000, joined: '2024-05-15', manager: 'NV-2003', role: 'EMPLOYEE', bankAcc: '1038 8899 00', bankName: 'Vietinbank', kpi: 91.0, attRate: 97.5 },

      // DEPT-FIN (8 nhÃ¢n sá»±)
      { id: 'NV-3001', name: 'Nguyá»…n BÃ­ch Ngá»c', dept: 'DEPT-FIN', pos: 'POS-MGR', title: 'TrÆ°á»Ÿng PhÃ²ng TÃ i ChÃ­nh & Káº¿ ToÃ¡n TrÆ°á»Ÿng', email: 'ngoc.nguyen@fwbnexus.vn', phone: '0905 444 001', citizen: '079187042042', gender: 'Nu', dob: '1987-03-24', salary: 43000000, joined: '2021-02-01', manager: 'NV-0001', role: 'LINE_MANAGER', bankAcc: '0071 5544 33', bankName: 'Vietcombank', kpi: 98.0, attRate: 100 },
      { id: 'NV-3002', name: 'Tráº§n Quá»‘c Thá»‹nh', dept: 'DEPT-FIN', pos: 'POS-SR', title: 'Káº¿ ToÃ¡n Tá»•ng Há»£p & BÃ¡o CÃ¡o TÃ i ChÃ­nh', email: 'thinh.tran@fwbnexus.vn', phone: '0905 444 002', citizen: '079191043043', gender: 'Nam', dob: '1991-10-09', salary: 27000000, joined: '2022-04-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1903 4433 22', bankName: 'Techcombank', kpi: 96.5, attRate: 99.0 },
      { id: 'NV-3003', name: 'LÃª HoÃ ng Oanh', dept: 'DEPT-FIN', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn Káº¿ ToÃ¡n Thuáº¿ & Kiá»ƒm ToÃ¡n Ná»™i Bá»™', email: 'oanh.le@fwbnexus.vn', phone: '0905 444 003', citizen: '079194044044', gender: 'Nu', dob: '1994-06-16', salary: 23000000, joined: '2022-10-01', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '0341 3322 11', bankName: 'MB Bank', kpi: 95.0, attRate: 98.5 },
      { id: 'NV-3004', name: 'Phan Anh VÅ©', dept: 'DEPT-FIN', pos: 'POS-MID', title: 'ChuyÃªn ViÃªn Quáº£n Trá»‹ NgÃ¢n SÃ¡ch & DÃ²ng Tiá»n', email: 'vu.phan@fwbnexus.vn', phone: '0905 444 004', citizen: '079195045045', gender: 'Nam', dob: '1995-12-03', salary: 24000000, joined: '2023-03-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '0071 9988 77', bankName: 'Vietcombank', kpi: 95.5, attRate: 98.0 },
      { id: 'NV-3005', name: 'Táº¡ ThÃºy Nga', dept: 'DEPT-FIN', pos: 'POS-JR', title: 'ChuyÃªn ViÃªn Káº¿ ToÃ¡n Thanh ToÃ¡n & CÃ´ng Ná»£', email: 'nga.ta@fwbnexus.vn', phone: '0905 444 005', citizen: '079199046046', gender: 'Nu', dob: '1999-05-27', salary: 18000000, joined: '2023-12-01', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1028 6655 44', bankName: 'Vietinbank', kpi: 92.0, attRate: 97.5 },
      { id: 'NV-3006', name: 'QuÃ¡ch Há»¯u TÃ i', dept: 'DEPT-FIN', pos: 'POS-JR', title: 'ChuyÃªn ViÃªn Káº¿ ToÃ¡n TÃ i Sáº£n & Kho Quáº£n Trá»‹', email: 'tai.quach@fwbnexus.vn', phone: '0905 444 006', citizen: '079198047047', gender: 'Nam', dob: '1998-11-18', salary: 17500000, joined: '2024-02-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1903 8899 11', bankName: 'Techcombank', kpi: 91.5, attRate: 98.0 },
      { id: 'NV-3007', name: 'DÆ°Æ¡ng Diá»…m My', dept: 'DEPT-FIN', pos: 'POS-JR', title: 'Thá»§ Quá»¹ Doanh Nghiá»‡p & Quáº£n LÃ½ Quá»¹ Tiá»n Máº·t', email: 'my.duong@fwbnexus.vn', phone: '0905 444 007', citizen: '079200048048', gender: 'Nu', dob: '2000-08-08', salary: 16500000, joined: '2024-04-10', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '0371 9988 77', bankName: 'MB Bank', kpi: 92.5, attRate: 98.5 },
      { id: 'NV-3008', name: 'Kiá»u Minh Tuáº¥n', dept: 'DEPT-FIN', pos: 'POS-INT', title: 'Thá»±c Táº­p Sinh Káº¿ ToÃ¡n Doanh Nghiá»‡p', email: 'tuan.kieu@fwbnexus.vn', phone: '0905 444 008', citizen: '079203049049', gender: 'Nam', dob: '2003-01-22', salary: 8000000, joined: '2024-07-15', manager: 'NV-3001', role: 'EMPLOYEE', bankAcc: '1078 2233 44', bankName: 'ACB', kpi: 89.0, attRate: 96.0 }
    ];

    console.log(`  => Tá»•ng cá»™ng cÃ³ ${rawEmployees.length} nhÃ¢n sá»± chuáº©n bá»‹ Ä‘Æ°a vÃ o há»‡ thá»‘ng.`);

    // ChÃ¨n 50 Employees
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

    // Cáº­p nháº­t quan há»‡ cáº¥p trÃªn quáº£n lÃ½ (manager_id)
    console.log('ðŸ”— Thiáº¿t láº­p cáº¥u trÃºc phÃ¢n cáº¥p quáº£n lÃ½ (manager_id)...');
    for (const emp of rawEmployees) {
      if (emp.manager) {
        await client.query(`UPDATE employees SET manager_id = $1 WHERE id = $2;`, [emp.manager, emp.id]);
      }
    }
    // GÃ¡n TrÆ°á»Ÿng phÃ²ng cho tá»«ng Department
    await client.query(`UPDATE departments SET manager_id = 'NV-0001' WHERE id = 'DEPT-CEO';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-1002' WHERE id = 'DEPT-IT';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-1001' WHERE id = 'DEPT-HR';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-2001' WHERE id = 'DEPT-MKT';`);
    await client.query(`UPDATE departments SET manager_id = 'NV-3001' WHERE id = 'DEPT-FIN';`);

    // 7. Táº¡o Users vÃ  gÃ¡n Roles
    console.log('ðŸ” 7. Khá»Ÿi táº¡o TÃ i khoáº£n Users vá»›i máº­t kháº©u chuáº©n báº£o máº­t...');
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

    // GÃ¡n báº£ng user_roles
    await client.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id 
      FROM users u 
      JOIN roles r ON u.role_code = r.role_code;
    `);

    // 8. Há»£p Ä‘á»“ng lao Ä‘á»™ng (contracts)
    console.log('ðŸ“œ 8. Khá»Ÿi táº¡o 50 Há»£p Ä‘á»“ng Lao Ä‘á»™ng chÃ­nh thá»©c cÃ³ hiá»‡u lá»±c...');
    await client.query(`
      INSERT INTO contracts (employee_id, contract_no, type, start_date, salary, status)
      SELECT id, 'HDLD-' || id, contract_type, joined_date, base_salary, 'HIEU_LUC'
      FROM employees;
    `);

    // 9. Quá»¹ ngÃ y phÃ©p (leave_balances)
    console.log('ðŸ–ï¸ 9. Khá»Ÿi táº¡o Sá»‘ dÆ° ngÃ y phÃ©p 2026 cho 50 nhÃ¢n viÃªn...');
    const currentYear = new Date().getFullYear();
    for (const emp of rawEmployees) {
      await client.query(`
        INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
        VALUES ($1, 'LT-AL', $2, 12, 0)
        ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;
      `, [emp.id, currentYear]);
    }

    // 10. Cháº¥m cÃ´ng thá»±c táº¿ (attendance_logs)
    console.log('â±ï¸ 10. Khá»Ÿi táº¡o Dá»¯ liá»‡u Cháº¥m cÃ´ng thá»±c táº¿ trong thÃ¡ng 09/2026...');
    const today = '2026-09-29';
    const yesterday = '2026-09-28';
    const dayBefore = '2026-09-27';

    // Táº¡o cháº¥m cÃ´ng cho hÃ´m nay (2026-09-29) cho toÃ n bá»™ 50 ngÆ°á»i
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Trá»¥ sá»Ÿ chÃ­nh TÃ²a nhÃ  NEXUS, Táº§ng 12, Q.1, TP.HCM');
      `, [emp.id, today, inTime, outTime, status, lateMinutes, method, workHours]);
    }

    // Táº¡o cháº¥m cÃ´ng ngÃ y hÃ´m qua (2026-09-28)
    for (let i = 0; i < rawEmployees.length; i++) {
      const emp = rawEmployees[i];
      const inTime = `${yesterday} 08:15:00+07`;
      const outTime = `${yesterday} 17:45:00+07`;
      await client.query(`
        INSERT INTO attendance_logs (employee_id, work_date, check_in_time, check_out_time, status, late_minutes, check_in_method, work_hours, check_in_address)
        VALUES ($1, $2, $3, $4, 'DUNG_GIO', 0, 'face_id', 8.5, 'Trá»¥ sá»Ÿ chÃ­nh TÃ²a nhÃ  NEXUS, Táº§ng 12, Q.1, TP.HCM');
      `, [emp.id, yesterday, inTime, outTime]);
    }

    // 11. ÄÆ¡n nghá»‰ phÃ©p máº«u Ä‘a dáº¡ng (leave_requests)
    console.log('ðŸ“ 11. Khá»Ÿi táº¡o ÄÆ¡n nghá»‰ phÃ©p Ä‘a tráº¡ng thÃ¡i & Ä‘Ãºng luá»“ng phÃª duyá»‡t...');
    await client.query(`
      INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage, handover_to, submitted_at)
      VALUES 
        ('LP-2026-001', 'NV-0842', 'LT-AL', '2026-10-02', '2026-10-02', 1.0, 'Giáº£i quyáº¿t cÃ´ng viá»‡c gia Ä‘Ã¬nh cÃ¡ nhÃ¢n', 'CHO_TRUONG_PHONG_DUYET', 'VÅ© ÄÃ¬nh Khang', NOW() - INTERVAL '3 hours'),
        ('LP-2026-002', 'NV-1008', 'LT-AL', '2026-10-05', '2026-10-06', 2.0, 'Nghá»‰ vá» quÃª gia Ä‘Ã¬nh cÃ³ viá»‡c hiáº¿u há»‰', 'CHO_TRUONG_PHONG_DUYET', 'Pháº¡m Minh QuÃ¢n', NOW() - INTERVAL '5 hours'),
        ('LP-2026-003', 'NV-1002', 'LT-BT', '2026-10-10', '2026-10-12', 3.0, 'Tham gia Há»™i tháº£o CÃ´ng nghá»‡ Pháº§n má»m Quá»‘c gia Vietnam Tech 2026', 'CHO_HR_PHE_CHUAN', 'Pháº¡m Minh QuÃ¢n', NOW() - INTERVAL '1 day'),
        ('LP-2026-004', 'NV-2001', 'LT-BT', '2026-10-08', '2026-10-09', 2.0, 'Gáº·p gá»¡ kÃ½ káº¿t há»£p tÃ¡c Ä‘á»‘i tÃ¡c chiáº¿n lÆ°á»£c táº¡i HÃ  Ná»™i', 'CHO_HR_PHE_CHUAN', 'BÃ¹i KhÃ¡nh Linh', NOW() - INTERVAL '2 days');
    `);

    // CÃ¡c Ä‘Æ¡n Ä‘Ã£ phÃª duyá»‡t
    await client.query(`
      INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage, manager_approved_by, manager_approved_at, hr_approved_by, hr_approved_at, hr_note, submitted_at)
      VALUES
        ('LP-2026-005', 'NV-1001', 'LT-AL', '2026-09-15', '2026-09-16', 2.0, 'Nghá»‰ phÃ©p nÄƒm tÃ¡i táº¡o nÄƒng lÆ°á»£ng', 'DA_PHE_DUYET', 'NV-0001', NOW() - INTERVAL '14 days', 'NV-0001', NOW() - INTERVAL '14 days', 'Tá»•ng GiÃ¡m Äá»‘c Ä‘Ã£ phÃª chuáº©n', NOW() - INTERVAL '15 days'),
        ('LP-2026-006', 'NV-1102', 'LT-AL', '2026-09-20', '2026-09-20', 1.0, 'KhÃ¡m sá»©c khá»e Ä‘á»‹nh ká»³', 'DA_PHE_DUYET', 'NV-1001', NOW() - INTERVAL '9 days', 'NV-1001', NOW() - INTERVAL '9 days', 'TrÆ°á»Ÿng phÃ²ng NhÃ¢n sá»± Ä‘Ã£ duyá»‡t', NOW() - INTERVAL '10 days'),
        ('LP-2026-007', 'NV-3002', 'LT-SL', '2026-09-22', '2026-09-23', 2.0, 'Nghá»‰ á»‘m theo chá»‰ Ä‘á»‹nh cá»§a bÃ¡c sÄ© bá»‡nh viá»‡n', 'DA_PHE_DUYET', 'NV-3001', NOW() - INTERVAL '7 days', 'NV-1001', NOW() - INTERVAL '7 days', 'ÄÃ£ ná»™p giáº¥y C65 BHXH há»£p lá»‡', NOW() - INTERVAL '8 days');
    `);

    // ÄÆ¡n bá»‹ tá»« chá»‘i
    await client.query(`
      INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage, manager_approved_by, manager_approved_at, manager_note, submitted_at)
      VALUES
        ('LP-2026-008', 'NV-2007', 'LT-UL', '2026-09-25', '2026-09-26', 2.0, 'Xin nghá»‰ viá»‡c riÃªng', 'TU_CHOI', 'NV-2001', NOW() - INTERVAL '5 days', 'Bá»™ pháº­n Ä‘ang táº­p trung chá»‘t chiáº¿n dá»‹ch kinh doanh cuá»‘i thÃ¡ng, Ä‘á» nghá»‹ bá»‘ trÃ­ dá»‹p khÃ¡c.', NOW() - INTERVAL '6 days');
    `);

    // 12. Báº£ng lÆ°Æ¡ng vÃ  Phiáº¿u lÆ°Æ¡ng 50 ngÆ°á»i (payroll_periods & payslips)
    console.log('ðŸ’° 12. Khá»Ÿi táº¡o Báº£ng lÆ°Æ¡ng thÃ¡ng 09/2026 vÃ  thÃ¡ng 08/2026 cho toÃ n bá»™ 50 nhÃ¢n sá»±...');
    
    // Ká»³ lÆ°Æ¡ng ThÃ¡ng 09/2026 (Hiá»‡n táº¡i - Dá»± tháº£o)
    const period09Res = await client.query(`
      INSERT INTO payroll_periods (period, total_headcount, total_net, total_bhxh, total_tax, status, note)
      VALUES ('2026-09', 50, 0, 0, 0, 'DU_THAO', 'Báº£ng lÆ°Æ¡ng tá»•ng há»£p thÃ¡ng 09/2026 theo dá»¯ liá»‡u cháº¥m cÃ´ng thá»±c táº¿ cá»§a 50 cÃ¡n bá»™ nhÃ¢n viÃªn')
      RETURNING id;
    `);
    const period09Id = period09Res.rows[0].id;

    // Ká»³ lÆ°Æ¡ng ThÃ¡ng 08/2026 (QuÃ¡ khá»© - ÄÃ£ hoÃ n thÃ nh chi tráº£)
    const period08Res = await client.query(`
      INSERT INTO payroll_periods (period, total_headcount, total_net, total_bhxh, total_tax, status, note)
      VALUES ('2026-08', 50, 0, 0, 0, 'DA_CHUYEN_KHOAN', 'Báº£ng lÆ°Æ¡ng thÃ¡ng 08/2026 Ä‘Ã£ giáº£i ngÃ¢n quyáº¿t toÃ¡n thÃ nh cÃ´ng qua ngÃ¢n hÃ ng Vietcombank')
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

      // Báº£o hiá»ƒm theo luáº­t VN (tráº§n 20 láº§n lÆ°Æ¡ng cÆ¡ sá»Ÿ hoáº·c theo lÆ°Æ¡ng)
      const insSalary = Math.min(baseSalary, 36000000);
      const bhxh = Math.round(insSalary * 0.08);
      const bhyt = Math.round(insSalary * 0.015);
      const bhtn = Math.round(insSalary * 0.01);
      const totalInsurance = bhxh + bhyt + bhtn;

      // Giáº£m trá»« cÃ¡ nhÃ¢n 11tr
      const pitDeduction = 11000000;
      const taxable = Math.max(0, gross - totalInsurance - pitDeduction);
      
      // Thuáº¿ TNCN lÅ©y tiáº¿n Ä‘Æ¡n giáº£n hÃ³a
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

      // Phiáº¿u lÆ°Æ¡ng thÃ¡ng 09
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

      // Phiáº¿u lÆ°Æ¡ng thÃ¡ng 08
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

    // Cáº­p nháº­t tá»•ng sá»‘ tiá»n cho ká»³ lÆ°Æ¡ng
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

    // 13. Dá»± Ã¡n vÃ  Nhiá»‡m vá»¥ Kanban (projects & tasks)
    console.log('ðŸ“Œ 13. Khá»Ÿi táº¡o Dá»± Ã¡n & Nhiá»‡m vá»¥ Kanban phÃ²ng ban...');
    await client.query(`
      INSERT INTO projects (id, code, name, department_id, manager_id, start_date, end_date, progress, status, priority, description, budget_hours, used_hours)
      VALUES 
        ('PRJ-01', 'PRJ-NEXUS-V2', 'NÃ¢ng cáº¥p Ná»n Táº£ng NEXUS HR v2.0 ToÃ n Diá»‡n', 'DEPT-IT', 'NV-1002', '2026-09-01', '2026-10-31', 82, 'in_progress', 'Cao', 'Hiá»‡n Ä‘áº¡i hÃ³a toÃ n diá»‡n giao diá»‡n, phÃ´ng chá»¯ chuáº©n Roboto YouTube, tá»‘i Æ°u tráº£i nghiá»‡m vÃ  hiá»‡u nÄƒng', 400, 328),
        ('PRJ-02', 'PRJ-AI-KIOSK', 'Há»‡ Thá»‘ng Äiá»ƒm Danh Kiosk AI Face ID & Cá»•ng Barrier', 'DEPT-IT', 'NV-1002', '2026-08-15', '2026-10-15', 88, 'in_progress', 'Cao', 'Triá»ƒn khai camera AI nháº­n diá»‡n khuÃ´n máº·t cháº¥m cÃ´ng thá»i gian thá»±c táº¡i sáº£nh', 250, 220),
        ('PRJ-03', 'PRJ-MKT-Q4',   'Chiáº¿n Dá»‹ch Tiáº¿p Thá»‹ Sá»‘ & Má»Ÿ Rá»™ng Thá»‹ Pháº§n B2B QuÃ½ IV/2026', 'DEPT-MKT', 'NV-2001', '2026-09-15', '2026-12-31', 35, 'in_progress', 'Trung bÃ¬nh', 'Thu hÃºt 200 khÃ¡ch hÃ ng doanh nghiá»‡p sá»­ dá»¥ng ná»n táº£ng HR Tech', 300, 105),
        ('PRJ-04', 'PRJ-FIN-AUTO', 'Tá»± Äá»™ng HÃ³a Äá»‘i SoÃ¡t NgÃ¢n HÃ ng & BÃ¡o CÃ¡o TÃ i ChÃ­nh', 'DEPT-FIN', 'NV-3001', '2026-09-01', '2026-10-31', 65, 'in_progress', 'Trung bÃ¬nh', 'Káº¿t ná»‘i API thanh toÃ¡n chi lÆ°Æ¡ng tá»± Ä‘á»™ng qua Vietcombank vÃ  Techcombank', 180, 117);
    `);

    await client.query(`
      INSERT INTO tasks (id, project_id, title, description, assignee_id, creator_id, deadline, priority, kpi_weight, progress, stage)
      VALUES
        ('TSK-01', 'PRJ-01', 'Chuáº©n hÃ³a phÃ´ng chá»¯ Roboto chuáº©n YouTube tiáº¿ng Viá»‡t sáº¯c nÃ©t', 'Cáº­p nháº­t Google Fonts Roboto Ä‘áº§y Ä‘á»§ trá»ng sá»‘ 300-900, dÃ£n dÃ²ng 1.5, khá»­ rÄƒng cÆ°a antialiased', 'NV-0842', 'NV-1002', '2026-10-01', 'Cao', 30, 100, 'done'),
        ('TSK-02', 'PRJ-01', 'Dá»n dáº¹p vÃ  reset database chuáº©n 50 nhÃ¢n viÃªn 4 phÃ²ng ban', 'Khá»Ÿi táº¡o dá»¯ liá»‡u sáº¡ch, Ä‘á»“ng bá»™ toÃ n bá»™ luá»“ng cháº¥m cÃ´ng, phÃ©p nÄƒm, báº£ng lÆ°Æ¡ng vÃ  Kanban', 'NV-0842', 'NV-1002', '2026-10-02', 'Cao', 30, 100, 'done'),
        ('TSK-03', 'PRJ-01', 'Kiá»ƒm thá»­ toÃ n diá»‡n tá»«ng nÃºt báº¥m vÃ  11 mÃ n hÃ¬nh á»©ng dá»¥ng', 'Thá»±c hiá»‡n test ká»¹ cÃ ng trÃªn giao diá»‡n trÃ¬nh duyá»‡t live, xÃ¡c nháº­n 0 lá»—i console', 'NV-1006', 'NV-1002', '2026-10-05', 'Kháº©n cáº¥p', 25, 80, 'review'),
        ('TSK-04', 'PRJ-02', 'Tá»‘i Æ°u nháº­n diá»‡n FaceID camera AI gÃ³c nghiÃªng táº¡i sáº£nh', 'Äáº£m báº£o thá»i gian nháº­n diá»‡n khuÃ´n máº·t dÆ°á»›i 0.3s vá»›i Ä‘á»™ chÃ­nh xÃ¡c trÃªn 99%', 'NV-1013', 'NV-1002', '2026-10-10', 'Cao', 25, 85, 'in_progress'),
        ('TSK-05', 'PRJ-03', 'Thiáº¿t káº¿ bá»™ áº¥n pháº©m nháº­n diá»‡n thÆ°Æ¡ng hiá»‡u sáº£n pháº©m B2B', 'Bá»™ banner, landing page vÃ  há»“ sÆ¡ nÄƒng lá»±c gá»­i cÃ¡c Ä‘á»‘i tÃ¡c táº­p Ä‘oÃ n', 'NV-2009', 'NV-2001', '2026-10-08', 'Trung bÃ¬nh', 20, 70, 'in_progress'),
        ('TSK-06', 'PRJ-04', 'Kiá»ƒm thá»­ Ä‘á»‘i soÃ¡t tá»± Ä‘á»™ng lá»‡nh chi lÆ°Æ¡ng qua cá»•ng ngÃ¢n hÃ ng', 'XÃ¡c thá»±c Ä‘á»‹nh dáº¡ng file á»§y nhiá»‡m chi Ä‘iá»‡n tá»­ chuáº©n Vietcombank Digital', 'NV-3002', 'NV-3001', '2026-10-12', 'Trung bÃ¬nh', 20, 60, 'in_progress'),
        ('TSK-07', 'PRJ-01', 'Viáº¿t tÃ i liá»‡u hÆ°á»›ng dáº«n sá»­ dá»¥ng phiÃªn báº£n má»›i cho ngÆ°á»i dÃ¹ng', 'Cáº­p nháº­t cáº©m nang nhÃ¢n viÃªn, quy trÃ¬nh xin nghá»‰ phÃ©p vÃ  kÃ½ há»£p Ä‘á»“ng Ä‘iá»‡n tá»­', 'NV-1016', 'NV-1002', '2026-10-15', 'Tháº¥p', 15, 20, 'todo'),
        ('TSK-08', 'PRJ-03', 'Cháº¡y chiáº¿n dá»‹ch quáº£ng cÃ¡o tÃ¬m kiáº¿m Google Ads vÃ  LinkedIn', 'Nháº¯m má»¥c tiÃªu GiÃ¡m Ä‘á»‘c nhÃ¢n sá»± vÃ  CEO cÃ¡c doanh nghiá»‡p vá»«a vÃ  nhá»', 'NV-2005', 'NV-2001', '2026-10-20', 'Trung bÃ¬nh', 20, 10, 'todo');
    `);

    // 14. ThÃ´ng bÃ¡o doanh nghiá»‡p (company_notices & broadcast notifications)
    console.log('ðŸ“¢ 14. Khá»Ÿi táº¡o ThÃ´ng bÃ¡o chÃ­nh thá»©c ná»™i bá»™ cÃ´ng ty vÃ  Ä‘á»“ng bá»™ trung tÃ¢m thÃ´ng bÃ¡o...');
    await client.query(`
      INSERT INTO company_notices (id, title, content, category, priority, author_id, is_pinned, is_active, published_at)
      VALUES 
        ('NOT-01', 'QUYáº¾T Äá»ŠNH KHEN THÆ¯á»žNG XUáº¤T Sáº®C QUÃ III/2026', 'Tá»•ng GiÃ¡m Äá»‘c biá»ƒu dÆ°Æ¡ng vÃ  trao thÆ°á»Ÿng cho cÃ¡c táº­p thá»ƒ phÃ²ng ban xuáº¥t sáº¯c Ä‘Ã£ hoÃ n thÃ nh xuáº¥t sáº¯c cÃ¡c chá»‰ tiÃªu cÃ´ng tÃ¡c vÃ  nÃ¢ng cáº¥p há»‡ thá»‘ng NEXUS HR v2.0.', 'general', 'high', 'NV-0001', TRUE, TRUE, NOW() - INTERVAL '1 day'),
        ('NOT-02', 'HÆ¯á»šNG DáºªN QUY TRÃŒNH CHáº¤M CÃ”NG VÃ€ NGHá»ˆ PHÃ‰P Tá»° Äá»˜NG', 'NhÃ¢n viÃªn thá»±c hiá»‡n Ä‘iá»ƒm danh qua Kiosk FaceID hoáº·c Ä‘á»‹nh vá»‹ GPS trÃªn á»©ng dá»¥ng. Má»i Ä‘Æ¡n nghá»‰ phÃ©p pháº£i gá»­i trÆ°á»›c Ã­t nháº¥t 24 giá» Ä‘á»ƒ cáº¥p trÃªn phÃª duyá»‡t.', 'policy', 'normal', 'NV-1001', TRUE, TRUE, NOW() - INTERVAL '3 days'),
        ('NOT-03', 'Káº¾ HOáº CH Tá»” CHá»¨C KHÃM Sá»¨C KHá»ŽE Äá»ŠNH Ká»² NÄ‚M 2026', 'PhÃ²ng Quáº£n trá»‹ NhÃ¢n sá»± phá»‘i há»£p cÃ¹ng Bá»‡nh viá»‡n Äa khoa Quá»‘c táº¿ tá»• chá»©c khÃ¡m sá»©c khá»e Ä‘á»‹nh ká»³ cho toÃ n thá»ƒ 50 cÃ¡n bá»™ nhÃ¢n viÃªn trong thÃ¡ng 10/2026.', 'event', 'normal', 'NV-1001', FALSE, TRUE, NOW() - INTERVAL '5 days'),
        ('NOT-04', 'Lá»ŠCH NGHá»ˆ Lá»„ VÃ€ QUY CHáº¾ TRá»°C Há»† THá»NG DOANH NGHIá»†P', 'ThÃ´ng bÃ¡o lá»‹ch trá»±c há»— trá»£ khÃ¡ch hÃ ng vÃ  váº­n hÃ nh há»‡ thá»‘ng háº¡ táº§ng mÃ¡y chá»§ trong cÃ¡c dá»‹p lá»… tá»›i.', 'urgent', 'high', 'NV-0001', FALSE, TRUE, NOW() - INTERVAL '7 days');
    `);

    // Äá»“ng bá»™ 4 thÃ´ng bÃ¡o cÃ´ng ty vÃ o báº£ng notifications (Broadcast toÃ n doanh nghiá»‡p)
    await client.query(`
      INSERT INTO notifications (
        id, user_id, role_target, type, category, title, summary, 
        sender_name, sender_role, sender_avatar, priority, is_read, 
        action_type, action_payload, created_at
      ) VALUES 
        (
          'NOTIF-NOT-01', NULL, NULL, 'company_award', 'ThÃ´ng bÃ¡o cÃ´ng ty',
          'QUYáº¾T Äá»ŠNH KHEN THÆ¯á»žNG XUáº¤T Sáº®C QUÃ III/2026',
          'Tá»•ng GiÃ¡m Äá»‘c biá»ƒu dÆ°Æ¡ng vÃ  trao thÆ°á»Ÿng cho cÃ¡c táº­p thá»ƒ phÃ²ng ban xuáº¥t sáº¯c Ä‘Ã£ hoÃ n thÃ nh xuáº¥t sáº¯c cÃ¡c chá»‰ tiÃªu cÃ´ng tÃ¡c vÃ  nÃ¢ng cáº¥p há»‡ thá»‘ng NEXUS HR v2.0.',
          'LÃª VÅ© Ngá»c Duy', 'Tá»•ng GiÃ¡m Äá»‘c (CEO)',
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          'urgent', FALSE, 'notice_popup',
          '{"id":"NOT-01","title":"QUYáº¾T Äá»ŠNH KHEN THÆ¯á»žNG XUáº¤T Sáº®C QUÃ III/2026","content":"Tá»•ng GiÃ¡m Äá»‘c biá»ƒu dÆ°Æ¡ng vÃ  trao thÆ°á»Ÿng cho cÃ¡c táº­p thá»ƒ phÃ²ng ban xuáº¥t sáº¯c Ä‘Ã£ hoÃ n thÃ nh xuáº¥t sáº¯c cÃ¡c chá»‰ tiÃªu cÃ´ng tÃ¡c vÃ  nÃ¢ng cáº¥p há»‡ thá»‘ng NEXUS HR v2.0.","category":"general","priority":"high","isPinned":true,"attachments":[{"name":"QUYET_DINH_KHEN_THUONG_Q3_2026.pdf","size":"2.4 MB","type":"application/pdf"},{"name":"DANH_SACH_TAP_THE_CA_NHAN_KHEN_THUONG.xlsx","size":"1.1 MB","type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}],"date":"28/9/2026","signer":"LÃª VÅ© Ngá»c Duy - Tá»•ng GiÃ¡m Äá»‘c (CEO)","docNumber":"Sá»‘: 101/2026/QÄ-TGÄ"}'::jsonb,
          NOW() - INTERVAL '1 day'
        ),
        (
          'NOTIF-NOT-02', NULL, NULL, 'system', 'ThÃ´ng bÃ¡o cÃ´ng ty',
          'HÆ¯á»šNG DáºªN QUY TRÃŒNH CHáº¤M CÃ”NG VÃ€ NGHá»ˆ PHÃ‰P Tá»° Äá»˜NG',
          'NhÃ¢n viÃªn thá»±c hiá»‡n Ä‘iá»ƒm danh qua Kiosk FaceID hoáº·c Ä‘á»‹nh vá»‹ GPS trÃªn á»©ng dá»¥ng. Má»i Ä‘Æ¡n nghá»‰ phÃ©p pháº£i gá»­i trÆ°á»›c Ã­t nháº¥t 24 giá» Ä‘á»ƒ cáº¥p trÃªn phÃª duyá»‡t.',
          'Tráº§n Mai HÆ°Æ¡ng', 'GiÃ¡m Äá»‘c NhÃ¢n Sá»± (HRD)',
          'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
          'normal', FALSE, 'notice_popup',
          '{"id":"NOT-02","title":"HÆ¯á»šNG DáºªN QUY TRÃŒNH CHáº¤M CÃ”NG VÃ€ NGHá»ˆ PHÃ‰P Tá»° Äá»˜NG","content":"NhÃ¢n viÃªn thá»±c hiá»‡n Ä‘iá»ƒm danh qua Kiosk FaceID hoáº·c Ä‘á»‹nh vá»‹ GPS trÃªn á»©ng dá»¥ng. Má»i Ä‘Æ¡n nghá»‰ phÃ©p pháº£i gá»­i trÆ°á»›c Ã­t nháº¥t 24 giá» Ä‘á»ƒ cáº¥p trÃªn phÃª duyá»‡t.","category":"policy","priority":"normal","isPinned":true,"attachments":[{"name":"SO_TAY_QUY_TRINH_CHAM_CONG_NGHI_PHEP.pdf","size":"3.8 MB","type":"application/pdf"}],"date":"26/9/2026","signer":"Tráº§n Mai HÆ°Æ¡ng - GiÃ¡m Äá»‘c NhÃ¢n Sá»± (HRD)","docNumber":"Sá»‘: 88/2026/HD-HR"}'::jsonb,
          NOW() - INTERVAL '3 days'
        ),
        (
          'NOTIF-NOT-03', NULL, NULL, 'health_check', 'ThÃ´ng bÃ¡o cÃ´ng ty',
          'Káº¾ HOáº CH Tá»” CHá»¨C KHÃM Sá»¨C KHá»ŽE Äá»ŠNH Ká»² NÄ‚M 2026',
          'PhÃ²ng Quáº£n trá»‹ NhÃ¢n sá»± phá»‘i há»£p cÃ¹ng Bá»‡nh viá»‡n Äa khoa Quá»‘c táº¿ tá»• chá»©c khÃ¡m sá»©c khá»e Ä‘á»‹nh ká»³ cho toÃ n thá»ƒ 50 cÃ¡n bá»™ nhÃ¢n viÃªn trong thÃ¡ng 10/2026.',
          'Tráº§n Mai HÆ°Æ¡ng', 'GiÃ¡m Äá»‘c NhÃ¢n Sá»± (HRD)',
          'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
          'normal', FALSE, 'notice_popup',
          '{"id":"NOT-03","title":"Káº¾ HOáº CH Tá»” CHá»¨C KHÃM Sá»¨C KHá»ŽE Äá»ŠNH Ká»² NÄ‚M 2026","content":"PhÃ²ng Quáº£n trá»‹ NhÃ¢n sá»± phá»‘i há»£p cÃ¹ng Bá»‡nh viá»‡n Äa khoa Quá»‘c táº¿ tá»• chá»©c khÃ¡m sá»©c khá»e Ä‘á»‹nh ká»³ cho toÃ n thá»ƒ 50 cÃ¡n bá»™ nhÃ¢n viÃªn trong thÃ¡ng 10/2026.","category":"event","priority":"normal","isPinned":false,"attachments":[{"name":"LICH_KHAM_SUC_KHOE_THEO_PHONG_BAN.pdf","size":"1.5 MB","type":"application/pdf"}],"date":"24/9/2026","signer":"Tráº§n Mai HÆ°Æ¡ng - GiÃ¡m Äá»‘c NhÃ¢n Sá»± (HRD)","docNumber":"Sá»‘: 65/2026/TB-HR"}'::jsonb,
          NOW() - INTERVAL '5 days'
        ),
        (
          'NOTIF-NOT-04', NULL, NULL, 'ceo_directive', 'ThÃ´ng bÃ¡o cÃ´ng ty',
          'Lá»ŠCH NGHá»ˆ Lá»„ VÃ€ QUY CHáº¾ TRá»°C Há»† THá»NG DOANH NGHIá»†P',
          'ThÃ´ng bÃ¡o lá»‹ch trá»±c há»— trá»£ khÃ¡ch hÃ ng vÃ  váº­n hÃ nh há»‡ thá»‘ng háº¡ táº§ng mÃ¡y chá»§ trong cÃ¡c dá»‹p lá»… tá»›i.',
          'LÃª VÅ© Ngá»c Duy', 'Tá»•ng GiÃ¡m Äá»‘c (CEO)',
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          'urgent', FALSE, 'notice_popup',
          '{"id":"NOT-04","title":"Lá»ŠCH NGHá»ˆ Lá»„ VÃ€ QUY CHáº¾ TRá»°C Há»† THá»NG DOANH NGHIá»†P","content":"ThÃ´ng bÃ¡o lá»‹ch trá»±c há»— trá»£ khÃ¡ch hÃ ng vÃ  váº­n hÃ nh há»‡ thá»‘ng háº¡ táº§ng mÃ¡y chá»§ trong cÃ¡c dá»‹p lá»… tá»›i.","category":"urgent","priority":"high","isPinned":false,"attachments":[{"name":"QUY_CHE_TRUC_VAN_HANH_HA_TANG_LE.pdf","size":"2.1 MB","type":"application/pdf"}],"date":"22/9/2026","signer":"LÃª VÅ© Ngá»c Duy - Tá»•ng GiÃ¡m Äá»‘c (CEO)","docNumber":"Sá»‘: 45/2026/TB-TGÄ"}'::jsonb,
          NOW() - INTERVAL '7 days'
        )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        category = EXCLUDED.category,
        priority = EXCLUDED.priority,
        action_payload = EXCLUDED.action_payload;
    `);

    // 15. ThÃ´ng bÃ¡o cÃ¡ nhÃ¢n (notifications)
    console.log('ðŸ”” 15. Khá»Ÿi táº¡o ThÃ´ng bÃ¡o thÃ´ng tin ngÆ°á»i dÃ¹ng...');
    await client.query(`
      INSERT INTO notifications (id, user_id, type, category, title, summary, priority, is_read, created_at)
      SELECT 
        'NOTIF-' || LPAD(ROW_NUMBER() OVER ()::TEXT, 4, '0'),
        u.id, 
        'system',
        'CÃ¡ nhÃ¢n',
        'ChÃ o má»«ng Ä‘áº¿n vá»›i Há»‡ thá»‘ng NEXUS HR v2.0', 
        'TÃ i khoáº£n cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t vá»›i giao diá»‡n má»›i chuáº©n sáº¯c nÃ©t vÃ  tá»‘i Æ°u.', 
        'normal',
        FALSE,
        NOW()
      FROM users u;
    `);

    await client.query('COMMIT');
    console.log('\n======================================================');
    console.log('ðŸŽ‰ THÃ€NH CÃ”NG Rá»°C Rá» : DATABASE ÄÃƒ ÄÆ¯á»¢C RESET VÃ€ SEED Äáº¦Y Äá»¦!');
    console.log('ðŸ“Š Thá»‘ng kÃª dá»¯ liá»‡u Ä‘Ã£ náº¡p:');
    console.log('   - 50 NhÃ¢n sá»± chÃ­nh thá»©c (Há» tÃªn tiáº¿ng Viá»‡t chuáº©n má»±c, lÆ°Æ¡ng, phÃ²ng ban, chá»©c vá»¥)');
    console.log('   - 4 PhÃ²ng ban nghiá»‡p vá»¥ chÃ­nh (IT, HR, Marketing, Finance) + Ban Äiá»u HÃ nh');
    console.log('   - 50 TÃ i khoáº£n Ä‘Äƒng nháº­p tÆ°Æ¡ng á»©ng vá»›i phÃ¢n quyá»n Roles chuáº©n xÃ¡c');
    console.log('   - 50 Há»£p Ä‘á»“ng lao Ä‘á»™ng cÃ³ hiá»‡u lá»±c');
    console.log('   - 50 Quá»¹ ngÃ y phÃ©p nÄƒm 2026');
    console.log('   - HÃ ng trÄƒm báº£n ghi Cháº¥m cÃ´ng thá»±c táº¿ trong thÃ¡ng 09/2026');
    console.log('   - 8 ÄÆ¡n nghá»‰ phÃ©p Ä‘a tráº¡ng thÃ¡i Ä‘Ãºng luá»“ng phÃª duyá»‡t 4 cáº¥p');
    console.log('   - 2 Ká»³ lÆ°Æ¡ng (ThÃ¡ng 09/2026 vÃ  ThÃ¡ng 08/2026) vá»›i 100 Phiáº¿u lÆ°Æ¡ng Ä‘áº§y Ä‘á»§');
    console.log('   - 4 Dá»± Ã¡n lá»›n vÃ  8 Nhiá»‡m vá»¥ Kanban phÃ¢n bá»• theo cÃ¡c phÃ²ng ban');
    console.log('   - 4 ThÃ´ng bÃ¡o cÃ´ng ty chÃ­nh thá»©c');
    console.log('======================================================');
    console.log('ðŸ”‘ 4 TÃ i khoáº£n Ä‘Äƒng nháº­p nhanh:');
    console.log('   1. CEO:          ceo@fwbnexus.vn      / Ceo@123456');
    console.log('   2. HR Director:  hrd@fwbnexus.vn      / Hrd@123456');
    console.log('   3. Line Manager: lead@fwbnexus.vn     / Lead@123456');
    console.log('   4. Employee:     employee@fwbnexus.vn / Emp@123456');
    console.log('   * 46 nhÃ¢n sá»± cÃ²n láº¡i: máº­t kháº©u máº·c Ä‘á»‹nh: User@123456\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('âŒ Lá»—i khi thá»±c hiá»‡n reset & seed database:', err);
    process.exit(1);
  } finally {
    client.release();
    await db.pool.end();
  }
}

resetAndSeed50Employees();
