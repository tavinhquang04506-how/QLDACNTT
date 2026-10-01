import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { Shield, Crown, Briefcase, Users, User, Tablet, Bot } from 'lucide-react';
import Avatar from '../common/Avatar';

export default function RoleSwitcherBar() {
  const { currentRole, switchRole, ROLES } = useAuth();
  const { openModal } = useModal();
  const navigate = useNavigate();
  const location = useLocation();

  const roleConfigs = [
    {
      key: 'CEO',
      icon: Crown,
      badge: 'Tổng Giám Đốc (CEO)',
      name: 'Lê Vũ Ngọc Duy',
      color: 'hover:border-purple-400',
      activeBg: 'bg-purple-600 text-white ring-1 ring-purple-400',
      targetPath: '/dashboard',
    },
    {
      key: 'HR_DIRECTOR',
      icon: Briefcase,
      badge: 'Giám Đốc Nhân Sự (HRD)',
      name: 'Trần Mai Hương',
      color: 'hover:border-blue-400',
      activeBg: 'bg-blue-600 text-white ring-1 ring-blue-400',
      targetPath: '/dashboard',
    },
    {
      key: 'LINE_MANAGER',
      icon: Users,
      badge: 'Trưởng Phòng Kỹ Thuật',
      name: 'Vũ Đình Khang',
      color: 'hover:border-emerald-400',
      activeBg: 'bg-emerald-600 text-white ring-1 ring-emerald-400',
      targetPath: '/dashboard',
    },
    {
      key: 'EMPLOYEE',
      icon: User,
      badge: 'Nhân Viên Tiêu Chuẩn',
      name: 'Phạm Minh Quân',
      color: 'hover:border-amber-400',
      activeBg: 'bg-amber-600 text-white ring-1 ring-amber-400',
      targetPath: '/portal',
    },
    {
      key: 'KIOSK',
      icon: Tablet,
      badge: 'Kiosk Cổng Điểm Danh',
      name: 'Cổng Sảnh A1',
      color: 'hover:border-slate-400',
      activeBg: 'bg-slate-700 text-white ring-1 ring-slate-400',
      targetPath: '/kiosk',
    },
  ];

  const handleRoleSwitch = (item) => {
    switchRole(item.key);
    if (item.key === 'EMPLOYEE' && location.pathname !== '/portal') {
      navigate('/portal');
    } else if (item.key === 'KIOSK') {
      navigate('/kiosk');
    } else if (location.pathname === '/portal' && item.key !== 'EMPLOYEE') {
      navigate('/dashboard');
    }
  };

  return (
    <div className="bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center justify-between text-xs border-b border-slate-800 shadow-inner shrink-0 z-40 gap-2">
      {/* Title */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-semibold text-slate-200 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          Góc nhìn vai trò:
        </span>
        <span className="text-slate-400 hidden lg:inline text-[11px]">
          Chuyển đổi hiển thị theo quyền hạn tài khoản:
        </span>
      </div>

      {/* Role Buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1 sm:py-0">
        {roleConfigs.map((cfg) => {
          const isActive = currentRole.key === cfg.key;
          const IconComponent = cfg.icon;
          return (
            <button
              key={cfg.key}
              onClick={() => handleRoleSwitch(cfg)}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-2 whitespace-nowrap active:scale-[0.98] cursor-pointer ${
                isActive
                  ? `${cfg.activeBg} shadow-xs font-bold`
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
              }`}
            >
              <IconComponent className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{cfg.badge}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${isActive ? 'bg-black/20 text-white' : 'bg-slate-700 text-slate-300'}`}>
                {cfg.name}
              </span>
            </button>
          );
        })}

        {/* Support Assistant Button */}
        <button
          onClick={() => openModal('modal8B')}
          className="ml-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          title="Mở Trợ lý Nhân sự"
        >
          <Bot className="w-3.5 h-3.5 text-blue-400" />
          <span>Trợ lý nhân sự</span>
        </button>
      </div>
    </div>
  );
}
