import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import userService from '../services/userService';
import { generateCSVContent, downloadFile } from '../utils/fileExportUtils';
import {
  RBAC_ROLES,
  ROLE_MAP,
  SCOPE_META,
  RBAC_MODULES,
  TOTAL_PERMISSIONS_COUNT,
} from '../utils/rbacMatrixCatalog';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  GitBranch,
  History,
  Layers,
  Lock,
  RotateCcw,
  Save,
  Sparkles,
  ArrowRight,
  Info,
  Eye,
  X,
  Sliders,
} from 'lucide-react';

const CEO_LOCKED_PERMISSIONS = new Set([
  'settings.read',
  'settings.manage',
  'user.read',
  'user.update',
  'audit.read',
]);

const SCOPE_OPTIONS = [
  {
    value: 'all',
    shortLabel: 'ALL',
    label: 'Toàn công ty',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-2xs',
    idleClass: 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200',
  },
  {
    value: 'department',
    shortLabel: 'DEPT',
    label: 'Phòng ban',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-2xs',
    idleClass: 'bg-white text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200',
  },
  {
    value: 'self',
    shortLabel: 'SELF',
    label: 'Cá nhân',
    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-2xs',
    idleClass: 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-200',
  },
  {
    value: 'none',
    shortLabel: '—',
    label: 'Không cấp',
    activeClass: 'bg-slate-700 text-white border-slate-700 shadow-2xs',
    idleClass: 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-700',
  },
];

function buildInitialCatalogMatrix() {
  const mat = {};
  for (const mod of RBAC_MODULES) {
    for (const perm of mod.permissions) {
      mat[perm.key] = { ...(perm.scopes || {}) };
    }
  }
  return mat;
}

function cloneMatrix(matrixObj = {}) {
  const copy = {};
  for (const [k, v] of Object.entries(matrixObj)) {
    copy[k] = { ...(v || {}) };
  }
  return copy;
}

