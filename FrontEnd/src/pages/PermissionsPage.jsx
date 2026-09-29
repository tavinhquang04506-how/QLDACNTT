import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  RefreshCw,
  Search,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  RotateCcw,
  Save,
  Plus,
  Pencil,
  Trash2,
  X,
  User,
  UserPlus,
  Mail,
  Building2,
  KeyRound,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/userService';
import employeeService from '../services/employeeService';

const CORE_DEMO_EMAILS = new Set([
  'ceo@fwbnexus.vn',
  'hrd@fwbnexus.vn',
  'lead@fwbnexus.vn',
  'employee@fwbnexus.vn',
]);

const CEO_LOCKED_PERMISSIONS = new Set([
  'settings.read',
  'settings.manage',
  'user.read',
  'user.update',
  'audit.read',
]);

const ASSIGNABLE_SYSTEM_ROLES = new Set([
  'CEO',
  'HR_DIRECTOR',
  'LINE_MANAGER',
  'EMPLOYEE',
  'ADMIN',
  'KIOSK',
]);

const DEFAULT_ROLE_CATALOG = [
  {
    key: 'CEO',
    code: 'CEO',
    name: 'Tổng Giám Đốc',
    shortName: 'Tổng Giám Đốc',
    badge: 'Tổng Giám Đốc',
    level: 'Cấp 1',
    hierarchy: 'Ban Giám Đốc',
    colorTheme: 'amber',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
    defaultScope: 'Toàn công ty (ALL)',
    summary: 'Toàn quyền điều hành chiến lược, phê duyệt cuối cùng và cấu hình hệ thống.',
    isSystem: true,
    isProtected: true,
  },
  {
    key: 'HR_DIRECTOR',
    code: 'HR_DIRECTOR',
    name: 'Giám Đốc Nhân Sự',
    shortName: 'Giám Đốc Nhân Sự',
    badge: 'Giám Đốc Nhân Sự',
    level: 'Cấp 2A',
    hierarchy: 'Phòng Nhân sự',
    colorTheme: 'purple',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    dotClass: 'bg-purple-600',
    defaultScope: 'Toàn công ty (ALL)',
    summary: 'Quản lý toàn diện hồ sơ nhân sự, hợp đồng, nghỉ phép/OT bước 2 và bảng lương.',
    isSystem: true,
    isProtected: false,
  },
  {
    key: 'LINE_MANAGER',
    code: 'LINE_MANAGER',
    name: 'Trưởng Phòng Ban',
    shortName: 'Trưởng Phòng Ban',
    badge: 'Trưởng Phòng Ban',
    level: 'Cấp 2B',
    hierarchy: 'Quản lý bộ phận',
    colorTheme: 'blue',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-600',
    defaultScope: 'Theo phòng ban (DEPT)',
    summary: 'Quản lý nhân sự, chấm công, dự án và phê duyệt đơn bước 1 trong phòng ban.',
    isSystem: true,
    isProtected: false,
  },
  {
    key: 'EMPLOYEE',
    code: 'EMPLOYEE',
    name: 'Nhân Viên',
    shortName: 'Nhân Viên',
    badge: 'Nhân Viên',
    level: 'Cấp 3',
    hierarchy: 'Nhân sự chính thức',
    colorTheme: 'slate',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotClass: 'bg-slate-500',
    defaultScope: 'Cá nhân (SELF)',
    summary: 'Cổng tự phục vụ ESS: chấm công, gửi đơn phép/OT, xem phiếu lương cá nhân.',
    isSystem: true,
    isProtected: false,
  },
  {
    key: 'ADMIN',
    code: 'ADMIN',
    name: 'Quản Trị Viên',
    shortName: 'Quản Trị Viên',
    badge: 'Quản Trị Viên',
    level: 'QTHT',
    hierarchy: 'Quản trị hệ thống',
    colorTheme: 'rose',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClass: 'bg-rose-500',
    defaultScope: 'Toàn công ty (ALL)',
    summary: 'Quản trị tài khoản người dùng và nhật ký kiểm toán bảo mật.',
    isSystem: true,
    isProtected: false,
  },
  {
    key: 'KIOSK',
    code: 'KIOSK',
    name: 'Kiosk Chấm Công',
    shortName: 'Kiosk Chấm Công',
    badge: 'Kiosk Chấm Công',
    level: 'Thiết bị',
    hierarchy: 'Sảnh chính',
    colorTheme: 'emerald',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    defaultScope: 'Cá nhân (SELF)',
    summary: 'Thiết bị đầu cuối tại sảnh để phát QR TOTP động và nhận diện Face ID.',
    isSystem: true,
    isProtected: false,
  },
];

const ROLE_BADGE_MAP = {
  CEO: {
    label: 'Tổng Giám Đốc',
    pill: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
  },
  HR_DIRECTOR: {
    label: 'Giám Đốc Nhân Sự',
    pill: 'bg-purple-50 text-purple-700 border border-purple-200',
    dot: 'bg-purple-600',
  },
  LINE_MANAGER: {
    label: 'Trưởng Phòng Ban',
    pill: 'bg-blue-50 text-blue-700 border border-blue-200',
    dot: 'bg-blue-600',
  },
  EMPLOYEE: {
    label: 'Nhân Viên',
    pill: 'bg-slate-100 text-slate-700 border border-slate-200',
    dot: 'bg-slate-500',
  },
  ADMIN: {
    label: 'Quản Trị Viên',
    pill: 'bg-rose-50 text-rose-700 border border-rose-200',
    dot: 'bg-rose-500',
  },
  KIOSK: {
    label: 'Kiosk Chấm Công',
    pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    dot: 'bg-emerald-500',
  },
};

const COLOR_THEME_OPTIONS = [
  { key: 'blue', label: 'Xanh Dương', swatch: 'bg-blue-600' },
  { key: 'purple', label: 'Tím Hoàng Gia', swatch: 'bg-purple-600' },
  { key: 'emerald', label: 'Xanh Ngọc Lục Bảo', swatch: 'bg-emerald-600' },
  { key: 'amber', label: 'Vàng Hổ Phách', swatch: 'bg-amber-500' },
  { key: 'indigo', label: 'Chàm Indigo', swatch: 'bg-indigo-600' },
  { key: 'rose', label: 'Đỏ Hồng', swatch: 'bg-rose-600' },
  { key: 'cyan', label: 'Xanh Cyan', swatch: 'bg-cyan-600' },
  { key: 'slate', label: 'Xám Đá', swatch: 'bg-slate-600' },
];

