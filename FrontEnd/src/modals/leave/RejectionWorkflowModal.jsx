import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { FileText, AlertTriangle, CheckCircle2, XCircle, Sparkles, Send, Copy, Check, X, Calendar } from 'lucide-react';

export default function Modal6C_RejectionWorkflow({ isOpen, onClose, payload }) {
  const [selectedReason, setSelectedReason] = useState('sprint_conflict');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('idle'); // 'approved', 'rejected'

  const leaveId = payload?.id || payload?.leave_id || '';
  const employeeName = payload?.name || payload?.employeeName || payload?.full_name || 'Nhân sự';
  const deptName = payload?.dept || payload?.department || payload?.department_name || 'Bộ phận';
  const leaveTypeStr = payload?.leaveType || payload?.leave_type_name || 'Nghỉ phép thường niên';
  const timeRange = payload?.range || payload?.dates || 'Giai đoạn đã chọn';
  const days = payload?.daysCount || payload?.total_days || 1;

  const [emailText, setEmailText] = useState('');

  useEffect(() => {
    setEmailText(
      `Chào ${employeeName}, bộ phận Quản lý đã xem xét đơn ${leaveTypeStr.toLowerCase()} của bạn (${timeRange}). Tuy nhiên, thời điểm này đang có khối lượng công việc cao điểm tại ${deptName}. Quản lý đề xuất bạn có thể dời lịch sang tuần kế tiếp hoặc sắp xếp bàn giao kỹ các nhiệm vụ trước khi nghỉ nhé!`
    );
  }, [payload, employeeName, leaveTypeStr, timeRange, deptName]);

  const handleCopy = () => {
    navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Tiến trình xét duyệt và Xử lý đơn nghỉ phép</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Đang chờ phê duyệt
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Mã đơn: <strong className="text-slate-800 font-mono">{leaveId}</strong> • Nhân viên: <strong className="text-slate-800">{employeeName}</strong> ({deptName})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Request Details */}
        <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Loại nghỉ phép:</span>
            <span className="font-bold text-blue-700">{leaveTypeStr}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Thời gian:</span>
            <span className="font-bold text-slate-900">{timeRange}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Tổng số ngày:</span>
            <span className="font-bold text-slate-900">{days} ngày công</span>
          </div>
        </div>

        {/* 2. AI Impact Warning */}
        <div className="mt-3.5 p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-900">Cảnh báo Phân bổ Nguồn lực (AI Workload Impact)</span>
              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">CẦN LƯU Ý</span>
            </div>
            <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
              Bộ phận <strong>{deptName}</strong> đang có lịch trực và deadline quan trọng trong giai đoạn này. Nếu phê duyệt đơn của <strong>{employeeName}</strong>, vui lòng đảm bảo công việc đã được ủy quyền bàn giao đầy đủ.
            </p>
          </div>
        </div>

        {/* 3. Reason selection for Rejection or Rescheduling */}
        <div className="mt-4 space-y-2 text-xs">
          <label className="font-bold text-slate-800 block">Lý do điều chỉnh / từ chối:</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              onClick={() => setSelectedReason('sprint_conflict')}
              className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center gap-2 ${
                selectedReason === 'sprint_conflict'
                  ? 'bg-blue-50 border-blue-500 text-blue-900 font-semibold'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <input type="radio" name="reason" checked={selectedReason === 'sprint_conflict'} readOnly className="hidden" />
              <span>Trùng tiến độ dự án cốt lõi</span>
            </label>
            <label
              onClick={() => setSelectedReason('headcount_limit')}
              className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center gap-2 ${
                selectedReason === 'headcount_limit'
                  ? 'bg-blue-50 border-blue-500 text-blue-900 font-semibold'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <input type="radio" name="reason" checked={selectedReason === 'headcount_limit'} readOnly className="hidden" />
              <span>Vượt giới hạn vắng mặt đồng thời (&gt;50%)</span>
            </label>
          </div>
        </div>

        {/* 4. AI-Drafted Response Email Preview */}
        <div className="mt-3.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              Nội dung phản hồi tự động đề xuất từ AI:
            </label>
            <button
              onClick={handleCopy}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Đã sao chép' : 'Sao chép'}
            </button>
          </div>
          <textarea
            rows={3}
            value={emailText}
            onChange={e => setEmailText(e.target.value)}
            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 leading-relaxed font-sans"
          />
        </div>

        {/* Action buttons */}
        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => setStatus('approved')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition active:scale-95 flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            Vẫn phê duyệt đặc cách
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs transition"
            >
              Hủy bỏ
            </button>
            <button
              onClick={() => {
                setStatus('rejected');
                setTimeout(() => onClose(), 1200);
              }}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-sm transition active:scale-95 flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Gửi từ chối và Đề xuất dời lịch
            </button>
          </div>
        </div>

        {status === 'approved' && (
          <div className="mt-3 p-2 bg-emerald-50 text-emerald-800 text-center font-bold text-xs rounded-lg">
            ✓ Đơn nghỉ phép đã được phê duyệt thành công!
          </div>
        )}
        {status === 'rejected' && (
          <div className="mt-3 p-2 bg-rose-50 text-rose-800 text-center font-bold text-xs rounded-lg">
            ✓ Đã gửi email phản hồi từ chối và đề xuất dời lịch cho nhân viên!
          </div>
        )}
      </div>
    </AppleModal>
  );
}
