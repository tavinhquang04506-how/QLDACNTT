// ============================================================
// utils/rbacMatrixCatalog.js — Authoritative RBAC Policy Catalog
// Mirrors Backend/src/policies/matrix.js (64 permissions) &
// Backend/src/modules/users/roleRules.js (role assignment guards)
// ============================================================

const RAW_ROLES = [
  {
    key: 'CEO',
    code: 'CEO',
    name: 'Tổng Giám Đốc (CEO)',
    shortName: 'CEO',
    badge: 'Cấp 1 — CEO',
    level: 'Cấp 1',
    hierarchy: 'Cấp 1 — Lãnh Đạo Tối Cao',
    levelLabel: 'Cấp 1 — Lãnh Đạo Tối Cao',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    dotClass: 'bg-purple-600',
    defaultScope: 'Toàn công ty (ALL)',
    summary:
      'Toàn quyền điều hành chiến lược, truy cập mọi dữ liệu nhân sự, bảng lương, đánh giá 9-Box, cấu hình hệ thống, nhật ký kiểm toán và phân quyền mọi cấp tài khoản.',
    assignableRoles: ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE', 'ADMIN', 'KIOSK'],
  },
  {
    key: 'HR_DIRECTOR',
    code: 'HR_DIRECTOR',
    name: 'Giám Đốc Nhân Sự (HRD)',
    shortName: 'HR Director',
    badge: 'Cấp 2A — HRD',
    level: 'Cấp 2A',
    hierarchy: 'Cấp 2A — Quản Trị Nhân Sự',
    levelLabel: 'Cấp 2A — Quản Trị Nhân Sự',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-600',
    defaultScope: 'Toàn công ty (ALL)',
    summary:
      'Quản lý toàn diện hồ sơ nhân sự, hợp đồng, phê duyệt nghỉ phép/OT/C65 cấp 2, tính & chốt bảng lương, đánh giá 9-Box/PIP, thông báo nội bộ và quản lý tài khoản từ cấp Trưởng phòng trở xuống.',
    assignableRoles: ['LINE_MANAGER', 'EMPLOYEE', 'KIOSK'],
  },
  {
    key: 'LINE_MANAGER',
    code: 'LINE_MANAGER',
    name: 'Trưởng Phòng Ban',
    shortName: 'Line Manager',
    badge: 'Cấp 2B — Lead',
    level: 'Cấp 2B',
    hierarchy: 'Cấp 2B — Quản Lý Bộ Phận',
    levelLabel: 'Cấp 2B — Quản Lý Bộ Phận',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-600',
    defaultScope: 'Theo phòng ban (DEPT)',
    summary:
      'Quản lý nhân sự, chấm công, dự án Kanban, đánh giá 9-Box/đề xuất PIP và phê duyệt đơn nghỉ phép/OT/giải trình cấp 1 trong phạm vi phòng ban phụ trách.',
    assignableRoles: [],
  },
  {
    key: 'EMPLOYEE',
    code: 'EMPLOYEE',
    name: 'Nhân Viên Chính Thức',
    shortName: 'Employee',
    badge: 'Cấp 3 — ESS',
    level: 'Cấp 3',
    hierarchy: 'Cấp 3 — Tự Phục Vụ (ESS)',
    levelLabel: 'Cấp 3 — Tự Phục Vụ (ESS)',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
    defaultScope: 'Cá nhân (SELF)',
    summary:
      'Truy cập Cổng Nhân Viên (ESS): chấm công cá nhân, gửi đơn nghỉ phép/OT/giải trình, xem phiếu lương của bản thân, cập nhật tiến độ task Kanban và hỏi đáp Trợ lý AI HR trong phạm vi cá nhân.',
    assignableRoles: [],
  },
  {
    key: 'ADMIN',
    code: 'ADMIN',
    name: 'Quản Trị Hệ Thống (IT Admin)',
    shortName: 'System Admin',
    badge: 'QTHT — ADMIN',
    level: 'QTHT',
    hierarchy: 'QTHT — Quản Trị Kỹ Thuật',
    levelLabel: 'QTHT — Quản Trị Kỹ Thuật',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dotClass: 'bg-indigo-600',
    defaultScope: 'Tài khoản & Kiểm toán (ALL)',
    summary:
      'Quản trị tài khoản người dùng (gán quyền Nhân viên, Trưởng phòng, Kiosk), xem danh bạ và giám sát Nhật ký kiểm toán bảo mật (dữ liệu lương & CCCD được tự động ẩn [REDACTED]).',
    assignableRoles: ['LINE_MANAGER', 'EMPLOYEE', 'KIOSK'],
  },
  {
    key: 'KIOSK',
    code: 'KIOSK',
    name: 'Thiết Bị Kiosk Chấm Công',
    shortName: 'Kiosk Terminal',
    badge: 'Kiosk Sảnh',
    level: 'Kiosk',
    hierarchy: 'Thiết bị — Sảnh Cổng Chính',
    levelLabel: 'Thiết bị — Sảnh Cổng Chính',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    dotClass: 'bg-slate-500',
    defaultScope: 'Quầy chấm công (SELF)',
    summary:
      'Tài khoản chuyên dụng cho thiết bị iPad/Terminal tại sảnh chính, chỉ có quyền phát mã QR TOTP động và ghi nhận sự kiện chấm công Kiosk.',
    assignableRoles: [],
  },
];

