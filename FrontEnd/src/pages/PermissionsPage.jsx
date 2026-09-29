import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/common/Avatar';
import userService from '../services/userService';
import employeeService from '../services/employeeService';
import { generateCSVContent, downloadFile } from '../utils/fileExportUtils';
import {
  RBAC_ROLES,
  ROLE_MAP,
  SCOPE_META,
  RBAC_MODULES,
  TOTAL_PERMISSIONS_COUNT,
  canAssignRole,
  canManageUserWithRole,
} from '../utils/rbacMatrixCatalog';
import {
  ShieldCheck,
  Users,
  KeyRound,
  Lock,
  Unlock,
  Plus,
  Search,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  Copy,
  Check,
  GitBranch,
  History,
  Layers,
  Building2,
  UserCheck,
  ShieldAlert,
  Info,
  ArrowRight,
  Sparkles,
  X,
} from 'lucide-react';

const CORE_DEMO_EMAILS = new Set([
  'ceo@fwbnexus.vn',
  'hrd@fwbnexus.vn',
  'lead@fwbnexus.vn',
  'employee@fwbnexus.vn',
]);

function formatDateTime(value) {
  if (!value) return 'Chưa từng đăng nhập';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRoleScopeSummary(roleKey) {
  switch (roleKey) {
    case 'CEO':
    case 'HR_DIRECTOR':
      return 'ALL';
    case 'LINE_MANAGER':
      return 'DEPT';
    case 'ADMIN':
      return 'ALL';
    case 'EMPLOYEE':
    case 'KIOSK':
    default:
      return 'SELF';
  }
}

function normalizeUserRecord(u, empMap = new Map()) {
  if (!u) return null;
  const roleKey = u.roleCode || u.role || 'EMPLOYEE';
  const emp = u.employeeId ? empMap.get(u.employeeId) : null;
  return {
    ...u,
    role: roleKey,
    roleCode: roleKey,
    avatarUrl:
      u.avatarUrl ||
      emp?.avatarUrl ||
      emp?.avatar_url ||
      emp?.avatar ||
      '/default-avatar.jpg',
    jobTitle:
      u.jobTitle ||
      emp?.jobTitle ||
      emp?.positionName ||
      emp?.position_name ||
      ROLE_MAP[roleKey]?.name ||
      roleKey,
  };
}

export default function PermissionsPage() {
  const { currentRole } = useAuth();
  const actorRole = currentRole?.key || 'EMPLOYEE';
  const canManageAccounts = ['CEO', 'HR_DIRECTOR', 'ADMIN'].includes(actorRole);
  const canReadAuditLogs = ['CEO', 'ADMIN'].includes(actorRole);

  const [activeTab, setActiveTab] = useState(canManageAccounts ? 'users' : 'matrix');

  // Users & Reference State
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userError, setUserError] = useState('');
  const [toast, setToast] = useState(null);

  // Filters for Tab 1 (Users)
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Filters for Tab 2 (RBAC Matrix)
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixModuleFilter, setMatrixModuleFilter] = useState('ALL');
  const [highlightedRole, setHighlightedRole] = useState(actorRole);

  // Audit Logs State (Tab 4)
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditTableFilter, setAuditTableFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [selectedAuditItem, setSelectedAuditItem] = useState(null);

  // Modals State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    employeeId: '',
    email: '',
    role: 'EMPLOYEE',
    password: '',
  });
  const [submittingAction, setSubmittingAction] = useState(false);
  const [tempPasswordModal, setTempPasswordModal] = useState(null);
  const [copiedPwd, setCopiedPwd] = useState(false);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  const loadAccountData = useCallback(async () => {
    if (!canManageAccounts) return;
    setLoadingUsers(true);
    setUserError('');
    try {
      const [usersRes, empRes, deptRes] = await Promise.all([
        userService.getAll({ limit: 100 }),
        employeeService.getAll({ limit: 100 }).catch(() => ({ data: [] })),
        employeeService.getDepartments().catch(() => ({ data: [] })),
      ]);

      const empList = Array.isArray(empRes?.data) ? empRes.data : [];
      const empMap = new Map(empList.map((e) => [e.id, e]));
      setEmployees(empList);

      if (usersRes?.success && Array.isArray(usersRes.data)) {
        setUsers(usersRes.data.map((u) => normalizeUserRecord(u, empMap)));
      }
      if (Array.isArray(deptRes?.data)) {
        setDepartments(deptRes.data);
      }
    } catch (err) {
      setUserError(err?.message || 'Không thể tải danh sách tài khoản hệ thống.');
    } finally {
      setLoadingUsers(false);
    }
  }, [canManageAccounts]);

  const loadAuditLogs = useCallback(async () => {
    if (!canReadAuditLogs) return;
    setLoadingAudit(true);
    setAuditError('');
    try {
      const res = await userService.getAuditLogs({
        table: auditTableFilter || undefined,
        action: auditActionFilter || undefined,
        limit: 60,
        page: 1,
      });
      if (res?.success && Array.isArray(res.data)) {
        setAuditLogs(res.data);
        setAuditTotal(res.pagination?.total ?? res.data.length);
      }
    } catch (err) {
      setAuditError(err?.message || 'Không thể tải nhật ký kiểm toán bảo mật.');
    } finally {
      setLoadingAudit(false);
    }
  }, [canReadAuditLogs, auditTableFilter, auditActionFilter]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  useEffect(() => {
    if (activeTab === 'audit' && canReadAuditLogs) {
      loadAuditLogs();
    }
  }, [activeTab, canReadAuditLogs, loadAuditLogs]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, deptFilter, statusFilter]);

  // Computed KPI Metrics
  const kpiStats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const inactive = users.filter((u) => !u.isActive).length;
    const locked = users.filter(
      (u) => (u.lockedUntil && new Date(u.lockedUntil) > new Date()) || Number(u.failedLoginAttempts) >= 5
    ).length;
    const mustChangePwd = users.filter((u) => u.mustChangePassword).length;
    const privileged = users.filter((u) =>
      ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'ADMIN'].includes(u.role)
    ).length;
    const essAndKiosk = users.filter((u) => ['EMPLOYEE', 'KIOSK'].includes(u.role)).length;

    const countsByRole = RBAC_ROLES.reduce((acc, r) => {
      acc[r.key] = users.filter((u) => u.role === r.key).length;
      return acc;
    }, {});

    return {
      total,
      active,
      inactive,
      locked,
      mustChangePwd,
      privileged,
      essAndKiosk,
      securityAlerts: inactive + locked + mustChangePwd,
      countsByRole,
    };
  }, [users]);

  // Employees without an existing user account
  const unlinkedEmployees = useMemo(() => {
    const linkedIds = new Set(users.map((u) => u.employeeId).filter(Boolean));
    return employees.filter((e) => !linkedIds.has(e.id));
  }, [users, employees]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (deptFilter !== 'ALL' && (u.departmentId || 'NONE') !== deptFilter) return false;

      const isLocked =
        (u.lockedUntil && new Date(u.lockedUntil) > new Date()) ||
        Number(u.failedLoginAttempts) > 0;
      if (statusFilter === 'ACTIVE' && !u.isActive) return false;
      if (statusFilter === 'INACTIVE' && u.isActive) return false;
      if (statusFilter === 'LOCKED' && !isLocked) return false;
      if (statusFilter === 'MUST_CHANGE_PWD' && !u.mustChangePassword) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (u.fullName || '').toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchCode = (u.employeeId || '').toLowerCase().includes(q);
        const matchDept = (u.departmentName || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchCode && !matchDept) return false;
      }
      return true;
    });
  }, [users, roleFilter, deptFilter, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Filtered RBAC Matrix Modules
  const filteredMatrixModules = useMemo(() => {
    const q = matrixSearch.trim().toLowerCase();
    return RBAC_MODULES.filter((mod) =>
      matrixModuleFilter === 'ALL' ? true : mod.id === matrixModuleFilter
    )
      .map((mod) => {
        if (!q) return mod;
        const matchedPerms = mod.permissions.filter(
          (p) =>
            p.key.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q) ||
            p.desc.toLowerCase().includes(q)
        );
        return { ...mod, permissions: matchedPerms };
      })
      .filter((mod) => mod.permissions.length > 0);
  }, [matrixSearch, matrixModuleFilter]);

  // Handlers for Account Actions
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const handleRoleChange = async (targetUser, newRole) => {
    if (!newRole || newRole === targetUser.role) return;
    if (CORE_DEMO_EMAILS.has(String(targetUser.email).toLowerCase())) {
      showToast(
        `Tài khoản mẫu ${targetUser.email} được bảo vệ vai trò mặc định để đảm bảo 4 tài khoản test đăng nhập.`,
        'warning'
      );
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await userService.update(targetUser.id, { role: newRole });
      if (res?.success && res.data) {
        const updated = normalizeUserRecord(res.data, empMap);
        setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? updated : u)));
        showToast(
          `Đã cập nhật vai trò của ${targetUser.fullName || targetUser.email} thành ${ROLE_MAP[newRole]?.name || newRole}.`
        );
      }
    } catch (err) {
      showToast(err?.message || 'Không thể cập nhật vai trò tài khoản.', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleToggleActive = async (targetUser) => {
    if (CORE_DEMO_EMAILS.has(String(targetUser.email).toLowerCase()) && targetUser.isActive) {
      showToast(
        `Không thể vô hiệu hóa tài khoản test mẫu (${targetUser.email}) để đảm bảo đăng nhập kiểm thử.`,
        'warning'
      );
      return;
    }

    const nextActive = !targetUser.isActive;
    setSubmittingAction(true);
    try {
      const res = await userService.update(targetUser.id, { isActive: nextActive });
      if (res?.success && res.data) {
        const updated = normalizeUserRecord(res.data, empMap);
        setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? updated : u)));
        showToast(
          nextActive
            ? `Đã kích hoạt lại tài khoản ${targetUser.email}.`
            : `Đã tạm khóa tài khoản ${targetUser.email}.`
        );
      }
    } catch (err) {
      showToast(err?.message || 'Không thể thay đổi trạng thái tài khoản.', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleResetPassword = async (targetUser) => {
    if (CORE_DEMO_EMAILS.has(String(targetUser.email).toLowerCase())) {
      showToast(
        `Tài khoản test mẫu (${targetUser.email}) giữ nguyên mật khẩu mặc định để phục vụ kiểm thử.`,
        'warning'
      );
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await userService.resetPassword(targetUser.id);
      const tempPwd = res?.temporaryPassword || res?.data?.temporaryPassword;
      if (res?.success && tempPwd) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === targetUser.id
              ? { ...u, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null }
              : u
          )
        );
        setTempPasswordModal({
          title: 'Đã Cấp Lại Mật Khẩu Tạm Thời',
          email: targetUser.email,
          fullName: targetUser.fullName || targetUser.email,
          role: targetUser.role,
          temporaryPassword: tempPwd,
        });
        showToast(`Đã cấp mật khẩu tạm thời mới cho ${targetUser.email}.`);
      }
    } catch (err) {
      showToast(err?.message || 'Không thể đặt lại mật khẩu tạm thời.', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleUnlockUser = async (targetUser) => {
    setSubmittingAction(true);
    try {
      const res = await userService.unlock(targetUser.id);
      if (res?.success && res.data) {
        const updated = normalizeUserRecord(res.data, empMap);
        setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? updated : u)));
        showToast(`Đã mở khóa bảo mật và xóa bộ đếm đăng nhập sai cho ${targetUser.email}.`);
      }
    } catch (err) {
      showToast(err?.message || 'Không thể mở khóa tài khoản.', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSelectEmployeeForCreate = (empId) => {
    const emp = employees.find((e) => e.id === empId);
    setCreateForm((prev) => ({
      ...prev,
      employeeId: empId,
      email: emp?.email || prev.email,
    }));
  };

  const handleCreateUserSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.email.trim()) {
      showToast('Vui lòng nhập địa chỉ email đăng nhập.', 'error');
      return;
    }

    setSubmittingAction(true);
    try {
      const payload = {
        email: createForm.email.trim(),
        role: createForm.role,
      };
      if (createForm.employeeId.trim()) {
        payload.employeeId = createForm.employeeId.trim();
      }
      if (createForm.password.trim()) {
        payload.password = createForm.password.trim();
      }

      const res = await userService.create(payload);
      if (res?.success) {
        const rawCreated = res.data?.user || res.data;
        const createdUser = normalizeUserRecord(rawCreated, empMap);
        const tempPwd = res.temporaryPassword || res.data?.temporaryPassword;
        if (createdUser?.id) {
          setUsers((prev) => [createdUser, ...prev]);
        } else {
          await loadAccountData();
        }
        setIsCreateModalOpen(false);
        setCreateForm({ employeeId: '', email: '', role: 'KIOSK', password: '' });

        if (tempPwd) {
          setTempPasswordModal({
            title: 'Khởi Tạo Tài Khoản Thành Công',
            email: createdUser?.email || payload.email,
            fullName: createdUser?.fullName || payload.email,
            role: createdUser?.role || payload.role,
            temporaryPassword: tempPwd,
          });
        }
        showToast(`Đã tạo tài khoản mới ${payload.email} thành công.`);
      }
    } catch (err) {
      showToast(err?.message || 'Không thể tạo tài khoản mới.', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleExportUsersCSV = () => {
    const headers = [
      'Mã NV',
      'Họ và tên',
      'Email đăng nhập',
      'Vai trò RBAC',
      'Cấp quyền',
      'Phạm vi dữ liệu',
      'Phòng ban',
      'Trạng thái',
      'Đăng nhập gần nhất',
    ];
    const rows = filteredUsers.map((u) => {
      const rMeta = ROLE_MAP[u.role] || ROLE_MAP.EMPLOYEE;
      const scopeKey = getRoleScopeSummary(u.role);
      return [
        u.employeeId || 'N/A',
        u.fullName || 'Tài khoản hệ thống',
        u.email,
        u.role,
        rMeta.level,
        SCOPE_META[scopeKey]?.label || scopeKey,
        u.departmentName || 'Toàn hệ thống',
        u.isActive ? 'Đang hoạt động' : 'Đã khóa',
        formatDateTime(u.lastLoginAt),
      ];
    });
    const csv = generateCSVContent(headers, rows);
    downloadFile(csv, `bao-cao-phan-quyen-tai-khoan-nexus-2026.csv`, 'text/csv;charset=utf-8;');
    showToast(`Đã xuất ${rows.length} bản ghi phân quyền tài khoản ra file CSV.`);
  };

  const handleCopyTempPassword = async (pwd) => {
    try {
      await navigator.clipboard.writeText(pwd);
      setCopiedPwd(true);
      setTimeout(() => setCopiedPwd(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const assignableRolesForActor = useMemo(() => {
    return RBAC_ROLES.filter((r) => canAssignRole(actorRole, r.key));
  }, [actorRole]);

  return (
    <div className="space-y-6 pb-10">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : toast.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {toast.type === 'error' ? (
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : toast.type === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>RBAC Policy Engine • {TOTAL_PERMISSIONS_COUNT} Quyền hạn × 6 Vai trò</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Quản trị Phân quyền & Tài khoản Hệ thống (RBAC)
            </h1>
            <p className="text-sm text-slate-500 max-w-3xl">
              Kiểm soát truy cập dựa trên vai trò (Role-Based Access Control), phạm vi dữ liệu đa cấp
              (<span className="font-semibold text-slate-700">ALL • DEPT • SELF</span>), quy tắc ủy quyền
              cấp phát tài khoản và nhật ký kiểm toán bảo mật thời gian thực.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canManageAccounts && (
              <>
                <button
                  onClick={handleExportUsersCSV}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Xuất Báo cáo CSV</span>
                </button>
                <button
                  onClick={loadAccountData}
                  disabled={loadingUsers}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingUsers ? 'animate-spin text-blue-600' : ''}`} />
                  <span>Làm mới</span>
                </button>
                <button
                  onClick={() => {
                    const defaultRole = assignableRolesForActor[0]?.key || 'EMPLOYEE';
                    setCreateForm({
                      employeeId: '',
                      email: '',
                      role: defaultRole,
                      password: '',
                    });
                    setIsCreateModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cấp Tài khoản Mới</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 5 Live Security KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Tổng Tài khoản</span>
              <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">
                {canManageAccounts ? kpiStats.total : 50}
              </span>
              <span className="text-xs font-medium text-slate-500">tài khoản định danh</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Đồng bộ 100% với hồ sơ nhân sự 2026
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700">Đang Hoạt động</span>
              <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <UserCheck className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emerald-900">
                {canManageAccounts ? kpiStats.active : 50}
              </span>
              <span className="text-xs font-semibold text-emerald-700">
                ({canManageAccounts && kpiStats.total ? Math.round((kpiStats.active / kpiStats.total) * 100) : 100}%)
              </span>
            </div>
            <p className="text-[11px] text-emerald-700/80 mt-1">
              Xác thực JWT Bearer & phiên hợp lệ
            </p>
          </div>

          <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-700">Lãnh đạo & Quản trị</span>
              <span className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-purple-900">
                {canManageAccounts ? kpiStats.privileged : 8}
              </span>
              <span className="text-xs font-medium text-purple-700">CEO • HRD • Lead • Admin</span>
            </div>
            <p className="text-[11px] text-purple-700/80 mt-1">
              Có quyền phê duyệt hoặc quản trị
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800">Nhân viên ESS & Kiosk</span>
              <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-amber-900">
                {canManageAccounts ? kpiStats.essAndKiosk : 42}
              </span>
              <span className="text-xs font-medium text-amber-800">Phạm vi cá nhân (SELF)</span>
            </div>
            <p className="text-[11px] text-amber-800/80 mt-1">
              Cô lập dữ liệu chéo giữa các nhân viên
            </p>
          </div>

          <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-700">Cảnh báo Bảo mật</span>
              <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-rose-900">
                {canManageAccounts ? kpiStats.securityAlerts : 0}
              </span>
              <span className="text-xs font-medium text-rose-700">
                {kpiStats.locked} khóa • {kpiStats.mustChangePwd} MK tạm
              </span>
            </div>
            <p className="text-[11px] text-rose-700/80 mt-1">
              Tự động khóa sau 5 lần sai mật khẩu
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-slate-200/80">
          <button
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>1. Quản lý Tài khoản & Gán Vai trò ({canManageAccounts ? users.length : 50})</span>
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'matrix'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>2. Ma trận Phân quyền Đa cấp ({TOTAL_PERMISSIONS_COUNT} Quyền)</span>
          </button>

          <button
            onClick={() => setActiveTab('hierarchy')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'hierarchy'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            <span>3. Quy tắc Ủy quyền & Luồng Phê duyệt</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>4. Nhật ký Kiểm toán Bảo mật (Audit Logs)</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: QUẢN LÝ TÀI KHOẢN & GÁN VAI TRÒ
         ===================================================================== */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {!canManageAccounts ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Giới hạn Phạm vi Quản trị Tài khoản (`user.read` / `user.update`)
              </h3>
              <p className="text-sm text-slate-600 max-w-xl mx-auto">
                Vai trò hiện tại của bạn là{' '}
                <span className="font-bold text-slate-900">{currentRole?.title}</span>. Theo ma trận
                bảo mật RBAC, chức năng quản lý danh sách tài khoản và đặt lại mật khẩu chỉ dành cho{' '}
                <span className="font-semibold text-purple-700">Tổng Giám Đốc (CEO)</span>,{' '}
                <span className="font-semibold text-blue-700">Giám Đốc Nhân Sự (HR_DIRECTOR)</span> và{' '}
                <span className="font-semibold text-indigo-700">Quản Trị Hệ Thống (ADMIN)</span>.
              </p>
              <button
                onClick={() => setActiveTab('matrix')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer"
              >
                <span>Xem Ma trận Phân quyền 64 Quyền hạn</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Filter Bar */}
              <div className="p-5 border-b border-slate-200/80 bg-slate-50/50 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm theo tên, mã NV (NV-xxxx), email, phòng ban..."
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="ALL">Tất cả vai trò RBAC ({users.length})</option>
                      {RBAC_ROLES.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.badge} — {r.name} ({kpiStats.countsByRole[r.key] || 0})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="ALL">Tất cả phòng ban</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="ALL">Mọi trạng thái</option>
                      <option value="ACTIVE">Đang hoạt động</option>
                      <option value="INACTIVE">Đã vô hiệu hóa</option>
                      <option value="LOCKED">Bị khóa / Nhập sai MK</option>
                      <option value="MUST_CHANGE_PWD">Cần đổi mật khẩu tạm</option>
                    </select>
                  </div>
                </div>

                {/* Role Quick Filter Pills */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setRoleFilter('ALL')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        roleFilter === 'ALL'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Tất cả ({users.length})
                    </button>
                    {RBAC_ROLES.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => setRoleFilter(r.key === roleFilter ? 'ALL' : r.key)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                          roleFilter === r.key
                            ? r.badgeClass
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {r.shortName}: {kpiStats.countsByRole[r.key] || 0}
                      </button>
                    ))}
                  </div>

                  <span className="text-xs text-slate-500">
                    Hiển thị <strong className="text-slate-800">{filteredUsers.length}</strong> /{' '}
                    {users.length} tài khoản
                  </span>
                </div>
              </div>

              {userError && (
                <div className="m-5 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{userError}</span>
                </div>
              )}

              {/* Accounts Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-4">Nhân sự & Định danh</th>
                      <th className="py-3.5 px-4">Email & Phòng ban</th>
                      <th className="py-3.5 px-4">Vai trò RBAC (Role)</th>
                      <th className="py-3.5 px-4">Phạm vi Dữ liệu</th>
                      <th className="py-3.5 px-4">Trạng thái Bảo mật</th>
                      <th className="py-3.5 px-4 text-right">Thao tác Quản trị</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {loadingUsers ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          Đang tải danh sách phân quyền tài khoản...
                        </td>
                      </tr>
                    ) : paginatedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          Không tìm thấy tài khoản nào khớp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      paginatedUsers.map((u) => {
                        const rMeta = ROLE_MAP[u.role] || ROLE_MAP.EMPLOYEE;
                        const scopeKey = getRoleScopeSummary(u.role);
                        const scopeMeta = SCOPE_META[scopeKey] || SCOPE_META.SELF;
                        const isSelf =
                          (currentRole?.userId && u.id === currentRole.userId) ||
                          (currentRole?.email &&
                            String(u.email).toLowerCase() === String(currentRole.email).toLowerCase());
                        const isCoreDemo = CORE_DEMO_EMAILS.has(String(u.email).toLowerCase());
                        const canManageTarget =
                          canManageUserWithRole(actorRole, u.role) && !isSelf;
                        const isLocked =
                          (u.lockedUntil && new Date(u.lockedUntil) > new Date()) ||
                          Number(u.failedLoginAttempts) >= 5;

                        return (
                          <tr
                            key={u.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            {/* Employee Info */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  src={u.avatarUrl || '/default-avatar.jpg'}
                                  name={u.fullName || u.email}
                                  size="md"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-900 truncate">
                                      {u.fullName || 'Tài khoản Hệ thống'}
                                    </span>
                                    {isCoreDemo && (
                                      <span
                                        title="Tài khoản mẫu dùng để kiểm thử nhanh 4 cấp bậc"
                                        className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold"
                                      >
                                        TK Test Mẫu
                                      </span>
                                    )}
                                    {isSelf && (
                                      <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                                        Bạn
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                    <span className="font-mono font-semibold text-slate-700">
                                      {u.employeeId || 'SYS-ACC'}
                                    </span>
                                    <span>•</span>
                                    <span className="truncate">{u.jobTitle || rMeta.name}</span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Email & Department */}
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-slate-800">{u.email}</div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">
                                  {u.departmentName || 'Toàn hệ thống'}
                                </span>
                              </div>
                            </td>

                            {/* Role Selector */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-1">
                                <select
                                  value={u.role}
                                  disabled={!canManageTarget || isCoreDemo || submittingAction}
                                  onChange={(e) => handleRoleChange(u, e.target.value)}
                                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                    rMeta.badgeClass
                                  } ${
                                    !canManageTarget || isCoreDemo
                                      ? 'opacity-85 cursor-not-allowed'
                                      : 'cursor-pointer hover:shadow-2xs'
                                  }`}
                                >
                                  {RBAC_ROLES.map((roleOpt) => {
                                    const allowed =
                                      roleOpt.key === u.role ||
                                      canAssignRole(actorRole, roleOpt.key);
                                    return (
                                      <option
                                        key={roleOpt.key}
                                        value={roleOpt.key}
                                        disabled={!allowed}
                                      >
                                        {roleOpt.badge} — {roleOpt.name}
                                      </option>
                                    );
                                  })}
                                </select>
                                <span className="text-[10px] text-slate-400">
                                  {rMeta.hierarchy}
                                </span>
                              </div>
                            </td>

                            {/* Data Scope */}
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${scopeMeta.badgeClass}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${scopeMeta.dotClass}`} />
                                <span>
                                  {scopeMeta.shortLabel}: {scopeMeta.label}
                                </span>
                              </span>
                            </td>

                            {/* Security Status */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {u.isActive ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      Hoạt động
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                      Đã khóa
                                    </span>
                                  )}

                                  {isLocked && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-bold">
                                      Khóa bảo mật ({u.failedLoginAttempts} lần sai)
                                    </span>
                                  )}

                                  {u.mustChangePassword && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                                      MK tạm
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  Đăng nhập: {formatDateTime(u.lastLoginAt)}
                                </span>
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={!canManageTarget || isCoreDemo || submittingAction}
                                  onClick={() => handleResetPassword(u)}
                                  title={
                                    isCoreDemo
                                      ? 'Tài khoản test mẫu giữ mật khẩu mặc định Password@123'
                                      : 'Cấp lại mật khẩu tạm thời (One-Time Password)'
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 text-slate-600 text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                  <span>Đặt lại MK</span>
                                </button>

                                {(isLocked || Number(u.failedLoginAttempts) > 0) && (
                                  <button
                                    type="button"
                                    disabled={!canManageTarget || submittingAction}
                                    onClick={() => handleUnlockUser(u)}
                                    title="Mở khóa đăng nhập và đặt lại số lần sai mật khẩu về 0"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-40"
                                  >
                                    <Unlock className="w-3.5 h-3.5" />
                                    <span>Gỡ khóa</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  disabled={!canManageTarget || isCoreDemo || submittingAction}
                                  onClick={() => handleToggleActive(u)}
                                  title={
                                    u.isActive
                                      ? 'Vô hiệu hóa quyền đăng nhập của tài khoản này'
                                      : 'Kích hoạt lại tài khoản'
                                  }
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                    u.isActive
                                      ? 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  }`}
                                >
                                  {u.isActive ? (
                                    <>
                                      <Lock className="w-3.5 h-3.5" />
                                      <span>Khóa</span>
                                    </>
                                  ) : (
                                    <>
                                      <Unlock className="w-3.5 h-3.5" />
                                      <span>Mở lại</span>
                                    </>
                                  )}
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
              <div className="px-5 py-3.5 border-t border-slate-200/80 bg-slate-50/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                <div>
                  Trang <strong className="text-slate-900">{currentPage}</strong> / {totalPages} •
                  Tổng số <strong className="text-slate-900">{filteredUsers.length}</strong> tài khoản
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                  >
                    Trước
                  </button>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                  >
                    Tiếp theo
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: MA TRẬN PHÂN QUYỀN RBAC ĐA CẤP (64 QUYỀN × 6 VAI TRÒ)
         ===================================================================== */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          {/* 6 Role Cards Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {RBAC_ROLES.map((r) => {
              const isSelected = highlightedRole === r.key;
              const liveCount = kpiStats.countsByRole[r.key] || 0;
              return (
                <div
                  key={r.key}
                  onClick={() => setHighlightedRole(r.key)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/40 border-blue-400 ring-2 ring-blue-500/15 shadow-xs'
                      : 'bg-white border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${r.badgeClass}`}
                      >
                        {r.badge}
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 mt-2">{r.name}</h3>
                      <p className="text-xs font-medium text-slate-500">{r.hierarchy}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-extrabold text-slate-900">
                        {canManageAccounts ? liveCount : r.key === 'EMPLOYEE' ? 43 : r.key === 'LINE_MANAGER' ? 5 : 1}
                      </span>
                      <span className="block text-[10px] font-semibold text-slate-400 uppercase">
                        Tài khoản
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mt-3 leading-relaxed">{r.summary}</p>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Phạm vi mặc định:</span>
                    <span className="font-bold text-slate-800">{r.defaultScope}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Matrix Filter & Legend Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={matrixSearch}
                    onChange={(e) => setMatrixSearch(e.target.value)}
                    placeholder="Tìm theo mã quyền (vd: payroll.finalize, leave.approve_hr)..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <select
                  value={matrixModuleFilter}
                  onChange={(e) => setMatrixModuleFilter(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">Tất cả 8 phân hệ ({TOTAL_PERMISSIONS_COUNT} quyền)</option>
                  {RBAC_MODULES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.permissions.length} quyền)
                    </option>
                  ))}
                </select>
              </div>

              {/* Scope Legend */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 font-semibold mr-1">Chú giải phạm vi:</span>
                {['ALL', 'DEPT', 'SELF'].map((k) => {
                  const sc = SCOPE_META[k];
                  return (
                    <span
                      key={sc.key}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${sc.badgeClass}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dotClass}`} />
                      <span>
                        {sc.shortLabel} — {sc.label}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4 min-w-[280px]">Mã Quyền (Permission Key) & Nghiệp vụ</th>
                    {RBAC_ROLES.map((r) => (
                      <th
                        key={r.key}
                        onClick={() => setHighlightedRole(r.key)}
                        className={`py-3.5 px-3 text-center cursor-pointer transition-colors ${
                          highlightedRole === r.key ? 'bg-blue-700' : 'hover:bg-slate-800'
                        }`}
                      >
                        <div className="font-extrabold">{r.shortName}</div>
                        <div className="text-[10px] font-normal text-slate-300 mt-0.5">
                          {r.level}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredMatrixModules.map((mod) => (
                    <React.Fragment key={mod.id}>
                      {/* Module Group Header */}
                      <tr className="bg-slate-100/90">
                        <td colSpan={7} className="py-2.5 px-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-extrabold text-slate-900 text-xs">
                                {mod.name}
                              </span>
                              <span className="text-slate-500 text-[11px] ml-2">
                                — {mod.description}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-600">
                              {mod.permissions.length} quyền
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Permissions Rows */}
                      {mod.permissions.map((perm) => (
                        <tr key={perm.key} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <code className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px] font-bold border border-slate-200/80">
                                {perm.key}
                              </code>
                              <span className="font-bold text-slate-900">{perm.label}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">{perm.desc}</p>
                          </td>

                          {RBAC_ROLES.map((r) => {
                            const scopeVal = perm.scopes[r.key] || null;
                            const isRoleHighlighted = highlightedRole === r.key;
                            if (!scopeVal) {
                              return (
                                <td
                                  key={r.key}
                                  className={`py-3 px-3 text-center ${
                                    isRoleHighlighted ? 'bg-blue-50/30' : ''
                                  }`}
                                >
                                  <span className="text-slate-300 font-bold">—</span>
                                </td>
                              );
                            }
                            const sMeta = SCOPE_META[scopeVal] || SCOPE_META.SELF;
                            return (
                              <td
                                key={r.key}
                                className={`py-3 px-3 text-center ${
                                  isRoleHighlighted ? 'bg-blue-50/40' : ''
                                }`}
                              >
                                <span
                                  title={`${r.name}: ${sMeta.description}`}
                                  className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${sMeta.badgeClass}`}
                                >
                                  {sMeta.shortLabel}
                                </span>
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
        </div>
      )}

      {/* =====================================================================
          TAB 3: QUY TẮC ỦY QUYỀN & LUỒNG PHÊ DUYỆT
         ===================================================================== */}
      {activeTab === 'hierarchy' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Delegation Rules */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Quy tắc Ủy quyền Cấp phát Tài khoản (`roleRules.js`)
                </h3>
                <p className="text-xs text-slate-500">
                  Chặn leo thang đặc quyền (Privilege Escalation Prevention) tại tầng Backend
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-200/80">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-950 text-xs">
                    Cấp 1 — Tổng Giám Đốc (CEO)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-200/70 text-purple-900 text-[10px] font-extrabold">
                    Toàn quyền Ủy quyền
                  </span>
                </div>
                <p className="text-xs text-purple-900/80 mt-1.5">
                  Được phép khởi tạo, gán vai trò, đặt lại mật khẩu tạm và khóa/mở khóa cho tất cả 6
                  vai trò: <code className="font-mono font-bold">CEO</code>,{' '}
                  <code className="font-mono font-bold">HR_DIRECTOR</code>,{' '}
                  <code className="font-mono font-bold">LINE_MANAGER</code>,{' '}
                  <code className="font-mono font-bold">EMPLOYEE</code>,{' '}
                  <code className="font-mono font-bold">ADMIN</code>,{' '}
                  <code className="font-mono font-bold">KIOSK</code>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/80">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-950 text-xs">
                    Cấp 2A — Giám Đốc Nhân Sự (HR_DIRECTOR) & Quản Trị Hệ Thống (ADMIN)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-200/70 text-blue-900 text-[10px] font-extrabold">
                    Ủy quyền Cấp dưới
                  </span>
                </div>
                <p className="text-xs text-blue-900/80 mt-1.5">
                  Được phép cấp phát tài khoản thuộc khối vận hành:{' '}
                  <code className="font-mono font-bold">LINE_MANAGER</code>,{' '}
                  <code className="font-mono font-bold">EMPLOYEE</code>, và{' '}
                  <code className="font-mono font-bold">KIOSK</code>. Hệ thống tự động chặn (`403
                  FORBIDDEN`) nếu HRD hoặc ADMIN cố tình nâng quyền lên{' '}
                  <code className="font-mono">CEO</code> / <code className="font-mono">ADMIN</code>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">
                    Quy tắc Chống Tự Khóa & Tự Nâng Quyền (Self-Protection)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-extrabold">
                    Bắt buộc
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1.5">
                  Không tài khoản nào được phép tự hạ/nâng vai trò của chính mình hoặc tự vô hiệu hóa
                  (`isActive = false`) phiên đăng nhập hiện hành của bản thân.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: 2-Step Approval Workflow */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Luồng Phê duyệt Đa cấp Theo Vai trò (Workflow Routing)
                </h3>
                <p className="text-xs text-slate-500">
                  Tự động định tuyến người duyệt dựa trên vai trò của người gửi đơn
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2">
                <div className="text-xs font-extrabold text-emerald-950">
                  Luồng A: Đơn nghỉ phép của Nhân viên (`EMPLOYEE`)
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                    1. Nhân viên gửi đơn
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                    2. Trưởng phòng duyệt (`DEPT`)
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 border border-blue-200">
                    3. Giám đốc Nhân sự phê chuẩn (`ALL`)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Trưởng phòng chỉ thấy và duyệt đơn của nhân sự thuộc đúng phòng ban mình quản lý.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-2">
                <div className="text-xs font-extrabold text-amber-950">
                  Luồng B: Đơn nghỉ phép của Cấp Quản lý (`LINE_MANAGER` & `HR_DIRECTOR`)
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                    1. Trưởng phòng / HRD gửi đơn
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 border border-purple-200">
                    2. Tổng Giám Đốc (`CEO`) phê duyệt trực tiếp
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Đảm bảo tính độc lập: Cấp quản lý không thể tự phê duyệt đơn nghỉ phép của chính mình.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200/80 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-950">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Rào chắn Bảo mật Trợ lý AI Copilot & Dữ liệu Lương</span>
                </div>
                <p className="text-xs text-indigo-900/80">
                  Mọi truy vấn vào <code className="font-mono">/api/ai/copilot</code> và{' '}
                  <code className="font-mono">/api/payroll</code> đều đi qua bộ lọc phạm vi RBAC:
                  Nhân viên chỉ truy xuất được phiếu lương của bản thân (`SELF`), Trưởng phòng chỉ
                  truy xuất KPI/chấm công của phòng mình (`DEPT`), và bảng lương tổng hợp toàn công ty
                  chỉ mở cho `CEO` & `HR_DIRECTOR`.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: NHẬT KÝ KIỂM TOÁN BẢO MẬT (AUDIT LOGS)
         ===================================================================== */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {!canReadAuditLogs ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto">
                <History className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Quyền Truy cập Nhật ký Kiểm toán Bảo mật (`audit.read`)
              </h3>
              <p className="text-sm text-slate-600 max-w-xl mx-auto">
                Để đảm bảo tính toàn vẹn độc lập của dữ liệu kiểm toán (Audit Trail Separation of
                Duties), chỉ <span className="font-bold text-purple-700">Tổng Giám Đốc (CEO)</span> và{' '}
                <span className="font-bold text-indigo-700">Quản Trị Hệ Thống (ADMIN)</span> mới có
                quyền tra cứu lịch sử biến động dữ liệu gốc (`oldValues` / `newValues`).
              </p>
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium">
                <Info className="w-4 h-4 text-blue-600" />
                <span>
                  Mẹo kiểm thử: Chuyển sang tài khoản <strong>ceo@fwbnexus.vn</strong> để xem trực
                  tiếp toàn bộ nhật ký kiểm toán.
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={auditTableFilter}
                    onChange={(e) => setAuditTableFilter(e.target.value)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
                  >
                    <option value="">Tất cả bảng dữ liệu</option>
                    <option value="users">Bảng tài khoản (users)</option>
                    <option value="employees">Bảng nhân sự (employees)</option>
                    <option value="departments">Bảng phòng ban (departments)</option>
                    <option value="leave_requests">Bảng nghỉ phép (leave_requests)</option>
                    <option value="payroll_runs">Bảng kỳ lương (payroll_runs)</option>
                  </select>

                  <select
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
                  >
                    <option value="">Tất cả hành động</option>
                    <option value="CREATE_USER">CREATE_USER (Tạo tài khoản)</option>
                    <option value="UPDATE_USER">UPDATE_USER (Cập nhật vai trò/trạng thái)</option>
                    <option value="RESET_PASSWORD">RESET_PASSWORD (Đặt lại mật khẩu)</option>
                    <option value="UNLOCK_USER">UNLOCK_USER (Mở khóa bảo mật)</option>
                    <option value="INSERT">INSERT (Thêm mới bản ghi)</option>
                    <option value="UPDATE">UPDATE (Cập nhật bản ghi)</option>
                    <option value="DELETE">DELETE (Xóa bản ghi)</option>
                  </select>

                  <button
                    onClick={loadAuditLogs}
                    disabled={loadingAudit}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
                    <span>Tải lại nhật ký</span>
                  </button>
                </div>

                <div className="text-xs text-slate-500">
                  Tổng cộng <strong className="text-slate-900">{auditTotal}</strong> sự kiện kiểm toán
                </div>
              </div>

              {auditError && (
                <div className="m-5 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {auditError}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-4">Thời gian</th>
                      <th className="py-3.5 px-4">Người thực hiện (Actor)</th>
                      <th className="py-3.5 px-4">Hành động</th>
                      <th className="py-3.5 px-4">Bảng & Mã Bản ghi</th>
                      <th className="py-3.5 px-4">Địa chỉ IP</th>
                      <th className="py-3.5 px-4 text-right">Chi tiết Thay đổi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {loadingAudit ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          Đang truy xuất nhật ký kiểm toán bảo mật...
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          Chưa có bản ghi kiểm toán nào khớp với bộ lọc. Hãy thử cập nhật vai trò hoặc
                          tạo tài khoản ở Tab 1 để ghi nhận sự kiện mới.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">
                              {log.userEmail || log.changedByEmail || 'Hệ thống tự động'}
                            </div>
                            {(log.employeeId || log.changedByEmployeeId) && (
                              <div className="text-[11px] text-slate-500 font-mono">
                                {log.employeeId || log.changedByEmployeeId}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[11px] font-bold">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-800">{log.tableName}</span>
                            {log.recordId && (
                              <span className="block text-[10px] font-mono text-slate-400 truncate max-w-[180px]">
                                ID: {log.recordId}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                            {log.ipAddress || '127.0.0.1'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => setSelectedAuditItem(log)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                              <span>Xem JSON Diff</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL 1: CẤP TÀI KHOẢN MỚI (`POST /api/users`)
         ===================================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Cấp Tài Khoản Đăng Nhập Mới
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Liên kết hồ sơ nhân sự và gán vai trò RBAC
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Liên kết Hồ sơ Nhân sự (Tùy chọn cho ADMIN / KIOSK)
                </label>
                <select
                  value={createForm.employeeId}
                  onChange={(e) => handleSelectEmployeeForCreate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium"
                >
                  <option value="">
                    -- Không liên kết hồ sơ NV (Tài khoản Hệ thống / Kiosk độc lập) --
                  </option>
                  {unlinkedEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.id} — {emp.fullName} ({emp.email})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Hiện có {unlinkedEmployees.length} hồ sơ nhân sự chưa có tài khoản đăng nhập.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Địa chỉ Email Đăng nhập <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="vd: kiosk.sanh-b@fwbnexus.vn hoặc ten.nv@fwbnexus.vn"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Vai trò Phân quyền RBAC <span className="text-rose-500">*</span>
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold"
                >
                  {assignableRolesForActor.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.badge} — {r.name} ({r.defaultScope})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Mật khẩu Khởi tạo (Để trống để hệ thống tự sinh mật khẩu tạm thời)
                </label>
                <input
                  type="text"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Tối thiểu 8 ký tự (hoặc để trống để tự sinh OTP)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {submittingAction ? 'Đang khởi tạo...' : 'Xác nhận Cấp Tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: HIỂN THỊ MẬT KHẨU TẠM THỜI (ONE-TIME PASSWORD DISPLAY)
         ===================================================================== */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {tempPasswordModal.title}
                  </h3>
                  <p className="text-xs text-slate-500">{tempPasswordModal.email}</p>
                </div>
              </div>
              <button
                onClick={() => setTempPasswordModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2">
              <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">
                Mật khẩu tạm thời (Chỉ hiển thị 1 lần duy nhất)
              </div>
              <div className="flex items-center justify-between gap-2">
                <code className="text-base font-mono font-extrabold text-emerald-400 select-all">
                  {tempPasswordModal.temporaryPassword}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyTempPassword(tempPasswordModal.temporaryPassword)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer"
                >
                  {copiedPwd ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Đã sao chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Mật khẩu đã được băm (`bcrypt`) vào cơ sở dữ liệu và gắn cờ{' '}
              <code className="font-mono font-bold text-amber-700">mustChangePassword = true</code>.
              Vui lòng gửi mật khẩu tạm này cho nhân sự để đăng nhập.
            </p>

            <div className="flex justify-end">
              <button
                onClick={() => setTempPasswordModal(null)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
              >
                Đã lưu thông tin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: CHI TIẾT JSON DIFF NHẬT KÝ KIỂM TOÁN
         ===================================================================== */}
      {selectedAuditItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Chi tiết Sự kiện Kiểm toán #{selectedAuditItem.id} — {selectedAuditItem.action}
                </h3>
                <p className="text-xs text-slate-500">
                  Bảng: {selectedAuditItem.tableName} • Thực hiện bởi:{' '}
                  {selectedAuditItem.userEmail || selectedAuditItem.changedByEmail || 'System'} •{' '}
                  {formatDateTime(selectedAuditItem.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setSelectedAuditItem(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
              <div>
                <div className="text-xs font-bold text-rose-700 mb-2">
                  Giá trị Trước thay đổi (oldValues)
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-900 text-rose-300 font-mono text-[11px] overflow-x-auto">
                  {selectedAuditItem.oldValues
                    ? JSON.stringify(selectedAuditItem.oldValues, null, 2)
                    : '// Không có dữ liệu cũ (Bản ghi mới)'}
                </pre>
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-700 mb-2">
                  Giá trị Sau thay đổi (newValues)
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto">
                  {selectedAuditItem.newValues
                    ? JSON.stringify(selectedAuditItem.newValues, null, 2)
                    : '// Không có dữ liệu mới'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
