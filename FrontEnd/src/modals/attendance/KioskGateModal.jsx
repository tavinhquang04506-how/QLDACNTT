import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { 
  KeyRound, 
  CheckCircle2, 
  ShieldCheck, 
  Clock, 
  X, 
  Sparkles, 
  MapPin, 
  Maximize2,
  RefreshCw,
  Building2,
  Smartphone
} from 'lucide-react';
import attendanceService from '../../services/attendanceService';
import { useNavigate } from 'react-router-dom';

export default function KioskGateModal({ isOpen, onClose, payload }) {
  const navigate = useNavigate();
  const [kioskCode, setKioskCode] = useState('------');
  const [expiresIn, setExpiresIn] = useState(20);
  const [qrInput, setQrInput] = useState('');
  const [qrPunchMsg, setQrPunchMsg] = useState('');
  const [qrPunchErr, setQrPunchErr] = useState('');
  const [isPunchingQr, setIsPunchingQr] = useState(false);

  const handleQrPunch = async (e) => {
    e.preventDefault();
    if (!qrInput.trim()) return;
    setQrPunchMsg('');
    setQrPunchErr('');
    setIsPunchingQr(true);
    try {
      const res = await attendanceService.kioskPunch(qrInput.trim());
      setQrPunchMsg(res?.message || `Quét QR thành công (${res?.action || 'CHECK_IN'})`);
      setQrInput('');
      window.dispatchEvent(new CustomEvent('nexus:attendance-updated'));
    } catch (err) {
      setQrPunchErr(err?.message || 'Mã QR không hợp lệ hoặc đã được sử dụng.');
    } finally {
      setIsPunchingQr(false);
    }
  };

  const fetchCode = async () => {
    try {
      const res = await attendanceService.getKioskCode();
      if (res && res.success && res.data) {
        setKioskCode(res.data.code);
        setExpiresIn(res.data.expiresIn || 20);
      }
    } catch (e) {
      console.warn('Lỗi lấy mã Kiosk Modal:', e);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchCode();

    const timer = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          fetchCode();
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  const codePart1 = kioskCode.slice(0, 3);
  const codePart2 = kioskCode.slice(3, 6);

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Mã Chấm Công Kiosk Cổng A1</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  LIVE 20s
                </span>
              </div>
              <p className="text-xs text-slate-500">Trụ sở chính NEXUS • Tòa nhà Innovation, Cầu Giấy</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Center Code Display */}
        <div className="bg-gradient-to-br from-emerald-50/60 via-white to-slate-50 rounded-2xl p-6 border-2 border-emerald-400/80 text-center flex flex-col items-center shadow-sm relative overflow-hidden">
          <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Mã thời gian thực tự đổi mới sau: <strong className="text-emerald-700 font-mono font-bold">{expiresIn}s</strong></span>
          </div>

          <div className="flex items-center justify-center font-mono font-black text-4xl md:text-5xl text-emerald-700 my-2">
            <div className="px-7 py-3 bg-white border-2 border-emerald-400/80 rounded-2xl shadow-sm flex items-center justify-center gap-3">
              <span className="tracking-[0.15em] pl-[0.15em]">{kioskCode?.slice(0, 3) || '---'}</span>
              <span className="text-emerald-400 font-light select-none">-</span>
              <span className="tracking-[0.15em] pl-[0.15em]">{kioskCode?.slice(3, 6) || '---'}</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 mt-4 max-w-sm">
            Chế độ 1 (Mã Kiosk + GPS): Nhân viên nhập 6 số này vào màn hình chấm công cá nhân kèm định vị GPS.
          </p>
        </div>

        {/* Chế độ 2: Quét mã QR Nhân viên (POST /api/attendance/kiosk/punch) */}
        <form onSubmit={handleQrPunch} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs">
          <div className="font-bold text-slate-800 flex items-center justify-between">
            <span>Chế độ 2 (Quét QR Nhân Viên tại Kiosk — Dành cho KIOSK / HR):</span>
            <span className="text-[10px] font-mono text-slate-500">/api/attendance/kiosk/punch</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="Quét hoặc dán chuỗi QR Token của nhân viên..."
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="submit"
              disabled={isPunchingQr || !qrInput.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shrink-0"
            >
              {isPunchingQr ? 'Đang quét...' : 'Xác Thực QR'}
            </button>
          </div>
          {qrPunchMsg && (
            <div className="text-emerald-700 font-semibold text-[11px] bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              ✓ {qrPunchMsg}
            </div>
          )}
          {qrPunchErr && (
            <div className="text-rose-700 font-semibold text-[11px] bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg">
              ⚠️ {qrPunchErr}
            </div>
          )}
        </form>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/kiosk');
            }}
            className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1.5 cursor-pointer hover:underline"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Mở Kiosk Toàn Màn Hình</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