export const RBAC_ROLES = RAW_ROLES;
export const ROLE_MAP = Object.fromEntries(RBAC_ROLES.map((r) => [r.key, r]));

const SCOPE_ALL = {
  key: 'ALL',
  label: 'Toàn công ty',
  shortLabel: 'ALL',
  badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  dotClass: 'bg-emerald-500',
  description: 'Truy cập và thao tác trên toàn bộ phòng ban & nhân sự trong công ty',
};

const SCOPE_DEPT = {
  key: 'DEPT',
  label: 'Theo phòng ban',
  shortLabel: 'DEPT',
  badgeClass: 'bg-blue-50 text-blue-700 border border-blue-200',
  dotClass: 'bg-blue-500',
  description: 'Chỉ truy cập và phê duyệt dữ liệu của nhân sự thuộc phòng ban mình quản lý',
};

const SCOPE_SELF = {
  key: 'SELF',
  label: 'Cá nhân',
  shortLabel: 'SELF',
  badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
  dotClass: 'bg-amber-500',
  description: 'Chỉ truy cập hồ sơ, phiếu lương và đơn từ của chính bản thân mình',
};

export const SCOPE_META = {
  ALL: SCOPE_ALL,
  DEPT: SCOPE_DEPT,
  SELF: SCOPE_SELF,
  all: SCOPE_ALL,
  department: SCOPE_DEPT,
  self: SCOPE_SELF,
};

const LIMITED_ASSIGNABLE = ['EMPLOYEE', 'LINE_MANAGER', 'KIOSK'];
const HRD_PROTECTED = ['CEO', 'ADMIN'];

/**
 * Mirrors Backend/src/modules/users/roleRules.js -> canAssignRole
 */
export function canAssignRole(actorRole, targetRole) {
  if (actorRole === 'CEO') return true;
  if (actorRole === 'HR_DIRECTOR' || actorRole === 'ADMIN') {
    return LIMITED_ASSIGNABLE.includes(targetRole);
  }
  return false;
}

/**
 * Mirrors Backend/src/modules/users/roleRules.js -> canManageUserWithRole
 */
export function canManageUserWithRole(actorRole, subjectRole) {
  if (actorRole === 'CEO') return true;
  if (actorRole === 'HR_DIRECTOR') return !HRD_PROTECTED.includes(subjectRole);
  if (actorRole === 'ADMIN') return LIMITED_ASSIGNABLE.includes(subjectRole);
  return false;
}

