import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { 
  FileText, 
  Clock, 
  Send, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Calendar, 
  User, 
  Building2, 
  ShieldCheck, 
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function AttendanceAppealModal({ isOpen, onClose, payload }) {
  const { user, currentRole } = useAuth();
  const isAdminOrHR = currentRole?.key === 'HR_DIRECTOR' || currentRole?.key === 'CEO' || currentRole?.key === 'LINE_MANAGER' || currentRole?.canManageAll || user?.role === 'ADMIN' || user?.role === 'HR_MANAGER';

  const [activeTab, setActiveTab] = useState(isAdminOrHR ? 'list' : 'create'); // 'create' | 'list'
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    date: payload?.date || new Date().toISOString().split('T')[0],
    appeal_type: 'DI_MUON',
    reason: '',
    proof_url: '',
  });

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const appealTypeLabels = {
    DI_MUON: 'Đi muộn có lý do chính đáng',
    VE_SOM: 'Về sớm do công việc / việc gấp',
    QUEN_CHAM_CONG: 'Quên chấm công (dập thẻ / face scan)',
    CONG_TAC: 'Công tác / Làm việc tại địa bàn khách hàng',
  };

  const statusBadge = (status) => {
    switch (status) {
      case 'DA_DUYET':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Đã phê duyệt
          </span>
        );
      case 'TU_CHOI':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" /> Từ chối
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5" /> Chờ quản lý duyệt
          </span>
        );
    }
  };

  const fetchAppeals = async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/appeals');
      if (res && res.data) {
        setAppeals(Array.isArray(res.data) ? res.data : (res.data.data || []));
      }
    } catch (err) {
      console.warn('Lỗi lấy danh sách giải trình:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAppeals();
      setSuccessMsg('');
      setErrorMsg('');
      if (payload?.date) {
        setForm(prev => ({ ...prev, date: payload.date }));
      }
    }
  }, [isOpen, payload]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reason.trim()) {
      setErrorMsg('Vui lòng nhập lý do giải trình cụ thể.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.post('/attendance/appeals', {
        date: form.date,
        appeal_type: form.appeal_type,
        reason: form.reason.trim(),
        proof_url: form.proof_url.trim() || null,
        employee_id: user?.id || user?.employee_id,
        employee_name: user?.full_name || user?.name,
        department_name: user?.department || 'Khối Kỹ Thuật',
      });

      if (res && (res.status === 200 || res.status === 201 || res.data?.success)) {
        setSuccessMsg('Gửi đơn giải trình chấm công thành công!');
        setForm({
          date: new Date().toISOString().split('T')[0],
          appeal_type: 'DI_MUON',
          reason: '',
          proof_url: '',
        });
        fetchAppeals();
        setTimeout(() => setActiveTab('list'), 1000);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Có lỗi xảy ra khi gửi đơn giải trình.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (id, status) => {
    const note = window.prompt(status === 'DA_DUYET' ? 'Nhập ghi chú duyệt (tùy chọn):' : 'Nhập lý do từ chối:');
    if (status === 'TU_CHOI' && note === null) return;

    try {
      await api.put(`/attendance/appeals/${id}/review`, {
        status,
        review_note: note || '',
      });
      fetchAppeals();
      try {
        window.dispatchEvent(new CustomEvent('nexus:attendance-updated'));
      } catch (e) { }
    } catch (err) {
      setErrorMsg('Không thể cập nhật trạng thái đơn: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">Giải Trình Chấm Công</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Gửi đơn giải trình đi trễ, về sớm, hoặc quên chấm công tới Quản lý duyệt
              </p>
            </div>
          </div>
          <button
            onClick={fetchAppeals}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex p-1 bg-slate-100 rounded-xl max-w-sm">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'create'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tạo đơn giải trình mới
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'list'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Lịch sử đơn
            {appeals.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                {appeals.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Create Form */}
        {activeTab === 'create' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {successMsg && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Ngày cần giải trình <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-800 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Loại vi phạm cần giải trình <span className="text-rose-500">*</span>
                </label>
                <select
                  value={form.appeal_type}
                  onChange={(e) => setForm({ ...form, appeal_type: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-800 bg-white"
                >
                  <option value="DI_MUON">Đi muộn có lý do chính đáng</option>
                  <option value="VE_SOM">Về sớm do công tác / việc gấp</option>
                  <option value="QUEN_CHAM_CONG">Quên chấm công (dập thẻ / face scan)</option>
                  <option value="CONG_TAC">Công tác ngoài văn phòng / Khách hàng</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Lý do & Tình huống cụ thể <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="VD: Do tham gia cuộc họp đột xuất tại văn phòng khách hàng từ 08:15 đến 09:30 nên không kịp chấm công tại văn phòng công ty..."
                required
                className="w-full p-3 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 placeholder-slate-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Link tài liệu / Biên bản xác nhận đính kèm (tùy chọn)
              </label>
              <input
                type="text"
                value={form.proof_url}
                onChange={(e) => setForm({ ...form, proof_url: e.target.value })}
                placeholder="https://drive.google.com/... hoặc mã phiếu phân công"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 placeholder-slate-400"
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-2"
              >
                {submitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting ? 'Đang gửi...' : 'Nộp Đơn Giải Trình'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Appeals List */}
        {activeTab === 'list' && (
          <div className="space-y-3">
            {appeals.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">Chưa có đơn giải trình chấm công nào</p>
                <p className="text-xs text-slate-400 mt-1">Các đơn do bạn hoặc nhân sự gửi sẽ hiển thị tại đây.</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                {appeals.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{item.id}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            {appealTypeLabels[item.appeal_type] || item.appeal_type}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                          <span className="font-semibold text-slate-700">{item.employee_name || item.employee_id}</span>
                          <span>•</span>
                          <span>Ngày vi phạm: <strong className="text-slate-700">{String(item.date).split('T')[0]}</strong></span>
                          <span>•</span>
                          <span>Gửi lúc: {new Date(item.created_at).toLocaleString('vi-VN')}</span>
                        </div>
                      </div>
                      <div>{statusBadge(item.status)}</div>
                    </div>

                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-normal">
                      <strong className="text-slate-800">Lý do:</strong> {item.reason}
                    </p>

                    {item.proof_url && (
                      <div className="text-xs text-blue-600 font-medium flex items-center gap-1">
                        <span>Minh chứng đính kèm:</span>
                        <a href={item.proof_url} target="_blank" rel="noreferrer" className="underline hover:text-blue-800">
                          {item.proof_url}
                        </a>
                      </div>
                    )}

                    {item.review_note && (
                      <div className="text-xs text-slate-600 bg-blue-50/50 p-2 rounded-lg border border-blue-100/50">
                        <strong className="text-blue-900">Phản hồi của {item.reviewer_name || 'Quản lý'}:</strong> {item.review_note}
                      </div>
                    )}

                    {/* Admin/HR action controls */}
                    {isAdminOrHR && item.status === 'CHO_DUYET' && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleReview(item.id, 'TU_CHOI')}
                          className="px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200"
                        >
                          Từ chối
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReview(item.id, 'DA_DUYET')}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
                        >
                          Duyệt giải trình
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppleModal>
  );
}
