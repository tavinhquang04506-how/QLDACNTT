import React, { createContext, useContext, useState } from 'react';
import { AVATAR_SEEDS } from '../utils/avatarUtils';
import authService from '../services/authService';

export const ROLES = {
  CEO: {
    key: 'CEO',
    id: 'NV-0001',
    name: 'Lê Vũ Ngọc Duy',
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
  },
  HR_DIRECTOR: {
    key: 'HR_DIRECTOR',
    id: 'NV-0002',
    name: 'Trần Mai Hương',
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
  },
  LINE_MANAGER: {
    key: 'LINE_MANAGER',
    id: 'NV-1000',
    name: 'Vũ Đình Khang',
    title: 'Trưởng phòng Kỹ thuật Phần mềm',
    department: 'Phòng Phát triển Phần mềm',
    level: 'Cấp 2B',
    levelLabel: 'Cấp 2B (Trưởng Phòng Ban / Lead)',
    roleBadge: 'Cấp 2B',
    roleColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    email: 'lead@fwbnexus.vn',
    avatar: AVATAR_SEEDS.LEAD,
    isStaff: false,
    canApproveLeave: true,
    canAccessPayroll: false, // Bị giới hạn không xem full bảng lương công ty
    canAccessAi: true,
    canManageAll: false,
  },
  EMPLOYEE: {
    key: 'EMPLOYEE',
    id: 'NV-0842',
    name: 'Phạm Minh Quân',
    title: 'Kỹ sư Phần mềm',
    department: 'Phòng Phát triển Phần mềm',
    level: 'Cấp 3',
    levelLabel: 'Cấp 3 (Nhân Viên Tự Phục Vụ / ESS)',
    roleBadge: 'Cấp 3',
    roleColor: 'bg-amber-100 text-amber-800 border-amber-200',
    email: 'employee@fwbnexus.vn',
    avatar: AVATAR_SEEDS.EMPLOYEE,
    isStaff: true, // Directs to employee portal
    canApproveLeave: false,
    canAccessPayroll: false,
    canAccessAi: false,
    canManageAll: false,
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
  },
};

// Aliases for backwards compatibility
ROLES.ADMIN_CEO = ROLES.CEO;
ROLES.hr_director = ROLES.HR_DIRECTOR;
ROLES.employee = ROLES.EMPLOYEE;

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

  const isAuthenticated = Boolean(token);

  // Khởi tạo role từ localStorage
  const [currentRole, setCurrentRole] = useState(() => {
    try {
      const savedKey = localStorage.getItem('nexus_role_key');
      if (savedKey) {
        const upper = savedKey.toUpperCase();
        if (ROLES[savedKey]) return ROLES[savedKey];
        if (ROLES[upper]) return ROLES[upper];
      }
      const savedUser = localStorage.getItem('nexus_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const code = (parsed.roleCode || parsed.role || '').toUpperCase();
        if (ROLES[code]) return ROLES[code];
      }
    } catch (e) {}
    return ROLES.EMPLOYEE;
  });

  const switchRole = (roleKey) => {
    const upperKey = (roleKey || '').toUpperCase();
    let target = null;
    if (ROLES[roleKey]) {
      target = ROLES[roleKey];
    } else if (ROLES[upperKey]) {
      target = ROLES[upperKey];
    } else if (roleKey === 'employee') {
      target = ROLES.EMPLOYEE;
    } else if (roleKey === 'hr_director') {
      target = ROLES.HR_DIRECTOR;
    }

    if (target) {
      setCurrentRole(target);
      try {
        localStorage.setItem('nexus_role_key', target.key);
      } catch (e) {}
    }
  };

  const login = (authToken, authUser) => {
    setToken(authToken);
    setUser(authUser);
    if (authUser?.roleCode) {
      switchRole(authUser.roleCode);
    }
  };

  const logout = async () => {
    await authService.logout();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, currentRole, switchRole, ROLES, isAuthenticated, login, logout }}>
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