const PERMISSION_MODULES = [
  {
    id: 'employees',
    title: 'Hồ sơ nhân sự',
    sectionHeader: 'HỒ SƠ NHÂN SỰ & TỔ CHỨC',
    permissions: [
      { key: 'employee.list', label: 'Xem danh sách nhân sự' },
      { key: 'employee.read', label: 'Xem chi tiết hồ sơ 360°' },
      { key: 'employee.create', label: 'Tạo mới nhân viên (Onboarding)' },
      { key: 'employee.update', label: 'Cập nhật hồ sơ & lương cơ bản' },
      { key: 'employee.delete', label: 'Chấm dứt HĐLĐ (Offboarding)' },
      { key: 'department.read', label: 'Xem danh mục phòng ban & chức danh' },
      { key: 'department.write', label: 'Thêm / Sửa / Xóa phòng ban & chức danh' },
      { key: 'contract.read', label: 'Xem hợp đồng lao động' },
      { key: 'contract.write', label: 'Tạo & gia hạn hợp đồng lao động' },
    ],
  },
  {
    id: 'attendance',
    title: 'Chấm công & Kiosk',
    sectionHeader: 'CHẤM CÔNG SINH TRẮC HỌC & KIOSK',
    permissions: [
      { key: 'attendance.read', label: 'Xem dữ liệu bảng chấm công' },
      { key: 'attendance.checkIn', label: 'Thực hiện Check-in / Check-out' },
      { key: 'attendance.appeal', label: 'Tạo & duyệt đơn giải trình công' },
      { key: 'attendance.manage', label: 'Quản trị & hiệu chỉnh công tổng hợp' },
      { key: 'kiosk.DynamicQR', label: 'Phát mã QR động TOTP tại Kiosk' },
    ],
  },
  {
    id: 'leaves',
    title: 'Nghỉ phép & OT',
    sectionHeader: 'NGHỈ PHÉP, TĂNG CA (OT) & CHẾ ĐỘ C65',
    permissions: [
      { key: 'leave.read', label: 'Xem danh sách đơn nghỉ phép' },
      { key: 'leave.create', label: 'Gửi đơn xin nghỉ phép mới' },
      { key: 'leave.cancel', label: 'Hủy đơn nghỉ phép đang chờ' },
      { key: 'leave.approve', label: 'Phê duyệt / Từ chối đơn nghỉ phép' },
      { key: 'ot.read', label: 'Xem danh sách phiếu đăng ký OT' },
      { key: 'ot.create', label: 'Gửi yêu cầu làm thêm giờ (OT)' },
      { key: 'ot.approve', label: 'Phê duyệt / Từ chối yêu cầu OT' },
      { key: 'medical.read', label: 'Xem hồ sơ trợ cấp BHXH / C65-HD' },
      { key: 'medical.create', label: 'Nộp hồ sơ đề nghị thanh toán C65' },
      { key: 'medical.approve', label: 'Duyệt chi trả chế độ BHXH C65' },
    ],
  },
  {
    id: 'payroll',
    title: 'Bảng lương & Thuế',
    sectionHeader: 'BẢNG LƯƠNG, THUẾ TNCN & BHXH',
    permissions: [
      { key: 'payroll.read', label: 'Xem bảng lương & phiếu lương (Payslip)' },
      { key: 'payroll.calculate', label: 'Chạy công thức tính lương tự động' },
      { key: 'payroll.finalize', label: 'Chốt kỳ lương & khóa sổ thanh toán' },
    ],
  },
  {
    id: 'projects',
    title: 'Dự án & Kanban',
    sectionHeader: 'DỰ ÁN, SQUAD & BẢNG KANBAN',
    permissions: [
      { key: 'project.read', label: 'Xem danh sách dự án, Squad & Task' },
      { key: 'project.write', label: 'Khởi tạo dự án & điều phối công việc' },
    ],
  },
  {
    id: 'analytics',
    title: 'Đánh giá & 9-Box',
    sectionHeader: 'PHÂN TÍCH BIẾN ĐỘNG & ĐÁNH GIÁ 9-BOX',
    permissions: [
      { key: 'dashboard.read', label: 'Xem bảng điều khiển KPI điều hành' },
      { key: 'analytics.read', label: 'Xem ma trận 9-Box & dự báo nghỉ việc' },
      { key: 'analytics.write', label: 'Chấm điểm 9-Box & kích hoạt PIP' },
    ],
  },
  {
    id: 'ai_comms',
    title: 'AI Copilot & Nội bộ',
    sectionHeader: 'TRỢ LÝ AI COPILOT & TRUYỀN THÔNG NỘI BỘ',
    permissions: [
      { key: 'notice.read', label: 'Xem bảng tin nội bộ & sổ tay RAG' },
      { key: 'notice.write', label: 'Đăng thông báo nội bộ toàn công ty' },
      { key: 'ai.query', label: 'Truy vấn trợ lý ảo AI HR Copilot' },
    ],
  },
  {
    id: 'system',
    title: 'Quản trị hệ thống',
    sectionHeader: 'QUẢN TRỊ TÀI KHOẢN & CẤU HÌNH HỆ THỐNG',
    permissions: [
      { key: 'user.read', label: 'Xem danh sách tài khoản hệ thống' },
      { key: 'user.create', label: 'Cấp phát tài khoản đăng nhập mới' },
      { key: 'user.update', label: 'Đổi vai trò, khóa / mở khóa tài khoản' },
      { key: 'user.resetPassword', label: 'Cấp lại mật khẩu tạm thời' },
      { key: 'audit.read', label: 'Truy xuất nhật ký kiểm toán (Audit Log)' },
      { key: 'settings.read', label: 'Xem tham số cấu hình & ma trận phân quyền' },
      { key: 'settings.manage', label: 'Cập nhật cấu hình & ma trận phân quyền' },
    ],
  },
];

const INITIAL_RBAC_MATRIX = {
  'employee.list': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' },
  'employee.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' },
  'employee.create': { CEO: 'all', HR_DIRECTOR: 'all' },
  'employee.update': { CEO: 'all', HR_DIRECTOR: 'all', EMPLOYEE: 'self' },
  'employee.delete': { CEO: 'all', HR_DIRECTOR: 'all' },
  'department.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'all', EMPLOYEE: 'all' },
  'department.write': { CEO: 'all', HR_DIRECTOR: 'all' },
  'contract.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' },
  'contract.write': { CEO: 'all', HR_DIRECTOR: 'all' },
  'attendance.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' },
  'attendance.checkIn': { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self', KIOSK: 'self' },
  'attendance.appeal': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' },
  'attendance.manage': { CEO: 'all', HR_DIRECTOR: 'all' },
  'kiosk.DynamicQR': { CEO: 'all', HR_DIRECTOR: 'all', KIOSK: 'self' },
  'leave.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' },
  'leave.create': { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self' },
  'leave.cancel': { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self' },
  'leave.approve': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' },
  'ot.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' },
  'ot.create': { LINE_MANAGER: 'self', EMPLOYEE: 'self' },
  'ot.approve': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' },
  'medical.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' },
  'medical.create': { CEO: 'self', HR_DIRECTOR: 'self', LINE_MANAGER: 'self', EMPLOYEE: 'self' },
  'medical.approve': { CEO: 'all', HR_DIRECTOR: 'all' },
  'payroll.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'self', EMPLOYEE: 'self' },
  'payroll.calculate': { CEO: 'all', HR_DIRECTOR: 'all' },
  'payroll.finalize': { CEO: 'all', HR_DIRECTOR: 'all' },
  'project.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'all', EMPLOYEE: 'all' },
  'project.write': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' },
  'notice.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'all', EMPLOYEE: 'all' },
  'notice.write': { CEO: 'all', HR_DIRECTOR: 'all' },
  'dashboard.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' },
  'analytics.read': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' },
  'analytics.write': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department' },
  'ai.query': { CEO: 'all', HR_DIRECTOR: 'all', LINE_MANAGER: 'department', EMPLOYEE: 'self' },
  'user.read': { CEO: 'all', HR_DIRECTOR: 'all', ADMIN: 'all' },
  'user.create': { CEO: 'all', HR_DIRECTOR: 'all', ADMIN: 'all' },
  'user.update': { CEO: 'all', HR_DIRECTOR: 'all', ADMIN: 'all' },
  'user.resetPassword': { CEO: 'all', HR_DIRECTOR: 'all', ADMIN: 'all' },
  'audit.read': { CEO: 'all', ADMIN: 'all' },
  'settings.read': { CEO: 'all', HR_DIRECTOR: 'all' },
  'settings.manage': { CEO: 'all', HR_DIRECTOR: 'all' },
};

