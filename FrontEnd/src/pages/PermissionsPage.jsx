import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import userService from '../services/userService';
import { generateCSVContent, downloadFile } from '../utils/fileExportUtils';
import {
  RBAC_ROLES,
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
  Eye,
  X,
  Sliders,
  Plus,
  Pencil,
  Trash2,
  Copy,
} from 'lucide-react';

const CEO_LOCKED_PERMISSIONS = new Set([
  'settings.read',
  'settings.manage',
  'user.read',
  'user.update',
  'audit.read',
]);

const COLOR_THEME_OPTIONS = [
  { key: 'purple', label: 'Tím', dot: 'bg-purple-600', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  { key: 'blue', label: 'Xanh dương', dot: 'bg-blue-600', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'emerald', label: 'Xanh ngọc', dot: 'bg-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'amber', label: 'Vàng cam', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'indigo', label: 'Chàm', dot: 'bg-indigo-600', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { key: 'rose', label: 'Hồng đỏ', dot: 'bg-rose-600', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  { key: 'cyan', label: 'Xanh lam', dot: 'bg-cyan-600', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { key: 'slate', label: 'Xám', dot: 'bg-slate-500', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
];

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
    label: 'Tắt',
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

function toRoleCodeSlug(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
}

export default function PermissionsPage() {
  const { currentRole } = useAuth();
  const actorRole = currentRole?.key || 'EMPLOYEE';
  const canEditRoles = ['CEO', 'HR_DIRECTOR'].includes(actorRole);
  const canReadAuditLogs = ['CEO', 'ADMIN'].includes(actorRole);

  const [activeTab, setActiveTab] = useState('role-editor');
  const [rolesList, setRolesList] = useState(() => RBAC_ROLES);
  const [selectedRoleKey, setSelectedRoleKey] = useState('HR_DIRECTOR');

  // Role Permission Matrix State
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
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [toast, setToast] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [grantFilter, setGrantFilter] = useState('ALL');

  // Create / Edit / Delete Role Modals
  const [roleModalMode, setRoleModalMode] = useState(null); // 'create' | 'edit' | null
  const [roleForm, setRoleForm] = useState({
    code: '',
    name: '',
    shortName: '',
    level: 'Chuyên trách',
    defaultScope: 'Theo phòng ban (DEPT)',
    colorTheme: 'cyan',
    templateRoleCode: 'EMPLOYEE',
    summary: '',
  });
  const [deleteTargetRole, setDeleteTargetRole] = useState(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [selectedAuditItem, setSelectedAuditItem] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  const roleMap = useMemo(
    () => Object.fromEntries(rolesList.map((r) => [r.key, r])),
    [rolesList]
  );

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

  const applyServerPayload = useCallback((data) => {
    if (!data) return;
    if (Array.isArray(data.roles) && data.roles.length > 0) {
      setRolesList(data.roles);
      setSelectedRoleKey((prev) =>
        data.roles.some((r) => r.key === prev) ? prev : data.roles[0].key
      );
    }
    if (data.matrix) {
      setSavedMatrix(cloneMatrix(data.matrix));
      setDraftMatrix(cloneMatrix(data.matrix));
    }
    if (data.roleCounts) {
      setRoleCounts(data.roleCounts);
    }
  }, []);

  const loadRbacMatrix = useCallback(async () => {
    setLoadingMatrix(true);
    try {
      const res = await userService.getRbacRoles();
      if (res?.success && res.data) {
        applyServerPayload(res.data);
      }
    } catch {
      // Fallback to local catalog
    } finally {
      setLoadingMatrix(false);
    }
  }, [applyServerPayload]);

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
    for (const r of rolesList) {
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
  }, [rolesList, draftMatrix, savedMatrix]);

  const selectedRoleMeta = roleMap[selectedRoleKey] || rolesList[0] || RBAC_ROLES[0];
  const selectedRoleStats = roleStatsMap[selectedRoleMeta.key] || {
    granted: 0,
    allCount: 0,
    deptCount: 0,
    selfCount: 0,
    noneCount: TOTAL_PERMISSIONS_COUNT,
    changedCount: 0,
  };
  const canModifySelectedRole = canActorModifyRole(selectedRoleMeta.key);

  // Filtered modules
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
            if (!matchKey && !matchLabel) return false;
          }
          if (activeTab === 'role-editor' && grantFilter !== 'ALL') {
            const hasScope = Boolean(draftMatrix[p.key]?.[selectedRoleMeta.key]);
            if (grantFilter === 'GRANTED' && !hasScope) return false;
            if (grantFilter === 'DENIED' && hasScope) return false;
          }
          return true;
        });
        return { ...mod, permissions: matchedPerms };
      })
      .filter((mod) => mod.permissions.length > 0);
  }, [searchQuery, moduleFilter, grantFilter, activeTab, draftMatrix, selectedRoleMeta.key]);

  // Handlers for Role CRUD (Create, Edit, Clone, Delete)
  const handleOpenCreateRoleModal = (templateRole = null) => {
    setRoleForm({
      code: '',
      name: templateRole ? `${templateRole.name} (Bản sao)` : '',
      shortName: templateRole ? `${templateRole.shortName} Copy` : '',
      level: templateRole?.level || 'Chuyên trách',
      defaultScope: templateRole?.defaultScope || 'Theo phòng ban (DEPT)',
      colorTheme: templateRole?.colorTheme || 'cyan',
      templateRoleCode: templateRole?.key || 'EMPLOYEE',
      summary: templateRole?.summary || '',
    });
    setRoleModalMode('create');
  };

  const handleOpenEditRoleModal = (role) => {
    setRoleForm({
      code: role.key,
      name: role.name || '',
      shortName: role.shortName || '',
      level: role.level || 'Cấp 3',
      defaultScope: role.defaultScope || 'Theo phòng ban (DEPT)',
      colorTheme: role.colorTheme || 'blue',
      templateRoleCode: '',
      summary: role.summary || '',
    });
    setRoleModalMode('edit');
  };

  const handleSubmitRoleModal = async (e) => {
    e.preventDefault();
    if (!roleForm.name.trim()) {
      showToast('Vui lòng nhập tên vai trò.', 'error');
      return;
    }

    setSavingMatrix(true);
    try {
      if (roleModalMode === 'create') {
        const codeToCreate = roleForm.code.trim() || toRoleCodeSlug(roleForm.name);
        const res = await userService.createRbacRole({
          code: codeToCreate,
          name: roleForm.name.trim(),
          shortName: roleForm.shortName.trim() || roleForm.name.trim(),
          level: roleForm.level.trim(),
          defaultScope: roleForm.defaultScope,
          colorTheme: roleForm.colorTheme,
          templateRoleCode: roleForm.templateRoleCode || undefined,
          summary: roleForm.summary.trim(),
        });
        if (res?.success && res.data) {
          applyServerPayload(res.data);
          const createdRole = res.data.roles?.[res.data.roles.length - 1];
          if (createdRole) setSelectedRoleKey(createdRole.key);
          setRoleModalMode(null);
          showToast(`Đã tạo vai trò mới "${roleForm.name.trim()}" thành công!`);
        }
      } else if (roleModalMode === 'edit') {
        const res = await userService.updateRbacRoleInfo(roleForm.code, {
          name: roleForm.name.trim(),
          shortName: roleForm.shortName.trim() || roleForm.name.trim(),
          level: roleForm.level.trim(),
          defaultScope: roleForm.defaultScope,
          colorTheme: roleForm.colorTheme,
          summary: roleForm.summary.trim(),
        });
        if (res?.success && res.data) {
          applyServerPayload(res.data);
          setRoleModalMode(null);
          showToast(`Đã cập nhật thông tin vai trò "${roleForm.name.trim()}" thành công!`);
        }
      }
    } catch (err) {
      showToast(err?.message || 'Không thể lưu thông tin vai trò.', 'error');
    } finally {
      setSavingMatrix(false);
    }
  };

  const handleConfirmDeleteRole = async () => {
    if (!deleteTargetRole) return;
    setSavingMatrix(true);
    try {
      const res = await userService.deleteRbacRole(deleteTargetRole.key);
      if (res?.success && res.data) {
        applyServerPayload(res.data);
        setDeleteTargetRole(null);
        showToast(`Đã xóa vai trò "${deleteTargetRole.name}" thành công.`);
      }
    } catch (err) {
      showToast(err?.message || 'Không thể xóa vai trò này.', 'error');
    } finally {
      setSavingMatrix(false);
    }
  };

  // Handlers for changing permission scopes of a Role
  const handleSetPermissionScope = (roleKey, permKey, nextScope) => {
    if (!canActorModifyRole(roleKey)) {
      showToast(
        `Vai trò hiện tại của bạn (${actorRole}) không có quyền chỉnh sửa vai trò ${roleKey}.`,
        'warning'
      );
      return;
    }
    if (roleKey === 'CEO' && CEO_LOCKED_PERMISSIONS.has(permKey) && nextScope !== 'all') {
      showToast(
        `Quyền cốt lõi "${permKey}" của Tổng Giám Đốc (CEO) được khóa ở mức Toàn công ty (ALL).`,
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
        if (selectedRoleMeta.key === 'CEO' && CEO_LOCKED_PERMISSIONS.has(perm.key)) {
          next[perm.key].CEO = 'all';
          continue;
        }
        if (!nextScope || nextScope === 'none') {
          delete next[perm.key][selectedRoleMeta.key];
        } else {
          next[perm.key][selectedRoleMeta.key] = nextScope;
        }
      }
      return next;
    });
    showToast(
      `Đã gán nhanh phạm vi "${nextScope === 'none' ? 'Tắt' : nextScope.toUpperCase()}" cho phân hệ "${mod.name}".`
    );
  };

  const handleSaveRolePermissions = async () => {
    if (!canModifySelectedRole) return;
    setSavingMatrix(true);
    try {
      const permissionsPayload = {};
      for (const mod of RBAC_MODULES) {
        for (const perm of mod.permissions) {
          permissionsPayload[perm.key] = draftMatrix[perm.key]?.[selectedRoleMeta.key] || null;
        }
      }

      const res = await userService.updateRbacRoles({
        roleCode: selectedRoleMeta.key,
        permissions: permissionsPayload,
      });

      if (res?.success && res.data) {
        applyServerPayload(res.data);
        showToast(
          `Đã lưu cấu hình phân quyền của vai trò "${selectedRoleMeta.name}" thành công!`
        );
      }
    } catch (err) {
      showToast(err?.message || 'Không thể lưu cấu hình phân quyền vai trò.', 'error');
    } finally {
      setSavingMatrix(false);
    }
  };

  const handleResetAllRolesToDefault = async () => {
    if (!canEditRoles) return;
    setSavingMatrix(true);
    try {
      const res = await userService.resetRbacRoles({});
      if (res?.success && res.data) {
        applyServerPayload(res.data);
        showToast('Đã khôi phục toàn bộ danh mục vai trò và quyền hạn về mặc định chuẩn.');
      }
    } catch (err) {
      showToast(err?.message || 'Không thể khôi phục mặc định.', 'error');
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
          const savedVal = savedMatrix[perm.key]?.[selectedRoleMeta.key] || null;
          if (savedVal) {
            next[perm.key][selectedRoleMeta.key] = savedVal;
          } else {
            delete next[perm.key][selectedRoleMeta.key];
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
      'Mã quyền',
      'Tên quyền hạn',
      ...rolesList.map((r) => `${r.shortName} (${r.key})`),
    ];
    const rows = [];
    for (const mod of RBAC_MODULES) {
      for (const perm of mod.permissions) {
        rows.push([
          mod.name,
          perm.key,
          perm.label,
          ...rolesList.map((r) => {
            const sc = draftMatrix[perm.key]?.[r.key];
            return sc ? SCOPE_META[sc]?.shortLabel || sc.toUpperCase() : '—';
          }),
        ]);
      }
    }
    const csv = generateCSVContent(headers, rows);
    downloadFile(csv, 'ma-tran-phan-quyen-theo-vai-tro-rbac-2026.csv', 'text/csv;charset=utf-8;');
    showToast(`Đã xuất Ma trận phân quyền ${rolesList.length} vai trò ra file CSV.`);
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

      {/* Clean Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Quản trị Phân quyền theo Vai trò (RBAC)
          </h1>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportRoleMatrixCSV}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Xuất Ma trận Vai trò CSV</span>
            </button>

            {canEditRoles && (
              <button
                onClick={handleResetAllRolesToDefault}
                disabled={savingMatrix}
                title="Khôi phục danh mục 6 vai trò và quyền hạn mặc định ban đầu"
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4 text-slate-500" />
                <span>Khôi phục gốc</span>
              </button>
            )}

            <button
              onClick={loadRbacMatrix}
              disabled={loadingMatrix}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingMatrix ? 'animate-spin text-blue-600' : ''}`} />
              <span>Đồng bộ</span>
            </button>

            {canEditRoles && (
              <button
                onClick={() => handleOpenCreateRoleModal(null)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Vai trò Mới</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Concise Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100">
          <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-800">Tổng số Vai trò</span>
              <span className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-purple-950">{rolesList.length}</span>
              <span className="text-xs font-semibold text-purple-700">nhóm vai trò (Roles)</span>
            </div>
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
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-slate-200/80">
          <button
            onClick={() => setActiveTab('role-editor')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'role-editor'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Thiết lập quyền theo vai trò ({rolesList.length})</span>
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
            <span>Ma trận phân quyền tổng thể</span>
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
            <span>Phân cấp & Nhật ký thay đổi</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: THIẾT LẬP QUYỀN HẠN THEO TỪNG VAI TRÒ (ROLE PERMISSION EDITOR)
         ===================================================================== */}
      {activeTab === 'role-editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: ROLES LIST + CRUD ACTIONS */}
          <div className="lg:col-span-4 space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Danh mục Vai trò ({rolesList.length})
                </h2>
                {canEditRoles && (
                  <button
                    type="button"
                    onClick={() => handleOpenCreateRoleModal(null)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tạo vai trò</span>
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {rolesList.map((role) => {
                  const isSelected = selectedRoleMeta.key === role.key;
                  const rStats = roleStatsMap[role.key] || {
                    granted: 0,
                    changedCount: 0,
                  };
                  const pct = Math.round((rStats.granted / TOTAL_PERMISSIONS_COUNT) * 100);
                  const memberCount = roleCounts[role.key] ?? 0;
                  const canModifyThisRole = canActorModifyRole(role.key);
                  const canDeleteThisRole =
                    canModifyThisRole && role.key !== 'CEO' && role.key !== actorRole;

                  return (
                    <div
                      key={role.key}
                      onClick={() => setSelectedRoleKey(role.key)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer group ${
                        isSelected
                          ? 'bg-blue-50/60 border-blue-500 ring-2 ring-blue-500/15 shadow-xs'
                          : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${role.badgeClass}`}
                            >
                              {role.badge}
                            </span>
                            {!role.isSystem && (
                              <span className="px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 text-[10px] font-bold">
                                Tùy chỉnh
                              </span>
                            )}
                            {rStats.changedCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                +{rStats.changedCount} sửa
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-extrabold text-slate-900 mt-1.5 truncate">
                            {role.name}
                          </h3>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-extrabold text-slate-900">
                            {rStats.granted}/{TOTAL_PERMISSIONS_COUNT}
                          </span>
                          <span className="block text-[10px] text-slate-400 font-semibold">
                            quyền ({pct}%)
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                        <div
                          className={`h-full rounded-full transition-all ${role.dotClass}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2.5 pt-2 border-t border-slate-100">
                        <span className="truncate">
                          Phạm vi: <strong className="text-slate-700">{role.defaultScope}</strong>
                        </span>

                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEditRoles && (
                            <button
                              type="button"
                              onClick={() => handleOpenCreateRoleModal(role)}
                              title={`Nhân bản từ vai trò ${role.name}`}
                              className="p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canModifyThisRole && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditRoleModal(role)}
                              title={`Sửa thông tin vai trò ${role.name}`}
                              className="p-1 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-700 transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canDeleteThisRole && (
                            <button
                              type="button"
                              onClick={() => setDeleteTargetRole(role)}
                              title={`Xóa vai trò ${role.name}`}
                              className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {memberCount > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                              {memberCount} NS
                            </span>
                          )}
                        </div>
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
                    <code className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[11px] font-bold">
                      Mã: {selectedRoleMeta.key}
                    </code>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                      {roleCounts[selectedRoleMeta.key] ?? 0} nhân sự
                    </span>
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    {selectedRoleMeta.name}
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {selectedRoleMeta.summary}
                  </p>
                </div>

                {/* Role Actions Bar (Edit Info, Delete Role, Save Permissions) */}
                {canModifySelectedRole ? (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditRoleModal(selectedRoleMeta)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5 text-blue-600" />
                      <span>Sửa vai trò</span>
                    </button>

                    {selectedRoleMeta.key !== 'CEO' && selectedRoleMeta.key !== actorRole && (
                      <button
                        type="button"
                        onClick={() => setDeleteTargetRole(selectedRoleMeta)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    )}

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
                          ? `Lưu Phân quyền (${selectedRoleStats.changedCount})`
                          : 'Lưu Phân quyền'}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold shrink-0">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {canEditRoles
                        ? `Chỉ CEO mới được sửa vai trò ${selectedRoleMeta.shortName}`
                        : 'Chế độ Xem tra cứu'}
                    </span>
                  </div>
                )}
              </div>

              {/* Scope Breakdown Mini-Cards */}
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
                    <span className="text-[10px] text-slate-400">Chặn truy cập</span>
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
                    placeholder="Tìm theo tên quyền hạn..."
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
                    <option value="GRANTED">Đang bật ({selectedRoleStats.granted})</option>
                    <option value="DENIED">Đang tắt ({selectedRoleStats.noneCount})</option>
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
                          draftMatrix[perm.key]?.[selectedRoleMeta.key] || 'none';
                        const savedScope =
                          savedMatrix[perm.key]?.[selectedRoleMeta.key] || 'none';
                        const isModified = currentScope !== savedScope;
                        const isCeoLocked =
                          selectedRoleMeta.key === 'CEO' && CEO_LOCKED_PERMISSIONS.has(perm.key);

                        return (
                          <div
                            key={perm.key}
                            className={`px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                              isModified ? 'bg-amber-50/40' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className="text-xs font-bold text-slate-800">
                                {perm.label}
                              </span>
                              {isCeoLocked && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                                  <Lock className="w-3 h-3" />
                                  Cốt lõi
                                </span>
                              )}
                              {isModified && (
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                  Đã đổi
                                </span>
                              )}
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
                                        selectedRoleMeta.key,
                                        perm.key,
                                        opt.value
                                      )
                                    }
                                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
                                      isActive ? opt.activeClass : opt.idleClass
                                    } ${
                                      disabled
                                        ? 'opacity-70 cursor-not-allowed'
                                        : 'cursor-pointer'
                                    }`}
                                  >
                                    {opt.label}
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
          TAB 2: MA TRẬN PHÂN QUYỀN TỔNG THỂ
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
                  placeholder="Tìm kiếm quyền hạn..."
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
              <span className="text-slate-500 font-semibold mr-1">Chú giải:</span>
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
                  <th className="py-3.5 px-4 min-w-[260px]">Danh mục Quyền hạn Nghiệp vụ</th>
                  {rolesList.map((r) => (
                    <th
                      key={r.key}
                      onClick={() => {
                        setSelectedRoleKey(r.key);
                        setActiveTab('role-editor');
                      }}
                      title={`Nhấn để thiết lập chi tiết vai trò ${r.name}`}
                      className={`py-3.5 px-3 text-center cursor-pointer transition-colors ${
                        selectedRoleMeta.key === r.key ? 'bg-blue-700' : 'hover:bg-slate-800'
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
                      <td colSpan={rolesList.length + 1} className="py-2.5 px-4">
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
                          <span className="font-bold text-slate-900">{perm.label}</span>
                        </td>

                        {rolesList.map((r) => {
                          const scopeVal = draftMatrix[perm.key]?.[r.key] || null;
                          const isHighlighted = selectedRoleMeta.key === r.key;
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
          TAB 3: PHÂN CẤP & NHẬT KÝ THAY ĐỔI
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
                    Cấu trúc Phân cấp theo Vai trò
                  </h3>
                  <p className="text-xs text-slate-500">
                    Nhân sự được gán vai trò nào sẽ tự động nhận bộ quyền của vai trò đó
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                {rolesList.map((r) => (
                  <div
                    key={r.key}
                    className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${r.badgeClass}`}
                        >
                          {r.badge}
                        </span>
                        <span className="font-bold text-slate-900 text-xs">{r.name}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{r.summary}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-700 shrink-0">
                      {roleStatsMap[r.key]?.granted || 0}/{TOTAL_PERMISSIONS_COUNT} quyền
                    </span>
                  </div>
                ))}
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
                    Luồng Phê duyệt Đa cấp Theo Vai trò
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tự động định tuyến người duyệt dựa trên vai trò của người gửi đơn
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2">
                  <div className="text-xs font-extrabold text-emerald-950">
                    Luồng A: Đơn từ của Nhân viên (`EMPLOYEE`)
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                      1. Nhân viên
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                      2. Trưởng phòng (`DEPT`)
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 border border-blue-200">
                      3. Giám đốc Nhân sự (`ALL`)
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-2">
                  <div className="text-xs font-extrabold text-amber-950">
                    Luồng B: Đơn từ của Cấp Quản lý (`LINE_MANAGER` / `HR_DIRECTOR`)
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                      1. Trưởng phòng / HRD
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 border border-purple-200">
                      2. Tổng Giám Đốc (`CEO`) phê duyệt trực tiếp
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-950">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Kiểm soát Phạm vi Trợ lý AI Copilot theo Vai trò</span>
                  </div>
                  <p className="text-xs text-indigo-900/80">
                    Trợ lý AI HR tự động áp dụng phạm vi dữ liệu theo vai trò người hỏi: Cá nhân
                    (`SELF`) cho Nhân viên, Phòng ban (`DEPT`) cho Trưởng phòng và Toàn công ty
                    (`ALL`) cho Ban Giám Đốc.
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
                    Nhật ký Thay đổi Vai trò & Phân quyền
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
                      <th className="py-3 px-4">Vai trò</th>
                      <th className="py-3 px-4 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          Chưa có lịch sử thay đổi vai trò nào.
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
                            {roleMap[log.recordId]?.name || log.recordId}
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

      {/* =====================================================================
          MODAL 1: TẠO MỚI HOẶC CHỈNH SỬA VAI TRÒ (CREATE / EDIT ROLE MODAL)
         ===================================================================== */}
      {roleModalMode && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  {roleModalMode === 'create' ? (
                    <Plus className="w-4 h-4" />
                  ) : (
                    <Pencil className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {roleModalMode === 'create'
                      ? 'Thêm Vai Trò Mới'
                      : `Chỉnh sửa Vai Trò: ${roleForm.name}`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {roleModalMode === 'create'
                      ? 'Khởi tạo vai trò mới và thiết lập bộ quyền hạn tương ứng'
                      : 'Cập nhật tên hiển thị, cấp bậc, màu nhận diện và phạm vi mặc định'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRoleModalMode(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRoleModal} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Tên Vai trò <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={roleForm.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRoleForm((p) => ({
                        ...p,
                        name: val,
                        code:
                          roleModalMode === 'create' && (!p.code || p.code === toRoleCodeSlug(p.name))
                            ? toRoleCodeSlug(val)
                            : p.code,
                      }));
                    }}
                    placeholder="vd: Kế toán Tiền lương"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Mã Định danh (Role Code)
                  </label>
                  <input
                    type="text"
                    disabled={roleModalMode === 'edit'}
                    value={roleForm.code}
                    onChange={(e) =>
                      setRoleForm((p) => ({ ...p, code: toRoleCodeSlug(e.target.value) }))
                    }
                    placeholder="vd: PAYROLL_ACCOUNTANT"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 font-mono font-bold disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Tên ngắn gọn (Hiển thị trên cột Ma trận)
                  </label>
                  <input
                    type="text"
                    value={roleForm.shortName}
                    onChange={(e) => setRoleForm((p) => ({ ...p, shortName: e.target.value }))}
                    placeholder="vd: Kế toán Lương"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Cấp bậc Vai trò
                  </label>
                  <select
                    value={roleForm.level}
                    onChange={(e) => setRoleForm((p) => ({ ...p, level: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold"
                  >
                    <option value="Cấp 1">Cấp 1 — Lãnh đạo Tối cao</option>
                    <option value="Cấp 2A">Cấp 2A — Quản trị Khối</option>
                    <option value="Cấp 2B">Cấp 2B — Trưởng Bộ phận</option>
                    <option value="Chuyên trách">Chuyên trách — Nghiệp vụ</option>
                    <option value="Cấp 3">Cấp 3 — Nhân viên</option>
                    <option value="QTHT">QTHT — Quản trị Kỹ thuật</option>
                    <option value="Kiosk">Thiết bị — Kiosk</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Phạm vi Dữ liệu Mặc định
                  </label>
                  <select
                    value={roleForm.defaultScope}
                    onChange={(e) =>
                      setRoleForm((p) => ({ ...p, defaultScope: e.target.value }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold"
                  >
                    <option value="Toàn công ty (ALL)">Toàn công ty (ALL)</option>
                    <option value="Theo phòng ban (DEPT)">Theo phòng ban (DEPT)</option>
                    <option value="Cá nhân (SELF)">Cá nhân (SELF)</option>
                  </select>
                </div>

                {roleModalMode === 'create' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">
                      Sao chép Bộ quyền Mẫu từ Vai trò
                    </label>
                    <select
                      value={roleForm.templateRoleCode}
                      onChange={(e) =>
                        setRoleForm((p) => ({ ...p, templateRoleCode: e.target.value }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold"
                    >
                      <option value="">-- Khởi tạo trống (0 quyền) --</option>
                      {rolesList.map((r) => (
                        <option key={r.key} value={r.key}>
                          Sao chép từ: {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Màu sắc Nhận diện Vai trò
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {COLOR_THEME_OPTIONS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setRoleForm((p) => ({ ...p, colorTheme: c.key }))}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                        roleForm.colorTheme === c.key
                          ? `${c.badge} ring-2 ring-slate-900/15`
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Mô tả Chức năng & Trách nhiệm của Vai trò
                </label>
                <textarea
                  rows={3}
                  value={roleForm.summary}
                  onChange={(e) => setRoleForm((p) => ({ ...p, summary: e.target.value }))}
                  placeholder="Mô tả ngắn gọn quyền hạn và phạm vi công việc của vai trò này..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setRoleModalMode(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingMatrix}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {savingMatrix
                    ? 'Đang lưu...'
                    : roleModalMode === 'create'
                    ? 'Tạo Vai trò'
                    : 'Lưu Thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: XÁC NHẬN XÓA VAI TRÒ (DELETE ROLE CONFIRMATION)
         ===================================================================== */}
      {deleteTargetRole && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Xác nhận Xóa Vai trò
                  </h3>
                  <p className="text-xs text-slate-500">{deleteTargetRole.name}</p>
                </div>
              </div>
              <button
                onClick={() => setDeleteTargetRole(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa vai trò{' '}
              <strong className="text-slate-900">
                {deleteTargetRole.name} ({deleteTargetRole.key})
              </strong>{' '}
              khỏi danh mục phân quyền? Bạn luôn có thể nhấn nút <strong>"Khôi phục gốc"</strong>{' '}
              trên thanh công cụ nếu muốn lấy lại bộ vai trò mặc định ban đầu.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetRole(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={savingMatrix}
                onClick={handleConfirmDeleteRole}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {savingMatrix ? 'Đang xóa...' : 'Xác nhận Xóa Vai trò'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: CHI TIẾT JSON DIFF
         ===================================================================== */}
      {selectedAuditItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Chi tiết Thay đổi Vai trò #{selectedAuditItem.id}
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
                  Dữ liệu Trước khi lưu (oldValues)
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-900 text-rose-300 font-mono text-[11px] overflow-x-auto">
                  {selectedAuditItem.oldValues
                    ? JSON.stringify(selectedAuditItem.oldValues, null, 2)
                    : '// Không có dữ liệu cũ'}
                </pre>
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-700 mb-2">
                  Dữ liệu Sau khi lưu (newValues)
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
