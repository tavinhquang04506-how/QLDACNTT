import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import noticeService from '../../services/noticeService';
import { 
  SlidersHorizontal, 
  Plus, 
  Search, 
  Pin, 
  Eye, 
  Edit3, 
  Trash2, 
  Paperclip, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Users,
  Loader2,
  Calendar
} from 'lucide-react';

export default function NoticeManagementModal({ isOpen, onClose }) {
  const { currentRole } = useAuth();
  const { openModal } = useModal();

  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionNoticeId, setActionNoticeId] = useState(null);

  const loadNotices = async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      let res;
      try {
        res = await noticeService.getAll({ all: 'true' });
      } catch (err) {
        res = await noticeService.getAll();
      }
      const list = res?.data || (Array.isArray(res) ? res : []);
      setNotices(list);
    } catch (err) {
      console.error('Error loading notices for management:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotices();

    const handleUpdate = () => {
      loadNotices();
    };
    window.addEventListener('nexus:notices-updated', handleUpdate);
    return () => window.removeEventListener('nexus:notices-updated', handleUpdate);
  }, [isOpen]);

  const handleTogglePin = async (notice) => {
    setActionNoticeId(notice.id);
    try {
      await noticeService.update(notice.id, { isPinned: !notice.is_pinned });
      setNotices(prev => prev.map(n => n.id === notice.id ? { ...n, is_pinned: !n.is_pinned } : n));
      window.dispatchEvent(new CustomEvent('nexus:notices-updated'));
    } catch (e) {
      console.warn('Error toggling pin:', e);
    } finally {
      setActionNoticeId(null);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Bạn có chắc chắn muốn thu hồi/xóa thông báo "${title}" khỏi toàn bộ hệ thống không?`)) {
      return;
    }
    setActionNoticeId(id);
    try {
      await noticeService.remove(id);
      setNotices(prev => prev.filter(n => n.id !== id));
      window.dispatchEvent(new CustomEvent('nexus:notices-updated'));
      window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
    } catch (e) {
      console.warn('Error deleting notice:', e);
    } finally {
      setActionNoticeId(null);
    }
  };

  const filteredNotices = notices.filter(n => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
  });

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Bảng Quản Trị Thông Báo Doanh Nghiệp"
      subtitle="Quản lý vòng đời bài viết, chỉnh sửa, đính kèm tệp và theo dõi tỷ lệ tiếp cận của nhân viên"
      badge={
        <span className="bg-purple-50 text-purple-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Quyền CEO & HR
        </span>
      }
      maxWidth="max-w-4xl"
    >
      <div className="p-6 space-y-4 text-xs font-sans">
        {/* Toolbar: Search & Create Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm bài đăng theo tiêu đề hoặc nội dung..."
              className="w-full h-9 pl-9 pr-4 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 rounded-xl outline-none transition"
            />
          </div>

          <button
            type="button"
            onClick={() => openModal('modalCreateNotice', { mode: 'create' })}
            className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Đăng bài mới</span>
          </button>
        </div>

        {/* Notices Table */}
        <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white">
          {loading && notices.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
              <p className="text-slate-500 font-bold">Đang tải danh sách thông báo quản trị...</p>
            </div>
          ) : filteredNotices.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="font-bold text-slate-700">Chưa có thông báo nào được tìm thấy</p>
              <p className="text-slate-400 text-[11px]">Bấm nút "+ Đăng bài mới" ở trên để phát hành thông báo đầu tiên.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Văn bản / Tiêu đề</th>
                  <th className="py-3 px-3">Phân loại & File</th>
                  <th className="py-3 px-3">Đối tượng nhận</th>
                  <th className="py-3 px-3">Ngày đăng</th>
                  <th className="py-3 px-4 text-right">Thao tác quản lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredNotices.map((notice) => {
                  const isPinned = Boolean(notice.is_pinned);
                  const attCount = Array.isArray(notice.attachments) ? notice.attachments.length : 0;
                  const pubDate = notice.published_at 
                    ? new Date(notice.published_at).toLocaleDateString('vi-VN') 
                    : '';

                  return (
                    <tr key={notice.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Tiêu đề */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          {isPinned && (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Pin className="w-2.5 h-2.5 fill-amber-700 text-amber-700" />
                              GHIM
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-slate-400 font-bold">{notice.id}</span>
                        </div>
                        <h4 className="font-bold text-slate-900 line-clamp-2 leading-tight">
                          {notice.title}
                        </h4>
                      </td>

                      {/* Phân loại & Tệp đính kèm */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase inline-block ${
                            notice.priority === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {notice.priority === 'high' ? 'Hỏa tốc' : (notice.category || 'Chung')}
                          </span>
                          {attCount > 0 && (
                            <span className="flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
                              <Paperclip className="w-3 h-3" />
                              <span>{attCount} tệp đính kèm</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Đối tượng */}
                      <td className="py-3 px-3">
                        <span className="font-medium text-slate-700 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>{notice.target_role || 'Toàn công ty'}</span>
                        </span>
                      </td>

                      {/* Ngày đăng */}
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{pubDate}</span>
                        </div>
                      </td>

                      {/* Thao tác */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Thống kê người đọc */}
                          <button
                            type="button"
                            onClick={() => openModal('modalNoticeReaders', { id: notice.id, title: notice.title })}
                            className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition cursor-pointer"
                            title="Xem thống kê tỷ lệ người đã đọc văn bản này"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Ghim / Bỏ ghim */}
                          <button
                            type="button"
                            onClick={() => handleTogglePin(notice)}
                            disabled={actionNoticeId === notice.id}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              isPinned
                                ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                            title={isPinned ? 'Bỏ ghim bài viết' : 'Ghim bài viết lên đầu'}
                          >
                            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-700' : ''}`} />
                          </button>

                          {/* Chỉnh sửa */}
                          <button
                            type="button"
                            onClick={() => openModal('modalCreateNotice', { mode: 'edit', notice })}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            title="Chỉnh sửa nội dung thông báo"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Xóa */}
                          <button
                            type="button"
                            onClick={() => handleDelete(notice.id, notice.title)}
                            disabled={actionNoticeId === notice.id}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition cursor-pointer"
                            title="Xóa/thu hồi thông báo này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-slate-500">
          <span className="text-[11px]">Tổng số: {filteredNotices.length} văn bản thông báo công ty</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
