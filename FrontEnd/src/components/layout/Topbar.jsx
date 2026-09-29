import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import Avatar from '../common/Avatar';
import { Bell, Sparkles, ChevronDown, FileText, LogOut } from 'lucide-react';
import notificationService from '../../services/notificationService';

export default function Topbar() {
  const { currentRole, logout } = useAuth();
  const { openModal } = useModal();
  const navigate = useNavigate();

  const [unreadCount, setUnreadCount] = useState(0);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDateTimeVN = (d) => {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = days[d.getDay()];
    const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return `${dayName}, ${dateStr} - ${timeStr}`;
  };

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const notifRes = await notificationService.getUnreadCount();
        const count = notifRes?.count ?? notifRes?.unreadCount;
        if (isMounted && typeof count === 'number') {
          setUnreadCount(count);
        }
      } catch (e) {
        // silent fallback
      }
    }
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('nexus:notifications-updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('nexus:notifications-updated', handleUpdate);
    };
  }, [currentRole?.key]);

  return (
    <header className="h-16 bg-white border-b border-slate-200/90 px-6 flex items-center justify-between shrink-0 select-none z-30 relative">
      {/* Left Spacer */}
      <div className="flex-1" />

      {/* Right Tools: Date, Notifications, User */}
      <div className="flex items-center gap-3">
        {/* Real-time Date Badge */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600 font-medium bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span>{formatDateTimeVN(currentTime)}</span>
        </div>

        {/* Notification Bell - Clearly visible button and offset badge */}
        <button
          type="button"
          id="topbar-notification-bell"
          onClick={() => openModal('modalNotificationCenter')}
          className="relative w-9 h-9 rounded-xl bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 flex items-center justify-center transition-colors cursor-pointer border border-slate-200"
          title={`Thông báo hệ thống (${unreadCount} chưa đọc)`}
        >
          <Bell className="w-4 h-4 text-slate-700 stroke-[2.2]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow-xs">
              {unreadCount}
            </span>
          )}
        </button>

        {/* Support Assistant Button */}
        <button
          type="button"
          onClick={() => openModal('modal8B')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
          title="Mở trợ lý hỗ trợ"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span className="hidden sm:inline">Trợ lý hỗ trợ</span>
        </button>

        {/* User Info và Avatar with Dropdown */}
        <div className="relative">
          <div 
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-2.5 pl-2 border-l border-slate-200 cursor-pointer hover:bg-slate-50 p-1.5 rounded-xl transition-colors group"
            title="Tài khoản cá nhân"
          >
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-tight">
                {currentRole.name}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 truncate max-w-[160px]">
                {currentRole.title}
              </span>
            </div>
            <Avatar
              src={currentRole.avatar}
              name={currentRole.name}
              id={currentRole.id}
              size="sm"
              shape="circle"
              statusBadge="online"
            />
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
          </div>

          {/* Dropdown Menu */}
          {isProfileMenuOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsProfileMenuOpen(false)} 
              />
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Header User Card */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                  <Avatar
                    src={currentRole.avatar}
                    name={currentRole.name}
                    id={currentRole.id}
                    size="md"
                    shape="circle"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {currentRole.name}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {currentRole.title}
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="p-2 space-y-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      openModal('modal4B', currentRole);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl text-slate-700 hover:bg-slate-100/80 hover:text-blue-600 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer text-xs"
                  >
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>Hồ sơ nhân sự chi tiết</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setIsProfileMenuOpen(false);
                      if (logout) await logout();
                      navigate('/login');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer text-xs border border-transparent hover:border-rose-100"
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    <span>Đăng xuất tài khoản</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