const RAW_MODULES = [
  {
    id: 'users_security',
    name: '1. Quản trị Tài khoản, Phân quyền & Kiểm toán',
    description: 'Cấp phát tài khoản, đổi vai trò RBAC, khóa phiên đăng nhập, cấu hình hệ thống & nhật ký kiểm toán',
    permissions: [
      { code: 'user.read', name: 'Xem danh sách & chi tiết tài khoản hệ thống', endpoint: 'GET /api/users', scopes: { CEO: 'all', HR_DIRECTOR: 'all', ADMIN: 'all' } },
      { code: 'user.create', name: 'Tạo tài khoản mới & cấp mật khẩu khởi tạo', endpoint: 'POST /api/users', scopes: { CEO: 'all', HR_DIRECTOR: 'all', ADMIN: 'all' } },
      { code: 'user.update', name: 'Đổi vai trò (Role), khóa / mở khóa tài khoản', endpoint: 'PATCH /api/users/:id', scopes: { CEO: 'all', HR_DIRECTOR: 'all', ADMIN: 'all' } },
      { code: 'user.resetPassword', name: 'Cấp lại mật khẩu tạm thời & thu hồi phiên cũ', endpoint: 'POST /api/users/:id/reset-password', scopes: { CEO: 'all', HR_DIRECTOR: 'all', ADMIN: 'all' } },
      { code: 'settings.read', name: 'Xem cấu hình hệ thống & phiên bản chính sách', endpoint: 'GET /api/settings', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self', ADMIN: 'all' } },
      { code: 'settings.manage', name: 'Chỉnh sửa cấu hình chấm công, thuế, BHXH & GPS', endpoint: 'PUT /api/settings', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'audit.read', name: 'Truy vấn nhật ký kiểm toán bảo mật toàn hệ thống', endpoint: 'GET /api/audit-logs', scopes: { CEO: 'all', ADMIN: 'all' } },
    ],
  },
  {
    id: 'employees_org',
    name: '2. Hồ sơ Nhân sự, Cơ cấu Tổ chức & Hợp đồng',
    description: 'Quản lý danh bạ 360°, tuyển dụng onboarding, thôi việc offboarding, phòng ban, chức danh và hợp đồng',
    permissions: [
      { code: 'employee.list', name: 'Xem danh bạ nhân sự công ty', endpoint: 'GET /api/employees', scopes: { CEO: 'all', HR_DIRECTOR: 'all', ADMIN: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'all' } },
      { code: 'employee.read', name: 'Xem chi tiết hồ sơ nhân sự 360° (lương, CCCD, ngân hàng)', endpoint: 'GET /api/employees/:id', scopes: { CEO: 'all', HR_DIRECTOR: 'all', ADMIN: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'employee.create', name: 'Tiếp nhận nhân sự mới (Onboarding)', endpoint: 'POST /api/employees', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'employee.import', name: 'Nhập hàng loạt hồ sơ nhân sự (Bulk Import)', endpoint: 'POST /api/employees/import', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'employee.update', name: 'Cập nhật thông tin hồ sơ & điều chuyển nhân sự', endpoint: 'PATCH /api/employees/:id', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'employee.offboard', name: 'Giải quyết nghỉ việc & thu hồi quyền truy cập', endpoint: 'POST /api/employees/:id/offboard', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'contract.read', name: 'Xem hợp đồng lao động', endpoint: 'GET /api/contracts', scopes: { CEO: 'all', HR_DIRECTOR: 'all', EMPLOYEE: 'self' } },
      { code: 'contract.manage', name: 'Tạo mới, gia hạn & chấm dứt hợp đồng lao động', endpoint: 'POST /api/contracts', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'department.manage', name: 'Tạo mới, cập nhật & xóa phòng ban', endpoint: 'POST /api/departments', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'position.manage', name: 'Quản lý danh mục chức danh & cấp bậc', endpoint: 'POST /api/positions', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
    ],
  },
  {
    id: 'attendance_kiosk',
    name: '3. Chấm công, Kiosk AI Face ID & Giải trình',
    description: 'Check-in/out GPS, quét QR Kiosk sảnh chính, bảng công tháng, điều chỉnh công và xét duyệt giải trình',
    permissions: [
      { code: 'attendance.punch', name: 'Thực hiện chấm công vào ca / tan ca (Check-in/out)', endpoint: 'POST /api/attendance/check-in', scopes: { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self' } },
      { code: 'attendance.read', name: 'Xem lịch sử chấm công & bảng công tháng', endpoint: 'GET /api/attendance', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'attendance.report', name: 'Xem báo cáo chuyên cần, đi muộn / vắng mặt', endpoint: 'GET /api/attendance/exceptions', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'attendance.kiosk', name: 'Vận hành màn hình Kiosk AI & phát mã QR động', endpoint: 'GET /api/attendance/kiosk/qr', scopes: { CEO: 'all', HR_DIRECTOR: 'all', KIOSK: 'all' } },
      { code: 'attendance.adjust', name: 'Điều chỉnh trực tiếp bản ghi chấm công', endpoint: 'PATCH /api/attendance/:id', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'attendance.appeals.create', name: 'Gửi đơn giải trình chấm công cá nhân', endpoint: 'POST /api/attendance/appeals', scopes: { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self' } },
      { code: 'attendance.appeals.read', name: 'Xem danh sách đơn giải trình chấm công', endpoint: 'GET /api/attendance/appeals', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'attendance.appeals.review', name: 'Phê duyệt / từ chối đơn giải trình chấm công', endpoint: 'PATCH /api/attendance/appeals/:id', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
    ],
  },
  {
    id: 'leaves_ot_medical',
    name: '4. Nghỉ phép, Tăng ca (OT) & Bảo hiểm Y tế (C65)',
    description: 'Quy trình phê duyệt 2 cấp (Nhân viên -> Trưởng phòng -> HRD; Quản lý/HRD -> CEO)',
    permissions: [
      { code: 'leave.create', name: 'Tạo đơn xin nghỉ phép mới', endpoint: 'POST /api/leaves', scopes: { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self' } },
      { code: 'leave.read', name: 'Xem danh sách đơn nghỉ phép & số dư phép năm', endpoint: 'GET /api/leaves', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'leave.approve', name: 'Phê duyệt đơn nghỉ phép theo luồng phân cấp', endpoint: 'POST /api/leaves/:id/approve', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'leave.reject', name: 'Từ chối đơn nghỉ phép kèm lý do', endpoint: 'POST /api/leaves/:id/reject', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'ot.create', name: 'Đăng ký làm thêm giờ (Overtime)', endpoint: 'POST /api/ot-requests', scopes: { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self' } },
      { code: 'ot.read', name: 'Xem danh sách đơn đăng ký làm thêm giờ', endpoint: 'GET /api/ot-requests', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'ot.approve', name: 'Phê duyệt đơn đăng ký làm thêm giờ (OT)', endpoint: 'POST /api/ot-requests/:id/approve', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'ot.reject', name: 'Từ chối đơn đăng ký làm thêm giờ (OT)', endpoint: 'POST /api/ot-requests/:id/reject', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'claim.create', name: 'Gửi hồ sơ thanh toán y tế / nghỉ ốm BHXH (C65)', endpoint: 'POST /api/medical-claims', scopes: { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self' } },
      { code: 'claim.read', name: 'Xem danh sách hồ sơ thanh toán y tế C65', endpoint: 'GET /api/medical-claims', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'claim.approve', name: 'Phê duyệt thanh toán chế độ y tế C65', endpoint: 'POST /api/medical-claims/:id/approve', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'claim.reject', name: 'Từ chối hồ sơ thanh toán y tế C65', endpoint: 'POST /api/medical-claims/:id/reject', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
    ],
  },
  {
    id: 'payroll_finance',
    name: '5. Bảng lương, Thuế TNCN, BHXH & Quyết toán',
    description: 'Tính lương tự động từ công/phép/OT, điều chỉnh phụ cấp, khóa kỳ lương và lệnh chuyển khoản ngân hàng',
    permissions: [
      { code: 'payroll.periods.read', name: 'Xem danh sách kỳ lương & tổng quỹ lương công ty', endpoint: 'GET /api/payroll/periods', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'payroll.payslips.read', name: 'Xem phiếu lương chi tiết (Gross, BHXH, Thuế TNCN, Net)', endpoint: 'GET /api/payroll/payslips', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'self', EMPLOYEE: 'self' } },
      { code: 'payroll.calculate', name: 'Chạy tính toán bảng lương tháng & chụp snapshot chính sách', endpoint: 'POST /api/payroll/calculate', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'payroll.update', name: 'Điều chỉnh phụ cấp, thưởng & đối soát bất thường lương', endpoint: 'PATCH /api/payroll/payslips/:id', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'payroll.lock', name: 'Chốt kỳ lương (Đóng băng số liệu kỳ lương)', endpoint: 'POST /api/payroll/periods/:id/lock', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'payroll.transfer', name: 'Xác nhận giải ngân chuyển khoản ngân hàng', endpoint: 'POST /api/payroll/periods/:id/transfer', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
    ],
  },
  {
    id: 'projects_kanban_squads',
    name: '6. Dự án, Quản lý Nhiệm vụ Kanban & Squads',
    description: 'Khởi tạo dự án, giao việc Kanban, nghiệm thu bàn giao task và thảo luận nhóm Squads thời gian thực',
    permissions: [
      { code: 'project.read', name: 'Xem danh sách dự án & bảng nhiệm vụ Kanban', endpoint: 'GET /api/projects', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'project.create', name: 'Khởi tạo dự án mới & phân bổ ngân sách giờ công', endpoint: 'POST /api/projects', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'squad.read', name: 'Xem danh sách Squads & tin nhắn thảo luận nhóm', endpoint: 'GET /api/squads', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'squad.create', name: 'Thành lập tổ đội Squad liên phòng ban', endpoint: 'POST /api/squads', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
    ],
  },
  {
    id: 'analytics_9box_pip',
    name: '7. Phân tích Nhân sự, Ma trận 9-Box & Kế hoạch PIP',
    description: 'Đánh giá hiệu suất - tiềm năng 9-Box, dự báo rủi ro nghỉ việc và quản lý lộ trình cải thiện PIP',
    permissions: [
      { code: 'analytics.read', name: 'Xem dữ liệu đánh giá hiệu suất & ma trận 9-Box', endpoint: 'GET /api/analytics/reviews', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'analytics.insight', name: 'Xem báo cáo phân tích chuyên sâu & thống kê KPI', endpoint: 'GET /api/analytics/insights', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'analytics.risk', name: 'Xem cảnh báo dự báo rủi ro nghỉ việc (Turnover Risk)', endpoint: 'GET /api/analytics/turnover-risk', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'review.write', name: 'Chấm điểm đánh giá năng lực & xếp ô 9-Box', endpoint: 'POST /api/analytics/reviews', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'review.delete', name: 'Xóa bản ghi đánh giá năng lực', endpoint: 'DELETE /api/analytics/reviews/:id', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'pip.read', name: 'Xem kế hoạch cải thiện hiệu suất (PIP)', endpoint: 'GET /api/analytics/pip', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'pip.propose', name: 'Đề xuất lập kế hoạch kèm cặp PIP cho nhân viên', endpoint: 'POST /api/analytics/pip', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
      { code: 'pip.manage', name: 'Phê duyệt kích hoạt & đóng kế hoạch PIP', endpoint: 'PATCH /api/analytics/pip/:id', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'pip.track', name: 'Cập nhật tiến độ mục tiêu trong kế hoạch PIP', endpoint: 'POST /api/analytics/pip/:id/progress', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' } },
    ],
  },
  {
    id: 'notices_handbook_ai',
    name: '8. Truyền thông Nội bộ, Cẩm nang & Trợ lý AI Copilot',
    description: 'Ban hành thông báo công ty, quản lý văn bản quy chế 2026, Dashboard KPI và Grounded AI Copilot V1',
    permissions: [
      { code: 'dashboard.read', name: 'Xem bảng điều khiển KPI theo phạm vi vai trò', endpoint: 'GET /api/dashboard', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' } },
      { code: 'notice.read', name: 'Đọc thông báo nội bộ công ty', endpoint: 'GET /api/notices', scopes: { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self', ADMIN: 'self' } },
      { code: 'notice.manage', name: 'Ban hành, ghim & gỡ thông báo nội bộ công ty', endpoint: 'POST /api/notices', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'handbook.read', name: 'Tra cứu Cẩm nang Nhân sự & Quy chế công ty', endpoint: 'GET /api/handbook', scopes: { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self', ADMIN: 'self' } },
      { code: 'handbook.manage', name: 'Biên soạn & cập nhật văn bản quy chế trong Cẩm nang', endpoint: 'POST /api/handbook', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'notification.read', name: 'Xem thông báo cá nhân tại Trung tâm thông báo', endpoint: 'GET /api/notifications', scopes: { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self', ADMIN: 'self' } },
      { code: 'notification.create', name: 'Phát thông báo hệ thống tới nhân sự / vai trò', endpoint: 'POST /api/notifications', scopes: { CEO: 'all', HR_DIRECTOR: 'all' } },
      { code: 'ai.copilot', name: 'Sử dụng Trợ lý AI HR (Grounded AI Copilot V1 - kiểm soát theo RBAC)', endpoint: 'POST /api/ai/copilot', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self', ADMIN: 'self' } },
      { code: 'ai.knowledge', name: 'Truy xuất kho tri thức chính sách chuẩn cho AI Copilot', endpoint: 'GET /api/ai/knowledge', scopes: { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self', ADMIN: 'self' } },
    ],
  },
];

export const RBAC_MODULES = RAW_MODULES.map((mod) => ({
  ...mod,
  permissions: mod.permissions.map((p) => ({
    ...p,
    key: p.code,
    label: p.name,
    desc: `API: ${p.endpoint}`,
  })),
}));

export const TOTAL_PERMISSIONS_COUNT = RBAC_MODULES.reduce(
  (sum, mod) => sum + mod.permissions.length,
  0
);
