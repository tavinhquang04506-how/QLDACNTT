import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import leaveService from '../../services/leaveService';
import { 
  LayoutDashboard, 
  Users, 
  Clock, 
  CalendarDays, 
  Wallet, 
  BarChart3, 
  Settings, 
  UserSquare2, 
  FolderKanban, 
  CheckSquare 
} from 'lucide-react';

export default function Sidebar() {
  const { currentRole } = useAuth();
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function loadPendingCount() {
      try {
        const res = await leaveService.getAll();
        if (res?.success && Array.isArray(res.data) && isMounted) {
          const pending = res.data.filter(l => l.stage === 'CHO_TRUONG_PHONG_DUYET' || l.stage === 'CHO_HR_PHE_CHUAN');
          setPendingLeavesCount(pending.length);
        }
      } catch (e) {}
    }
    loadPendingCount();
    window.addEventListener('nexus:leave-updated', loadPendingCount);

    return () => {
      isMounted = false;
      window.removeEventListener('nexus:leave-updated', loadPendingCount);
    };
  }, [currentRole.key]);

  const leaveBadge = pendingLeavesCount > 0 ? String(pendingLeavesCount) : undefined;

  // Role-Specific Navigation Menus
  const getMenuItems = () => {
    switch (currentRole.key) {
      case 'CEO':
        return [
          { name: 'Tổng quan điều hành', path: '/dashboard', icon: LayoutDashboard },
          { name: 'Dự án và Tiến độ công việc', path: '/tasks', icon: FolderKanban },
          { name: 'Hồ sơ nhân sự', path: '/directory', icon: Users },
          { name: 'Giám sát chấm công', path: '/attendance', icon: Clock },
          { name: 'Phê duyệt nghỉ phép', path: '/leaves', icon: CalendarDays, badge: leaveBadge },
          { name: 'Phê duyệt quỹ lương', path: '/payroll', icon: Wallet },
          { name: 'Phân tích hiệu suất nhân sự', path: '/ai-analytics', icon: BarChart3 },
          { name: 'Bàn làm việc của tôi', path: '/portal', icon: UserSquare2 },
          { name: 'Cài đặt hệ thống', path: '/settings', icon: Settings },
        ];
      case 'HR_DIRECTOR':
        return [
          { name: 'Tổng quan quản trị nhân sự', path: '/dashboard', icon: LayoutDashboard },
          { name: 'Dự án và Tiến độ công việc', path: '/tasks', icon: FolderKanban },
          { name: 'Hồ sơ nhân sự', path: '/directory', icon: Users },
          { name: 'Chấm công và ca làm', path: '/attendance', icon: Clock },
          { name: 'Thẩm duyệt nghỉ phép', path: '/leaves', icon: CalendarDays, badge: leaveBadge },
          { name: 'Xử lý tiền lương và quyết toán', path: '/payroll', icon: Wallet },
          { name: 'Phân tích hiệu suất nhân sự', path: '/ai-analytics', icon: BarChart3 },
          { name: 'Bàn làm việc của tôi', path: '/portal', icon: UserSquare2 },
          { name: 'Cài đặt hệ thống', path: '/settings', icon: Settings },
        ];
      case 'LINE_MANAGER':
        return [
          { name: 'Tổng quan bộ phận', path: '/dashboard', icon: LayoutDashboard },
          { name: 'Dự án và Phân công nhiệm vụ', path: '/tasks', icon: FolderKanban },
          { name: 'Nhân sự bộ phận', path: '/directory', icon: Users },
          { name: 'Chấm công và ca làm', path: '/attendance', icon: Clock },
          { name: 'Duyệt phép phòng ban', path: '/leaves', icon: CalendarDays, badge: leaveBadge },
          { name: 'Phiếu lương của tôi', path: '/payroll', icon: Wallet },
          { name: 'Đánh giá hiệu suất nhân sự', path: '/ai-analytics', icon: BarChart3 },
          { name: 'Bàn làm việc của tôi', path: '/portal', icon: UserSquare2 },
        ];
      case 'EMPLOYEE':
      default:
        return [
          { name: 'Bàn làm việc của tôi', path: '/portal', icon: UserSquare2 },
          { name: 'Nhiệm vụ và Dự án của tôi', path: '/tasks', icon: CheckSquare },
          { name: 'Chấm công và ca làm', path: '/attendance', icon: Clock },
          { name: 'Đơn nghỉ phép của tôi', path: '/leaves', icon: CalendarDays },
          { name: 'Phiếu lương của tôi', path: '/payroll', icon: Wallet },
          { name: 'Hồ sơ nhân sự', path: '/directory', icon: Users },
        ];
    }
  };

  const menuItems = getMenuItems();

  return (
    <aside className="w-[272px] bg-white border-r border-slate-200/90 flex flex-col shrink-0 select-none h-full">
      {/* Brand Header */}
      <div className="h-16 px-6 border-b border-slate-200/80 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold text-base shadow-sm">
          N
        </div>
        <div className="flex flex-col">
          <span className="font-extrabold text-[15px] font-display text-slate-900 tracking-wider">
            NEXUS HR
          </span>
          <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Trụ sở chính Hà Nội
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path + item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 group ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="w-[18px] h-[18px] shrink-0 transition-transform group-hover:scale-105" />
                <span className="truncate whitespace-nowrap">{item.name}</span>
              </div>

              {/* Badges */}
              {item.badge && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-1 transition-all ${
                  item.badgeType === 'chat'
                    ? 'bg-rose-500 text-white shadow-xs'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