function formatDateTime(value) {
  if (!value) return 'Mặc định hệ thống';
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

export default function PermissionsPage() {
  const { currentRole } = useAuth();
  const actorRole = currentRole?.key || 'EMPLOYEE';
  const canEditRoles = ['CEO', 'HR_DIRECTOR'].includes(actorRole);
  const canReadAuditLogs = ['CEO', 'ADMIN'].includes(actorRole);

  const [activeTab, setActiveTab] = useState('role-editor');
  const [selectedRoleKey, setSelectedRoleKey] = useState('HR_DIRECTOR');

  // Role Permission Matrix State (persisted in PostgreSQL via /api/settings/rbac-roles)
  const [savedMatrix, setSavedMatrix] = useState(() => buildInitialCatalogMatrix());
  const [draftMatrix, setDraftMatrix] = useState(() => buildInitialCatalogMatrix());
  const [roleCounts, setRoleCounts] = useState({
    CEO: 1,
    HR_DIRECTOR: 1,
    LINE_MANAGER: 5,
    EMPLOYEE: 43,
    ADMIN: 0,
    KIOSK: 0,
  });
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState(null);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [toast, setToast] = useState(null);

  // Filters for Tab 1 (Role Editor) & Tab 2 (Full Matrix)
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [grantFilter, setGrantFilter] = useState('ALL'); // ALL | GRANTED | DENIED

  // Audit Logs State (for Role Permission Changes)
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [selectedAuditItem, setSelectedAuditItem] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  const canActorModifyRole = useCallback(
    (targetRoleCode) => {
      if (!canEditRoles) return false;
      if (actorRole === 'CEO') return true;
      if (actorRole === 'HR_DIRECTOR') {
        return !['CEO', 'ADMIN'].includes(targetRoleCode);
      }
      return false;
    },
    [actorRole, canEditRoles]
  );

  const loadRbacMatrix = useCallback(async () => {
    setLoadingMatrix(true);
    try {
      const res = await userService.getRbacRoles();
      if (res?.success && res.data?.matrix) {
        setSavedMatrix(cloneMatrix(res.data.matrix));
        setDraftMatrix(cloneMatrix(res.data.matrix));
        if (res.data.roleCounts) {
          setRoleCounts(res.data.roleCounts);
        }
        setLastUpdatedAt(res.data.updatedAt || null);
        setLastUpdatedBy(res.data.updatedBy || null);
      }
    } catch {
      // Keep local catalog fallback if endpoint fails
    } finally {
      setLoadingMatrix(false);
    }
  }, []);

  const loadRoleAuditLogs = useCallback(async () => {
    if (!canReadAuditLogs) return;
    setLoadingAudit(true);
    try {
      const res = await userService.getAuditLogs({
        table: 'roles',
        limit: 30,
        page: 1,
      });
      if (res?.success && Array.isArray(res.data)) {
        setAuditLogs(res.data);
      }
    } catch {
      // Ignore error
    } finally {
      setLoadingAudit(false);
    }
  }, [canReadAuditLogs]);

  useEffect(() => {
    loadRbacMatrix();
  }, [loadRbacMatrix]);

  useEffect(() => {
    if (activeTab === 'hierarchy' && canReadAuditLogs) {
      loadRoleAuditLogs();
    }
  }, [activeTab, canReadAuditLogs, loadRoleAuditLogs]);

  // Compute statistics per role from draftMatrix
  const roleStatsMap = useMemo(() => {
    const stats = {};
    for (const r of RBAC_ROLES) {
      let granted = 0;
      let allCount = 0;
      let deptCount = 0;
      let selfCount = 0;
      let noneCount = 0;
      let changedCount = 0;

      for (const mod of RBAC_MODULES) {
        for (const perm of mod.permissions) {
          const curScope = draftMatrix[perm.key]?.[r.key] || null;
          const origScope = savedMatrix[perm.key]?.[r.key] || null;
          if (curScope !== origScope) {
            changedCount++;
          }
          if (curScope === 'all') {
            granted++;
            allCount++;
          } else if (curScope === 'department') {
            granted++;
            deptCount++;
          } else if (curScope === 'self') {
            granted++;
            selfCount++;
          } else {
            noneCount++;
          }
        }
      }

      stats[r.key] = {
        granted,
        allCount,
        deptCount,
        selfCount,
        noneCount,
        changedCount,
      };
    }
    return stats;
  }, [draftMatrix, savedMatrix]);

  const selectedRoleMeta = ROLE_MAP[selectedRoleKey] || RBAC_ROLES[0];
  const selectedRoleStats = roleStatsMap[selectedRoleKey] || {
    granted: 0,
    allCount: 0,
    deptCount: 0,
    selfCount: 0,
    noneCount: TOTAL_PERMISSIONS_COUNT,
    changedCount: 0,
  };
  const canModifySelectedRole = canActorModifyRole(selectedRoleKey);

  // Filtered modules for Tab 1 & Tab 2
  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return RBAC_MODULES.filter((mod) =>
      moduleFilter === 'ALL' ? true : mod.id === moduleFilter
    )
      .map((mod) => {
        const matchedPerms = mod.permissions.filter((p) => {
          if (q) {
            const matchKey = p.key.toLowerCase().includes(q);
            const matchLabel = p.label.toLowerCase().includes(q);
            const matchDesc = p.desc.toLowerCase().includes(q);
            if (!matchKey && !matchLabel && !matchDesc) return false;
          }
          if (activeTab === 'role-editor' && grantFilter !== 'ALL') {
            const hasScope = Boolean(draftMatrix[p.key]?.[selectedRoleKey]);
            if (grantFilter === 'GRANTED' && !hasScope) return false;
            if (grantFilter === 'DENIED' && hasScope) return false;
          }
          return true;
        });
        return { ...mod, permissions: matchedPerms };
      })
      .filter((mod) => mod.permissions.length > 0);
  }, [searchQuery, moduleFilter, grantFilter, activeTab, draftMatrix, selectedRoleKey]);

  // Handlers for changing permission scopes of a Role
  const handleSetPermissionScope = (roleKey, permKey, nextScope) => {
    if (!canActorModifyRole(roleKey)) {
      showToast(
        `Vai trò hiện tại của bạn (${actorRole}) không có quyền chỉnh sửa cấu hình của vai trò ${roleKey}.`,
        'warning'
      );
      return;
    }
    if (roleKey === 'CEO' && CEO_LOCKED_PERMISSIONS.has(permKey) && nextScope !== 'all') {
      showToast(
        `Quyền cốt lõi "${permKey}" của Tổng Giám Đốc (CEO) được khóa ở mức Toàn công ty (ALL) để bảo vệ hệ thống.`,
        'warning'
      );
      return;
    }

    setDraftMatrix((prev) => {
      const next = cloneMatrix(prev);
      if (!next[permKey]) next[permKey] = {};
      if (!nextScope || nextScope === 'none') {
        delete next[permKey][roleKey];
      } else {
        next[permKey][roleKey] = nextScope;
      }
      return next;
    });
  };

  const handleSetModuleScopeForRole = (mod, nextScope) => {
    if (!canModifySelectedRole) return;
    setDraftMatrix((prev) => {
      const next = cloneMatrix(prev);
      for (const perm of mod.permissions) {
        if (!next[perm.key]) next[perm.key] = {};
        if (selectedRoleKey === 'CEO' && CEO_LOCKED_PERMISSIONS.has(perm.key)) {
          next[perm.key].CEO = 'all';
          continue;
        }
        if (!nextScope || nextScope === 'none') {
          delete next[perm.key][selectedRoleKey];
        } else {
          next[perm.key][selectedRoleKey] = nextScope;
        }
      }
      return next;
    });
    showToast(
      `Đã gán nhanh phạm vi "${nextScope === 'none' ? 'Không cấp' : nextScope.toUpperCase()}" cho phân hệ "${mod.name}" của vai trò ${selectedRoleMeta.shortName}.`
    );
  };

  const handleSaveRolePermissions = async () => {
    if (!canModifySelectedRole) return;
    setSavingMatrix(true);
    try {
      const permissionsPayload = {};
      for (const mod of RBAC_MODULES) {
        for (const perm of mod.permissions) {
          permissionsPayload[perm.key] = draftMatrix[perm.key]?.[selectedRoleKey] || null;
        }
      }

      const res = await userService.updateRbacRoles({
        roleCode: selectedRoleKey,
        permissions: permissionsPayload,
      });

      if (res?.success && res.data?.matrix) {
        setSavedMatrix(cloneMatrix(res.data.matrix));
        setDraftMatrix(cloneMatrix(res.data.matrix));
        setLastUpdatedAt(res.data.updatedAt || new Date().toISOString());
        setLastUpdatedBy(res.data.updatedBy || currentRole?.employeeId || actorRole);
        showToast(
          `Đã lưu cấu hình phân quyền của vai trò "${selectedRoleMeta.name}" vào cơ sở dữ liệu thành công!`
        );
      }
    } catch (err) {
      showToast(err?.message || 'Không thể lưu cấu hình phân quyền vai trò.', 'error');
    } finally {
      setSavingMatrix(false);
    }
  };

  const handleResetRoleToDefault = async () => {
    if (!canModifySelectedRole) return;
    setSavingMatrix(true);
    try {
      const res = await userService.resetRbacRoles({ roleCode: selectedRoleKey });
      if (res?.success && res.data?.matrix) {
        setSavedMatrix(cloneMatrix(res.data.matrix));
        setDraftMatrix(cloneMatrix(res.data.matrix));
        setLastUpdatedAt(res.data.updatedAt || null);
        showToast(
          `Đã khôi phục quyền hạn của vai trò "${selectedRoleMeta.name}" về mặc định chuẩn doanh nghiệp.`
        );
      }
    } catch (err) {
      showToast(err?.message || 'Không thể khôi phục mặc định vai trò.', 'error');
    } finally {
      setSavingMatrix(false);
    }
  };

  const handleDiscardRoleChanges = () => {
    setDraftMatrix((prev) => {
      const next = cloneMatrix(prev);
      for (const mod of RBAC_MODULES) {
        for (const perm of mod.permissions) {
          if (!next[perm.key]) next[perm.key] = {};
          const savedVal = savedMatrix[perm.key]?.[selectedRoleKey] || null;
          if (savedVal) {
            next[perm.key][selectedRoleKey] = savedVal;
          } else {
            delete next[perm.key][selectedRoleKey];
          }
        }
      }
      return next;
    });
    showToast(`Đã hoàn tác các thay đổi chưa lưu của vai trò ${selectedRoleMeta.shortName}.`);
  };

  const handleExportRoleMatrixCSV = () => {
    const headers = [
      'Phân hệ nghiệp vụ',
      'Mã quyền (Permission Code)',
      'Tên quyền hạn',
      'API Endpoint',
      ...RBAC_ROLES.map((r) => `${r.shortName} (${r.key})`),
    ];
    const rows = [];
    for (const mod of RBAC_MODULES) {
      for (const perm of mod.permissions) {
        rows.push([
          mod.name,
          perm.key,
          perm.label,
          perm.endpoint || perm.desc,
          ...RBAC_ROLES.map((r) => {
            const sc = draftMatrix[perm.key]?.[r.key];
            return sc ? SCOPE_META[sc]?.shortLabel || sc.toUpperCase() : '—';
          }),
        ]);
      }
    }
    const csv = generateCSVContent(headers, rows);
    downloadFile(csv, 'ma-tran-phan-quyen-theo-vai-tro-rbac-2026.csv', 'text/csv;charset=utf-8;');
    showToast(`Đã xuất Ma trận 64 quyền × 6 vai trò ra file CSV.`);
  };

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
              <span>Role-Based Access Control (RBAC) • Phân quyền theo Vai trò Chức danh</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Quản trị Phân quyền theo Vai trò (RBAC)
            </h1>
            <p className="text-sm text-slate-500 max-w-3xl">
              Thiết lập quyền hạn nghiệp vụ và phạm vi truy cập dữ liệu (
              <span className="font-semibold text-emerald-700">Toàn công ty ALL</span> •{' '}
              <span className="font-semibold text-blue-700">Phòng ban DEPT</span> •{' '}
              <span className="font-semibold text-amber-700">Cá nhân SELF</span>) cho từng nhóm{' '}
              <strong className="text-slate-800">Vai trò (Role)</strong> trong doanh nghiệp, thay vì phải
              gán quyền lẻ tẻ trên từng tài khoản.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportRoleMatrixCSV}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Xuất Ma trận Vai trò CSV</span>
            </button>
            <button
              onClick={loadRbacMatrix}
              disabled={loadingMatrix}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingMatrix ? 'animate-spin text-blue-600' : ''}`} />
              <span>Đồng bộ</span>
            </button>
          </div>
        </div>

        {/* 4 Role-Centric Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-800">Tổng số Vai trò Chuẩn</span>
              <span className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-purple-950">{RBAC_ROLES.length}</span>
              <span className="text-xs font-semibold text-purple-700">nhóm vai trò (Roles)</span>
            </div>
            <p className="text-[11px] text-purple-800/80 mt-1">
              CEO • HRD • Trưởng phòng • Nhân viên • Admin • Kiosk
            </p>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-800">Phân hệ Nghiệp vụ</span>
              <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-blue-950">{RBAC_MODULES.length}</span>
              <span className="text-xs font-semibold text-blue-700">phân hệ chức năng</span>
            </div>
            <p className="text-[11px] text-blue-800/80 mt-1">
              Nhân sự, Công, Phép, Lương, Dự án, 9-Box, AI...
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800">Danh mục Quyền hạn</span>
              <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Sliders className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emerald-950">
                {TOTAL_PERMISSIONS_COUNT}
              </span>
              <span className="text-xs font-semibold text-emerald-700">quyền chi tiết (Actions)</span>
            </div>
            <p className="text-[11px] text-emerald-800/80 mt-1">
              Kiểm soát Xem, Thêm, Sửa, Xóa, Phê duyệt, Chốt lương
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800">Cấp độ Phạm vi Dữ liệu</span>
              <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <GitBranch className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-amber-950">3 Cấp</span>
              <span className="text-xs font-semibold text-amber-800">ALL • DEPT • SELF</span>
            </div>
            <p className="text-[11px] text-amber-800/80 mt-1">
              Cập nhật gần nhất: {formatDateTime(lastUpdatedAt)}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-slate-200/80">
          <button
            onClick={() => setActiveTab('role-editor')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'role-editor'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>1. Thiết lập Quyền hạn theo từng Vai trò (6 Vai trò)</span>
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
            <span>2. Ma trận So sánh Tổng thể 6 Vai trò ({TOTAL_PERMISSIONS_COUNT} Quyền)</span>
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
            <span>3. Tháp Phân cấp Vai trò & Luồng Phê duyệt</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: THIẾT LẬP QUYỀN HẠN THEO TỪNG VAI TRÒ (ROLE PERMISSION EDITOR)
         ===================================================================== */}
      {activeTab === 'role-editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: 6 ROLES SELECTOR */}
          <div className="lg:col-span-4 space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Danh mục 6 Vai trò Hệ thống
                </h2>
                <span className="text-[11px] font-semibold text-blue-600">
                  Chọn vai trò để phân quyền
                </span>
              </div>

              <div className="space-y-2.5">
                {RBAC_ROLES.map((role) => {
                  const isSelected = selectedRoleKey === role.key;
                  const rStats = roleStatsMap[role.key] || {
                    granted: 0,
                    changedCount: 0,
                  };
                  const pct = Math.round((rStats.granted / TOTAL_PERMISSIONS_COUNT) * 100);
                  const memberCount = roleCounts[role.key] ?? 0;

                  return (
                    <div
                      key={role.key}
                      onClick={() => setSelectedRoleKey(role.key)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/60 border-blue-500 ring-2 ring-blue-500/15 shadow-xs'
                          : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${role.badgeClass}`}
                            >
                              {role.badge}
                            </span>
                            {rStats.changedCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                +{rStats.changedCount} thay đổi
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-extrabold text-slate-900 mt-1.5">
                            {role.name}
                          </h3>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-extrabold text-slate-900">
                            {rStats.granted}/{TOTAL_PERMISSIONS_COUNT}
                          </span>
                          <span className="block text-[10px] text-slate-400 font-semibold">
                            quyền bật ({pct}%)
                          </span>
                        </div>
                      </div>

                      {/* Permission Coverage Progress Bar */}
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                        <div
                          className={`h-full rounded-full transition-all ${role.dotClass}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2.5 pt-2 border-t border-slate-100">
                        <span>Phạm vi chính: <strong className="text-slate-700">{role.defaultScope}</strong></span>
                        <span className="font-semibold text-slate-600">
                          {memberCount} nhân sự
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: SELECTED ROLE PERMISSION CONFIGURATOR */}
          <div className="lg:col-span-8 space-y-4">
            {/* Selected Role Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${selectedRoleMeta.badgeClass}`}
                    >
                      {selectedRoleMeta.badge}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      • {selectedRoleMeta.hierarchy}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                      {roleCounts[selectedRoleKey] ?? 0} nhân sự thuộc vai trò này
                    </span>
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    Cấu hình Quyền hạn Vai trò: {selectedRoleMeta.name}
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {selectedRoleMeta.summary}
                  </p>
                </div>

                {/* Save & Reset Buttons for Selected Role */}
                {canModifySelectedRole ? (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={savingMatrix}
                      onClick={handleResetRoleToDefault}
                      title="Khôi phục toàn bộ 64 quyền của vai trò này về chuẩn mặc định"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                      <span>Khôi phục Mặc định</span>
                    </button>

                    {selectedRoleStats.changedCount > 0 && (
                      <button
                        type="button"
                        disabled={savingMatrix}
                        onClick={handleDiscardRoleChanges}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <span>Hoàn tác ({selectedRoleStats.changedCount})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={savingMatrix}
                      onClick={handleSaveRolePermissions}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>
                        {savingMatrix
                          ? 'Đang lưu...'
                          : selectedRoleStats.changedCount > 0
                          ? `Lưu Phân quyền Vai trò (${selectedRoleStats.changedCount})`
                          : 'Lưu Phân quyền Vai trò'}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold shrink-0">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {canEditRoles
                        ? `Chỉ CEO mới được sửa vai trò ${selectedRoleMeta.shortName}`
                        : 'Chế độ Xem tra cứu (Read-only)'}
                    </span>
                  </div>
                )}
              </div>

              {/* Scope Breakdown Mini-Cards for Selected Role */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-800 block">
                      Toàn công ty (ALL)
                    </span>
                    <span className="text-[10px] text-emerald-600">Mọi phòng ban</span>
                  </div>
                  <span className="text-lg font-extrabold text-emerald-900">
                    {selectedRoleStats.allCount}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-blue-800 block">
                      Phòng ban (DEPT)
                    </span>
                    <span className="text-[10px] text-blue-600">Nội bộ bộ phận</span>
                  </div>
                  <span className="text-lg font-extrabold text-blue-900">
                    {selectedRoleStats.deptCount}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-amber-800 block">
                      Cá nhân (SELF)
                    </span>
                    <span className="text-[10px] text-amber-700">Hồ sơ bản thân</span>
                  </div>
                  <span className="text-lg font-extrabold text-amber-900">
                    {selectedRoleStats.selfCount}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-700 block">
                      Không cấp (—)
                    </span>
                    <span className="text-[10px] text-slate-400">Chặn HTTP 403</span>
                  </div>
                  <span className="text-lg font-extrabold text-slate-700">
                    {selectedRoleStats.noneCount}
                  </span>
                </div>
              </div>

              {/* Filter Bar inside Role Configurator */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
                <div className="sm:col-span-5 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên quyền, mã quyền (vd: payroll.lock, leave.approve)..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50/60 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="sm:col-span-4">
                  <select
                    value={moduleFilter}
                    onChange={(e) => setModuleFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 text-xs font-semibold text-slate-700"
                  >
                    <option value="ALL">Tất cả 8 phân hệ ({TOTAL_PERMISSIONS_COUNT} quyền)</option>
                    {RBAC_MODULES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.permissions.length})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <select
                    value={grantFilter}
                    onChange={(e) => setGrantFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 text-xs font-semibold text-slate-700"
                  >
                    <option value="ALL">Mọi trạng thái quyền</option>
                    <option value="GRANTED">Đang được cấp quyền ({selectedRoleStats.granted})</option>
                    <option value="DENIED">Không cấp quyền ({selectedRoleStats.noneCount})</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modules & Permissions List for Selected Role */}
            <div className="space-y-4">
              {filteredModules.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-xs text-slate-500">
                  Không tìm thấy quyền hạn nào khớp với bộ lọc hiện tại.
                </div>
              ) : (
                filteredModules.map((mod) => (
                  <div
                    key={mod.id}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden"
                  >
                    {/* Module Header with Quick Batch Scope Setter */}
                    <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-extrabold tracking-wide">{mod.name}</h3>
                        <p className="text-[11px] text-slate-300 mt-0.5">{mod.description}</p>
                      </div>

                      {canModifySelectedRole && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-slate-300 font-semibold mr-1">
                            Gán cả phân hệ:
                          </span>
                          {SCOPE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => handleSetModuleScopeForRole(mod, opt.value)}
                              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white transition-colors cursor-pointer"
                            >
                              {opt.shortLabel}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Permission Rows */}
                    <div className="divide-y divide-slate-100">
                      {mod.permissions.map((perm) => {
                        const currentScope =
                          draftMatrix[perm.key]?.[selectedRoleKey] || 'none';
                        const savedScope =
                          savedMatrix[perm.key]?.[selectedRoleKey] || 'none';
                        const isModified = currentScope !== savedScope;
                        const isCeoLocked =
                          selectedRoleKey === 'CEO' && CEO_LOCKED_PERMISSIONS.has(perm.key);

                        return (
                          <div
                            key={perm.key}
                            className={`px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                              isModified ? 'bg-amber-50/40' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">
                                  {perm.label}
                                </span>
                                <code className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200/80 font-mono text-[11px] font-bold text-slate-700">
                                  {perm.key}
                                </code>
                                {isCeoLocked && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                                    <Lock className="w-3 h-3" />
                                    Quyền gốc CEO
                                  </span>
                                )}
                                {isModified && (
                                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                    Đã chỉnh sửa
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono">{perm.desc}</p>
                            </div>

                            {/* 4-Scope Segmented Control */}
                            <div className="inline-flex items-center gap-1.5 shrink-0">
                              {SCOPE_OPTIONS.map((opt) => {
                                const isActive = currentScope === opt.value;
                                const disabled = !canModifySelectedRole || isCeoLocked;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() =>
                                      handleSetPermissionScope(
                                        selectedRoleKey,
                                        perm.key,
                                        opt.value
                                      )
                                    }
                                    title={`${opt.label} (${opt.shortLabel})`}
                                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-extrabold transition-all ${
                                      isActive ? opt.activeClass : opt.idleClass
                                    } ${
                                      disabled
                                        ? 'opacity-70 cursor-not-allowed'
                                        : 'cursor-pointer'
                                    }`}
                                  >
                                    {opt.shortLabel === '—'
                                      ? 'Tắt (—)'
                                      : `${opt.shortLabel} • ${opt.label}`}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: MA TRẬN SO SÁNH TỔNG THỂ 6 VAI TRÒ (64 QUYỀN × 6 VAI TRÒ)
         ===================================================================== */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo mã quyền hoặc nghiệp vụ (vd: payroll.lock, leave.approve)..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
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

          {/* Full Comparison Matrix Table */}
          <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4 min-w-[280px]">
                    Mã Quyền (Permission Key) & Nghiệp vụ
                  </th>
                  {RBAC_ROLES.map((r) => (
                    <th
                      key={r.key}
                      onClick={() => {
                        setSelectedRoleKey(r.key);
                        setActiveTab('role-editor');
                      }}
                      title={`Nhấn để thiết lập chi tiết vai trò ${r.name}`}
                      className={`py-3.5 px-3 text-center cursor-pointer transition-colors ${
                        selectedRoleKey === r.key ? 'bg-blue-700' : 'hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-extrabold">{r.shortName}</div>
                      <div className="text-[10px] font-normal text-slate-300 mt-0.5">
                        {r.level} ({roleStatsMap[r.key]?.granted || 0}/{TOTAL_PERMISSIONS_COUNT})
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredModules.map((mod) => (
                  <React.Fragment key={mod.id}>
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
                          const scopeVal = draftMatrix[perm.key]?.[r.key] || null;
                          const isHighlighted = selectedRoleKey === r.key;
                          if (!scopeVal) {
                            return (
                              <td
                                key={r.key}
                                className={`py-3 px-3 text-center ${
                                  isHighlighted ? 'bg-blue-50/30' : ''
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
                                isHighlighted ? 'bg-blue-50/40' : ''
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
      )}

      {/* =====================================================================
          TAB 3: THÁP PHÂN CẤP VAI TRÒ & LUỒNG PHÊ DUYỆT
         ===================================================================== */}
      {activeTab === 'hierarchy' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1: Role Hierarchy Pyramid */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Tháp Phân cấp Quyền hạn theo Vai trò (Role Hierarchy)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mọi nhân sự tự động thừa hưởng quyền từ Vai trò chức danh được gán
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-200/80">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-950 text-xs">
                      Cấp 1 — Tổng Giám Đốc (`CEO`)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-purple-200/70 text-purple-900 text-[10px] font-extrabold">
                      Phạm vi: Toàn công ty (ALL)
                    </span>
                  </div>
                  <p className="text-xs text-purple-900/80 mt-1.5">
                    Nắm giữ toàn bộ quyền điều hành chiến lược, phê duyệt cuối cùng đơn từ của cấp
                    Quản lý/HRD, xem toàn bộ bảng lương, đánh giá 9-Box và cấu hình phân quyền cho
                    mọi vai trò.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/80">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-950 text-xs">
                      Cấp 2A — Giám Đốc Nhân Sự (`HR_DIRECTOR`)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-200/70 text-blue-900 text-[10px] font-extrabold">
                      Phạm vi: Toàn công ty (ALL)
                    </span>
                  </div>
                  <p className="text-xs text-blue-900/80 mt-1.5">
                    Quản trị toàn diện nghiệp vụ HR (Tuyển dụng, Hợp đồng, Chấm công, Phê chuẩn nghỉ
                    phép bước 2, Tính & Chốt lương, 9-Box/PIP) và được phép tùy chỉnh quyền của các
                    vai trò cấp dưới (`LINE_MANAGER`, `EMPLOYEE`, `KIOSK`).
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950 text-xs">
                      Cấp 2B — Trưởng Phòng Ban (`LINE_MANAGER`)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-200/70 text-emerald-900 text-[10px] font-extrabold">
                      Phạm vi: Theo phòng ban (DEPT)
                    </span>
                  </div>
                  <p className="text-xs text-emerald-900/80 mt-1.5">
                    Chỉ truy cập dữ liệu, giao việc Kanban, chấm điểm năng lực và duyệt đơn bước 1
                    đối với nhân sự thuộc đúng phòng ban mình phụ trách. Không thể xem lương của
                    nhân viên khác.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-950 text-xs">
                      Cấp 3 — Nhân Viên Chính Thức (`EMPLOYEE`)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-200/70 text-amber-900 text-[10px] font-extrabold">
                      Phạm vi: Cá nhân (SELF)
                    </span>
                  </div>
                  <p className="text-xs text-amber-900/80 mt-1.5">
                    Tự phục vụ trên Cổng Nhân Viên (ESS): chấm công, gửi đơn phép/OT/giải trình, xem
                    phiếu lương của riêng mình và cập nhật tiến độ công việc được giao.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Role-Based Workflow Routing */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Luồng Phê duyệt Đa cấp Theo Vai trò (Role Workflow)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hệ thống tự động định tuyến người duyệt dựa trên Vai trò của người tạo đơn
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2">
                  <div className="text-xs font-extrabold text-emerald-950">
                    Luồng A: Khi vai trò Nhân viên (`EMPLOYEE`) gửi đơn
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                      1. Vai trò `EMPLOYEE`
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                      2. Vai trò `LINE_MANAGER` (`DEPT`)
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 border border-blue-200">
                      3. Vai trò `HR_DIRECTOR` (`ALL`)
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-2">
                  <div className="text-xs font-extrabold text-amber-950">
                    Luồng B: Khi vai trò Quản lý (`LINE_MANAGER` / `HR_DIRECTOR`) gửi đơn
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                      1. Vai trò `LINE_MANAGER` / `HR_DIRECTOR`
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 border border-purple-200">
                      2. Vai trò `CEO` phê duyệt trực tiếp
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-950">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Kiểm soát Phạm vi Trợ lý AI Copilot theo Vai trò</span>
                  </div>
                  <p className="text-xs text-indigo-900/80">
                    Trợ lý AI HR tự động đọc cấu hình vai trò của người hỏi: Vai trò `EMPLOYEE` chỉ
                    được AI trả lời số liệu phép/công/lương của bản thân (`SELF`); vai trò
                    `LINE_MANAGER` được hỏi thống kê phòng ban (`DEPT`); chỉ vai trò `CEO` và
                    `HR_DIRECTOR` mới được hỏi tổng hợp toàn công ty (`ALL`).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Role Permission Change Audit Trail */}
          {canReadAuditLogs && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <History className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Lịch sử Kiểm toán Thay đổi Phân quyền Vai trò
                  </h3>
                </div>
                <button
                  onClick={loadRoleAuditLogs}
                  disabled={loadingAudit}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Thời gian</th>
                      <th className="py-3 px-4">Người thực hiện</th>
                      <th className="py-3 px-4">Sự kiện</th>
                      <th className="py-3 px-4">Vai trò được cập nhật</th>
                      <th className="py-3 px-4 text-right">Chi tiết JSON</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          Chưa có lịch sử chỉnh sửa cấu hình vai trò nào. Hãy thử chỉnh sửa quyền của
                          1 vai trò ở Tab 1 và nhấn "Lưu Phân quyền Vai trò".
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {log.userEmail || 'Hệ thống'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[11px] font-bold">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {ROLE_MAP[log.recordId]?.name || log.recordId}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => setSelectedAuditItem(log)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                              <span>Xem thay đổi</span>
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
        </div>
      )}

      {/* JSON Diff Modal */}
      {selectedAuditItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Chi tiết Thay đổi Phân quyền Vai trò #{selectedAuditItem.id}
                </h3>
                <p className="text-xs text-slate-500">
                  Vai trò: {selectedAuditItem.recordId} • Thực hiện bởi:{' '}
                  {selectedAuditItem.userEmail || 'System'} •{' '}
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
                  Cấu hình Quyền Trước khi lưu (oldValues)
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-900 text-rose-300 font-mono text-[11px] overflow-x-auto">
                  {selectedAuditItem.oldValues
                    ? JSON.stringify(selectedAuditItem.oldValues, null, 2)
                    : '// Mặc định gốc'}
                </pre>
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-700 mb-2">
                  Cấu hình Quyền Sau khi lưu (newValues)
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto">
                  {selectedAuditItem.newValues
                    ? JSON.stringify(selectedAuditItem.newValues, null, 2)
                    : '// Không có dữ liệu'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
