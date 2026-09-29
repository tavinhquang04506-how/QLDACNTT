import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import noticeService from '../../services/noticeService';
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Send, 
  BellRing, 
  Search, 
  Building, 
  Loader2, 
  TrendingUp, 
  UserCheck, 
  UserX,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

export default function NoticeReadersModal({ isOpen, onClose, data, payload }) {
  const actualData = data || payload || {};
  const noticeId = actualData?.id;
  const noticeTitle = actualData?.title || 'Thông báo doanh nghiệp';

  const [loading, setLoading] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('read'); // 'read' | 'unread'
  const [searchQuery, setSearchQuery] = useState('');
  const [remindFeedback, setRemindFeedback] = useState(null);

  const fetchStats = async () => {
    if (!isOpen || !noticeId) return;
    setLoading(true);
    setRemindFeedback(null);
    try {
      const res = await noticeService.getReaders(noticeId);
      const data = res?.data || res;
      setStats(data);
    } catch (err) {
      console.error('Lỗi khi tải thống kê người đọc:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStats();
    } else {
      setStats(null);
      setSearchQuery('');
      setRemindFeedback(null);
    }
  }, [isOpen, noticeId]);

  const handleSendReminder = async () => {
    if (!noticeId || reminding) return;
    setReminding(true);
    setRemindFeedback(null);
    try {
      const res = await noticeService.remindUnread(noticeId);
      setRemindFeedback({
        type: 'success',
        message: res?.message || 'Đã gửi thông báo nhắc nhở hỏa tốc đến các nhân sự chưa xem!'
      });
      // Tự động làm mới dữ liệu sau khi gửi
      window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
    } catch (err) {
      setRemindFeedback({
        type: 'error',
        message: err?.response?.data?.message || err?.message || 'Không thể gửi nhắc nhở. Vui lòng thử lại.'
      });
    } finally {
      setReminding(false);
    }
  };

  const readersList = stats?.readers || [];
  const unreadList = stats?.unread || stats?.unread_employees || [];
  const totalTarget = stats?.totalTargeted ?? stats?.total_target ?? (readersList.length + unreadList.length);
  const readCount = stats?.readCount ?? stats?.read_count ?? readersList.length;
  const readPct = stats?.readPercent ?? stats?.read_percentage ?? (totalTarget > 0 ? Math.round((readCount / totalTarget) * 100) : 0);

  const filterList = (list) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(emp => {
      const name = emp.full_name || emp.employee_name || '';
      const dept = emp.department_name || '';
      const job = emp.job_title || '';
      const id = emp.id || emp.employee_id || '';
      return name.toLowerCase().includes(q) ||
        dept.toLowerCase().includes(q) ||
        job.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q);
    });
  };

  const displayedList = activeTab === 'read' ? filterList(readersList) : filterList(unreadList);

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Báo Cáo Tỷ Lệ Tiếp Cận & Đọc Thông Báo"
      subtitle={`Văn bản: "${noticeTitle}"`}
      badge={
        <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          Phân Tích Realtime
        </span>
      }
      maxWidth="max-w-3xl"
    >
      <div className="p-6 space-y-5 text-xs font-sans">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="font-medium text-slate-500">Đang tổng hợp dữ liệu tiếp cận từ máy chủ...</span>
          </div>
        ) : !stats ? (
          <div className="py-12 text-center text-slate-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p>Không tìm thấy dữ liệu thống kê cho thông báo này.</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Tổng đối tượng */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200/70 text-slate-700 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Đối tượng mục tiêu</div>
                  <div className="text-xl font-bold text-slate-800">{totalTarget} <span className="text-xs font-normal text-slate-500">nhân sự</span></div>
                </div>
              </div>

              {/* Đã đọc */}
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Đã tiếp cận & đọc</div>
                  <div className="text-xl font-bold text-emerald-800 flex items-baseline gap-1.5">
                    {readCount}
                    <span className="text-xs font-semibold text-emerald-600">({readPct}%)</span>
                  </div>
                </div>
              </div>

              {/* Chưa đọc */}
              <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200/80 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-rose-200">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Chưa đọc</div>
                  <div className="text-xl font-bold text-rose-800">{unreadList.length} <span className="text-xs font-normal text-rose-600">nhân sự</span></div>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
              <div className="flex justify-between items-center text-xs font-medium text-slate-600 mb-1.5">
                <span>Tiến độ đọc toàn công ty</span>
                <span className="font-bold text-blue-700">{readPct}% hoàn thành ({readCount}/{totalTarget})</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-emerald-500 h-2.5 rounded-full transition-all duration-700 ease-out" 
                  style={{ width: `${Math.min(100, Math.max(0, readPct))}%` }}
                />
              </div>
            </div>

            {/* Notification / Reminder Feedback Banner */}
            {remindFeedback && (
              <div className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-medium transition-all ${
                remindFeedback.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <div className="flex items-center gap-2">
                  {remindFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{remindFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRemindFeedback(null)}
                  className="text-xs font-bold underline hover:opacity-75"
                >
                  Đóng
                </button>
              </div>
            )}

            {/* Controls: Search, Tabs & Urgent Reminder Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 border-t border-slate-100">
              {/* Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('read')}
                  className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'read'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Đã đọc ({readersList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('unread')}
                  className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'unread'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserX className="w-3.5 h-3.5" />
                  Chưa đọc ({unreadList.length})
                </button>
              </div>

              {/* Action buttons & Search */}
              <div className="flex items-center gap-2 flex-1 sm:justify-end">
                <div className="relative flex-1 sm:max-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm nhân sự..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {unreadList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSendReminder}
                    disabled={reminding}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-medium text-xs shadow-xs hover:shadow transition disabled:opacity-50 cursor-pointer shrink-0"
                    title="Gửi thông báo đẩy gấp yêu cầu nhân viên vào đọc thông báo này"
                  >
                    {reminding ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang gửi...</span>
                      </>
                    ) : (
                      <>
                        <BellRing className="w-3.5 h-3.5" />
                        <span>Nhắc nhở hỏa tốc</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Employee List Table */}
            <div className="border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-2xs max-h-[320px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="py-2.5 px-3.5">Nhân viên</th>
                    <th className="py-2.5 px-3">Phòng ban & Vị trí</th>
                    <th className="py-2.5 px-3 text-right">
                      {activeTab === 'read' ? 'Thời gian đọc' : 'Trạng thái'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {displayedList.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400">
                        {searchQuery ? 'Không tìm thấy nhân viên phù hợp bộ lọc.' : 'Không có nhân sự nào trong danh sách này.'}
                      </td>
                    </tr>
                  ) : (
                    displayedList.map((emp, idx) => (
                      <tr key={emp.id || emp.employee_id || idx} className="hover:bg-slate-50/80 transition-colors">
                        {/* Employee info */}
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 uppercase shadow-2xs">
                              {(emp.full_name || emp.employee_name || 'U').charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800">{emp.full_name || emp.employee_name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{emp.id || emp.employee_id}</div>
                            </div>
                          </div>
                        </td>

                        {/* Dept & Job */}
                        <td className="py-2.5 px-3 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Building className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{emp.department_name || 'Chưa phân bổ'}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 pl-4">{emp.job_title || 'Nhân viên'}</div>
                        </td>

                        {/* Read timestamp or status badge */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {activeTab === 'read' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {emp.read_at ? new Date(emp.read_at).toLocaleString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                day: '2-digit',
                                month: '2-digit'
                              }) : 'Đã đọc'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                              <Clock className="w-3 h-3 text-rose-500" />
                              Chưa mở thông báo
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Summary & Tip */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/60">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                Hệ thống tự động ghi nhận biên nhận đọc mỗi khi nhân viên click mở xem chi tiết thông báo.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold cursor-pointer transition"
              >
                Đóng
              </button>
            </div>
          </>
        )}
      </div>
    </AppleModal>
  );
}
