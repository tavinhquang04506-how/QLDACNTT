import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { AVATAR_SEEDS } from '../utils/avatarUtils';
import authService from '../services/authService';

export const ROLE_META = {
  CEO: {
    key: 'CEO',
    id: 'NV-0001',
    name: 'Tổng Giám Đốc',
    title: 'Tổng Giám Đốc (CEO)',
    department: 'Ban Điều Hành và Lãnh Đạo',
    level: 'Cấp 1',
    levelLabel: 'Cấp 1 (Lãnh Đạo Tối Cao / CEO)',
    roleBadge: 'Cấp 1',
    roleColor: 'bg-purple-100 text-purple-800 border-purple-200',
    email: 'ceo@fwbnexus.vn',
    avatar: AVATAR_SEEDS.CEO,
    isStaff: false,
    canApproveLeave: true,
    canAccessPayroll: true,
    canAccessAi: true,
    canManageAll: true,
    canManageUsers: true,
  },
  HR_DIRECTOR: {
    key: 'HR_DIRECTOR',
    id: 'NV-0002',
    name: 'Giám Đốc Nhân Sự',
    title: 'Giám Đốc Nhân Sự (HRD)',
    department: 'Khối Nhân sự và Vận hành',
    level: 'Cấp 2A',
    levelLabel: 'Cấp 2A (Giám Đốc Khối / HRD)',
    roleBadge: 'Cấp 2A',
    roleColor: 'bg-blue-100 text-blue-800 border-blue-200',
    email: 'hrd@fwbnexus.vn',
    avatar: AVATAR_SEEDS.HRD,
    isStaff: false,
    canApproveLeave: true,
    canAccessPayroll: true,
    canAccessAi: true,
    canManageAll: true,
    canManageUsers: true,
  },
  LINE_MANAGER: {
    key: 'LINE_MANAGER',
    id: 'NV-1000',
    name: 'Trưởng Phòng Ban',
    title: 'Trưởng Phòng Ban (Line Manager)',
    department: 'Phòng Ban Chuyên Môn',
    level: 'Cấp 2B',
    levelLabel: 'Cấp 2B (Trưởng Phòng Ban / Lead)',
    roleBadge: 'Cấp 2B',
    roleColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    email: 'lead@fwbnexus.vn',
    avatar: AVATAR_SEEDS.LEAD,
    isStaff: false,
    canApproveLeave: true,
    canAccessPayroll: false,
    canAccessAi: true,
    canManageAll: false,
    canManageUsers: false,
  },
  EMPLOYEE: {
    key: 'EMPLOYEE',
    id: 'NV-0842',
    name: 'Nhân Viên',
    title: 'Nhân Viên Chính Thức',
    department: 'Phòng Ban Chuyên Môn',
    level: 'Cấp 3',
    levelLabel: 'Cấp 3 (Nhân Viên Tự Phục Vụ / ESS)',
    roleBadge: 'Cấp 3',
    roleColor: 'bg-amber-100 text-amber-800 border-amber-200',
    email: 'employee@fwbnexus.vn',
    avatar: AVATAR_SEEDS.EMPLOYEE,
    isStaff: true,
    canApproveLeave: false,
    canAccessPayroll: false,
    canAccessAi: false,
    canManageAll: false,
    canManageUsers: false,
  },
  ADMIN: {
    key: 'ADMIN',
    id: 'ADMIN-01',
    name: 'Quản Trị Hệ Thống',
    title: 'Quản Trị Viên Hệ Thống (System Admin)',
    department: 'Khối Hạ Tầng & Bảo Mật CNTT',
    level: 'QTHT',
    levelLabel: 'Quản Trị Hệ Thống (ADMIN)',
    roleBadge: 'ADMIN',
    roleColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    email: 'admin@fwbnexus.vn',
    avatar: AVATAR_SEEDS.LEAD,
    isStaff: false,
    canApproveLeave: false,
    canAccessPayroll: false,
    canAccessAi: false,
    canManageAll: false,
    canManageUsers: true,
  },
  KIOSK: {
    key: 'KIOSK',
    id: 'KIOSK-01',
    name: 'iPad Kiosk Sảnh Cổng Chính',
    title: 'Thiết bị Chấm công Tự động A1',
    department: 'Hệ thống Cổng Turnstile',
    level: 'Kiosk',
    levelLabel: 'Kiosk Chấm Công (iPad Sảnh)',
    roleBadge: 'Kiosk',
    roleColor: 'bg-slate-100 text-slate-800 border-slate-300',
    email: 'kiosk@fwbnexus.vn',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    isStaff: false,
    canApproveLeave: false,
    canAccessPayroll: false,
    canAccessAi: false,
    canManageAll: false,
    canManageUsers: false,
  },
};