const SCOPE_OPTIONS = [
  { value: 'all', label: 'Toàn công ty', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'department', label: 'Theo phòng ban', badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
  { value: 'self', label: 'Cá nhân', badgeClass: 'bg-purple-50 text-purple-800 border-purple-200' },
];

function cloneMatrix(src) {
  const out = {};
  for (const [k, v] of Object.entries(src || {})) {
    out[k] = { ...(v || {}) };
  }
  return out;
}

function inferRoleDefaultScopeValue(role) {
  const raw = String(role?.defaultScope || '').toLowerCase();
  if (raw.includes('all') || raw.includes('toàn')) return 'all';
  if (raw.includes('self') || raw.includes('cá nhân') || raw.includes('kiosk')) return 'self';
  if (raw.includes('dept') || raw.includes('phòng ban')) return 'department';
  if (role?.key === 'CEO' || role?.key === 'HR_DIRECTOR' || role?.key === 'ADMIN') return 'all';
  if (role?.key === 'LINE_MANAGER') return 'department';
  return 'self';
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function PermissionsPage() {
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'accounts';

  const setActiveTab = useCallback(
    (tabId) => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tabId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const actorRole = currentUser?.role || currentUser?.role_code || 'CEO';
  const canManageUsers = ['CEO', 'HR_DIRECTOR', 'ADMIN'].includes(actorRole);
  const canEditMatrix = ['CEO', 'HR_DIRECTOR', 'ADMIN'].includes(actorRole);
  const canViewAudit = ['CEO', 'ADMIN', 'HR_DIRECTOR'].includes(actorRole);

  // Toast state
  const [toast, setToast] = useState(null);
  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ============================================================================
  // TAB 1 STATE: TÀI KHOẢN (ACCOUNTS)
  // ============================================================================
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountRoleFilter, setAccountRoleFilter] = useState('ALL');
  const [accountPage, setAccountPage] = useState(1);
  const accountPageSize = 15;

  // Employees list for linking new accounts
  const [employees, setEmployees] = useState([]);

  // Account Modals
  const [createAccountModalOpen, setCreateAccountModalOpen] = useState(false);
  const [createAccountForm, setCreateAccountForm] = useState({
    employeeId: '',
    email: '',
    role: 'EMPLOYEE',
    password: '',
  });
  const [editAccountModal, setEditAccountModal] = useState(null); // { user, role, isActive }
  const [tempPasswordModal, setTempPasswordModal] = useState(null); // { email, fullName, password, title }
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [accountSubmitting, setAccountSubmitting] = useState(false);

  // ============================================================================
  // TAB 2 STATE: MA TRẬN PHÂN QUYỀN (RBAC MATRIX & ROLE CRUD)
  // ============================================================================
  const [roleCatalog, setRoleCatalog] = useState(DEFAULT_ROLE_CATALOG);
  const [rbacMatrix, setRbacMatrix] = useState(() => cloneMatrix(INITIAL_RBAC_MATRIX));
  const [savedMatrix, setSavedMatrix] = useState(() => cloneMatrix(INITIAL_RBAC_MATRIX));
  const [defaultMatrix, setDefaultMatrix] = useState(() => cloneMatrix(INITIAL_RBAC_MATRIX));
  const [roleCounts, setRoleCounts] = useState({});
  const [roleScopes, setRoleScopes] = useState({
    CEO: 'all',
    HR_DIRECTOR: 'all',
    LINE_MANAGER: 'department',
    EMPLOYEE: 'self',
    ADMIN: 'all',
    KIOSK: 'self',
  });
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [matrixModuleFilter, setMatrixModuleFilter] = useState('ALL');
  const [matrixSearch, setMatrixSearch] = useState('');

  // Role CRUD modals
  const [roleModal, setRoleModal] = useState(null);
  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState(null);
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  // ============================================================================
  // TAB 3 STATE: LỊCH SỬ THAY ĐỔI (AUDIT LOGS)
  // ============================================================================
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [selectedAuditDetail, setSelectedAuditDetail] = useState(null);

  // ============================================================================
  // TAB 4 STATE: QUYỀN HIỆU LỰC (EFFECTIVE PERMISSIONS)
  // ============================================================================
  const [effectiveMode, setEffectiveMode] = useState('account'); // 'account' | 'role'
  const [effectiveAccountId, setEffectiveAccountId] = useState('');
  const [effectiveRoleCode, setEffectiveRoleCode] = useState('CEO');
  const [effectiveSearch, setEffectiveSearch] = useState('');

  // ============================================================================
  // DATA LOADING
  // ============================================================================
  const loadAccountsData = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const [usersRes, empRes] = await Promise.all([
        userService.getAll({ page: 1, limit: 200 }).catch(() => ({ data: [] })),
        employeeService.getAll({ page: 1, limit: 200 }).catch(() => ({ data: [] })),
      ]);
      const userList = Array.isArray(usersRes?.data)
        ? usersRes.data
        : Array.isArray(usersRes)
        ? usersRes
        : [];
      setAccounts(userList);

      const empList = Array.isArray(empRes?.data)
        ? empRes.data
        : Array.isArray(empRes)
        ? empRes
        : [];
      setEmployees(empList);

      if (userList.length > 0 && !effectiveAccountId) {
        setEffectiveAccountId(userList[0].id);
      }
    } catch (err) {
      showToast('error', err.message || 'Không thể tải danh sách tài khoản');
    } finally {
      setAccountsLoading(false);
    }
  }, [effectiveAccountId, showToast]);

  const applyServerRbacPayload = useCallback((rawRes) => {
    const res = rawRes?.data || rawRes || {};
    if (Array.isArray(res?.roles) && res.roles.length > 0) {
      setRoleCatalog(res.roles);
      const nextScopes = {};
      for (const r of res.roles) {
        nextScopes[r.key] = inferRoleDefaultScopeValue(r);
      }
      setRoleScopes((prev) => ({ ...nextScopes, ...prev }));
    }
    if (res?.matrix && typeof res.matrix === 'object') {
      setRbacMatrix(cloneMatrix(res.matrix));
      setSavedMatrix(cloneMatrix(res.matrix));
    }
    if (res?.defaultMatrix && typeof res.defaultMatrix === 'object') {
      setDefaultMatrix(cloneMatrix(res.defaultMatrix));
    }
    if (res?.roleCounts && typeof res.roleCounts === 'object') {
      setRoleCounts(res.roleCounts);
    }
    if (Array.isArray(res?.recentAuditLogs) && res.recentAuditLogs.length > 0) {
      setAuditLogs((prev) => (prev.length > 0 ? prev : res.recentAuditLogs));
    }
  }, []);

  const loadMatrixData = useCallback(async () => {
    setMatrixLoading(true);
    try {
      const res = await userService.getRbacMatrix();
      applyServerRbacPayload(res);
    } catch {
      // Fallback to default matrix if user is ADMIN (who doesn't have settings.read by default)
      setRbacMatrix(cloneMatrix(INITIAL_RBAC_MATRIX));
      setSavedMatrix(cloneMatrix(INITIAL_RBAC_MATRIX));
    } finally {
      setMatrixLoading(false);
    }
  }, [applyServerRbacPayload]);

  const loadAuditData = useCallback(async () => {
    if (!canViewAudit) return;
    setAuditLoading(true);
    try {
      const res = await userService.listAuditLogs({ page: 1, limit: 60 });
      const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setAuditLogs(items);
    } catch {
      // Keep recentAuditLogs from getRbacRoles when actor does not have direct /audit-logs access
    } finally {
      setAuditLoading(false);
    }
  }, [canViewAudit]);

  const refreshAll = useCallback(() => {
    loadAccountsData();
    loadMatrixData();
    if (activeTab === 'audit') {
      loadAuditData();
    }
  }, [loadAccountsData, loadMatrixData, loadAuditData, activeTab]);

  useEffect(() => {
    loadAccountsData();
    loadMatrixData();
  }, [loadAccountsData, loadMatrixData]);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditData();
    }
  }, [activeTab, loadAuditData]);

  // ============================================================================
  // COMPUTED DATA FOR TAB 1 (TÀI KHOẢN)
  // ============================================================================
  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    return accounts.filter((u) => {
      if (accountRoleFilter !== 'ALL' && u.roleCode !== accountRoleFilter) return false;
      if (!q) return true;
      const loginName = u.email ? u.email.split('@')[0].toLowerCase() : '';
      const empId = String(u.employeeId || '').toLowerCase();
      const fullName = String(u.fullName || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      const dept = String(u.departmentName || '').toLowerCase();
      return (
        loginName.includes(q) ||
        empId.includes(q) ||
        fullName.includes(q) ||
        email.includes(q) ||
        dept.includes(q)
      );
    });
  }, [accounts, accountSearch, accountRoleFilter]);

  const totalAccountPages = Math.max(1, Math.ceil(filteredAccounts.length / accountPageSize));
  const paginatedAccounts = useMemo(() => {
    const safePage = Math.min(accountPage, totalAccountPages);
    const start = (safePage - 1) * accountPageSize;
    return filteredAccounts.slice(start, start + accountPageSize);
  }, [filteredAccounts, accountPage, totalAccountPages]);

  const unlinkedEmployees = useMemo(() => {
    const linkedIds = new Set(accounts.map((a) => a.employeeId).filter(Boolean));
    return employees.filter((e) => !linkedIds.has(e.id));
  }, [employees, accounts]);

  const getRoleBadgeMeta = useCallback(
    (roleCode) => {
      if (ROLE_BADGE_MAP[roleCode]) return ROLE_BADGE_MAP[roleCode];
      const custom = roleCatalog.find((r) => r.key === roleCode);
      if (custom) {
        return {
          label: custom.shortName || custom.name || roleCode,
          pill: custom.badgeClass || 'bg-blue-50 text-blue-700 border border-blue-200',
          dot: custom.dotClass || 'bg-blue-600',
        };
      }
      return {
        label: roleCode || 'Chưa gán',
        pill: 'bg-slate-100 text-slate-700 border border-slate-200',
        dot: 'bg-slate-500',
      };
    },
    [roleCatalog]
  );

  const getUnitDisplay = useCallback((u) => {
    if (u.departmentName) return u.departmentName;
    if (u.roleCode === 'CEO') return 'Ban Giám Đốc';
    if (u.roleCode === 'ADMIN') return 'Quản trị hệ thống';
    if (u.roleCode === 'HR_DIRECTOR') return 'Phòng Nhân sự';
    if (u.roleCode === 'KIOSK') return 'Sảnh chính NEXUS';
    return '—';
  }, []);

  // ============================================================================
  // HANDLERS FOR TAB 1 (TÀI KHOẢN)
  // ============================================================================
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!createAccountForm.email.trim()) {
      showToast('error', 'Vui lòng nhập địa chỉ email đăng nhập');
      return;
    }
    const needsEmployee = !['ADMIN', 'KIOSK'].includes(createAccountForm.role);
    if (needsEmployee && !createAccountForm.employeeId) {
      showToast('error', 'Vui lòng chọn hồ sơ nhân viên liên kết cho vai trò này');
      return;
    }
    setAccountSubmitting(true);
    try {
      const payload = {
        email: createAccountForm.email.trim().toLowerCase(),
        role: createAccountForm.role,
      };
      if (createAccountForm.employeeId) {
        payload.employeeId = createAccountForm.employeeId;
      }
      if (createAccountForm.password.trim()) {
        payload.password = createAccountForm.password.trim();
      }
      const res = await userService.create(payload);
      setCreateAccountModalOpen(false);
      setCreateAccountForm({ employeeId: '', email: '', role: 'EMPLOYEE', password: '' });
      await loadAccountsData();
      if (res?.temporaryPassword) {
        setTempPasswordModal({
          title: 'Đã khởi tạo tài khoản mới',
          email: payload.email,
          fullName: res?.user?.fullName || payload.email,
          password: res.temporaryPassword,
        });
      } else {
        showToast('success', `Đã tạo tài khoản ${payload.email} thành công`);
      }
    } catch (err) {
      showToast('error', err.message || 'Không thể tạo tài khoản');
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleSaveEditAccount = async (e) => {
    e.preventDefault();
    if (!editAccountModal?.user) return;
    const target = editAccountModal.user;
    if (CORE_DEMO_EMAILS.has(target.email) && !editAccountModal.isActive) {
      showToast('error', 'Tài khoản mẫu dùng để kiểm thử đăng nhập không được phép vô hiệu hóa');
      return;
    }
    setAccountSubmitting(true);
    try {
      await userService.update(target.id, {
        role: editAccountModal.role,
        isActive: editAccountModal.isActive,
      });
      setEditAccountModal(null);
      showToast('success', `Đã cập nhật tài khoản ${target.email}`);
      await loadAccountsData();
    } catch (err) {
      showToast('error', err.message || 'Không thể cập nhật tài khoản');
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleResetPassword = async (targetUser) => {
    setAccountSubmitting(true);
    try {
      const res = await userService.resetPassword(targetUser.id);
      const pwd = res?.temporaryPassword || res?.data?.temporaryPassword;
      setEditAccountModal(null);
      if (pwd) {
        setTempPasswordModal({
          title: 'Đã cấp lại mật khẩu tạm thời',
          email: targetUser.email,
          fullName: targetUser.fullName || targetUser.email,
          password: pwd,
        });
      } else {
        showToast('success', `Đã đặt lại mật khẩu cho ${targetUser.email}`);
      }
    } catch (err) {
      showToast('error', err.message || 'Không thể cấp lại mật khẩu');
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleUnlockAccount = async (targetUser) => {
    setAccountSubmitting(true);
    try {
      await userService.unlock(targetUser.id);
      showToast('success', `Đã mở khóa tài khoản ${targetUser.email}`);
      await loadAccountsData();
      setEditAccountModal(null);
    } catch (err) {
      showToast('error', err.message || 'Không thể mở khóa tài khoản');
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleToggleAccountStatus = async (targetUser) => {
    if (CORE_DEMO_EMAILS.has(targetUser.email)) {
      showToast(
        'error',
        `Tài khoản mẫu "${targetUser.email}" được bảo vệ để phục vụ kiểm thử đăng nhập`
      );
      return;
    }
    try {
      await userService.update(targetUser.id, { isActive: !targetUser.isActive });
      showToast(
        'success',
        targetUser.isActive
          ? `Đã tạm khóa tài khoản ${targetUser.email}`
          : `Đã kích hoạt lại tài khoản ${targetUser.email}`
      );
      await loadAccountsData();
    } catch (err) {
      showToast('error', err.message || 'Không thể thay đổi trạng thái tài khoản');
    }
  };

  // ============================================================================
  // COMPUTED & HANDLERS FOR TAB 2 (MA TRẬN PHÂN QUYỀN)
  // ============================================================================
  const filteredPermissionModules = useMemo(() => {
    const q = matrixSearch.trim().toLowerCase();
    return PERMISSION_MODULES.filter((mod) =>
      matrixModuleFilter === 'ALL' ? true : mod.id === matrixModuleFilter
    )
      .map((mod) => ({
        ...mod,
        permissions: mod.permissions.filter(
          (p) =>
            !q ||
            p.key.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q)
        ),
      }))
      .filter((mod) => mod.permissions.length > 0);
  }, [matrixModuleFilter, matrixSearch]);

  const dirtyCellsCount = useMemo(() => {
    let count = 0;
    for (const mod of PERMISSION_MODULES) {
      for (const perm of mod.permissions) {
        for (const r of roleCatalog) {
          const cur = rbacMatrix[perm.key]?.[r.key] || null;
          const orig = savedMatrix[perm.key]?.[r.key] || null;
          if (cur !== orig) count++;
        }
      }
    }
    return count;
  }, [rbacMatrix, savedMatrix, roleCatalog]);

  const canActorModifyRoleColumn = useCallback(
    (roleCode) => {
      if (!canEditMatrix) return false;
      if (actorRole === 'HR_DIRECTOR' && ['CEO', 'ADMIN'].includes(roleCode)) return false;
      return true;
    },
    [canEditMatrix, actorRole]
  );

  const handleTogglePermissionCheckbox = (permKey, roleCode) => {
    if (!canActorModifyRoleColumn(roleCode)) {
      showToast('error', 'Bạn không có quyền thay đổi phân quyền của vai trò này');
      return;
    }
    if (roleCode === 'CEO' && CEO_LOCKED_PERMISSIONS.has(permKey)) {
      showToast('error', `Quyền "${permKey}" là quyền cốt lõi của Tổng Giám Đốc (CEO), không thể gỡ bỏ`);
      return;
    }
    const currentScope = rbacMatrix[permKey]?.[roleCode] || null;
    const defaultRoleScope = roleScopes[roleCode] || 'department';

    setRbacMatrix((prev) => {
      const next = cloneMatrix(prev);
      if (!next[permKey]) next[permKey] = {};
      if (currentScope) {
        delete next[permKey][roleCode];
      } else {
        next[permKey][roleCode] = defaultRoleScope;
      }
      return next;
    });
  };

  const handleCycleCellScope = (permKey, roleCode) => {
    if (!canActorModifyRoleColumn(roleCode)) return;
    if (roleCode === 'CEO' && CEO_LOCKED_PERMISSIONS.has(permKey)) return;
    const currentScope = rbacMatrix[permKey]?.[roleCode];
    if (!currentScope) return;
    const order = ['all', 'department', 'self'];
    const nextScope = order[(order.indexOf(currentScope) + 1) % order.length];
    setRbacMatrix((prev) => {
      const next = cloneMatrix(prev);
      if (!next[permKey]) next[permKey] = {};
      next[permKey][roleCode] = nextScope;
      return next;
    });
  };

  const handleRoleColumnScopeChange = (roleCode, newScope) => {
    if (!canActorModifyRoleColumn(roleCode)) {
      showToast('error', 'Bạn không có quyền thay đổi phạm vi của vai trò này');
      return;
    }
    setRoleScopes((prev) => ({ ...prev, [roleCode]: newScope }));
    // Update all currently checked permissions in visible modules for this role to the selected scope
    setRbacMatrix((prev) => {
      const next = cloneMatrix(prev);
      for (const mod of filteredPermissionModules) {
        for (const perm of mod.permissions) {
          if (roleCode === 'CEO' && CEO_LOCKED_PERMISSIONS.has(perm.key)) continue;
          if (next[perm.key]?.[roleCode]) {
            next[perm.key][roleCode] = newScope;
          }
        }
      }
      return next;
    });
  };

  const handleSaveMatrix = async () => {
    setSavingMatrix(true);
    try {
      const res = await userService.updateRbacMatrix({ matrix: rbacMatrix });
      applyServerRbacPayload(res);
      showToast('success', 'Đã lưu ma trận phân quyền thành công');
    } catch (err) {
      showToast('error', err.message || 'Không thể lưu ma trận phân quyền');
    } finally {
      setSavingMatrix(false);
    }
  };

  const handleResetMatrixToDefault = async () => {
    setSavingMatrix(true);
    try {
      const res = await userService.resetRbacMatrix({});
      applyServerRbacPayload(res);
      showToast('success', 'Đã khôi phục ma trận phân quyền về mặc định chuẩn');
    } catch {
      setRbacMatrix(cloneMatrix(defaultMatrix));
      setSavedMatrix(cloneMatrix(defaultMatrix));
      showToast('success', 'Đã khôi phục ma trận phân quyền về mặc định');
    } finally {
      setSavingMatrix(false);
    }
  };

  // Role CRUD handlers
  const openCreateRoleModal = () => {
    setRoleModal({
      mode: 'create',
      code: '',
      name: '',
      shortName: '',
      level: 'Chuyên trách',
      colorTheme: 'cyan',
      defaultScope: 'Theo phòng ban (DEPT)',
      templateRoleCode: 'LINE_MANAGER',
      summary: '',
    });
  };

  const openEditRoleModal = (role) => {
    setRoleModal({
      mode: 'edit',
      code: role.key,
      name: role.name,
      shortName: role.shortName || role.name,
      level: role.level || 'Chuyên trách',
      colorTheme: role.colorTheme || 'blue',
      defaultScope: role.defaultScope || 'Theo phòng ban (DEPT)',
      summary: role.summary || '',
      isSystem: role.isSystem,
    });
  };

  const handleSaveRoleModal = async (e) => {
    e.preventDefault();
    if (!roleModal) return;
    if (!roleModal.name.trim()) {
      showToast('error', 'Vui lòng nhập tên vai trò');
      return;
    }
    setRoleSubmitting(true);
    try {
      if (roleModal.mode === 'create') {
        const res = await userService.createRbacRole({
          code: roleModal.code.trim() || undefined,
          name: roleModal.name.trim(),
          shortName: roleModal.shortName.trim() || roleModal.name.trim(),
          level: roleModal.level.trim() || 'Chuyên trách',
          colorTheme: roleModal.colorTheme,
          defaultScope: roleModal.defaultScope,
          templateRoleCode: roleModal.templateRoleCode || undefined,
          summary: roleModal.summary.trim(),
        });
        applyServerRbacPayload(res);
        showToast('success', `Đã thêm vai trò "${roleModal.name.trim()}" vào ma trận phân quyền`);
      } else {
        const res = await userService.updateRbacRoleInfo(roleModal.code, {
          name: roleModal.name.trim(),
          shortName: roleModal.shortName.trim() || roleModal.name.trim(),
          level: roleModal.level.trim(),
          colorTheme: roleModal.colorTheme,
          defaultScope: roleModal.defaultScope,
          summary: roleModal.summary.trim(),
        });
        applyServerRbacPayload(res);
        showToast('success', `Đã cập nhật vai trò "${roleModal.name.trim()}"`);
      }
      setRoleModal(null);
    } catch (err) {
      showToast('error', err.message || 'Không thể lưu thông tin vai trò');
    } finally {
      setRoleSubmitting(false);
    }
  };

  const handleConfirmDeleteRole = async () => {
    if (!deleteRoleConfirm) return;
    setRoleSubmitting(true);
    try {
      const res = await userService.deleteRbacRole(deleteRoleConfirm.key);
      applyServerRbacPayload(res);
      showToast('success', `Đã xóa vai trò "${deleteRoleConfirm.name}"`);
      setDeleteRoleConfirm(null);
    } catch (err) {
      showToast('error', err.message || 'Không thể xóa vai trò');
    } finally {
      setRoleSubmitting(false);
    }
  };

  // ============================================================================
  // COMPUTED DATA FOR TAB 3 (LỊCH SỬ THAY ĐỔI)
  // ============================================================================
  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      const action = String(log.action || '');
      if (auditActionFilter === 'RBAC' && !action.includes('RBAC')) return false;
      if (auditActionFilter === 'USER' && !action.includes('USER') && !action.includes('PASSWORD'))
        return false;
      if (!q) return true;
      const actor = String(log.userEmail || log.actorEmail || log.user_email || log.userId || '').toLowerCase();
      const table = String(log.tableName || log.table_name || '').toLowerCase();
      const record = String(log.recordId || log.record_id || '').toLowerCase();
      return (
        action.toLowerCase().includes(q) ||
        actor.includes(q) ||
        table.includes(q) ||
        record.includes(q)
      );
    });
  }, [auditLogs, auditSearch, auditActionFilter]);

  // ============================================================================
  // COMPUTED DATA FOR TAB 4 (QUYỀN HIỆU LỰC)
  // ============================================================================
  const effectiveTarget = useMemo(() => {
    if (effectiveMode === 'account') {
      const acc = accounts.find((a) => a.id === effectiveAccountId) || accounts[0];
      const roleKey = acc?.roleCode || 'EMPLOYEE';
      const roleObj = roleCatalog.find((r) => r.key === roleKey) || DEFAULT_ROLE_CATALOG[3];
      return {
        mode: 'account',
        account: acc,
        roleKey,
        roleObj,
      };
    }
    const roleObj =
      roleCatalog.find((r) => r.key === effectiveRoleCode) ||
      roleCatalog[0] ||
      DEFAULT_ROLE_CATALOG[0];
    return {
      mode: 'role',
      account: null,
      roleKey: roleObj.key,
      roleObj,
    };
  }, [effectiveMode, effectiveAccountId, effectiveRoleCode, accounts, roleCatalog]);

  const effectivePermissionsList = useMemo(() => {
    const roleKey = effectiveTarget.roleKey;
    const q = effectiveSearch.trim().toLowerCase();
    const rows = [];
    for (const mod of PERMISSION_MODULES) {
      for (const perm of mod.permissions) {
        const scope = rbacMatrix[perm.key]?.[roleKey] || null;
        if (!scope) continue;
        if (
          q &&
          !perm.key.toLowerCase().includes(q) &&
          !perm.label.toLowerCase().includes(q) &&
          !mod.title.toLowerCase().includes(q)
        ) {
          continue;
        }
        rows.push({
          moduleTitle: mod.title,
          key: perm.key,
          label: perm.label,
          scope,
          isLocked: roleKey === 'CEO' && CEO_LOCKED_PERMISSIONS.has(perm.key),
        });
      }
    }
    return rows;
  }, [effectiveTarget, rbacMatrix, effectiveSearch]);

  return (
    <div className="space-y-5 pb-12">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle size={18} className="text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-slate-600"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* =====================================================================
          CLEAN HEADER & UNDERLINE TABS (MATCHING REFERENCE SCREENSHOTS 1 & 2)
      ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-6 pt-6 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Người dùng và quyền hạn
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Quản trị tài khoản, ma trận phân quyền và đơn vị.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={refreshAll}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium transition"
            >
              <RefreshCw
                size={15}
                className={accountsLoading || matrixLoading ? 'animate-spin text-[#165DFC]' : ''}
              />
              Làm mới
            </button>

            {activeTab === 'accounts' && canManageUsers && (
              <button
                onClick={() => setCreateAccountModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#165DFC] hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition"
              >
                <Plus size={16} />
                Tạo tài khoản
              </button>
            )}

            {activeTab === 'matrix' && canEditMatrix && (
              <>
                <button
                  onClick={openCreateRoleModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#165DFC] text-sm font-semibold transition"
                >
                  <Plus size={16} />
                  Thêm vai trò
                </button>
                {dirtyCellsCount > 0 && (
                  <button
                    onClick={handleSaveMatrix}
                    disabled={savingMatrix}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#165DFC] hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition disabled:opacity-50"
                  >
                    <Save size={15} />
                    {savingMatrix ? 'Đang lưu...' : `Lưu phân quyền (${dirtyCellsCount})`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 4 Underline Tabs */}
        <div className="flex items-center gap-7 border-t border-slate-100 pt-1 overflow-x-auto">
          {[
            { id: 'accounts', label: 'Tài khoản' },
            { id: 'matrix', label: 'Ma trận phân quyền' },
            { id: 'audit', label: 'Lịch sử thay đổi' },
            { id: 'effective', label: 'Quyền hiệu lực' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                  isActive
                    ? 'border-[#165DFC] text-[#165DFC]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          TAB 1: TÀI KHOẢN (MATCHES SCREENSHOT 1)
      ===================================================================== */}
      {activeTab === 'accounts' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          {/* Search & Role Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={accountSearch}
                onChange={(e) => {
                  setAccountSearch(e.target.value);
                  setAccountPage(1);
                }}
                placeholder="Tìm theo mã đăng nhập, tên, email..."
                className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#165DFC]"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={accountRoleFilter}
                onChange={(e) => {
                  setAccountRoleFilter(e.target.value);
                  setAccountPage(1);
                }}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-[#165DFC]"
              >
                <option value="ALL">Tất cả vai trò ({accounts.length})</option>
                {DEFAULT_ROLE_CATALOG.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name} ({accounts.filter((a) => a.roleCode === r.key).length})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Royal Blue Header Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#165DFC] text-white text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <User size={14} className="opacity-85" />
                      <span>TÊN ĐĂNG NHẬP</span>
                    </div>
                  </th>
                  <th className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <UserPlus size={14} className="opacity-85" />
                      <span>TÊN NGƯỜI DÙNG</span>
                    </div>
                  </th>
                  <th className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <Mail size={14} className="opacity-85" />
                      <span>EMAIL</span>
                    </div>
                  </th>
                  <th className="py-3.5 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <ShieldCheck size={14} className="opacity-85" />
                      <span>VAI TRÒ</span>
                    </div>
                  </th>
                  <th className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <Building2 size={14} className="opacity-85" />
                      <span>ĐƠN VỊ</span>
                    </div>
                  </th>
                  <th className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Sliders size={14} className="opacity-85" />
                      <span>THAO TÁC</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {accountsLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Đang tải danh sách tài khoản...
                    </td>
                  </tr>
                ) : paginatedAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Không tìm thấy tài khoản nào phù hợp với từ khóa tìm kiếm.
                    </td>
                  </tr>
                ) : (
                  paginatedAccounts.map((acc) => {
                    const loginId = acc.email ? acc.email.split('@')[0] : acc.employeeId || '—';
                    const roleBadge = getRoleBadgeMeta(acc.roleCode);
                    const isProtectedDemo = CORE_DEMO_EMAILS.has(acc.email);

                    return (
                      <tr
                        key={acc.id}
                        className={`hover:bg-slate-50/80 transition ${
                          !acc.isActive ? 'opacity-60 bg-slate-50/40' : ''
                        }`}
                      >
                        {/* TÊN ĐĂNG NHẬP */}
                        <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span>{loginId}</span>
                            {acc.employeeId && (
                              <span className="text-[11px] font-normal text-slate-400">
                                ({acc.employeeId})
                              </span>
                            )}
                            {!acc.isActive && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-rose-100 text-rose-700">
                                Đã khóa
                              </span>
                            )}
                          </div>
                        </td>

                        {/* TÊN NGƯỜI DÙNG */}
                        <td className="py-3.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                          {acc.fullName || '—'}
                        </td>

                        {/* EMAIL */}
                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                          {acc.email || '—'}
                        </td>

                        {/* VAI TRÒ */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${roleBadge.pill}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${roleBadge.dot}`} />
                            {roleBadge.label}
                          </span>
                        </td>

                        {/* ĐƠN VỊ */}
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {getUnitDisplay(acc)}
                        </td>

                        {/* THAO TÁC */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              onClick={() =>
                                setEditAccountModal({
                                  user: acc,
                                  role: acc.roleCode || 'EMPLOYEE',
                                  isActive: Boolean(acc.isActive),
                                })
                              }
                              title="Chỉnh sửa vai trò / Đặt lại mật khẩu"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#165DFC] hover:bg-blue-50 transition"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleToggleAccountStatus(acc)}
                              disabled={isProtectedDemo}
                              title={
                                isProtectedDemo
                                  ? 'Tài khoản mẫu kiểm thử được bảo vệ'
                                  : acc.isActive
                                  ? 'Khóa / Vô hiệu hóa tài khoản'
                                  : 'Kích hoạt lại tài khoản'
                              }
                              className={`p-1.5 rounded-lg transition ${
                                isProtectedDemo
                                  ? 'text-slate-200 cursor-not-allowed'
                                  : 'text-rose-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {filteredAccounts.length > accountPageSize && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 text-xs text-slate-500">
              <span>
                Hiển thị {(accountPage - 1) * accountPageSize + 1}–
                {Math.min(accountPage * accountPageSize, filteredAccounts.length)} trên tổng số{' '}
                <strong className="text-slate-700">{filteredAccounts.length}</strong> tài khoản
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setAccountPage((p) => Math.max(1, p - 1))}
                  disabled={accountPage <= 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> Trước
                </button>
                <span className="px-3 py-1.5 font-semibold text-slate-700">
                  Trang {accountPage} / {totalAccountPages}
                </span>
                <button
                  onClick={() => setAccountPage((p) => Math.min(totalAccountPages, p + 1))}
                  disabled={accountPage >= totalAccountPages}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Sau <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: MA TRẬN PHÂN QUYỀN (MATCHES SCREENSHOT 2)
      ===================================================================== */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          {/* 1. Scope Legend Bar */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                Toàn công ty
              </span>
              <span>quyền đã tích có hiệu lực ở mọi phòng ban/đơn vị</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-semibold bg-cyan-50 text-cyan-800 border border-cyan-200">
                Theo phòng ban
              </span>
              <span>chỉ ở phòng ban/đơn vị chọn khi gán vai trò</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                Cá nhân
              </span>
              <span>chỉ thao tác trên hồ sơ, đơn từ và phiếu lương của chính mình</span>
            </div>
          </div>

          {/* 2. Module Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMatrixModuleFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                matrixModuleFilter === 'ALL'
                  ? 'bg-[#165DFC] text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả
            </button>
            {PERMISSION_MODULES.map((mod) => {
              const active = matrixModuleFilter === mod.id;
              return (
                <button
                  key={mod.id}
                  onClick={() => setMatrixModuleFilter(mod.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                    active
                      ? 'bg-[#165DFC] text-white font-semibold shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {mod.title}
                </button>
              );
            })}
          </div>

          {/* 3. Search & Restore Default Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={matrixSearch}
                onChange={(e) => setMatrixSearch(e.target.value)}
                placeholder="Tìm theo mã hoặc tên quyền..."
                className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#165DFC]"
              />
            </div>

            {canEditMatrix && (
              <div className="flex flex-wrap items-center gap-2">
                {dirtyCellsCount > 0 && (
                  <button
                    onClick={() => setRbacMatrix(cloneMatrix(savedMatrix))}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-medium"
                  >
                    Hoàn tác ({dirtyCellsCount})
                  </button>
                )}
                <button
                  onClick={handleResetMatrixToDefault}
                  disabled={savingMatrix}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium transition"
                >
                  <RotateCcw size={14} />
                  Khôi phục mặc định
                </button>
                <button
                  onClick={handleSaveMatrix}
                  disabled={savingMatrix || dirtyCellsCount === 0}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                    dirtyCellsCount > 0
                      ? 'bg-[#165DFC] hover:bg-blue-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Save size={14} />
                  {savingMatrix
                    ? 'Đang lưu...'
                    : dirtyCellsCount > 0
                    ? `Lưu thay đổi (${dirtyCellsCount})`
                    : 'Đã lưu đồng bộ'}
                </button>
              </div>
            )}
          </div>

          {/* 4. Royal Blue Header Matrix Table (Matches Screenshot 2) */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#165DFC] text-white">
                  <th className="py-4 px-5 min-w-[270px] sticky left-0 z-10 bg-[#165DFC] text-xs font-bold uppercase tracking-wider border-r border-blue-500/40">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={15} className="opacity-85" />
                      <span>NHÓM QUYỀN</span>
                    </div>
                  </th>
                  {roleCatalog.map((role) => {
                    const colScope = roleScopes[role.key] || inferRoleDefaultScopeValue(role);
                    const canModifyCol = canActorModifyRoleColumn(role.key);

                    return (
                      <th
                        key={role.key}
                        className="py-3.5 px-3 min-w-[155px] text-center align-top border-r border-blue-500/30 last:border-r-0"
                      >
                        <div className="flex flex-col items-center gap-1">
                          {/* Role Title + Edit/Delete Role Mini Icons */}
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-xs font-bold uppercase tracking-wide">
                              {role.shortName || role.name}
                            </span>
                            {canModifyCol && (
                              <button
                                type="button"
                                onClick={() => openEditRoleModal(role)}
                                title={`Sửa thông tin vai trò ${role.name}`}
                                className="p-0.5 rounded hover:bg-blue-500 text-blue-100 hover:text-white transition"
                              >
                                <Pencil size={11} />
                              </button>
                            )}
                            {canModifyCol && role.key !== 'CEO' && (
                              <button
                                type="button"
                                onClick={() => setDeleteRoleConfirm(role)}
                                title={`Xóa vai trò ${role.name}`}
                                className="p-0.5 rounded hover:bg-rose-500 text-blue-100 hover:text-white transition"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>

                          {/* Role Code */}
                          <span className="text-[11px] font-normal text-blue-100/90 font-mono">
                            {role.key}
                          </span>

                          {/* Scope Select Dropdown inside Header (Exact Screenshot 2 style) */}
                          <select
                            value={colScope}
                            disabled={!canModifyCol}
                            onChange={(e) =>
                              handleRoleColumnScopeChange(role.key, e.target.value)
                            }
                            className={`mt-1 px-2.5 py-1 rounded text-[11px] font-semibold shadow-sm border-0 focus:outline-none cursor-pointer ${
                              colScope === 'all'
                                ? 'bg-amber-50 text-amber-900'
                                : colScope === 'department'
                                ? 'bg-white text-slate-800'
                                : 'bg-purple-50 text-purple-900'
                            }`}
                          >
                            {SCOPE_OPTIONS.map((opt) => (
                              <option
                                key={opt.value}
                                value={opt.value}
                                className="bg-white text-slate-800"
                              >
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredPermissionModules.map((mod) => (
                  <React.Fragment key={mod.id}>
                    {/* Uppercase Module Group Row */}
                    <tr className="bg-slate-50/90">
                      <td
                        colSpan={roleCatalog.length + 1}
                        className="py-2.5 px-5 text-xs font-bold uppercase tracking-wider text-slate-600"
                      >
                        {mod.sectionHeader}
                      </td>
                    </tr>

                    {/* Permission Rows */}
                    {mod.permissions.map((perm) => (
                      <tr key={perm.key} className="hover:bg-slate-50/70 transition">
                        {/* Left Column: Vietnamese Label + Permission Code */}
                        <td className="py-3 px-5 sticky left-0 bg-white border-r border-slate-100">
                          <div className="font-semibold text-slate-800 text-sm">
                            {perm.label}
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            {perm.key}
                          </div>
                        </td>

                        {/* Role Checkbox Cells */}
                        {roleCatalog.map((role) => {
                          const cellScope = rbacMatrix[perm.key]?.[role.key] || null;
                          const isChecked = Boolean(cellScope);
                          const isLockedCeo =
                            role.key === 'CEO' && CEO_LOCKED_PERMISSIONS.has(perm.key);
                          const canModify = canActorModifyRoleColumn(role.key) && !isLockedCeo;

                          return (
                            <td
                              key={role.key}
                              className="py-3 px-3 text-center align-middle border-r border-slate-50 last:border-r-0"
                            >
                              <div className="flex flex-col items-center justify-center gap-0.5">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={!canModify}
                                  onChange={() =>
                                    handleTogglePermissionCheckbox(perm.key, role.key)
                                  }
                                  className={`w-4 h-4 rounded border-slate-300 text-[#165DFC] focus:ring-[#165DFC] ${
                                    canModify
                                      ? 'cursor-pointer accent-[#165DFC]'
                                      : 'cursor-not-allowed opacity-60 accent-slate-400'
                                  }`}
                                />
                                {isLockedCeo ? (
                                  <span className="text-[10px] text-slate-400 leading-tight">
                                    mặc định
                                  </span>
                                ) : isChecked ? (
                                  <button
                                    type="button"
                                    onClick={() => handleCycleCellScope(perm.key, role.key)}
                                    title="Nhấn để chuyển đổi phạm vi quyền (Toàn công ty / Theo phòng ban / Cá nhân)"
                                    className={`text-[10px] leading-tight font-medium hover:underline ${
                                      cellScope === 'all'
                                        ? 'text-amber-700'
                                        : cellScope === 'department'
                                        ? 'text-cyan-700'
                                        : 'text-purple-700'
                                    }`}
                                  >
                                    {cellScope === 'all'
                                      ? 'toàn công ty'
                                      : cellScope === 'department'
                                      ? 'theo phòng ban'
                                      : 'cá nhân'}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: LỊCH SỬ THAY ĐỔI (AUDIT LOGS)
      ===================================================================== */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Tìm theo hành động, người thực hiện, bảng dữ liệu..."
                className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-[#165DFC]"
              />
            </div>

            <div className="flex items-center gap-2">
              {[
                { id: 'ALL', label: 'Tất cả nhật ký' },
                { id: 'RBAC', label: 'Thay đổi vai trò & phân quyền' },
                { id: 'USER', label: 'Tài khoản & mật khẩu' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setAuditActionFilter(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    auditActionFilter === f.id
                      ? 'bg-[#165DFC] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#165DFC] text-white text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">THỜI GIAN</th>
                  <th className="py-3.5 px-4">NGƯỜI THỰC HIỆN</th>
                  <th className="py-3.5 px-4">HÀNH ĐỘNG</th>
                  <th className="py-3.5 px-4">ĐỐI TƯỢNG / BẢNG</th>
                  <th className="py-3.5 px-4 text-right">CHI TIẾT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {auditLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Đang tải lịch sử thay đổi...
                    </td>
                  </tr>
                ) : filteredAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Chưa có bản ghi lịch sử thay đổi nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Clock size={14} className="text-slate-400" />
                          <span>{formatDateTime(log.createdAt || log.created_at)}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {log.userEmail || log.actorEmail || log.user_email || log.userId || 'Hệ thống'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-xs whitespace-nowrap">
                        {(log.tableName || log.table_name || 'system') +
                          (log.recordId || log.record_id
                            ? ` • ${log.recordId || log.record_id}`
                            : '')}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedAuditDetail(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#165DFC] hover:bg-blue-50"
                        >
                          <Eye size={14} /> Xem JSON
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: QUYỀN HIỆU LỰC (EFFECTIVE PERMISSIONS INSPECTOR)
      ===================================================================== */}
      {activeTab === 'effective' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          {/* Selector Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg p-1 bg-slate-100">
                <button
                  onClick={() => setEffectiveMode('account')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    effectiveMode === 'account'
                      ? 'bg-white text-[#165DFC] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tra cứu theo Tài khoản
                </button>
                <button
                  onClick={() => setEffectiveMode('role')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    effectiveMode === 'role'
                      ? 'bg-white text-[#165DFC] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tra cứu theo Vai trò
                </button>
              </div>

              {effectiveMode === 'account' ? (
                <select
                  value={effectiveAccountId}
                  onChange={(e) => setEffectiveAccountId(e.target.value)}
                  className="px-3.5 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 font-medium focus:outline-none focus:border-[#165DFC]"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email ? a.email.split('@')[0] : a.employeeId} — {a.fullName || a.email} (
                      {getRoleBadgeMeta(a.roleCode).label})
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={effectiveRoleCode}
                  onChange={(e) => setEffectiveRoleCode(e.target.value)}
                  className="px-3.5 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 font-medium focus:outline-none focus:border-[#165DFC]"
                >
                  {roleCatalog.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name} ({r.key})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="relative w-full lg:max-w-xs">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={effectiveSearch}
                onChange={(e) => setEffectiveSearch(e.target.value)}
                placeholder="Lọc quyền hiệu lực..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-[#165DFC]"
              />
            </div>
          </div>

          {/* Summary Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200/80 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              {effectiveTarget.mode === 'account' && effectiveTarget.account ? (
                <>
                  <span className="font-bold text-slate-900">
                    {effectiveTarget.account.fullName || effectiveTarget.account.email}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600">{effectiveTarget.account.email}</span>
                  <span className="text-slate-400">•</span>
                </>
              ) : null}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  getRoleBadgeMeta(effectiveTarget.roleKey).pill
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    getRoleBadgeMeta(effectiveTarget.roleKey).dot
                  }`}
                />
                {effectiveTarget.roleObj?.name || effectiveTarget.roleKey}
              </span>
            </div>

            <div className="text-xs font-semibold text-slate-600">
              Tổng quyền được cấp:{' '}
              <span className="text-[#165DFC] font-bold">
                {effectivePermissionsList.length} / 38
              </span>{' '}
              quyền nghiệp vụ
            </div>
          </div>

          {/* Effective Permissions Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#165DFC] text-white text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">PHÂN HỆ NGHIỆP VỤ</th>
                  <th className="py-3.5 px-4">MÃ QUYỀN</th>
                  <th className="py-3.5 px-4">TÊN QUYỀN HẠN</th>
                  <th className="py-3.5 px-4 text-center">PHẠM VI DỮ LIỆU</th>
                  <th className="py-3.5 px-4 text-right">TRẠNG THÁI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {effectivePermissionsList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Không có quyền hiệu lực nào khớp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  effectivePermissionsList.map((item) => (
                    <tr key={item.key} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-medium text-slate-700">{item.moduleTitle}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{item.key}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{item.label}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded text-xs font-semibold border ${
                            item.scope === 'all'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : item.scope === 'department'
                              ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                              : 'bg-purple-50 text-purple-800 border-purple-200'
                          }`}
                        >
                          {item.scope === 'all'
                            ? 'Toàn công ty'
                            : item.scope === 'department'
                            ? 'Theo phòng ban'
                            : 'Cá nhân'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <CheckCircle2 size={14} /> Đang có hiệu lực
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: TẠO TÀI KHOẢN MỚI
      ===================================================================== */}
      {createAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Tạo tài khoản mới</h3>
              <button
                onClick={() => setCreateAccountModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Vai trò đăng nhập *
                </label>
                <select
                  value={createAccountForm.role}
                  onChange={(e) =>
                    setCreateAccountForm((prev) => ({ ...prev, role: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#165DFC]"
                >
                  {DEFAULT_ROLE_CATALOG.filter((r) => ASSIGNABLE_SYSTEM_ROLES.has(r.key)).map(
                    (r) => (
                      <option key={r.key} value={r.key}>
                        {r.name} ({r.key})
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Liên kết hồ sơ nhân viên{' '}
                  {!['ADMIN', 'KIOSK'].includes(createAccountForm.role) ? '*' : '(Tùy chọn)'}
                </label>
                <select
                  value={createAccountForm.employeeId}
                  onChange={(e) => {
                    const empId = e.target.value;
                    const emp = unlinkedEmployees.find((item) => item.id === empId);
                    setCreateAccountForm((prev) => ({
                      ...prev,
                      employeeId: empId,
                      email: emp?.email && !prev.email ? emp.email : prev.email,
                    }));
                  }}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#165DFC]"
                >
                  <option value="">
                    {['ADMIN', 'KIOSK'].includes(createAccountForm.role)
                      ? '— Không liên kết nhân viên (Tài khoản hệ thống/Kiosk) —'
                      : '— Chọn nhân viên chưa có tài khoản —'}
                  </option>
                  {unlinkedEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.id} — {emp.full_name || emp.fullName} ({emp.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Email đăng nhập *
                </label>
                <input
                  type="email"
                  required
                  value={createAccountForm.email}
                  onChange={(e) =>
                    setCreateAccountForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="ví dụ: ten.nhanvien@fwbnexus.vn"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#165DFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Mật khẩu khởi tạo (Để trống để sinh tự động)
                </label>
                <input
                  type="text"
                  value={createAccountForm.password}
                  onChange={(e) =>
                    setCreateAccountForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  placeholder="Để trống hệ thống sẽ tự cấp mật khẩu tạm an toàn"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#165DFC]"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateAccountModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={accountSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#165DFC] hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {accountSubmitting ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: CHỈNH SỬA TÀI KHOẢN / ĐẶT LẠI MẬT KHẨU
      ===================================================================== */}
      {editAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Chỉnh sửa tài khoản</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editAccountModal.user.email}</p>
              </div>
              <button
                onClick={() => setEditAccountModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditAccount} className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Người dùng:</span>
                  <span className="font-semibold text-slate-800">
                    {editAccountModal.user.fullName || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Đơn vị:</span>
                  <span className="font-medium text-slate-700">
                    {getUnitDisplay(editAccountModal.user)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Vai trò (Role)
                </label>
                <select
                  value={editAccountModal.role}
                  onChange={(e) =>
                    setEditAccountModal((prev) => ({ ...prev, role: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#165DFC]"
                >
                  {DEFAULT_ROLE_CATALOG.filter((r) => ASSIGNABLE_SYSTEM_ROLES.has(r.key)).map(
                    (r) => (
                      <option key={r.key} value={r.key}>
                        {r.name} ({r.key})
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    Trạng thái hoạt động
                  </div>
                  <div className="text-xs text-slate-500">
                    Cho phép tài khoản này đăng nhập vào hệ thống
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editAccountModal.isActive}
                  disabled={CORE_DEMO_EMAILS.has(editAccountModal.user.email)}
                  onChange={(e) =>
                    setEditAccountModal((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  className="w-4 h-4 accent-[#165DFC] rounded cursor-pointer"
                />
              </div>

              {/* Security quick actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleResetPassword(editAccountModal.user)}
                  disabled={accountSubmitting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-semibold transition"
                >
                  <KeyRound size={14} /> Cấp lại mật khẩu tạm
                </button>
                {(editAccountModal.user.failedLoginAttempts > 0 ||
                  editAccountModal.user.lockedUntil) && (
                  <button
                    type="button"
                    onClick={() => handleUnlockAccount(editAccountModal.user)}
                    disabled={accountSubmitting}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold transition"
                  >
                    <Unlock size={14} /> Mở khóa đăng nhập sai
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditAccountModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={accountSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#165DFC] hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {accountSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: HIỂN THỊ MẬT KHẨU TẠM THỜI
      ===================================================================== */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{tempPasswordModal.title}</h3>
              <button
                onClick={() => setTempPasswordModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Tài khoản <strong>{tempPasswordModal.email}</strong> đã được cấp mật khẩu tạm thời
              dưới đây. Vui lòng sao chép và gửi cho nhân sự:
            </p>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 text-white font-mono text-sm">
              <span>{tempPasswordModal.password}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(tempPasswordModal.password);
                  setCopiedPassword(true);
                  setTimeout(() => setCopiedPassword(false), 2000);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-sans"
              >
                {copiedPassword ? <Check size={14} /> : <Copy size={14} />}
                {copiedPassword ? 'Đã chép' : 'Sao chép'}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setTempPasswordModal(null)}
                className="px-4 py-2 rounded-xl bg-[#165DFC] text-white text-sm font-semibold"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: THÊM / SỬA VAI TRÒ (ROLE CRUD)
      ===================================================================== */}
      {roleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {roleModal.mode === 'create' ? 'Thêm vai trò mới' : 'Chỉnh sửa vai trò'}
              </h3>
              <button
                onClick={() => setRoleModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRoleModal} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    Tên vai trò *
                  </label>
                  <input
                    type="text"
                    required
                    value={roleModal.name}
                    onChange={(e) =>
                      setRoleModal((prev) => ({
                        ...prev,
                        name: e.target.value,
                        shortName: prev.shortName || e.target.value,
                      }))
                    }
                    placeholder="VD: Kế Toán Trưởng"
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#165DFC]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    Mã vai trò (Code)
                  </label>
                  <input
                    type="text"
                    disabled={roleModal.mode === 'edit'}
                    value={roleModal.code}
                    onChange={(e) =>
                      setRoleModal((prev) => ({
                        ...prev,
                        code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
                      }))
                    }
                    placeholder="Tự động sinh nếu để trống"
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-200 bg-slate-50/60 focus:outline-none focus:border-[#165DFC] disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    Phạm vi mặc định
                  </label>
                  <select
                    value={roleModal.defaultScope}
                    onChange={(e) =>
                      setRoleModal((prev) => ({ ...prev, defaultScope: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#165DFC]"
                  >
                    <option value="Toàn công ty (ALL)">Toàn công ty (ALL)</option>
                    <option value="Theo phòng ban (DEPT)">Theo phòng ban (DEPT)</option>
                    <option value="Cá nhân (SELF)">Cá nhân (SELF)</option>
                  </select>
                </div>

                {roleModal.mode === 'create' ? (
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Sao chép quyền mẫu từ
                    </label>
                    <select
                      value={roleModal.templateRoleCode}
                      onChange={(e) =>
                        setRoleModal((prev) => ({ ...prev, templateRoleCode: e.target.value }))
                      }
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#165DFC]"
                    >
                      <option value="">— Khởi tạo trống —</option>
                      {roleCatalog.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name} ({r.key})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Cấp bậc hiển thị
                    </label>
                    <input
                      type="text"
                      value={roleModal.level}
                      onChange={(e) =>
                        setRoleModal((prev) => ({ ...prev, level: e.target.value }))
                      }
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#165DFC]"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Tông màu nhận diện
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_THEME_OPTIONS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setRoleModal((prev) => ({ ...prev, colorTheme: c.key }))}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                        roleModal.colorTheme === c.key
                          ? 'border-[#165DFC] bg-blue-50/70 text-[#165DFC] font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${c.swatch}`} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRoleModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={roleSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#165DFC] hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {roleSubmitting ? 'Đang lưu...' : 'Lưu vai trò'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: XÁC NHẬN XÓA VAI TRÒ
      ===================================================================== */}
      {deleteRoleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Xác nhận xóa vai trò</h3>
              <button
                onClick={() => setDeleteRoleConfirm(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Bạn có chắc chắn muốn xóa vai trò <strong>{deleteRoleConfirm.name}</strong> (
              <code className="text-xs font-mono">{deleteRoleConfirm.key}</code>) khỏi ma trận
              phân quyền?
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setDeleteRoleConfirm(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDeleteRole}
                disabled={roleSubmitting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {roleSubmitting ? 'Đang xóa...' : 'Xóa vai trò'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 6: CHI TIẾT JSON AUDIT LOG
      ===================================================================== */}
      {selectedAuditDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Chi tiết bản ghi kiểm toán #{selectedAuditDetail.id}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedAuditDetail.action} •{' '}
                  {formatDateTime(
                    selectedAuditDetail.createdAt || selectedAuditDetail.created_at
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelectedAuditDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4 text-xs">
              <div>
                <div className="font-bold uppercase text-slate-500 mb-1">
                  Giá trị cũ (Old Values)
                </div>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 overflow-x-auto">
                  {JSON.stringify(
                    selectedAuditDetail.oldValues || selectedAuditDetail.old_values || {},
                    null,
                    2
                  )}
                </pre>
              </div>
              <div>
                <div className="font-bold uppercase text-slate-500 mb-1">
                  Giá trị mới (New Values)
                </div>
                <pre className="p-3 rounded-xl bg-slate-900 text-emerald-300 overflow-x-auto">
                  {JSON.stringify(
                    selectedAuditDetail.newValues || selectedAuditDetail.new_values || {},
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
