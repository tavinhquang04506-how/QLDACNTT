import React, { useState } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import Avatar from '../../components/common/Avatar';
import { Clock, Calendar, CheckCircle2, User, Building, Send, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { otService } from '../../services';
import { useAuth } from '../../context/AuthContext';

export default function Modal3A_OtRegister({ isOpen, onClose }) {
  const { currentRole } = useAuth();
  const [otDate, setOtDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('21:00');
  const [project, setProject] = useState('nexus-hrms');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setSubmitError('Vui lòng nhập lý do đăng ký tăng ca');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    try {
      await otService.create({
        workDate: otDate,
        startTime,
        endTime,
        reason: reason.trim(),
      });

      setSubmitted(true);
      try {
        confetti({ particleCount: 45, spread: 55, origin: { y: 0.6 } });
      } catch (err) {}
      setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.warn('Failed to submit OT request to API:', err);
      const msg = err.response?.data?.message || err.message || 'Không thể gửi đăng ký làm thêm giờ. Vui lòng thử lại.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Đăng ký ca làm thêm giờ (Khai báo OT)"
      subtitle="NEXUS HR • Quy chuẩn quản lý thời gian và chế độ làm ngoài giờ"
      badge={
        <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-200">
          Chính sách T9/2026
        </span>
      }
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {submitError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {submitError}
          </div>
        )}

        {/* Employee Info Bar */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <Avatar
              name={currentRole?.name || "Nhân viên"}
              id={currentRole?.id || ""}
              size="sm"
              shape="circle"
            />
            <div>
              <span className="font-bold text-slate-800">
                {currentRole?.name || "Nhân viên"} {currentRole?.id ? `(${currentRole.id})` : ''}
              </span>
              <span className="text-slate-400 block text-[11px]">
                {currentRole?.title || "Kỹ sư Phần mềm"}
              </span>
            </div>
          </div>
          <span className="text-slate-500 font-semibold">
            {currentRole?.department || "Phòng Kỹ thuật Phần mềm"}
          </span>
        </div>

        {/* Date Field */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Ngày đăng ký làm thêm giờ *
          </label>
          <div className="relative flex items-center">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="date"
              value={otDate}
              onChange={(e) => setOtDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>
        </div>

        {/* Time from / to */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Từ giờ *
            </label>
            <div className="relative flex items-center">
              <Clock className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Đến giờ *
            </label>
            <div className="relative flex items-center">
              <Clock className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
            </div>
          </div>
        </div>

        {/* Auto Computed Badge */}
        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-2.5 text-xs text-blue-900">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-blue-800">Tổng thời gian làm thêm tính lương: 3.0 giờ</span>
            <p className="text-[11px] text-blue-700 mt-0.5">
              Đã trừ 30 phút thời gian ăn tối từ 19:00 - 19:30 theo nội quy lao động công ty. Hệ số lương tính: 150% (ngày thường).
            </p>
          </div>
        </div>

        {/* Project Select */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Dự án và Khối công việc *
          </label>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="nexus-hrms">Dự án: NEXUS HRMS (Sprint 4 và Bản phát hành v2.4)</option>
            <option value="cloud-id">Dự án: Enterprise Identity Gateway (SSO Auth)</option>
            <option value="data-lake">Dự án: Hệ thống Tính lương và Dịch vụ Thuế</option>
            <option value="infra-ops">Dự án: DevOps Kubernetes Cluster Migration</option>
          </select>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Mô tả chi tiết nhiệm vụ *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 leading-relaxed"
            placeholder="Ghi rõ đầu việc cần hoàn thành trong ca ngoài giờ..."
            required
          />
        </div>

        {/* Benefits Card */}
        <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 text-xs text-amber-900 space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-amber-800">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Chế độ đãi ngộ làm thêm giờ NEXUS HR:</span>
          </div>
          <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-800">
            <li>Hệ số làm thêm ngày thường: 150% lương cơ bản theo giờ.</li>
            <li>Phụ cấp bữa ăn tối tự động: 75.000 VNĐ / ca (cộng vào bảng lương).</li>
            <li>Phê duyệt tự động chuyển tới Trưởng phòng chuyên trách bộ phận.</li>
          </ul>
        </div>

        {/* Footer Buttons */}
        <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            type="submit"
            disabled={submitted || submitting}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-75"
          >
            {submitted ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Đã gửi phê duyệt thành công!</span>
              </>
            ) : submitting ? (
              <span>Đang gửi phê duyệt...</span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Gửi tờ trình đăng ký OT</span>
              </>
            )}
          </button>
        </div>
      </form>
    </AppleModal>
  );
}
