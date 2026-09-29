import React, { useState } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { Lock, AlertTriangle, Eye, EyeOff, Globe, X, Loader2, Bell, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import payrollService from '../../services/payrollService';

export default function PayrollLockModal({ isOpen, onClose, payload }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sendPush, setSendPush] = useState(true);
  const [openPortal, setOpenPortal] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const empCount = payload?.employeesCount ?? payload?.slips?.length ?? payload?.employees?.length ?? 0;
  const periodName = payload?.period?.name || payload?.periodName || payload?.id || 'Kỳ hiện tại';
  const totalAmountStr =
    payload?.totalNet !== undefined && payload?.totalNet !== null
      ? `${Number(payload.totalNet).toLocaleString('vi-VN')} đ`
      : 'Chưa tổng hợp';

  const handleConfirmLock = async () => {
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const periodId = payload?.id || payload?.periodId || payload?.period?.id;
      if (!periodId) {
        throw new Error('Không xác định được mã kỳ lương cần khóa sổ');
      }
      await payrollService.lockPeriod(periodId, true);
      setIsLocked(true);
      window.dispatchEvent(new CustomEvent('nexus:payroll-locked', { detail: { periodId } }));
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}
      setTimeout(() => {
        setIsLocked(false);
        onClose();
      }, 1500);
    } catch (err) {
      setErrorMsg(err?.message || 'Khóa sổ lương thất bại. Vui lòng kiểm tra trạng thái kỳ lương hoặc quyền truy cập.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Khóa sổ lương và Phát hành phiếu lương</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider">
                  Bảo mật cấp cao
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Kỳ lương {periodName} • Quy mô: <strong className="text-slate-800">{empCount} nhân sự</strong> • Quỹ lương: <strong className="text-emerald-700">{totalAmountStr}</strong>
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

        {errorMsg && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. Data freeze warning */}
        <div className="mt-4 p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold text-amber-900">Cảnh báo Niêm phong Số liệu Kế toán:</div>
            <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
              Sau khi khóa sổ, toàn bộ ngày công, đơn nghỉ phép, giờ OT và các khoản khấu trừ thuế/BHXH của kỳ này sẽ bị <strong>đóng băng bất biến</strong>.
            </p>
          </div>
        </div>

        {/* 2. Broadcast distribution options */}
        <div className="mt-4 space-y-2.5 text-xs">
          <div className="font-bold text-slate-800">Kênh phát hành phiếu lương nội bộ:</div>

          <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition">
            <input
              type="checkbox"
              checked={sendPush}
              onChange={e => setSendPush(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
            />
            <Bell className="w-4 h-4 text-emerald-600" />
            <div className="text-left">
              <span className="font-semibold text-slate-800">Gửi thông báo nội bộ trên hệ thống NEXUS</span>
              <span className="block text-[10px] text-slate-400">Thông báo phát hành phiếu lương đến {empCount} nhân sự trong kỳ</span>
            </div>
          </label>

          <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition">
            <input
              type="checkbox"
              checked={openPortal}
              onChange={e => setOpenPortal(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
            />
            <Globe className="w-4 h-4 text-purple-600" />
            <div className="text-left">
              <span className="font-semibold text-slate-800">Mở quyền tra cứu phiếu lương trên Cổng ESS</span>
              <span className="block text-[10px] text-slate-400">Hiển thị chi tiết thu nhập trong mục Phiếu lương của tôi</span>
            </div>
          </label>
        </div>

        {/* 3. Password Authentication */}
        <div className="mt-4 space-y-1 text-xs">
          <label className="font-bold text-slate-800 block">Ghi chú / Xác nhận của người khóa sổ:</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Nhập mật khẩu hoặc mã xác nhận quản trị..."
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isLocked && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-center font-bold text-xs">
            ✓ Đã khóa sổ lương {periodName} thành công và mở tra cứu cho {empCount} phiếu lương!
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs transition"
          >
            Hủy thao tác
          </button>
          <button
            onClick={handleConfirmLock}
            disabled={isSubmitting || isLocked}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-sm transition active:scale-95 flex items-center gap-1.5"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {isSubmitting ? 'Đang khóa sổ...' : `Xác nhận Khóa sổ và Phát hành (${empCount} phiếu)`}
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
