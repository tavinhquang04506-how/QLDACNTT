import React, { useState } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import notificationService from '../../services/notificationService';
import noticeService from '../../services/noticeService';
import Avatar from '../../components/common/Avatar';
import { 
  Bell, 
  CheckCheck, 
  Clock, 
  ArrowRight, 
  Search,
  Plus,
  Paperclip,
  Trash2,
  SlidersHorizontal,
  X,
  FileText,
  UserCheck,
  Building,
  Pin
} from 'lucide-react';

export default function NotificationCenterModal({ isOpen, onClose }) {
  const { currentRole } = useAuth();
  const { openModal } = useModal();

  const roleKey = currentRole?.key || currentRole?.roleCode || 'EMPLOYEE';
  const canManageNotice = roleKey === 'HR_DIRECTOR' || roleKey === 'CEO' || currentRole?.isHR || currentRole?.isCEO;

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread' | 'company' | 'personal'
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch real notifications and company notices to guarantee 100% synchronization
  React.useEffect(() => {
    let isMounted = true;
    async function loadNotifications() {
      if (!isOpen) return;
      setLoading(true);
      try {
        const [notifRes, noticeRes] = await Promise.allSettled([
          notificationService.getAll(),
          noticeService.getAll({ limit: 50 })
        ]);

        if (isMounted) {
          const rawNotifs = notifRes.status === 'fulfilled' && notifRes.value?.data 
            ? (Array.isArray(notifRes.value.data) ? notifRes.value.data : []) 
            : [];
          const rawNotices = noticeRes.status === 'fulfilled' && noticeRes.value?.data 
            ? (Array.isArray(noticeRes.value.data) ? noticeRes.value.data : []) 
            : [];

          const normalizedNotifs = rawNotifs.map(n => {
            let payload = n.action_payload || n.actionPayload;
            if (typeof payload === 'string') {
              try { payload = JSON.parse(payload); } catch (e) {}
            }
            return {
              id: n.id,
              userId: n.user_id,
              title: n.title,
              summary: n.summary,
              category: n.category || (n.user_id ? 'Cá nhân' : 'Thông báo công ty'),
              categoryBadge: n.category_badge || n.categoryBadge,
              priority: n.priority || 'medium',
              isRead: Boolean(n.is_read ?? n.isRead),
              actionType: n.action_type || n.actionType,
              actionPayload: payload,
              actionButtonText: n.action_button_text || n.actionButtonText || 'Xem chi tiết',
              sender: {
                name: n.sender_name || n.sender?.name || 'Hệ thống',
                role: n.sender_role || n.sender?.role || 'Thông báo tự động',
                avatar: n.sender_avatar || n.sender?.avatar,
              },
              time: n.created_at ? new Date(n.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : (n.time || ''),
              date: n.created_at ? new Date(n.created_at).toLocaleDateString('vi-VN') : '',
              rawCreatedAt: n.created_at ? new Date(n.created_at).getTime() : 0,
            };
          });

          // Check if any company notice from noticeService is missing from notifications
          const existingIds = new Set(normalizedNotifs.map(n => n.id));
          const existingNoticeIds = new Set(normalizedNotifs.map(n => n.actionPayload?.id).filter(Boolean));

          const missingNotices = rawNotices.filter(notice => {
            const notifId = `NOTIF-${notice.id}`;
            return !existingIds.has(notifId) && !existingIds.has(notice.id) && !existingNoticeIds.has(notice.id);
          });

          const synthesizedNotices = missingNotices.map(notice => {
            let attachments = [];
            if (Array.isArray(notice.attachments)) attachments = notice.attachments;
            else if (typeof notice.attachments === 'string') {
              try { attachments = JSON.parse(notice.attachments); } catch (e) {}
            }

            const pubDate = notice.published_at 
              ? new Date(notice.published_at).toLocaleDateString('vi-VN') 
              : new Date().toLocaleDateString('vi-VN');
            const authorName = notice.author_name || (roleKey === 'CEO' ? 'Lê Vũ Ngọc Duy' : 'Trần Mai Hương');
            const authorRole = notice.author_title || (roleKey === 'CEO' ? 'Tổng Giám Đốc (CEO)' : 'Giám Đốc Nhân Sự (HRD)');
            const authorAvatar = notice.author_avatar || (authorRole.includes('CEO')
              ? 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
              : 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150');

            return {
              id: `NOTIF-${notice.id}`,
              userId: null,
              title: notice.title,
              summary: notice.content,
              category: 'Thông báo công ty',
              priority: notice.priority === 'high' ? 'urgent' : 'normal',
              isRead: false,
              actionType: 'notice_popup',
              actionPayload: {
                id: notice.id,
                title: notice.title,
                content: notice.content,
                category: notice.category,
                priority: notice.priority,
                isPinned: Boolean(notice.is_pinned),
                attachments,
                date: pubDate,
                signer: `${authorName} - ${authorRole}`,
                docNumber: `Số: ${notice.id}/2026/TB-NEXUS`
              },
              actionButtonText: 'Xem chi tiết',
              sender: {
                name: authorName,
                role: authorRole,
                avatar: authorAvatar,
              },
              time: notice.published_at ? new Date(notice.published_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '',
              date: pubDate,
              rawCreatedAt: notice.published_at ? new Date(notice.published_at).getTime() : 0,
            };
          });

          const merged = [...normalizedNotifs, ...synthesizedNotices].sort((a, b) => (b.rawCreatedAt || 0) - (a.rawCreatedAt || 0));
          setNotifications(merged);
        }
      } catch (e) {
        if (isMounted) setNotifications([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadNotifications();

    const handleUpdate = () => {
      loadNotifications();
    };
    window.addEventListener('nexus:notifications-updated', handleUpdate);
    window.addEventListener('nexus:notices-updated', handleUpdate);

    return () => { 
      isMounted = false; 
      window.removeEventListener('nexus:notifications-updated', handleUpdate);
      window.removeEventListener('nexus:notices-updated', handleUpdate);
    };
  }, [isOpen, roleKey]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
    } catch (e) {}
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
    window.dispatchEvent(new CustomEvent('nexus:notices-updated'));
  };

  const handleClearRead = async () => {
    try {
      await notificationService.clearRead();
      setNotifications(prev => prev.filter(n => !n.isRead || !n.userId));
      window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
      window.dispatchEvent(new CustomEvent('nexus:notices-updated'));
    } catch (e) {
      console.warn('Error clearing read notifications:', e);
    }
  };

  const handleDeleteItem = async (e, id) => {
    e.stopPropagation();
    try {
      await notificationService.remove(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
      window.dispatchEvent(new CustomEvent('nexus:notices-updated'));
    } catch (err) {
      console.warn('Error deleting notification:', err);
    }
  };

  const handleItemClick = async (notif) => {
    // Mark as read
    try {
      if (!notif.isRead && notif.id) {
        await notificationService.markAsRead(notif.id);
        if (notif.actionPayload?.id) {
          await notificationService.markAsRead(notif.actionPayload.id).catch(() => null);
        }
      }
    } catch (e) {}
    setNotifications(prev =>
      prev.map(n => (n.id === notif.id ? { ...n, isRead: true } : n))
    );
    window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
    window.dispatchEvent(new CustomEvent('nexus:notices-updated'));

    let payload = notif.actionPayload;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (e) {}
    }

    // Open corresponding business modal
    switch (notif.actionType) {
      case 'leave_detail':
        openModal('modal6E', payload);
        break;
      case 'notice_popup':
        openModal('modalNotificationDetail', payload);
        break;
      case 'late_absence_popup':
        openModal('modal2A', payload);
        break;
      case 'payslip_popup':
        openModal('modal3C', payload);
        break;
      case 'health_popup':
        openModal('modal3B', payload);
        break;
      case 'ot_popup':
        openModal('modal3A', payload);
        break;
      case 'payroll_anomaly_popup':
        openModal('modal7A', payload);
        break;
      case 'bank_transfer_popup':
        openModal('modal7B', payload);
        break;
      case 'turnover_popup':
        openModal('modal8A', payload);
        break;
      case 'pip_popup':
        openModal('modal8C', { pipId: payload?.id });
        break;
      default:
        openModal('modalNotificationDetail', payload);
        break;
    }
  };

  const isCompanyNotice = (item) => {
    const cat = (item.category || '').toLowerCase();
    return item.actionType === 'notice_popup' || cat.includes('công ty') || !item.userId;
  };

  const isPersonalNotice = (item) => {
    return !isCompanyNotice(item);
  };

  // Filter logic
  const filteredNotifications = notifications.filter(item => {
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (item.title || '').toLowerCase().includes(q);
      const matchSummary = (item.summary || '').toLowerCase().includes(q);
      const matchSender = (item.sender?.name || '').toLowerCase().includes(q);
      if (!matchTitle && !matchSummary && !matchSender) return false;
    }

    if (activeTab === 'unread') return !item.isRead;
    if (activeTab === 'company') return isCompanyNotice(item);
    if (activeTab === 'personal') return isPersonalNotice(item);
    return true;
  });

  const companyCount = notifications.filter(isCompanyNotice).length;
  const personalCount = notifications.filter(isPersonalNotice).length;

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Trung Tâm Thông Báo Doanh Nghiệp"
      subtitle={`Hộp thư dành riêng cho: ${currentRole?.name} (${currentRole?.title})`}
      badge={
        <span className="bg-rose-50 text-rose-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-rose-200 flex items-center gap-1">
          <Bell className="w-3.5 h-3.5" />
          {unreadCount > 0 ? `${unreadCount} thông báo mới` : 'Đã đọc tất cả'}
        </span>
      }
      maxWidth="max-w-2xl"
    >
      <div className="p-6 space-y-4 text-xs font-sans">
        {/* Search Bar & Action Buttons Toolbar */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm thông báo theo tiêu đề, người gửi, nội dung..."
                className="w-full h-9 pl-9 pr-8 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 rounded-xl outline-none transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {canManageNotice && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openModal('modalNoticeManagement')}
                  className="h-9 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  title="Mở Bảng quản trị toàn bộ bài đăng dành cho CEO và HR"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Quản lý bài đăng</span>
                </button>
                <button
                  type="button"
                  onClick={() => openModal('modalCreateNotice')}
                  className="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                  title="Đăng thông báo mới cho toàn doanh nghiệp"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Đăng bài</span>
                </button>
              </div>
            )}
          </div>

          {/* Filter Tabs & Bulk Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('unread')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'unread'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Chưa đọc ({unreadCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('company')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'company'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Công ty ({companyCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('personal')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'personal'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cá nhân ({personalCount})
              </button>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={handleClearRead}
                className="font-semibold text-[11px] text-slate-500 hover:text-rose-600 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer flex items-center gap-1"
                title="Dọn dẹp các thông báo cá nhân đã đọc"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Dọn đã đọc</span>
              </button>

              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
                className={`font-bold text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                  unreadCount > 0
                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 shadow-2xs'
                    : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-70'
                }`}
                title="Đánh dấu toàn bộ thông báo đã đọc"
              >
                <CheckCheck className={`w-3.5 h-3.5 ${unreadCount > 0 ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>Đọc tất cả</span>
              </button>
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
          {filteredNotifications.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center mx-auto">
                <Bell className="w-5 h-5" />
              </div>
              <p className="font-bold text-slate-700">Không tìm thấy thông báo nào</p>
              <p className="text-slate-400 text-[11px]">
                {searchQuery ? `Không có thông báo khớp với từ khóa "${searchQuery}".` : 'Bạn đã xử lý toàn bộ các thông báo trong mục này.'}
              </p>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const hasAttachments = item.actionPayload?.attachments && item.actionPayload.attachments.length > 0;
              const isUrgent = item.priority === 'urgent' || item.priority === 'high' || (item.title && (item.title.includes('KHẨN') || item.title.includes('KHEN THƯỞNG') || item.title.includes('QUYẾT ĐỊNH')));
              const isPinned = Boolean(item.actionPayload?.isPinned || item.isPinned);
              const isCompany = isCompanyNotice(item);

              // Category tag and styling matching EmployeePortalPage
              let catLabel = item.category || 'Chung';
              let catBadge = item.categoryBadge || 'bg-slate-100 text-slate-700 border-slate-200';

              if (isCompany) {
                const subCat = item.actionPayload?.category;
                if (subCat === 'policy') {
                  catLabel = 'QUY ĐỊNH';
                  catBadge = 'bg-blue-50 text-blue-700 border-blue-200';
                } else if (subCat === 'event') {
                  catLabel = 'SỰ KIỆN';
                  catBadge = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                } else if (isUrgent) {
                  catLabel = 'QUAN TRỌNG / KHẨN';
                  catBadge = 'bg-rose-50 text-rose-700 border-rose-200';
                } else {
                  catLabel = 'CHUNG';
                  catBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                }
              }

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative group flex flex-col gap-2 ${
                    item.isRead
                      ? 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50'
                      : isUrgent
                        ? 'bg-rose-50/40 border-rose-200 hover:border-rose-400 hover:bg-rose-50/70 shadow-2xs'
                        : isPinned
                          ? 'bg-amber-50/30 border-amber-200 hover:border-amber-400 hover:bg-amber-50/60 shadow-2xs'
                          : 'bg-blue-50/30 border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 shadow-2xs'
                  }`}
                >
                  {/* Unread indicator dot */}
                  {!item.isRead && (
                    <span className={`absolute top-4 right-4 w-2.5 h-2.5 rounded-full ${
                      isUrgent ? 'bg-rose-600 ring-4 ring-rose-100' : 'bg-blue-600 ring-4 ring-blue-100'
                    }`} />
                  )}

                  {/* Sender & Category Header */}
                  <div className="flex items-center justify-between gap-3 pr-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        src={item.sender?.avatar}
                        name={item.sender?.name || 'Hệ thống'}
                        id={item.sender?.id || ''}
                        size="sm"
                        shape="rounded"
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate leading-tight">
                          {item.sender?.name || 'Hệ thống'}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate">
                          {item.sender?.role || 'Thông báo tự động'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {isPinned && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Pin className="w-2.5 h-2.5 fill-amber-700 text-amber-700" />
                          GHIM
                        </span>
                      )}
                      {hasAttachments && (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Paperclip className="w-2.5 h-2.5" />
                          <span>Tệp đính kèm ({item.actionPayload.attachments.length})</span>
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catBadge}`}>
                        {catLabel}
                      </span>
                    </div>
                  </div>

                  {/* Title & Summary */}
                  <div className="space-y-1">
                    <h4 className={`text-xs font-bold transition-colors ${
                      item.isRead ? 'text-slate-800' : 'text-slate-950 font-display'
                    }`}>
                      {item.title}
                    </h4>
                    <p className="text-slate-600 text-[11px] leading-relaxed line-clamp-2">
                      {item.summary}
                    </p>
                  </div>

                  {/* Timestamp & Action Button */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100/80 text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{item.date ? `${item.time} - ${item.date}` : item.time}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      {item.userId && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteItem(e, item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition"
                          title="Xóa thông báo này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <span className="text-blue-600 group-hover:text-blue-700 font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-all">
                        <span>{item.actionButtonText || 'Xem chi tiết'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-slate-500">
          <span className="text-[11px] text-slate-400">Đồng bộ dữ liệu thời gian thực từ máy chủ doanh nghiệp</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