export const ROLES = {
  ...ROLE_META,
  ADMIN_CEO: ROLE_META.CEO,
  hr_director: ROLE_META.HR_DIRECTOR,
  employee: ROLE_META.EMPLOYEE,
};

function resolveRoleMeta(roleKey) {
  const raw = String(roleKey || '').trim();
  const upper = raw.toUpperCase();
  if (ROLE_META[raw]) return ROLE_META[raw];
  if (ROLE_META[upper]) return ROLE_META[upper];
  if (ROLES[raw]) return ROLES[raw];
  if (ROLES[upper]) return ROLES[upper];
  return ROLE_META.EMPLOYEE;
}

export function buildCurrentRole(user, fallbackRoleKey) {
  const effectiveKey = user?.roleCode || user?.role || fallbackRoleKey || 'EMPLOYEE';
  const meta = resolveRoleMeta(effectiveKey);
  if (!user) return meta;

  return {
    ...meta,
    key: meta.key,
    userId: user.id || user.userId || null,
    employeeId: user.employeeId || null,
    id: user.employeeId || user.id || meta.id,
    name: user.fullName || user.name || user.email || meta.name,
    title: user.jobTitle || user.positionName || meta.title,
    department: user.departmentName || user.department || meta.department,
    departmentId: user.departmentId || null,
    email: user.email || meta.email,
    avatar: user.avatarUrl || user.avatar || meta.avatar,
    phoneNumber: user.phoneNumber || null,
    kpiScore: user.kpiScore ?? null,
    attendanceRate: user.attendanceRate ?? null,
    leaveBalance: user.leaveBalance ?? null,
    status: user.status || null,
  };
}

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('nexus_token'));
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('nexus_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [roleKey, setRoleKey] = useState(() => {
    try {
      const savedUser = localStorage.getItem('nexus_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const code = (parsed.roleCode || parsed.role || '').toUpperCase();
        if (code && ROLE_META[code]) return code;
      }
      const savedKey = localStorage.getItem('nexus_role_key');
      if (savedKey) {
        const meta = resolveRoleMeta(savedKey);
        return meta.key;
      }
    } catch {}
    return 'EMPLOYEE';
  });

  const isAuthenticated = Boolean(token);

  const refreshProfile = useCallback(async () => {
    const activeToken = localStorage.getItem('nexus_token');
    if (!activeToken) return null;
    try {
      const res = await authService.getProfile();
      if (res?.success && res.user) {
        setUser(res.user);
        const nextRoleKey = resolveRoleMeta(res.user.roleCode).key;
        setRoleKey(nextRoleKey);
        localStorage.setItem('nexus_user', JSON.stringify(res.user));
        localStorage.setItem('nexus_role_key', nextRoleKey);
        return res.user;
      }
    } catch (err) {
      if (err?.status === 401) {
        setToken(null);
        setUser(null);
      }
    }
    return null;
  }, []);

  useEffect(() => {
    if (token) {
      refreshProfile();
    }
  }, [token, refreshProfile]);

  const currentRole = useMemo(() => buildCurrentRole(user, roleKey), [user, roleKey]);

  const switchRole = useCallback(
    (nextKey) => {
      // Backend authorization always uses the authenticated JWT actor (`user.roleCode`).
      // If authenticated, keep role locked to the authenticated user's roleCode.
      if (user?.roleCode) {
        const lockedMeta = resolveRoleMeta(user.roleCode);
        setRoleKey(lockedMeta.key);
        try {
          localStorage.setItem('nexus_role_key', lockedMeta.key);
        } catch {}
        return;
      }
      const target = resolveRoleMeta(nextKey);
      if (target) {
        setRoleKey(target.key);
        try {
          localStorage.setItem('nexus_role_key', target.key);
        } catch {}
      }
    },
    [user]
  );

  const login = useCallback((authToken, authUser) => {
    setToken(authToken);
    setUser(authUser || null);
    if (authUser) {
      const meta = resolveRoleMeta(authUser.roleCode || authUser.role);
      setRoleKey(meta.key);
      try {
        localStorage.setItem('nexus_user', JSON.stringify(authUser));
        localStorage.setItem('nexus_role_key', meta.key);
      } catch {}
    }
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setToken(null);
    setUser(null);
    setRoleKey('EMPLOYEE');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        currentRole,
        roleMeta: ROLE_META[currentRole.key] || ROLE_META.EMPLOYEE,
        ROLE_META,
        ROLES,
        switchRole,
        isAuthenticated,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
